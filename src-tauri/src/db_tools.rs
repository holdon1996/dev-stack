//! MySQL database page helpers: run SQL, import dumps with progress, backup.
//! All calls use `--no-defaults` and explicit connection flags so a broken
//! `my.ini` [client] section cannot break them.

use serde::Serialize;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

fn mysql_command(exe: &str, port: u16) -> Command {
    let mut cmd = crate::site_config::hidden_command(exe);
    cmd.args(["--no-defaults", "--protocol=TCP", "-h", "127.0.0.1", "-P", &port.to_string(), "-u", "root"]);
    cmd
}

pub fn is_valid_db_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '$')
}

/// Runs SQL through the mysql client's stdin (no shell quoting involved).
#[tauri::command(async)]
pub fn mysql_exec(mysql_exe: String, port: u16, sql: String) -> Result<String, String> {
    let mut child = mysql_command(&mysql_exe, port)
        .args(["--default-character-set=utf8mb4", "-N"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Cannot run mysql: {e}"))?;
    child.stdin.take().unwrap().write_all(sql.as_bytes()).map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[derive(Clone, Serialize)]
struct ImportProgress {
    file: String,
    pct: u32,
}

/// Streams a `.sql` file into `database`. With `disable_fk`, `SET FOREIGN_KEY_CHECKS=0;`
/// is prepended on the same line so mysql's "at line N" errors still match the file.
#[tauri::command(async)]
pub fn mysql_import(
    app: AppHandle,
    mysql_exe: String,
    port: u16,
    database: String,
    file: String,
    disable_fk: bool,
) -> Result<(), String> {
    if !is_valid_db_name(&database) {
        return Err(format!("Invalid database name: {database}"));
    }
    let mut input = File::open(&file).map_err(|e| format!("Cannot open {file}: {e}"))?;
    let total = input.metadata().map(|m| m.len()).unwrap_or(0).max(1);

    let mut child = mysql_command(&mysql_exe, port)
        .args(["--default-character-set=utf8mb4", &database])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Cannot run mysql: {e}"))?;

    let mut stdin = child.stdin.take().unwrap();
    let mut write_result = Ok(());
    if disable_fk {
        write_result = stdin.write_all(b"SET FOREIGN_KEY_CHECKS=0; ");
    }
    let mut buf = vec![0u8; 1 << 20];
    let mut sent = 0u64;
    let mut last_pct = u32::MAX;
    while write_result.is_ok() {
        let n = match input.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) => return Err(e.to_string()),
        };
        write_result = stdin.write_all(&buf[..n]);
        sent += n as u64;
        let pct = (sent * 100 / total) as u32;
        if pct != last_pct {
            last_pct = pct;
            let _ = app.emit("db-import-progress", ImportProgress { file: file.clone(), pct });
        }
    }
    drop(stdin); // a write error just means mysql stopped early; its stderr explains why

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Dumps one or more databases (with CREATE DATABASE statements) to `dest`.
#[tauri::command(async)]
pub fn mysql_dump(mysqldump_exe: String, port: u16, databases: Vec<String>, dest: String) -> Result<String, String> {
    if databases.is_empty() || databases.iter().any(|d| !is_valid_db_name(d)) {
        return Err("Select at least one valid database".into());
    }
    if let Some(parent) = Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let output = mysql_command(&mysqldump_exe, port)
        .args([
            "--default-character-set=utf8mb4",
            "--single-transaction",
            "--routines",
            "--triggers",
            &format!("--result-file={dest}"),
            "--databases",
        ])
        .args(&databases)
        .output()
        .map_err(|e| format!("Cannot run mysqldump: {e}"))?;
    if output.status.success() {
        Ok(dest)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::is_valid_db_name;

    #[test]
    fn rejects_unsafe_database_names() {
        assert!(is_valid_db_name("repitte_segment"));
        assert!(!is_valid_db_name("a`; DROP DATABASE x"));
        assert!(!is_valid_db_name(""));
    }
}
