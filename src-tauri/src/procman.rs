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
struct LogEvent {
    id: String,
    line: String,
    stream: &'static str,
}

#[derive(Clone, Serialize)]
pub struct ProcState {
    id: String,
    pid: Option<u32>,
    running: bool,
    command: String,
    code: Option<i32>,
}

/// What the supervisor reports; `proc_start` forwards it as Tauri events.
enum ProcEvent {
    Log(LogEvent),
    State(ProcState),
}

type Emit = Arc<dyn Fn(ProcEvent) + Send + Sync>;

fn log(emit: &Emit, id: &str, line: String, stream: &'static str) {
    emit(ProcEvent::Log(LogEvent { id: id.to_string(), line, stream }));
}

fn pipe_lines(emit: Emit, id: String, reader: impl Read + Send + 'static, stream: &'static str) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        while reader.read_until(b'\n', &mut buf).unwrap_or(0) > 0 {
            let line = String::from_utf8_lossy(&buf).trim_end().to_string();
            if !line.is_empty() {
                log(&emit, &id, line, stream);
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

struct Spec {
    id: String,
    command: String,
    cwd: String,
    path_prefix: String,
    env: HashMap<String, String>,
    restart: bool,
}

/// Runs `spec.command` until stopped. With `restart`, the process is relaunched 2s
/// after it exits (e.g. killed in Task Manager), until it fails 5 times in a row
/// within 5 seconds of starting.
fn supervise(spec: Spec, pid: Arc<Mutex<Option<u32>>>, stop: Arc<AtomicBool>, emit: Emit) -> Option<i32> {
    let Spec { id, command, cwd, path_prefix, env, restart } = spec;
    let state = |pid: Option<u32>, code: Option<i32>| ProcEvent::State(ProcState {
        id: id.clone(), pid, running: pid.is_some(), command: command.clone(), code,
    });
    let mut quick_failures = 0;
    let mut last_code = None;
    loop {
        let started = Instant::now();
        match spawn_shell(&command, &cwd, &path_prefix, &env) {
            Ok(mut child) => {
                *pid.lock().unwrap() = Some(child.id());
                emit(state(Some(child.id()), None));
                if let Some(out) = child.stdout.take() {
                    pipe_lines(emit.clone(), id.clone(), out, "stdout");
                }
                if let Some(err) = child.stderr.take() {
                    pipe_lines(emit.clone(), id.clone(), err, "stderr");
                }
                last_code = child.wait().ok().and_then(|s| s.code());
                *pid.lock().unwrap() = None;
                emit(state(None, last_code));
            }
            Err(e) => {
                log(&emit, &id, format!("Failed to start: {e}"), "stderr");
                break;
            }
        }
        if stop.load(Ordering::SeqCst) || !restart {
            break;
        }
        quick_failures = if started.elapsed() < Duration::from_secs(5) { quick_failures + 1 } else { 0 };
        if quick_failures >= 5 {
            log(&emit, &id, "Exited 5 times in a row, giving up.".into(), "stderr");
            break;
        }
        log(&emit, &id, format!("Exited with code {last_code:?}, restarting in 2s..."), "stderr");
        std::thread::sleep(Duration::from_secs(2));
        if stop.load(Ordering::SeqCst) {
            break;
        }
    }
    last_code
}

/// Starts `command` through `cmd /C` in `cwd` under the supervisor (see `supervise`).
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

    let emit: Emit = Arc::new(move |event| {
        let _ = match event {
            ProcEvent::Log(e) => app.emit("proc-log", e),
            ProcEvent::State(e) => app.emit("proc-state", e),
        };
    });
    std::thread::spawn(move || {
        let spec = Spec { id: id.clone(), command: command.clone(), cwd, path_prefix, env, restart };
        let code = supervise(spec, pid, stop.clone(), emit.clone());
        let mut reg = registry().lock().unwrap();
        if reg.get(&id).is_some_and(|e| Arc::ptr_eq(&e.stop, &stop)) {
            reg.remove(&id);
        }
        drop(reg);
        emit(ProcEvent::State(ProcState { id, pid: None, running: false, command, code }));
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

/// `start` command line for a terminal window. `start` gives the shell a console
/// of its own; spawning it directly would inherit DevStack's redirected stdio and
/// the window would never show (`npm run tauri dev` pipes it).
fn terminal_start_line(shell: &str, cwd: &str) -> Result<String, String> {
    let program = match shell {
        "powershell" => "powershell -NoExit -Command \"$Host.UI.RawUI.WindowTitle = 'DevStack Terminal'\"".to_string(),
        "bash" => {
            let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
            let git_bash = Path::new(&program_files).join("Git").join("git-bash.exe");
            if !git_bash.is_file() {
                return Err(format!("Git Bash was not found at {}", git_bash.display()));
            }
            format!("\"{}\" --cd=\"{cwd}\"", git_bash.display())
        }
        _ => "cmd /K title DevStack Terminal".to_string(),
    };
    Ok(format!("start \"DevStack Terminal\" /D \"{cwd}\" {program}"))
}

/// Opens a new terminal window (cmd, PowerShell or Git Bash) in `cwd` with the
/// DevStack PATH prefix and environment already set.
#[tauri::command]
pub fn open_devstack_terminal(shell: String, cwd: String, path_prefix: String, env: HashMap<String, String>) -> Result<(), String> {
    if !Path::new(&cwd).is_dir() {
        return Err(format!("Folder not found: {cwd}"));
    }
    let line = terminal_start_line(&shell, &cwd)?;
    let mut cmd = crate::site_config::hidden_command("cmd");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.args(["/D", "/S", "/C"]).raw_arg(format!("\"{line}\""));
    }
    let path = std::env::var("PATH").unwrap_or_default();
    cmd.current_dir(&cwd)
        .env("PATH", format!("{path_prefix};{path}"))
        .envs(&env)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
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
    use super::{spawn_shell, supervise, ProcEvent, Spec};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    /// PID of the program `cmd /C` started (what a user kills in Task Manager).
    fn grandchild_of(shell_pid: u32) -> Option<u32> {
        use sysinfo::{Pid, ProcessesToUpdate, System};
        let mut sys = System::new();
        sys.refresh_processes(ProcessesToUpdate::All, true);
        sys.processes()
            .iter()
            .find(|(_, p)| p.parent() == Some(Pid::from_u32(shell_pid)) && p.name().eq_ignore_ascii_case("PING.EXE"))
            .map(|(pid, _)| pid.as_u32())
    }

    #[test]
    fn terminal_opens_through_start_with_title_and_folder() {
        let line = super::terminal_start_line("cmd", r"F:\www\app").unwrap();
        assert_eq!(line, r#"start "DevStack Terminal" /D "F:\www\app" cmd /K title DevStack Terminal"#);
        assert!(super::terminal_start_line("powershell", r"C:\x").unwrap().contains("powershell -NoExit"));
    }

    #[test]
    fn restarts_a_killed_process() {
        let pid = Arc::new(Mutex::new(None));
        let stop = Arc::new(AtomicBool::new(false));
        let starts = Arc::new(Mutex::new(Vec::new()));
        let starts_seen = starts.clone();
        let emit: super::Emit = Arc::new(move |event| {
            if let ProcEvent::State(s) = event {
                if let Some(p) = s.pid {
                    starts_seen.lock().unwrap().push(p);
                }
            }
        });
        let spec = Spec {
            id: "probe".into(),
            command: "ping -n 60 127.0.0.1".into(),
            cwd: std::env::temp_dir().to_string_lossy().to_string(),
            path_prefix: String::new(),
            env: HashMap::new(),
            restart: true,
        };
        let (pid_t, stop_t) = (pid.clone(), stop.clone());
        let handle = std::thread::spawn(move || supervise(spec, pid_t, stop_t, emit));

        let wait_for = |n: usize| {
            let deadline = Instant::now() + Duration::from_secs(15);
            while starts.lock().unwrap().len() < n && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(100));
            }
            starts.lock().unwrap().len() >= n
        };
        assert!(wait_for(1), "process never started");
        std::thread::sleep(Duration::from_millis(1500)); // past the quick-failure window start
        let shell = pid.lock().unwrap().unwrap();
        let program = grandchild_of(shell).expect("ping.exe not found under cmd");
        crate::site_config::hidden_command("taskkill").args(["/PID", &program.to_string(), "/F"]).output().unwrap();
        assert!(wait_for(2), "process was not restarted after being killed");

        stop.store(true, Ordering::SeqCst);
        let shell = pid.lock().unwrap().unwrap();
        crate::site_config::hidden_command("taskkill").args(["/PID", &shell.to_string(), "/T", "/F"]).output().unwrap();
        handle.join().unwrap();
        let starts = starts.lock().unwrap();
        assert_ne!(starts[0], starts[1]);
    }

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
