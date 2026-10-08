//! Long-running per-project processes (Vite dev servers, queue workers, php-cgi
//! FastCGI backends). Output is streamed to JS as `proc-log`, state as `proc-state`.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

struct Entry {
    pid: Arc<Mutex<Option<u32>>>,
    stop: Arc<AtomicBool>,
    command: String,
}

fn registry() -> &'static Mutex<HashMap<String, Entry>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Entry>>> = OnceLock::new();
    REGISTRY.get_or_init(Default::default)
}

#[derive(Clone, Serialize)]
struct LogEvent<'a> {
    id: &'a str,
    line: String,
    stream: &'a str,
}

#[derive(Clone, Serialize)]
pub struct ProcState {
    id: String,
    pid: Option<u32>,
    running: bool,
    command: String,
    code: Option<i32>,
}

fn emit_log(app: &AppHandle, id: &str, line: String, stream: &str) {
    let _ = app.emit("proc-log", LogEvent { id, line, stream });
}

fn pipe_lines(app: AppHandle, id: String, reader: impl Read + Send + 'static, stream: &'static str) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        while reader.read_until(b'\n', &mut buf).unwrap_or(0) > 0 {
            let line = String::from_utf8_lossy(&buf).trim_end().to_string();
            if !line.is_empty() {
                emit_log(&app, &id, line, stream);
            }
            buf.clear();
        }
    });
}

fn spawn_shell(command: &str, cwd: &str, path_prefix: &str, env: &HashMap<String, String>) -> std::io::Result<std::process::Child> {
    let mut cmd = crate::site_config::hidden_command("cmd");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.args(["/D", "/S", "/C"]).raw_arg(format!("\"{command}\""));
    }
    if !path_prefix.is_empty() {
        let path = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{path_prefix};{path}"));
    }
    cmd.current_dir(cwd)
        .envs(env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}

/// Starts `command` through `cmd /C` in `cwd`. With `restart`, the process is
/// relaunched when it exits, until it crashes 5 times in a row within 5 seconds.
#[tauri::command]
pub fn proc_start(
    app: AppHandle,
    id: String,
    command: String,
    cwd: String,
    path_prefix: String,
    env: HashMap<String, String>,
    restart: bool,
) -> Result<(), String> {
    if !Path::new(&cwd).is_dir() {
        return Err(format!("Working directory not found: {cwd}"));
    }
    let stop = Arc::new(AtomicBool::new(false));
    let pid = Arc::new(Mutex::new(None));
    {
        let mut reg = registry().lock().unwrap();
        if reg.contains_key(&id) {
            return Err(format!("{id} is already running"));
        }
        reg.insert(id.clone(), Entry { pid: pid.clone(), stop: stop.clone(), command: command.clone() });
    }

    std::thread::spawn(move || {
        let mut quick_failures = 0;
        let mut last_code = None;
        loop {
            let started = Instant::now();
            match spawn_shell(&command, &cwd, &path_prefix, &env) {
                Ok(mut child) => {
                    *pid.lock().unwrap() = Some(child.id());
                    let _ = app.emit("proc-state", ProcState { id: id.clone(), pid: Some(child.id()), running: true, command: command.clone(), code: None });
                    if let Some(out) = child.stdout.take() {
                        pipe_lines(app.clone(), id.clone(), out, "stdout");
                    }
                    if let Some(err) = child.stderr.take() {
                        pipe_lines(app.clone(), id.clone(), err, "stderr");
                    }
                    last_code = child.wait().ok().and_then(|s| s.code());
                    *pid.lock().unwrap() = None;
                }
                Err(e) => {
                    emit_log(&app, &id, format!("Failed to start: {e}"), "stderr");
                    break;
                }
            }
            if stop.load(Ordering::SeqCst) || !restart {
                break;
            }
            quick_failures = if started.elapsed() < Duration::from_secs(5) { quick_failures + 1 } else { 0 };
            if quick_failures >= 5 {
                emit_log(&app, &id, "Exited 5 times in a row, giving up.".into(), "stderr");
                break;
            }
            emit_log(&app, &id, format!("Exited with code {last_code:?}, restarting in 2s..."), "stderr");
            std::thread::sleep(Duration::from_secs(2));
            if stop.load(Ordering::SeqCst) {
                break;
            }
        }

        let mut reg = registry().lock().unwrap();
        if reg.get(&id).is_some_and(|e| Arc::ptr_eq(&e.stop, &stop)) {
            reg.remove(&id);
        }
        drop(reg);
        let _ = app.emit("proc-state", ProcState { id, pid: None, running: false, command, code: last_code });
    });
    Ok(())
}

fn kill_tree(pid: u32) {
    let _ = crate::site_config::hidden_command("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[tauri::command(async)]
pub fn proc_stop(id: String) {
    let entry = registry().lock().unwrap().remove(&id);
    if let Some(entry) = entry {
        entry.stop.store(true, Ordering::SeqCst);
        if let Some(pid) = *entry.pid.lock().unwrap() {
            kill_tree(pid);
        }
    }
}

#[tauri::command(async)]
pub fn proc_stop_all() {
    let ids: Vec<String> = registry().lock().unwrap().keys().cloned().collect();
    for id in ids {
        proc_stop(id);
    }
}

/// Opens a new terminal window (cmd, PowerShell or Git Bash) in `cwd` with the
/// DevStack PATH prefix and environment already set.
#[tauri::command]
pub fn open_devstack_terminal(shell: String, cwd: String, path_prefix: String, env: HashMap<String, String>) -> Result<(), String> {
    let mut cmd = match shell.as_str() {
        "powershell" => {
            let mut c = Command::new("powershell");
            c.args(["-NoExit", "-Command", "$Host.UI.RawUI.WindowTitle = 'DevStack Terminal'"]);
            c
        }
        "bash" => {
            let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
            let git_bash = Path::new(&program_files).join("Git").join("git-bash.exe");
            if !git_bash.is_file() {
                return Err(format!("Git Bash was not found at {}", git_bash.display()));
            }
            let mut c = Command::new(git_bash);
            c.arg(format!("--cd={cwd}"));
            c
        }
        _ => {
            let mut c = Command::new("cmd");
            c.args(["/K", "title DevStack Terminal"]);
            c
        }
    };
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        cmd.creation_flags(CREATE_NEW_CONSOLE);
    }
    let path = std::env::var("PATH").unwrap_or_default();
    cmd.current_dir(&cwd)
        .env("PATH", format!("{path_prefix};{path}"))
        .envs(&env)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Cannot open terminal: {e}"))
}

#[tauri::command]
pub fn proc_list() -> Vec<ProcState> {
    registry()
        .lock()
        .unwrap()
        .iter()
        .map(|(id, e)| {
            let pid = *e.pid.lock().unwrap();
            ProcState { id: id.clone(), pid, running: pid.is_some(), command: e.command.clone(), code: None }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::spawn_shell;
    use std::collections::HashMap;

    #[test]
    fn shell_command_keeps_quotes_env_and_path_prefix() {
        let env = HashMap::from([("DEVSTACK_PROBE".to_string(), "from-env".to_string())]);
        let cwd = std::env::temp_dir();
        let child = spawn_shell(
            r#"echo "quoted arg" && echo %DEVSTACK_PROBE% && echo %PATH%"#,
            &cwd.to_string_lossy(),
            r"C:\devstack-probe\bin",
            &env,
        )
        .unwrap();
        let out = String::from_utf8_lossy(&child.wait_with_output().unwrap().stdout).to_string();
        let lines: Vec<&str> = out.lines().map(str::trim).collect();
        assert_eq!(lines[0], r#""quoted arg""#);
        assert_eq!(lines[1], "from-env");
        assert!(lines[2].starts_with(r"C:\devstack-probe\bin;"));
    }
}
