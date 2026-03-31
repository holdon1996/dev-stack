use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
    Emitter,
};

use serde_json;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use sysinfo::{System, ProcessesToUpdate};
use std::io::{Read, Write};
use std::fs;
use std::path::Path;
use std::time::Duration;
use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::process::Command;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_updater::{Update as TauriPendingUpdate, UpdaterExt};

#[cfg(target_os = "windows")]
const WINDOWS_STARTUP_TASK_NAME: &str = "DevStack Startup";
const APP_UPDATE_API_URL: &str = "https://api.github.com/repos/holdon1996/dev-stack/releases/latest";
const APP_RELEASES_URL: &str = "https://github.com/holdon1996/dev-stack/releases";

struct AppState {
    sys: Mutex<System>,
    last_process_refresh: AtomicU64, // epoch ms of last refresh
    last_stats_refresh: AtomicU64,
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    pending_update: Mutex<Option<TauriPendingUpdate>>,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubLatestRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Serialize)]
struct AppUpdateInfo {
    current_version: String,
    latest_version: String,
    available: bool,
    notes: String,
    published_at: Option<String>,
    html_url: String,
    download_url: Option<String>,
    asset_name: Option<String>,
    can_install: bool,
    source: String,
    native_configured: bool,
}

#[cfg(all(target_os = "windows", not(debug_assertions)))]
fn ensure_elevated_on_startup() -> bool {
    use std::os::windows::process::CommandExt;
    use windows_sys::Win32::UI::Shell::IsUserAnAdmin;

    if unsafe { IsUserAnAdmin() } != 0 {
        return false;
    }

    let exe = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return false,
    };

    let args: Vec<String> = std::env::args().skip(1).collect();
    let escaped_args = if args.is_empty() {
        String::new()
    } else {
        args.iter()
            .map(|arg| format!("'{}'", arg.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(",")
    };

    let ps_cmd = if escaped_args.is_empty() {
        format!(
            "Start-Process -FilePath '{}' -Verb RunAs",
            exe.display().to_string().replace('\'', "''")
        )
    } else {
        format!(
            "Start-Process -FilePath '{}' -ArgumentList @({}) -Verb RunAs",
            exe.display().to_string().replace('\'', "''"),
            escaped_args
        )
    };

    let mut utf16_bytes = Vec::new();
    for utf16_char in ps_cmd.encode_utf16() {
        utf16_bytes.extend_from_slice(&utf16_char.to_le_bytes());
    }
    use base64::{Engine as _, engine::general_purpose};
    let encoded_ps_cmd = general_purpose::STANDARD.encode(utf16_bytes);

    let status = Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-EncodedCommand",
            &encoded_ps_cmd,
        ])
        .creation_flags(0x08000000)
        .status();

    matches!(status, Ok(s) if s.success())
}

#[cfg(not(all(target_os = "windows", not(debug_assertions))))]
fn ensure_elevated_on_startup() -> bool {
    false
}

#[tauri::command]
fn is_app_elevated() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Shell::IsUserAnAdmin;
        unsafe { IsUserAnAdmin() != 0 }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

fn detect_install_base_dir_internal() -> Result<Option<String>, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let Some(parent) = exe.parent() else {
        return Ok(None);
    };

    let parent_str = parent.to_string_lossy().replace("\\", "/");
    let lower = parent_str.to_lowercase();

    if lower.contains("/src-tauri/target/debug")
        || lower.contains("/src-tauri/target/release")
        || lower.contains("/target/debug")
        || lower.contains("/target/release")
    {
        return Ok(None);
    }

    Ok(Some(parent_str.trim_end_matches('/').to_string()))
}

fn cleanup_webview_state_for_fresh_install() -> Result<(), String> {
    let Some(base_dir) = detect_install_base_dir_internal()? else {
        return Ok(());
    };

    let install_dir = Path::new(&base_dir);
    fs::create_dir_all(install_dir).map_err(|e| e.to_string())?;

    let marker = install_dir.join(".devstack-install");
    let was_fresh_install = !marker.exists();
    fs::write(&marker, b"installed").map_err(|e| e.to_string())?;

    if !was_fresh_install {
        return Ok(());
    }

    let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    for dir_name in ["com.devstack.app", "com.devstack.desktop"] {
        let target = Path::new(&local_app_data).join(dir_name);
        if target.exists() {
            let _ = fs::remove_dir_all(&target);
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn encode_powershell_command(script: &str) -> String {
    let mut utf16_bytes = Vec::new();
    for utf16_char in script.encode_utf16() {
        utf16_bytes.extend_from_slice(&utf16_char.to_le_bytes());
    }
    use base64::{Engine as _, engine::general_purpose};
    general_purpose::STANDARD.encode(utf16_bytes)
}

#[cfg(target_os = "windows")]
fn run_hidden_powershell(script: &str) -> Result<std::process::Output, String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let encoded_ps_cmd = encode_powershell_command(script);

    Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-EncodedCommand",
            &encoded_ps_cmd,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn run_elevated_powershell(script: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let encoded_ps_cmd = encode_powershell_command(script);

    let status = Command::new("powershell")
        .args(&[
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &format!(
                "Start-Process powershell -ArgumentList \"-NoProfile -WindowStyle Hidden -EncodedCommand {}\" -Verb RunAs -Wait",
                encoded_ps_cmd
            ),
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("PowerShell elevated command failed".into())
    }
}

#[tauri::command]
fn get_start_on_boot() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path = exe_path.display().to_string().replace('\'', "''");
        let script = format!(
            r#"
$task = Get-ScheduledTask -TaskName '{task_name}' -ErrorAction SilentlyContinue
if ($null -eq $task) {{
    Write-Output 'false'
    exit 0
}}

$expectedExe = '{exe_path}'
$actionMatch = $false
foreach ($action in $task.Actions) {{
    if ($action.Execute -eq $expectedExe -and $action.Arguments -eq '--minimized') {{
        $actionMatch = $true
        break
    }}
}}

if ($actionMatch -and $task.Principal.RunLevel -eq 'Highest') {{
    Write-Output 'true'
}} else {{
    Write-Output 'false'
}}
"#,
            task_name = WINDOWS_STARTUP_TASK_NAME,
            exe_path = exe_path
        );

        let output = run_hidden_powershell(&script)?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        return Ok(stdout.trim().eq_ignore_ascii_case("true"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn set_start_on_boot(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path = exe_path.display().to_string().replace('\'', "''");
        let script = if enabled {
            format!(
                r#"
$taskName = '{task_name}'
$exePath = '{exe_path}'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $exePath -Argument '--minimized'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Start DevStack on Windows logon with elevated privileges.' -Force | Out-Null
"#,
                task_name = WINDOWS_STARTUP_TASK_NAME,
                exe_path = exe_path
            )
        } else {
            format!(
                "Unregister-ScheduledTask -TaskName '{}' -Confirm:$false -ErrorAction SilentlyContinue | Out-Null",
                WINDOWS_STARTUP_TASK_NAME
            )
        };

        let output = run_hidden_powershell(&script)?;
        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stderr.is_empty() {
            return Err(stderr);
        }
        if !stdout.is_empty() {
            return Err(stdout);
        }
        return Err("Failed to update scheduled startup task".into());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Err("Scheduled startup is only supported on Windows".into())
    }
}

#[cfg(target_os = "windows")]
fn sync_hosts_entry(domain: &str, present: bool) -> Result<(), String> {
    let hosts_path = "C:\\Windows\\System32\\drivers\\etc\\hosts".replace('\'', "''");
    let entry = format!("127.0.0.1 {}", domain).replace('\'', "''");
    let mode = if present { "present" } else { "absent" };
    let script = format!(
        r#"
$path = '{hosts_path}'
$entry = '{entry}'
$mode = '{mode}'
$bytes = [System.IO.File]::ReadAllBytes($path)

if ($bytes.Length -ge 4 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE -and $bytes[2] -eq 0x00 -and $bytes[3] -eq 0x00) {{
    $encoding = [System.Text.Encoding]::UTF32
}} elseif ($bytes.Length -ge 4 -and $bytes[0] -eq 0x00 -and $bytes[1] -eq 0x00 -and $bytes[2] -eq 0xFE -and $bytes[3] -eq 0xFF) {{
    $encoding = [System.Text.Encoding]::GetEncoding('utf-32BE')
}} elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {{
    $encoding = New-Object System.Text.UTF8Encoding($true)
}} elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {{
    $encoding = [System.Text.Encoding]::Unicode
}} elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {{
    $encoding = [System.Text.Encoding]::BigEndianUnicode
}} else {{
    $encoding = [System.Text.Encoding]::Default
}}

$content = $encoding.GetString($bytes)

if ($mode -eq 'present') {{
    if (-not [regex]::IsMatch($content, '(?m)^' + [regex]::Escape($entry) + '$')) {{
        if ($content.Length -gt 0 -and -not ($content.EndsWith("`r`n") -or $content.EndsWith("`n"))) {{
            $content += "`r`n"
        }}
        $content += $entry + "`r`n"
        [System.IO.File]::WriteAllText($path, $content, $encoding)
    }}
}} else {{
    $updated = [regex]::Replace($content, '(?m)^' + [regex]::Escape($entry) + '\r?\n?', '')
    if ($updated -ne $content) {{
        [System.IO.File]::WriteAllText($path, $updated, $encoding)
    }}
}}
"#
    );

    run_elevated_powershell(&script)
}

fn copy_first_existing_template(dest_path: &Path, target_name: &str, candidates: &[&str]) -> Result<bool, String> {
    for candidate in candidates {
        let source = dest_path.join(candidate);
        if source.exists() {
            fs::copy(&source, dest_path.join(target_name))
                .map_err(|e| e.to_string())?;
            return Ok(true);
        }
    }
    Ok(false)
}

fn normalize_version_for_compare(input: &str) -> Vec<u32> {
    input
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(['.', '-', '+'])
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect()
}

fn is_version_newer(candidate: &str, current: &str) -> bool {
    use std::cmp::Ordering;

    let left = normalize_version_for_compare(candidate);
    let right = normalize_version_for_compare(current);
    let max_len = left.len().max(right.len());

    for idx in 0..max_len {
        let l = *left.get(idx).unwrap_or(&0);
        let r = *right.get(idx).unwrap_or(&0);
        match l.cmp(&r) {
            Ordering::Greater => return true,
            Ordering::Less => return false,
            Ordering::Equal => {}
        }
    }

    false
}

fn pick_release_download_asset(assets: &[GithubReleaseAsset]) -> Option<&GithubReleaseAsset> {
    let preferred_suffixes = [
        "-setup.exe",
        ".msi",
        ".exe",
        ".nsis.zip",
        ".msi.zip",
    ];

    for suffix in preferred_suffixes {
        if let Some(asset) = assets.iter().find(|asset| asset.name.to_lowercase().ends_with(suffix)) {
            return Some(asset);
        }
    }

    assets.first()
}

#[tauri::command]
async fn check_app_update(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<AppUpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let mut native_configured = false;

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Ok(updater) = app.updater() {
            native_configured = true;
            if let Ok(update) = updater.check().await {
                let update_info = if let Some(update) = update.as_ref() {
                    AppUpdateInfo {
                        current_version: update.current_version.clone(),
                        latest_version: update.version.clone(),
                        available: true,
                        notes: update.body.clone().unwrap_or_default().trim().to_string(),
                        published_at: update.date.as_ref().map(|d| d.to_string()),
                        html_url: APP_RELEASES_URL.to_string(),
                        download_url: None,
                        asset_name: None,
                        can_install: true,
                        source: "tauri".into(),
                        native_configured: true,
                    }
                } else {
                    AppUpdateInfo {
                        current_version: current_version.clone(),
                        latest_version: current_version.clone(),
                        available: false,
                        notes: String::new(),
                        published_at: None,
                        html_url: APP_RELEASES_URL.to_string(),
                        download_url: None,
                        asset_name: None,
                        can_install: false,
                        source: "tauri".into(),
                        native_configured: true,
                    }
                };

                *state.pending_update.lock().unwrap() = update;
                return Ok(update_info);
            }
        }
    }

    let client = reqwest::Client::builder()
        .user_agent("DevStack-Updater")
        .timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(APP_UPDATE_API_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("No published GitHub release found yet".into());
    }

    let response = response.error_for_status().map_err(|e| e.to_string())?;
    let release: GithubLatestRelease = response.json().await.map_err(|e| e.to_string())?;
    let latest_version = release.tag_name.trim().trim_start_matches('v').to_string();
    let selected_asset = pick_release_download_asset(&release.assets);

    Ok(AppUpdateInfo {
        current_version: current_version.clone(),
        latest_version: latest_version.clone(),
        available: is_version_newer(&latest_version, &current_version),
        notes: release.body.unwrap_or_default().trim().to_string(),
        published_at: release.published_at,
        html_url: release.html_url,
        download_url: selected_asset.map(|asset| asset.browser_download_url.clone()),
        asset_name: selected_asset.map(|asset| asset.name.clone()),
        can_install: false,
        source: "github".into(),
        native_configured,
    })
}

#[tauri::command]
fn open_external_target(target: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("cmd")
            .args(["/C", "start", "", &target])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Opening external targets is not supported on this platform".into())
}

#[tauri::command]
async fn install_app_update(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let Some(update) = state.pending_update.lock().unwrap().take() else {
            return Err("There is no pending update. Please check for updates again.".into());
        };

        let started = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let app_handle = app.clone();
        let started_flag = started.clone();

        update
            .download_and_install(
                move |chunk_length, content_length| {
                    if !started_flag.swap(true, Ordering::SeqCst) {
                        let _ = app_handle.emit(
                            "app-update-download",
                            serde_json::json!({
                                "event": "Started",
                                "data": {
                                    "contentLength": content_length
                                }
                            }),
                        );
                    }

                    let _ = app_handle.emit(
                        "app-update-download",
                        serde_json::json!({
                            "event": "Progress",
                            "data": {
                                "chunkLength": chunk_length
                            }
                        }),
                    );
                },
                || {
                    let _ = app.emit(
                        "app-update-download",
                        serde_json::json!({
                            "event": "Finished"
                        }),
                    );
                },
            )
            .await
            .map_err(|e| e.to_string())?;

        #[cfg(not(target_os = "windows"))]
        app.request_restart();

        return Ok(());
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = app;
        let _ = state;
        Err("Native updater is not supported on this platform".into())
    }
}

fn build_default_mysql_ini(mysql_root: &str, mysql_port: u16) -> String {
    let data_dir = format!("{}/data", mysql_root);
    format!(
        "[mysqld]\r\nport={port}\r\nbasedir={root}\r\ndatadir={data}\r\ncharacter-set-server=utf8mb4\r\ncollation-server=utf8mb4_unicode_ci\r\nexplicit_defaults_for_timestamp=ON\r\nmax_allowed_packet=1G\r\nbind-address=127.0.0.1\r\ninnodb_buffer_pool_size=1G\r\ninnodb_log_file_size=256M\r\ninnodb_flush_log_at_trx_commit=2\r\ninnodb_flush_method=normal\r\ntmp_table_size=256M\r\nmax_heap_table_size=256M\r\ntable_open_cache=4096\r\nthread_cache_size=32\r\n\r\n[client]\r\nport={port}\r\ndefault-character-set=utf8mb4\r\n",
        port = mysql_port,
        root = mysql_root,
        data = data_dir
    )
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn check_ports_status(ports: Vec<u16>) -> Vec<bool> {
    use std::net::TcpStream;
    use std::time::Duration;
    ports.iter().map(|&port| {
        if port == 0 { return false; }
        // Connect-based detection is reliable on Windows.
        // - If a service IS listening (XAMPP, DevStack Apache, etc.) → connect succeeds → busy.
        // - If port is free → connection refused immediately → not busy.
        // This avoids SO_REUSEADDR false-negatives from bind() and IPv6 false-positives.
        let addr = format!("127.0.0.1:{}", port);
        match addr.parse() {
            Ok(sock_addr) => TcpStream::connect_timeout(&sock_addr, Duration::from_millis(150)).is_ok(),
            Err(_) => false,
        }
    }).collect()
}

#[tauri::command]
fn kill_process_by_name(state: tauri::State<'_, AppState>, name: String) -> bool {
    kill_process_by_name_exact(state, name)
}

#[tauri::command]
fn kill_process_by_name_exact(state: tauri::State<'_, AppState>, name: String) -> bool {
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    
    let target_name = name.to_lowercase();
    let mut any_killed = false;
    for (_pid, process) in sys.processes() {
        let p_name = process.name().to_str().unwrap_or("").to_lowercase();
        // Since we're replacing taskkill /IM exact match, we do exact match (case insensitive)
        if p_name == target_name {
            if process.kill() {
                any_killed = true;
            }
        }
    }
    any_killed
}

#[tauri::command]
fn kill_process_by_port(state: tauri::State<'_, AppState>, port: u16) -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::NetworkManagement::IpHelper::{GetExtendedTcpTable, MIB_TCP_STATE_LISTEN};
        use windows_sys::Win32::Networking::WinSock::AF_INET;
        use windows_sys::Win32::Foundation::NO_ERROR;
        
        // TCP_TABLE_OWNER_PID_LISTENER = 3
        const TCP_TABLE_OWNER_PID_LISTENER: u32 = 3;
        
        // Call once with size=0 to get required buffer size
        let mut size: u32 = 0;
        unsafe { GetExtendedTcpTable(std::ptr::null_mut(), &mut size, 0, AF_INET as u32, TCP_TABLE_OWNER_PID_LISTENER as i32, 0); }
        
        let mut buf: Vec<u8> = vec![0u8; size as usize];
        let ret = unsafe { GetExtendedTcpTable(buf.as_mut_ptr() as *mut _, &mut size, 0, AF_INET as u32, TCP_TABLE_OWNER_PID_LISTENER as i32, 0) };
        
        if ret != NO_ERROR {
            return false;
        }
        
        // Layout of MIB_TCPTABLE_OWNER_PID:
        //   DWORD dwNumEntries
        //   MIB_TCPROW_OWNER_PID table[] -- each row is 6 DWORDs (24 bytes)
        //     [0] dwState, [1] dwLocalAddr, [2] dwLocalPort (network byte order), [3] dwRemoteAddr, [4] dwRemotePort, [5] dwOwningPid
        let target_port_be = (port as u32).to_be() << 16; // network byte order for 2 bytes
        let num_entries = u32::from_le_bytes(buf[0..4].try_into().unwrap_or([0;4]));
        
        let row_size = 6 * 4usize; // 6 DWORD fields
        let table_start = 4usize; // after dwNumEntries
        
        let mut found_pid: Option<u32> = None;
        for i in 0..num_entries as usize {
            let base = table_start + i * row_size;
            if base + row_size > buf.len() { break; }
            
            let local_port = u32::from_le_bytes(buf[base+8..base+12].try_into().unwrap_or([0;4]));
            let owning_pid = u32::from_le_bytes(buf[base+20..base+24].try_into().unwrap_or([0;4]));
            
            // local_port is in network byte order (big-endian u16 in high 2 bytes of u32)
            let actual_port = ((local_port >> 8) & 0xFF) | ((local_port & 0xFF) << 8);
            
            if actual_port == port as u32 && owning_pid > 0 {
                found_pid = Some(owning_pid);
                break;
            }
        }
        
        if let Some(pid) = found_pid {
            let mut sys = state.sys.lock().unwrap();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            let spid = sysinfo::Pid::from_u32(pid);
            if let Some(proc) = sys.process(spid) {
                return proc.kill();
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}

#[tauri::command]
fn kill_process_by_port_admin(port: u16) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        use windows_sys::Win32::Foundation::NO_ERROR;
        use windows_sys::Win32::NetworkManagement::IpHelper::GetExtendedTcpTable;
        use windows_sys::Win32::Networking::WinSock::AF_INET;

        const TCP_TABLE_OWNER_PID_LISTENER: u32 = 3;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut size: u32 = 0;
        unsafe { GetExtendedTcpTable(std::ptr::null_mut(), &mut size, 0, AF_INET as u32, TCP_TABLE_OWNER_PID_LISTENER as i32, 0); }

        let mut buf: Vec<u8> = vec![0u8; size as usize];
        let ret = unsafe {
            GetExtendedTcpTable(
                buf.as_mut_ptr() as *mut _,
                &mut size,
                0,
                AF_INET as u32,
                TCP_TABLE_OWNER_PID_LISTENER as i32,
                0,
            )
        };

        if ret != NO_ERROR {
            return false;
        }

        let num_entries = u32::from_le_bytes(buf[0..4].try_into().unwrap_or([0; 4]));
        let row_size = 6 * 4usize;
        let table_start = 4usize;
        let mut found_pid: Option<u32> = None;

        for i in 0..num_entries as usize {
            let base = table_start + i * row_size;
            if base + row_size > buf.len() {
                break;
            }

            let local_port = u32::from_le_bytes(buf[base + 8..base + 12].try_into().unwrap_or([0; 4]));
            let owning_pid = u32::from_le_bytes(buf[base + 20..base + 24].try_into().unwrap_or([0; 4]));
            let actual_port = ((local_port >> 8) & 0xFF) | ((local_port & 0xFF) << 8);

            if actual_port == port as u32 && owning_pid > 0 {
                found_pid = Some(owning_pid);
                break;
            }
        }

        let Some(pid) = found_pid else {
            return false;
        };

        let ps_cmd = format!(
            "Start-Process taskkill -ArgumentList '/PID {} /F' -Verb RunAs -Wait -WindowStyle Hidden",
            pid
        );

        let mut utf16_bytes = Vec::new();
        for utf16_char in ps_cmd.encode_utf16() {
            utf16_bytes.extend_from_slice(&utf16_char.to_le_bytes());
        }
        use base64::{Engine as _, engine::general_purpose};
        let encoded_ps_cmd = general_purpose::STANDARD.encode(utf16_bytes);

        match Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &format!(
                    "Start-Process powershell -ArgumentList \"-NoProfile -WindowStyle Hidden -EncodedCommand {}\" -Verb RunAs -Wait",
                    encoded_ps_cmd
                ),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
        {
            Ok(status) => status.success(),
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}

#[tauri::command]
fn start_detached_process(executable: String, args: Vec<String>) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        std::process::Command::new(executable)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .is_ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new(executable)
            .args(args)
            .spawn()
            .is_ok()
    }
}

/// Spawns a process and streams its output back to JS via events.
/// Bypasses Tauri shell scope restrictions for dynamic paths.
#[tauri::command]
async fn spawn_command_stream(
    app: tauri::AppHandle,
    executable: String,
    args: Vec<String>,
    event_prefix: String
) -> Result<u32, String> {
    use std::process::{Command, Stdio};
    use std::io::{BufRead, BufReader};
    use std::thread;

    let mut cmd = Command::new(&executable);
    cmd.args(&args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn {}: {}", executable, e))?;
    let pid = child.id();

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let app_out = app.clone();
    let prefix_out = event_prefix.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_out.emit(&format!("{}-stdout", prefix_out), l);
            }
        }
    });

    let app_err = app.clone();
    let prefix_err = event_prefix.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = app_err.emit(&format!("{}-stderr", prefix_err), l);
            }
        }
    });

    // Handle process exit
    thread::spawn(move || {
        let status = child.wait();
        let code = status.map(|s| s.code().unwrap_or(0)).unwrap_or(-1);
        let _ = app.emit(&format!("{}-exit", event_prefix), code);
    });

    Ok(pid)
}


/// Run mkcert synchronously to generate SSL certificates for a domain.
/// Returns {cert, key} paths on success, or an error string.
#[tauri::command]
fn run_mkcert(mkcert_exe: String, cert_dir: String, domain: String) -> Result<serde_json::Value, String> {
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    // Ensure cert directory exists
    fs::create_dir_all(&cert_dir).map_err(|e| format!("Cannot create cert dir: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Step 1: Install mkcert's local CA (requires one-time trust prompt)
        let install_status = Command::new(&mkcert_exe)
            .arg("-install")
            .current_dir(&cert_dir)
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| format!("mkcert -install failed: {}", e))?;

        if !install_status.success() {
            return Err("mkcert -install failed. Make sure mkcert.exe is present.".into());
        }

        // Step 2: Generate cert for domain — output file is: <domain>.pem + <domain>-key.pem
        // mkcert names files after the domain: "hiiii.test.pem" + "hiiii.test-key.pem"
        let gen_output = Command::new(&mkcert_exe)
            .arg(&domain)
            .current_dir(&cert_dir)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("mkcert gen failed: {}", e))?;

        if !gen_output.status.success() {
            let err = String::from_utf8_lossy(&gen_output.stderr);
            return Err(format!("mkcert failed: {}", err));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new(&mkcert_exe).arg("-install").current_dir(&cert_dir).status().ok();
        std::process::Command::new(&mkcert_exe).arg(&domain).current_dir(&cert_dir).output().map_err(|e| e.to_string())?;
    }

    // mkcert always creates: <cert_dir>/<domain>.pem and <cert_dir>/<domain>-key.pem
    let cert_dir_path = Path::new(&cert_dir);
    let cert_path = cert_dir_path.join(format!("{}.pem", domain));
    let key_path = cert_dir_path.join(format!("{}-key.pem", domain));

    if !cert_path.exists() || !key_path.exists() {
        return Err(format!(
            "Cert files not found after mkcert ran. Expected: {} and {}",
            cert_path.display(), key_path.display()
        ));
    }

    Ok(serde_json::json!({
        "cert": cert_path.to_string_lossy().replace("\\", "/"),
        "key": key_path.to_string_lossy().replace("\\", "/")
    }))
}


#[tauri::command]
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn create_dir(path: String) -> bool {
    std::fs::create_dir_all(&path).is_ok()
}

#[tauri::command]
fn remove_dir(path: String) -> bool {
    std::fs::remove_dir_all(&path).is_ok()
}

/// Uncomment a specific extension in php.ini (e.g., ";extension=curl" -> "extension=curl")
#[tauri::command]
fn enable_php_extension(ini_path: String, ext: String) -> bool {
    let content = match std::fs::read_to_string(&ini_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    // Match lines like ";extension=curl" or "; extension=curl"
    let pattern = format!(r"(?m)^(\s*);(\s*extension\s*=\s*{})(\s*$)", regex::escape(&ext));
    let re = match regex::Regex::new(&pattern) {
        Ok(r) => r,
        Err(_) => return false,
    };
    let updated = re.replace_all(&content, "$1$2$3").to_string();
    std::fs::write(&ini_path, updated).is_ok()
}

#[tauri::command]
fn disable_php_extension(ini_path: String, ext: String) -> bool {
    let content = match std::fs::read_to_string(&ini_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let pattern = format!(r"(?m)^(\s*)(extension\s*=\s*{}\s*)$", regex::escape(&ext));
    let re = match regex::Regex::new(&pattern) {
        Ok(r) => r,
        Err(_) => return false,
    };
    let updated = re.replace_all(&content, "$1;$2").to_string();
    std::fs::write(&ini_path, updated).is_ok()
}

#[tauri::command]
fn get_php_ini_extensions(ini_path: String) -> Result<Vec<String>, String> {
    let content = std::fs::read_to_string(&ini_path).map_err(|e| e.to_string())?;
    let re = regex::Regex::new(r"(?im)^\s*extension\s*=\s*([A-Za-z0-9_]+)\s*$").unwrap();
    let mut exts: Vec<String> = re
        .captures_iter(&content)
        .filter_map(|caps| caps.get(1).map(|m| m.as_str().trim().to_lowercase()))
        .collect();
    exts.sort();
    exts.dedup();
    Ok(exts)
}

/// Enable common PHP extensions in php.ini (uncomments them if commented out)
#[tauri::command]
fn patch_php_ini_extensions(ini_path: String) -> bool {
    let exts = ["curl", "mbstring", "openssl", "pdo_mysql", "mysqli", "gd", "zip", "intl", "xml", "bcmath", "fileinfo", "sockets", "exif"];
    let content = match std::fs::read_to_string(&ini_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let mut updated = content;
    for ext in &exts {
        let pattern = format!(r"(?m)^(\s*);(\s*extension\s*=\s*{}\s*)$", regex::escape(ext));
        if let Ok(re) = regex::Regex::new(&pattern) {
            updated = re.replace_all(&updated, "$1$2").to_string();
        }
    }
    // Also set sensible defaults
    let settings = [
        ("upload_max_filesize", "1G"),
        ("post_max_size", "1G"),
        ("memory_limit", "2G"),
        ("max_execution_time", "300"),
        ("max_input_time", "300"),
        ("max_input_vars", "10000"),
    ];
    for (key, val) in &settings {
        let re_str = format!(r"(?im)^(\s*{}\s*=\s*).*$", regex::escape(key));
        if let Ok(re) = regex::Regex::new(&re_str) {
            updated = re.replace_all(&updated, format!("${{1}}{}", val).as_str()).to_string();
        }
    }
    std::fs::write(&ini_path, updated).is_ok()
}

#[tauri::command]
fn list_subdirs(path: String) -> Vec<String> {
    let mut dirs = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    dirs.push(name.to_string());
                }
            }
        }
    }
    dirs
}

#[derive(Debug, Serialize)]
struct NodeVersionState {
    version: String,
    installed: bool,
    active: bool,
    path: String,
}

fn normalize_node_version_tag(tag: &str) -> Result<String, String> {
    let trimmed = tag.trim();
    if trimmed.is_empty() {
        return Err("Node version tag is required".into());
    }

    let normalized = trimmed.trim_start_matches('v');
    let is_valid = normalized
        .chars()
        .all(|c| c.is_ascii_digit() || c == '.')
        && normalized.split('.').all(|part| !part.is_empty());

    if !is_valid {
        return Err(format!("Invalid Node version tag: {}", tag));
    }

    Ok(normalized.to_string())
}

fn node_root_dir(base_dir: &str) -> std::path::PathBuf {
    Path::new(base_dir).join("bin").join("node")
}

fn node_version_dir(base_dir: &str, version: &str) -> std::path::PathBuf {
    node_root_dir(base_dir).join(format!("node-v{}", version))
}

fn node_current_dir(base_dir: &str) -> std::path::PathBuf {
    node_root_dir(base_dir).join("current")
}

fn detect_active_node_version_internal(base_dir: &str) -> Result<Option<String>, String> {
    let current_exe = node_current_dir(base_dir).join("node.exe");
    if !current_exe.exists() {
        return Ok(None);
    }

    let output = std::process::Command::new(&current_exe)
        .arg("-v")
        .output()
        .map_err(|e| format!("Failed to query active Node version: {}", e))?;

    if !output.status.success() {
        return Ok(None);
    }

    let version = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches('v')
        .to_string();

    if version.is_empty() {
        Ok(None)
    } else {
        Ok(Some(version))
    }
}

#[tauri::command]
fn list_node_versions(base_dir: String) -> Result<Vec<NodeVersionState>, String> {
    let root = node_root_dir(&base_dir);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let active = detect_active_node_version_internal(&base_dir)?;
    let mut versions = Vec::new();

    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().map(|value| value.to_string_lossy().to_string()) else {
            continue;
        };

        if name.eq_ignore_ascii_case("current") || !name.starts_with("node-v") {
            continue;
        }

        let version = name.trim_start_matches("node-v").to_string();
        if !path.join("node.exe").exists() {
            continue;
        }

        versions.push(NodeVersionState {
            version: version.clone(),
            installed: true,
            active: active.as_deref() == Some(version.as_str()),
            path: path.to_string_lossy().replace("\\", "/"),
        });
    }

    versions.sort_by(|a, b| b.version.cmp(&a.version));
    Ok(versions)
}

#[tauri::command]
fn activate_node_version(base_dir: String, version: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
    let normalized = normalize_node_version_tag(&version)?;
    let root = node_root_dir(&base_dir);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let target_dir = node_version_dir(&base_dir, &normalized);
    if !target_dir.join("node.exe").exists() {
        return Err(format!("Node {} is not installed", normalized));
    }

    let current_dir = node_current_dir(&base_dir);
    let script = format!(
        r#"
$current = '{current}'
$target = '{target}'

if (Test-Path -LiteralPath $current) {{
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {{
        cmd /c rmdir "$current" | Out-Null
    }} else {{
        Remove-Item -LiteralPath $current -Force -Recurse
    }}
}}

New-Item -ItemType Junction -Path $current -Target $target | Out-Null
Write-Output $current
"#,
        current = current_dir.to_string_lossy().replace('\'', "''"),
        target = target_dir.to_string_lossy().replace('\'', "''"),
    );

    let output = run_hidden_powershell(&script)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Failed to activate Node {}", normalized)
        } else {
            stderr
        });
    }

    Ok(current_dir.to_string_lossy().replace("\\", "/"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = base_dir;
        let _ = version;
        Err("Node version switching is currently only supported on Windows".into())
    }
}

#[tauri::command]
fn deactivate_node_version(base_dir: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let current_dir = node_current_dir(&base_dir);
        if !current_dir.exists() {
            return Ok(());
        }

        let script = format!(
            r#"
$current = '{current}'

if (Test-Path -LiteralPath $current) {{
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {{
        cmd /c rmdir "$current" | Out-Null
    }} else {{
        Remove-Item -LiteralPath $current -Force -Recurse
    }}
}}
"#,
            current = current_dir.to_string_lossy().replace('\'', "''"),
        );

        let output = run_hidden_powershell(&script)?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(if stderr.is_empty() {
                "Failed to deactivate current Node version".into()
            } else {
                stderr
            })
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = base_dir;
        Err("Node version switching is currently only supported on Windows".into())
    }
}

#[tauri::command]
fn detect_install_base_dir() -> Result<Option<String>, String> {
    detect_install_base_dir_internal()
}

#[tauri::command]
fn ensure_devstack_layout(base_dir: String) -> Result<Vec<String>, String> {
    let base = Path::new(&base_dir);
    let targets = [
        base.join("bin"),
        base.join("www"),
        base.join("logs"),
        base.join("tmp"),
    ];

    let mut created = Vec::new();
    for dir in targets {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        created.push(dir.to_string_lossy().replace("\\", "/"));
    }

    Ok(created)
}

#[tauri::command]
fn ensure_install_marker(base_dir: String) -> Result<bool, String> {
    let base = Path::new(&base_dir);
    fs::create_dir_all(base).map_err(|e| e.to_string())?;

    let marker = base.join(".devstack-install");
    let was_fresh = !marker.exists();

    fs::write(&marker, b"installed").map_err(|e| e.to_string())?;
    Ok(was_fresh)
}

#[tauri::command]
fn ensure_apache_log_files(apache_root: String) -> Result<Vec<String>, String> {
    let base = Path::new(&apache_root);
    let logs_dir = base.join("logs");
    fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;

    let files = [
        logs_dir.join("error_log"),
        logs_dir.join("access_log"),
    ];

    let mut created = Vec::new();
    for file in files {
        if !file.exists() {
            fs::write(&file, b"").map_err(|e| e.to_string())?;
        }
        created.push(file.to_string_lossy().replace("\\", "/"));
    }

    Ok(created)
}

#[tauri::command]
fn open_main_devtools(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    window.open_devtools();
    Ok(())
}

#[tauri::command]
fn update_ini_value(file_path: String, key: String, value: String) -> bool {
    use std::fs;
    let content = match fs::read_to_string(&file_path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Regex to match key = value (case insensitive key)
    let re_str = format!(r"(?i)(^\s*{}\s*=\s*).*(\r?\n?)", key);
    let re = match regex::Regex::new(&re_str) {
        Ok(r) => r,
        Err(_) => return false,
    };

    let new_line = format!("{} {}$2", key, value);
    let updated = re.replace_all(&content, |caps: &regex::Captures| {
        format!("{}{}{}", &caps[1], value, &caps[2])
    });

    fs::write(file_path, updated.to_string()).is_ok()
}

#[tauri::command]
fn configure_apache_php(
    apache_conf_path: String,
    php_dir: String,
    php_version: String,
    mod_name: String,
    mod_file: String
) -> bool {
    use std::fs;
    let content = match fs::read_to_string(&apache_conf_path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Replace based on start/end markers
    let start_marker = "# --- DEVSTACK PHP CONFIG ---";
    let end_marker = "# --- END DEVSTACK PHP CONFIG ---";
    
    let new_block = format!(
"{}\nLoadModule {} \"{}/{}\"\nPHPIniDir \"{}\"\nAddType application/x-httpd-php .php\nAddType application/x-httpd-php-source .phps\n{}",
        start_marker, mod_name, php_dir.replace("\\", "/"), mod_file, php_dir.replace("\\", "/"), end_marker
    );

    let updated_content = if content.contains(start_marker) && content.contains(end_marker) {
        // Regex to replace between markers
        let re_str = format!(r"(?s){}.*?{}", regex::escape(start_marker), regex::escape(end_marker));
        let re = regex::Regex::new(&re_str).unwrap();
        re.replace(&content, regex::NoExpand(&new_block)).to_string()
    } else {
        // Append to the end
        format!("{}\n\n{}", content, new_block)
    };

    fs::write(apache_conf_path, updated_content).is_ok()
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    use std::fs;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn patch_apache_paths(new_server_root: String, new_doc_root: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    
    let sr = new_server_root.replace("\\", "/");
    let dr = new_doc_root.replace("\\", "/");

    // Extract the apache version from the server root path (e.g. "apache-2.4.62")
    // new_server_root = "F:/devstack/bin/apache/apache-2.4.62"
    let apache_folder = Path::new(&new_server_root)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    // Only patch the httpd.conf at the exact path derived from settings.
    // NEVER scan other drives — that causes cross-drive path corruption
    // (e.g. writing F:\ paths into a conf file physically at C:\).
    let conf_path = {
        let candidate = Path::new(&new_server_root).join("conf").join("httpd.conf");
        if candidate.exists() {
            candidate
        } else {
            return Err(format!(
                "httpd.conf not found at '{}'. Check that DevStack directory is correct in Settings and Apache is installed there.",
                Path::new(&new_server_root).join("conf").join("httpd.conf").display()
            ));
        }
    };

    // Read file as-is — do NOT do a global backslash replace, that corrupts LogFormat strings.
    let raw = fs::read_to_string(&conf_path).map_err(|e| e.to_string())?;
    let mut content = raw;

    // Helper: normalizes path backslashes, used per-match only
    let norm = |s: &str| s.replace("\\", "/");

    // Replace: Define SRVROOT "..." — match both forward/back slash paths
    let re_srv = regex::Regex::new(r#"(?im)^(Define\s+SRVROOT\s+")[^"\\]*(?:\\[^"]*)*""#).unwrap();
    content = re_srv.replace_all(&content, format!("Define SRVROOT \"{}\"", sr)).to_string();

    // Replace: ServerRoot "..."
    let re_server = regex::Regex::new(r#"(?im)^(ServerRoot\s+")[^"\\]*(?:\\[^"]*)*""#).unwrap();
    content = re_server.replace_all(&content, format!("ServerRoot \"{}\"", sr)).to_string();

    // Replace: DocumentRoot "..."
    let re_doc = regex::Regex::new(r#"(?im)^(DocumentRoot\s+")[^"\\]*(?:\\[^"]*)*""#).unwrap();
    content = re_doc.replace_all(&content, format!("DocumentRoot \"{}\"", dr)).to_string();

    // Enable gzip/deflate so static assets and HTML are compressed in transit.
    content = content.replace(
        "# LoadModule deflate_module modules/mod_deflate.so",
        "LoadModule deflate_module modules/mod_deflate.so",
    );
    content = content.replace(
        "#LoadModule deflate_module modules/mod_deflate.so",
        "LoadModule deflate_module modules/mod_deflate.so",
    );
    content = content.replace(
        "# LoadModule include_module modules/mod_include.so",
        "LoadModule include_module modules/mod_include.so",
    );
    content = content.replace(
        "#LoadModule include_module modules/mod_include.so",
        "LoadModule include_module modules/mod_include.so",
    );

    // Ensure a global ServerName exists so Apache does not warn on startup.
    let re_server_name = regex::Regex::new(r#"(?im)^#?\s*ServerName\s+.+$"#).unwrap();
    if re_server_name.is_match(&content) {
        content = re_server_name
            .replace(&content, "ServerName localhost:80")
            .to_string();
    } else if let Some(listen_match) = regex::Regex::new(r#"(?im)^Listen\s+\d+\s*$"#).unwrap().find(&content) {
        content.insert_str(listen_match.end(), "\r\nServerName localhost:80");
    } else {
        content.push_str("\r\nServerName localhost:80\r\n");
    }

    // Replace: <Directory "DRIVE:..."> — handles both / and \ in paths
    // Pattern: letter colon then any combo of non-quote chars (including backslashes)
    let re_dir = regex::Regex::new(r#"(?im)^<Directory\s+"([A-Za-z]:[^"]*)"\s*>"#).unwrap();
    let dr_lower = dr.to_lowercase();
    let sr_lower = sr.to_lowercase();
    content = re_dir.replace_all(&content, |caps: &regex::Captures| {
        let raw_path = &caps[1];
        let normalized_path = norm(raw_path);
        let path_lower = normalized_path.to_lowercase();

        if path_lower == dr_lower {
            format!("<Directory \"{}\">", dr)
        } else if path_lower == sr_lower {
            format!("<Directory \"{}\">", sr)
        } else {
            // Keep other absolute paths unchanged (do not corrupt unrelated Directory blocks)
            caps[0].to_string()
        }
    }).to_string();

    let gzip_start = "# --- DEVSTACK GZIP CONFIG ---";
    let gzip_end = "# --- END DEVSTACK GZIP CONFIG ---";
    let gzip_block = format!(
        "{start}\r\n<IfModule deflate_module>\r\n    AddOutputFilterByType DEFLATE text/plain text/html text/xml text/css text/javascript application/javascript application/x-javascript application/json application/xml application/rss+xml image/svg+xml\r\n    DeflateCompressionLevel 6\r\n    BrowserMatch ^Mozilla/4 gzip-only-text/html\r\n    BrowserMatch ^Mozilla/4\\.0[678] no-gzip\r\n    BrowserMatch \\bMSIE !no-gzip !gzip-only-text/html\r\n    Header append Vary Accept-Encoding\r\n</IfModule>\r\n{end}",
        start = gzip_start,
        end = gzip_end
    );
    if content.contains(gzip_start) && content.contains(gzip_end) {
        let re_gzip = regex::Regex::new(&format!(
            r"(?s){}.*?{}",
            regex::escape(gzip_start),
            regex::escape(gzip_end)
        )).unwrap();
        content = re_gzip.replace(&content, regex::NoExpand(&gzip_block)).to_string();
    } else {
        content.push_str("\r\n\r\n");
        content.push_str(&gzip_block);
        content.push_str("\r\n");
    }

    fs::write(&conf_path, &content).map_err(|e| e.to_string())?;
    Ok(conf_path.to_string_lossy().to_string())
}

#[tauri::command]
fn patch_mysql_paths(ini_path: String, new_mysql_root: String, port: Option<u16>) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    use std::process::Command;
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let ini_file = Path::new(&ini_path);
    let mysql_root_path = Path::new(&new_mysql_root);
    if !mysql_root_path.exists() {
        return Err(format!(
            "MySQL directory not found at '{}'. Check that DevStack directory is correct in Settings and MySQL is installed there.",
            mysql_root_path.display()
        ));
    }

    let mysql_root = new_mysql_root.replace("\\", "/").trim_end_matches('/').to_string();
    let data_dir = format!("{}/data", mysql_root);
    let mysql_port = port.unwrap_or(3306);

    let mut content = if ini_file.exists() {
        fs::read_to_string(ini_file).map_err(|e| e.to_string())?
    } else {
        let copied = copy_first_existing_template(
            mysql_root_path,
            "my.ini",
            &["my.ini-development", "my-default.ini", "my.ini-example"]
        )?;

        if copied {
            fs::read_to_string(ini_file).map_err(|e| e.to_string())?
        } else {
            let generated = build_default_mysql_ini(&mysql_root, mysql_port);
            fs::write(ini_file, &generated).map_err(|e| e.to_string())?;
            generated
        }
    };

    let upsert_ini_value = |content: String, key: &str, value: &str| -> String {
        let re = regex::Regex::new(&format!(r#"(?im)^(\s*{}\s*=\s*).*$"#, regex::escape(key))).unwrap();
        if re.is_match(&content) {
            re.replace_all(&content, format!("${{1}}{}", value)).to_string()
        } else {
            let mut out = content;
            if !out.ends_with('\n') {
                out.push_str("\r\n");
            }
            out.push_str(&format!("{}={}\r\n", key, value));
            out
        }
    };

    content = upsert_ini_value(content, "port", &mysql_port.to_string());
    content = upsert_ini_value(content, "basedir", &mysql_root);
    content = upsert_ini_value(content, "datadir", &data_dir);
    content = upsert_ini_value(content, "character-set-server", "utf8mb4");
    content = upsert_ini_value(content, "collation-server", "utf8mb4_unicode_ci");
    content = upsert_ini_value(content, "explicit_defaults_for_timestamp", "ON");
    content = upsert_ini_value(content, "max_allowed_packet", "1G");
    content = upsert_ini_value(content, "bind-address", "127.0.0.1");
    content = upsert_ini_value(content, "innodb_buffer_pool_size", "1G");
    content = upsert_ini_value(content, "innodb_log_file_size", "256M");
    content = upsert_ini_value(content, "innodb_flush_log_at_trx_commit", "2");
    content = upsert_ini_value(content, "innodb_flush_method", "normal");
    content = upsert_ini_value(content, "tmp_table_size", "256M");
    content = upsert_ini_value(content, "max_heap_table_size", "256M");
    content = upsert_ini_value(content, "table_open_cache", "4096");
    content = upsert_ini_value(content, "thread_cache_size", "32");
    // Keep hostname resolution enabled so legacy apps using `localhost`
    // continue to match `root@localhost` on Windows instead of being
    // rejected as `127.0.0.1`.
    let re_skip_name_resolve = regex::Regex::new(r#"(?im)^\s*#?\s*skip-name-resolve(?:\s*=.*)?\r?\n?"#).unwrap();
    content = re_skip_name_resolve.replace_all(&content, "").to_string();

    let re_client = regex::Regex::new(r#"(?im)^\[client\]\s*$"#).unwrap();
    if !re_client.is_match(&content) {
        if !content.ends_with('\n') {
            content.push_str("\r\n");
        }
        content.push_str(&format!("\r\n[client]\r\nport={}\r\ndefault-character-set=utf8mb4\r\n", mysql_port));
    } else {
        content = upsert_ini_value(content, "default-character-set", "utf8mb4");
    }

    fs::write(ini_file, &content).map_err(|e| e.to_string())?;

    let data_dir_path = mysql_root_path.join("data");
    fs::create_dir_all(&data_dir_path).map_err(|e| e.to_string())?;

    let mysql_system_dir = data_dir_path.join("mysql");
    if !mysql_system_dir.exists() {
        let mysqld_exe = mysql_root_path.join("bin").join("mysqld.exe");
        if !mysqld_exe.exists() {
            return Err(format!("mysqld.exe not found at '{}'", mysqld_exe.display()));
        }

        let output = Command::new(&mysqld_exe)
            .arg(format!("--defaults-file={}", ini_file.display()))
            .arg("--initialize-insecure")
            .arg("--console")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to initialize MySQL data directory: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let details = if !stderr.is_empty() { stderr } else { stdout };
            return Err(format!("Failed to initialize MySQL data directory: {}", details));
        }
    }

    Ok(ini_file.to_string_lossy().to_string())
}


#[tauri::command]
fn scan_processes(state: tauri::State<'_, AppState>, dev_dir: String) -> Vec<serde_json::Value> {
    let mut sys = state.sys.lock().unwrap();
    
    // Throttle: only refresh if at least 500ms since last refresh
    // (prevents infinite-loop scenario while allowing _pollUntilStable to get fresh data)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let last = state.last_process_refresh.load(Ordering::Relaxed);
    if now - last > 500 {
        sys.refresh_processes(ProcessesToUpdate::All, true);
        state.last_process_refresh.store(now, Ordering::Relaxed);
    }
    
    use std::collections::HashMap;
    let mut groups: HashMap<String, serde_json::Value> = HashMap::new();
    let dev_dir_low = dev_dir.to_lowercase().replace("/", "\\");

    for (pid, process) in sys.processes() {
        let name = process.name().to_str().unwrap_or("").to_lowercase();
        let exe_path = process.exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
        let exe_low = exe_path.to_lowercase();
        
        let is_ds = exe_low.starts_with(&dev_dir_low) || 
                    exe_low.contains("\\dev-stack\\") || 
                    exe_low.contains("\\devstack\\");

        // ONLY proceed if it's a DevStack process
        if !is_ds { continue; }

        let svc_type = if name.contains("mysqld") { Some("db") }
                      else if name.contains("httpd") || name.contains("apache") { Some("web") }
                      else if name.contains("redis") { Some("cache") }
                      else if name.contains("php") { Some("php") }
                      else { None };
        
        if let Some(t) = svc_type {
            let memory = process.memory() as f64 / 1024.0 / 1024.0;
            let key = t.to_string(); // Group strictly by type now
            
            // Try to detect version for DB
            let mut version = "—".to_string();
            if t == "db" {
                // Heuristic: path is bin/mysql/mysql-8.0.45/bin/mysqld.exe
                if let Some(parent) = std::path::Path::new(&exe_path).parent() {
                    // bin folder
                    if let Some(root) = parent.parent() {
                        // version folder
                        if let Some(fname) = root.file_name() {
                            let name_str = fname.to_string_lossy();
                            if name_str.starts_with("mysql-") {
                                version = name_str.replace("mysql-", "");
                            } else {
                                version = name_str.to_string();
                            }
                        }
                    }
                }
            }

            let entry = groups.entry(key).or_insert(serde_json::json!({
                "type": t,
                "is_devstack": true,
                "pid": pid.as_u32(),
                "memory": 0.0,
                "version": version,
                "path": exe_path
            }));
            
            let m = entry["memory"].as_f64().unwrap() + memory;
            entry["memory"] = serde_json::json!((m * 10.0).round() / 10.0);
            
            if pid.as_u32() < entry["pid"].as_u64().unwrap() as u32 {
                entry["pid"] = serde_json::json!(pid.as_u32());
            }
        }
    }

    groups.into_values().collect()
}

#[tauri::command]
fn setup_virtual_host(
    domain: String, 
    doc_root: String, 
    httpd_conf: String, 
    vhosts_file: String, 
    port: u16,
    ssl_enabled: bool,
    ssl_cert: String,
    ssl_key: String
) -> Result<String, String> {
    // 1) Enable required modules and include in httpd.conf
    if let Ok(mut content) = std::fs::read_to_string(&httpd_conf) {
        content = content.replace("#LoadModule rewrite_module modules/mod_rewrite.so", "LoadModule rewrite_module modules/mod_rewrite.so");
        content = content.replace("# LoadModule rewrite_module modules/mod_rewrite.so", "LoadModule rewrite_module modules/mod_rewrite.so");
        content = content.replace("#Include conf/extra/httpd-vhosts.conf", "Include conf/extra/httpd-vhosts.conf");
        content = content.replace("# Include conf/extra/httpd-vhosts.conf", "Include conf/extra/httpd-vhosts.conf");
        
        if ssl_enabled {
            content = content.replace("#LoadModule ssl_module modules/mod_ssl.so", "LoadModule ssl_module modules/mod_ssl.so");
            content = content.replace("# LoadModule ssl_module modules/mod_ssl.so", "LoadModule ssl_module modules/mod_ssl.so");
            content = content.replace("#LoadModule socache_shmcb_module modules/mod_socache_shmcb.so", "LoadModule socache_shmcb_module modules/mod_socache_shmcb.so");
            content = content.replace("# LoadModule socache_shmcb_module modules/mod_socache_shmcb.so", "LoadModule socache_shmcb_module modules/mod_socache_shmcb.so");
            
            if !content.contains("Listen 443") {
                // Better placement: insert Listen 443 after Listen 80 or similar
                if content.contains("Listen 80") {
                    content = content.replace("Listen 80", "Listen 80\nListen 443");
                } else {
                    content.push_str("\nListen 443\n");
                }
            }
        }

        // 1.1) Global Directory Permission Fix for 403 Forbidden
        // Ensure the root path of projects is allowed in Apache. Use forward slashes.
        // 1.1) Robust Global Directory Permission Fix for 403 Forbidden
        let normalized_doc_root = doc_root.replace("\\", "/");
        let drive_root = if normalized_doc_root.len() >= 3 {
            &normalized_doc_root[0..3] // e.g. "F:/"
        } else {
            "/"
        };
        
        let dir_perm_block = format!(
            "\n# DevStack Directory Access\n<Directory \"{}\">\n    Options Indexes FollowSymLinks\n    AllowOverride All\n    Require all granted\n</Directory>\n", 
            drive_root
        );

        if !content.contains(&format!("<Directory \"{}\">", drive_root)) {
            content.push_str(&dir_perm_block);
        }

        let _ = std::fs::write(&httpd_conf, content);
    }

    // 2) Add VirtualHost block to vhosts file
    let normalized_root = doc_root.replace("\\", "/");
    let mut block = format!(
        "\n<VirtualHost *:{}>\n    DocumentRoot \"{}\"\n    ServerName {}\n    DirectoryIndex index.php index.html\n    <Directory \"{}\">\n        Options Indexes FollowSymLinks\n        AllowOverride All\n        Require all granted\n    </Directory>\n</VirtualHost>\n",
        port, normalized_root, domain, normalized_root
    );

    if ssl_enabled {
        let cert = ssl_cert.replace("\\", "/");
        let key = ssl_key.replace("\\", "/");
        block.push_str(&format!(
            "\n<VirtualHost *:443>\n    DocumentRoot \"{}\"\n    ServerName {}\n    SSLEngine on\n    SSLCertificateFile \"{}\"\n    SSLCertificateKeyFile \"{}\"\n    DirectoryIndex index.php index.html\n    <Directory \"{}\">\n        Options Indexes FollowSymLinks\n        AllowOverride All\n        Require all granted\n    </Directory>\n</VirtualHost>\n",
            normalized_root, domain, cert, key, normalized_root
        ));
    }
    
    if let Ok(mut content) = std::fs::read_to_string(&vhosts_file) {
        // Comment out Apache's default dummy VirtualHost blocks — they point to
        // non-existent directories and cause 403 errors for all unmatched requests.
        let dummy_markers = ["dummy-host.example.com", "dummy-host2.example.com"];
        for marker in &dummy_markers {
            if content.contains(marker) {
                let re = regex::Regex::new(&format!(
                    r"(?ms)^([ \t]*<VirtualHost\b[^>]*>\r?\n.*?{}\r?\n.*?[ \t]*</VirtualHost>[ \t]*\r?\n?)",
                    regex::escape(marker)
                )).map_err(|e| e.to_string())?;

                content = re.replace_all(&content, |caps: &regex::Captures| {
                    caps[1]
                        .lines()
                        .map(|line| {
                            if line.trim_start().starts_with('#') {
                                line.to_string()
                            } else {
                                format!("#{}", line)
                            }
                        })
                        .collect::<Vec<_>>()
                        .join("\r\n")
                        + "\r\n"
                }).to_string();
            }
        }

        if !content.contains(&domain) {
            content.push_str(&block);
            let _ = std::fs::write(&vhosts_file, content);
        } else {
            // Domain already exists — still write back if we cleaned up dummy blocks
            let _ = std::fs::write(&vhosts_file, content);
        }
    }


    // 3) Update hosts file (requires admin)
    sync_hosts_entry(&domain, true).map_err(|_| {
        "Không thể cập nhật file hosts. Vui lòng cấp quyền Administrator cho ứng dụng.".to_string()
    })?;

    Ok("SUCCESS".into())
}

#[tauri::command]
fn get_system_stats(state: tauri::State<'_, AppState>) -> serde_json::Value {
    let mut sys = state.sys.lock().unwrap();
    
    // Throttle: only refresh if at least 3 seconds since last stats refresh
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let last = state.last_stats_refresh.load(Ordering::Relaxed);
    if now - last > 3000 {
        sys.refresh_cpu_all();
        sys.refresh_memory();
        state.last_stats_refresh.store(now, Ordering::Relaxed);
    }
    
    serde_json::json!({
        "cpu": sys.global_cpu_usage().round() as u32,
        "used_ram": (sys.used_memory() as f64 / 1024.0 / 1024.0 / 1024.0 * 10.0).round() / 10.0,
        "total_ram": (sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0).round() as u32,
        "total_ram_exact": (sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0 * 10.0).round() / 10.0
    })
}

#[tauri::command]
async fn install_binary(
    app: tauri::AppHandle,
    svc_type: String,
    version: String,
    url: String,
    dest_dir: String,
    expected_size_mb: Option<f64>,
) -> Result<String, String> {
    let log_event = format!("{}-install-log", svc_type);
    let app_clone = app.clone();
    
    let emit_log = move |msg: &str| {
        let _ = app_clone.emit(&log_event, msg);
    };

    emit_log(&format!("Starting download for {} {}...", svc_type, version));
    
    let client = reqwest::Client::new();
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    if !res.status().is_success() {
        return Err(format!("Download failed: HTTP {}", res.status()));
    }

    let total_size = {
        let header_size = res.content_length().unwrap_or(0);
        if header_size > 0 {
            header_size
        } else if let Some(mb) = expected_size_mb {
            (mb * 1024.0 * 1024.0) as u64
        } else {
            0u64
        }
    };
    if total_size > 0 {
        emit_log(&format!("Download size: {:.2} MB", total_size as f64 / 1024.0 / 1024.0));
    } else {
        emit_log("Download size: unknown (streaming...)");
    }

    let mut body = res.bytes_stream();
    let mut bytes = Vec::new();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    use futures_util::StreamExt;

    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        bytes.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        // Throttle: emit every 64KB for smooth progress updates
        if downloaded - last_emit >= 64 * 1024 {
            last_emit = downloaded;
            let downloaded_mb = (downloaded as f64 / 1024.0 / 1024.0 * 100.0).round() / 100.0;

            if total_size > 0 {
                let pct = (downloaded as f64 / total_size as f64 * 100.0).min(99.0) as u32;
                let total_mb = (total_size as f64 / 1024.0 / 1024.0 * 100.0).round() / 100.0;
                let _ = app.emit("download-progress", serde_json::json!({
                    "svcType": svc_type,
                    "pct": pct,
                    "downloaded": downloaded_mb,
                    "total": total_mb
                }));
            } else {
                // Unknown size: smooth bouncing 5→85→5 pattern
                let steps = downloaded / (64 * 1024);
                let cycle = steps % 32;
                let fake_pct = if cycle <= 16 { 5 + cycle * 5 } else { 85 - (cycle - 16) * 5 } as u32;
                let _ = app.emit("download-progress", serde_json::json!({
                    "svcType": svc_type,
                    "pct": fake_pct,
                    "downloaded": downloaded_mb,
                    "total": 0
                }));
            }
        }
    }

    emit_log("Download complete. Extracting file contents...");

    let dest_path = Path::new(&dest_dir);
    if !dest_path.parent().unwrap().exists() {
        fs::create_dir_all(dest_path.parent().unwrap()).map_err(|e| e.to_string())?;
    }

    let temp_extract_dir = dest_path.with_extension("tmp_extract");
    if temp_extract_dir.exists() {
        fs::remove_dir_all(&temp_extract_dir).ok();
    }
    fs::create_dir_all(&temp_extract_dir).map_err(|e| e.to_string())?;

    let cursor = std::io::Cursor::new(bytes);
    zip_extract::extract(cursor, &temp_extract_dir, true).map_err(|e| e.to_string())?;

    emit_log("Extraction finished. Finalizing paths...");

    // Flatten logic
    let mut entries = fs::read_dir(&temp_extract_dir).map_err(|e| e.to_string())?;
    let mut source_to_move = temp_extract_dir.clone();
    
    // If there's only one directory inside, move that instead (common in ZIPs)
    let mut count = 0;
    let mut last_entry = None;
    for entry in fs::read_dir(&temp_extract_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            last_entry = Some(entry.path());
        }
        count += 1;
    }
    
    if count == 1 && last_entry.is_some() {
        source_to_move = last_entry.unwrap();
    } else if svc_type == "web" {
         // Special case for Apache (often has Apache24 folder)
         let apache_inner = temp_extract_dir.join("Apache24");
         if apache_inner.exists() {
             source_to_move = apache_inner;
         }
    }

    if svc_type == "tunnel" {
        let tunnel_name = dest_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let final_exe_path = dest_path.with_extension("exe");
        let candidate_exe = source_to_move.join(format!("{}.exe", tunnel_name));

        if candidate_exe.exists() {
            if final_exe_path.exists() {
                fs::remove_file(&final_exe_path).ok();
            }
            fs::rename(&candidate_exe, &final_exe_path).map_err(|e| {
                format!("Failed to move tunnel executable to final destination: {}", e)
            })?;
        } else {
            if dest_path.exists() {
                fs::remove_dir_all(dest_path).ok();
            }
            fs::rename(&source_to_move, dest_path).map_err(|e| {
                format!("Failed to move files to final destination: {}", e)
            })?;
        }
    } else {
        if dest_path.exists() {
            fs::remove_dir_all(dest_path).ok();
        }
        fs::rename(source_to_move, dest_path).map_err(|e| {
            format!("Failed to move files to final destination: {}", e)
        })?;
    }

    // Cleanup
    if temp_extract_dir.exists() {
        emit_log("Cleaning up temporary files...");
        fs::remove_dir_all(temp_extract_dir).ok();
    }

    // Post-install: PHP ini
    if svc_type == "php" {
        let ini_path = dest_path.join("php.ini");
        if !ini_path.exists() {
            if copy_first_existing_template(&dest_path, "php.ini", &["php.ini-development", "php.ini-production"])? {
                emit_log("Creating initial php.ini from development template...");
            }
        }
        if ini_path.exists() && patch_php_ini_extensions(ini_path.to_string_lossy().to_string()) {
            emit_log("Applied DevStack PHP defaults (extensions, memory/upload limits).");
        }
    } else if svc_type == "web" {
        ensure_apache_log_files(dest_path.to_string_lossy().to_string())?;
        emit_log("Created initial Apache log files.");
    } else if svc_type == "db" {
        let ini_path = dest_path.join("my.ini");
        if !ini_path.exists() {
            if copy_first_existing_template(&dest_path, "my.ini", &["my.ini-development", "my-default.ini", "my.ini-example"])? {
                emit_log("Creating initial my.ini from bundled template...");
            } else {
                emit_log("No bundled MySQL template found, DevStack will generate a minimal my.ini on first start.");
            }
        }
        emit_log("Creating data directory and my.ini configuration for MySQL...");
    }

    emit_log("DONE");
    Ok("SUCCESS".into())
}

/// Download a single file (non-zip) directly to the destination path.
/// Used for tools like mkcert.exe that are distributed as standalone executables.
#[tauri::command]
async fn download_file(url: String, dest_path: String) -> Result<(), String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::builder()
        .user_agent("DevStack/1.0")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Download failed: HTTP {}", res.status()));
    }

    let mut bytes = Vec::new();
    let mut body = res.bytes_stream();
    while let Some(chunk) = body.next().await {
        bytes.extend_from_slice(&chunk.map_err(|e| e.to_string())?);
    }

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&dest_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&dest_path, &bytes).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn download_file_with_progress(
    app: tauri::AppHandle,
    svc_type: String,
    label: String,
    url: String,
    dest_path: String,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let log_event = format!("{}-install-log", svc_type);
    let emit_log = |msg: &str| {
        let _ = app.emit(&log_event, msg);
    };

    emit_log(&format!("Download URL: {}", url));
    emit_log(&format!("Starting direct download for {}...", label));

    let client = reqwest::Client::builder()
        .user_agent("DevStack/1.0")
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Download failed: HTTP {}", res.status()));
    }

    let total_size = res.content_length().unwrap_or(0);
    if total_size > 0 {
        emit_log(&format!("Download size: {:.2} MB", total_size as f64 / 1024.0 / 1024.0));
    } else {
        emit_log("Download size: unknown (streaming...)");
    }

    let mut bytes = Vec::new();
    let mut body = res.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;

    while let Some(chunk) = body.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        bytes.extend_from_slice(&chunk);
        downloaded += chunk.len() as u64;

        if downloaded - last_emit >= 64 * 1024 {
            last_emit = downloaded;
            let downloaded_mb = (downloaded as f64 / 1024.0 / 1024.0 * 100.0).round() / 100.0;

            if total_size > 0 {
                let pct = (downloaded as f64 / total_size as f64 * 100.0).min(100.0) as u32;
                let total_mb = (total_size as f64 / 1024.0 / 1024.0 * 100.0).round() / 100.0;
                let _ = app.emit("download-progress", serde_json::json!({
                    "svcType": svc_type,
                    "pct": pct,
                    "downloaded": downloaded_mb,
                    "total": total_mb
                }));
            }
        }
    }

    if let Some(parent) = std::path::Path::new(&dest_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&dest_path, &bytes).map_err(|e| e.to_string())?;

    let _ = app.emit("download-progress", serde_json::json!({
        "svcType": svc_type,
        "pct": 100,
        "downloaded": (downloaded as f64 / 1024.0 / 1024.0 * 100.0).round() / 100.0,
        "total": if total_size > 0 { (total_size as f64 / 1024.0 / 1024.0 * 100.0).round() / 100.0 } else { 0.0 }
    }));
    emit_log(&format!("Saved file to {}", dest_path));

    Ok(())
}

/// Fetch available Apache versions from apachelounge.com dynamically using reqwest.
/// Returns a list of {version, url} objects — no PowerShell, no child processes.
#[tauri::command]
async fn fetch_apache_versions() -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 DevStack/1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // Scrape both the current and archive pages
    let urls = ["https://www.apachelounge.com/download/", "https://www.apachelounge.com/download/archive/"];
    let re = regex::Regex::new(r#"href="([^"]*httpd-([\d.]+)[^"]*Win64[^"]*\.zip)""#).unwrap();
    
    let mut seen = std::collections::HashSet::new();
    let mut results: Vec<serde_json::Value> = Vec::new();

    for base_url in &urls {
        let Ok(resp) = client.get(*base_url).send().await else { continue; };
        let Ok(html) = resp.text().await else { continue; };

        for caps in re.captures_iter(&html) {
            let href = &caps[1];
            let ver = caps[2].to_string();
            if seen.contains(&ver) { continue; }
            seen.insert(ver.clone());

            let full_url = if href.starts_with("http") {
                href.to_string()
            } else {
                format!("https://www.apachelounge.com{}", href)
            };
            results.push(serde_json::json!({ "version": ver, "url": full_url }));
        }
    }

    // Sort by version descending (newest first)
    results.sort_by(|a, b| {
        let va = a["version"].as_str().unwrap_or("");
        let vb = b["version"].as_str().unwrap_or("");
        vb.cmp(va)
    });

    Ok(results)
}

/// Fetch available PHP versions using the official releases.json API.
/// Falls back to HTML scraping if the API is unavailable.
#[tauri::command]
async fn fetch_php_versions() -> Result<Vec<serde_json::Value>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 DevStack/1.0")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = "https://downloads.php.net/~windows/releases/";
    let json_url = format!("{}releases.json", base_url);

    // Try the official JSON API first
    if let Ok(resp) = client.get(&json_url).send().await {
        if let Ok(text) = resp.text().await {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                let mut results: Vec<serde_json::Value> = Vec::new();

                if let Some(map) = json.as_object() {
                    for (_branch, entry) in map {
                        let ver = entry["version"].as_str().unwrap_or("").to_string();
                        if ver.is_empty() { continue; }

                        // Try TS x64 build first (preferred for Apache module)
                        let ts_keys = ["ts-vs17-x64", "ts-vs16-x64", "ts-vc15-x64"];
                        let nts_keys = ["nts-vs17-x64", "nts-vs16-x64", "nts-vc15-x64"];

                        for key in &ts_keys {
                            if let Some(zip) = entry[key]["zip"].as_object() {
                                if let Some(path) = zip["path"].as_str() {
                                    let url = format!("{}{}", base_url, path);
                                    // Extract size in MB from string like "25.02MB"
                                    let size_mb: Option<f64> = zip["size"].as_str()
                                        .and_then(|s| s.trim_end_matches("MB").parse::<f64>().ok());
                                    results.push(serde_json::json!({
                                        "version": ver,
                                        "url": url,
                                        "is_nts": false,
                                        "size_mb": size_mb
                                    }));
                                    break;
                                }
                            }
                        }

                        for key in &nts_keys {
                            if let Some(path) = entry[key]["zip"]["path"].as_str() {
                                let url = format!("{}{}", base_url, path);
                                results.push(serde_json::json!({
                                    "version": ver,
                                    "url": url,
                                    "is_nts": true
                                }));
                                break;
                            }
                        }
                    }
                }

                if !results.is_empty() {
                    // Sort descending by version
                    results.sort_by(|a, b| {
                        let va = a["version"].as_str().unwrap_or("");
                        let vb = b["version"].as_str().unwrap_or("");
                        // Semver-aware compare: split by '.' and compare numerically
                        let pa: Vec<u32> = va.split('.').map(|x| x.parse().unwrap_or(0)).collect();
                        let pb: Vec<u32> = vb.split('.').map(|x| x.parse().unwrap_or(0)).collect();
                        pb.cmp(&pa)
                    });
                    return Ok(results);
                }
            }
        }
    }

    // Fallback: scrape archives HTML
    let re = regex::Regex::new(
        r#"href="(php-(\d+\.\d+\.\d+)(?:-nts)?-Win32-(?:vs16|vs17|vc14|vc15)-x64\.zip)""#
    ).unwrap();

    let mut seen = std::collections::HashSet::new();
    let mut results: Vec<serde_json::Value> = Vec::new();
    let archives_url = "https://downloads.php.net/~windows/releases/archives/";

    if let Ok(resp) = client.get(archives_url).send().await {
        if let Ok(html) = resp.text().await {
            for caps in re.captures_iter(&html) {
                let filename = &caps[1];
                let ver = caps[2].to_string();
                let is_nts = filename.contains("-nts-");
                let seen_key = format!("{}-{}", ver, if is_nts { "nts" } else { "ts" });
                if seen.contains(&seen_key) { continue; }
                seen.insert(seen_key);
                let full_url = format!("{}{}", archives_url, filename);
                results.push(serde_json::json!({ "version": ver, "url": full_url, "is_nts": is_nts }));
            }
        }
    }

    results.sort_by(|a, b| {
        let va = a["version"].as_str().unwrap_or("");
        let vb = b["version"].as_str().unwrap_or("");
        vb.cmp(va)
    });

    Ok(results)
}


#[tauri::command]
async fn run_mysql_query(exe_path: String, query: String, port: Option<u16>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mysql_port = port.unwrap_or(3306).to_string();
        
        let output = std::process::Command::new(exe_path)
            .args([
                "--protocol=TCP",
                "-h",
                "127.0.0.1",
                "-P",
                &mysql_port,
                "--connect-timeout=5",
                "-u",
                "root",
                "-N",
                "-e",
                &query,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Unsupported OS".into()) }
}

#[tauri::command]
async fn open_file_default(path: String, editor: Option<String>, admin: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let target_editor = editor.unwrap_or_else(|| "notepad.exe".to_string());
        
        if admin {
            // Use ShellExecute via rundll32 which triggers UAC without spawning PowerShell
            // cmd /c start "" /b runas ... doesn't work well for UAC
            // Instead, we spawn the editor; Windows will prompt UAC if the file is protected
            // For hosts file specifically, Windows UAC is triggered by the editor itself
            std::process::Command::new(&target_editor)
                .arg(&path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to open file: {}", e))?;
        } else {
            std::process::Command::new(&target_editor)
                .arg(&path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Unsupported OS".into()) }
}


#[tauri::command]
fn read_file_tail(path: String, lines: usize) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    use std::fs::File;

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    
    let content: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
    let start = if content.len() > lines { content.len() - lines } else { 0 };
    Ok(content[start..].join("\n"))
}

#[tauri::command]
async fn stream_log_file(app: tauri::AppHandle, eventName: String, path: String) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, AsyncSeekExt, BufReader};
    use tokio::fs::File;
    use std::path::Path;

    if !Path::new(&path).exists() {
        return Err("File not found".into());
    }

    tokio::spawn(async move {
        let file = match File::open(&path).await {
            Ok(f) => f,
            Err(_) => return,
        };
        
        let mut reader = BufReader::new(file);
        let _ = reader.seek(std::io::SeekFrom::End(0)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_millis(1000));
        loop {
            interval.tick().await;
            let mut line = String::new();
            while let Ok(n) = reader.read_line(&mut line).await {
                if n == 0 { break; }
                let _ = app.emit(&eventName, line.trim_end());
                line.clear();
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn remove_virtual_host(domain: String, vhosts_file: String) -> Result<String, String> {
    if let Ok(content) = std::fs::read_to_string(&vhosts_file) {
        let mut out_content = String::new();
        let mut current_block = String::new();
        let mut in_block = false;
        let mut is_target_domain = false;
        
        for line in content.lines() {
            if line.trim_start().starts_with("<VirtualHost") {
                in_block = true;
                current_block.clear();
                is_target_domain = false;
            }
            
            if in_block {
                current_block.push_str(line);
                current_block.push('\n');
                
                if line.contains(&format!("ServerName {}", domain)) {
                    is_target_domain = true;
                }
                
                if line.trim_start().starts_with("</VirtualHost>") {
                    in_block = false;
                    if !is_target_domain {
                        out_content.push_str(&current_block);
                    }
                }
            } else {
                out_content.push_str(line);
                out_content.push('\n');
            }
        }
        
        let _ = std::fs::write(&vhosts_file, out_content.trim_end());
        
        // Remove from hosts file (requires admin) while preserving the file encoding.
        let _ = sync_hosts_entry(&domain, false);
        
        return Ok("SUCCESS".to_string());
    }
    Err("Failed to read vhosts file".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if ensure_elevated_on_startup() {
        return;
    }

    tauri::Builder::default()
        .manage(AppState {
            sys: Mutex::new(System::new_all()),
            last_process_refresh: AtomicU64::new(0),
            last_stats_refresh: AtomicU64::new(0),
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            pending_update: Mutex::new(None),
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            scan_processes,
            get_system_stats,
            check_ports_status,
            path_exists,
            list_subdirs,
            list_node_versions,
            activate_node_version,
            deactivate_node_version,
            detect_install_base_dir,
            ensure_devstack_layout,
            ensure_install_marker,
            ensure_apache_log_files,
            open_main_devtools,
            is_app_elevated,
            check_app_update,
            install_app_update,
            open_external_target,
            get_start_on_boot,
            set_start_on_boot,
            kill_process_by_port,
            kill_process_by_port_admin,
            kill_process_by_name,
            kill_process_by_name_exact,
            start_detached_process,
            update_ini_value,
            setup_virtual_host,
            configure_apache_php,
            install_binary,
            run_mysql_query,
            open_file_default,
            create_dir,
            remove_dir,
            write_text_file,
            patch_apache_paths,
            patch_mysql_paths,
            enable_php_extension,
            disable_php_extension,
            get_php_ini_extensions,
            patch_php_ini_extensions,
            fetch_apache_versions,
            fetch_php_versions,
            remove_virtual_host,
            read_file_tail,
            stream_log_file,
            run_mkcert,
            spawn_command_stream,
            download_file,
            download_file_with_progress
        ])
        .setup(|app| {
            let _ = cleanup_webview_state_for_fresh_install();

            let quit_i = MenuItem::with_id(app, "quit", "Quit DevStack", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Main Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        // In a real production app, we might want to emit an event to JS 
                        // to stop services first, but for now we'll do a clean exit.
                        app.exit(0);
                    }
                    "show" => {
                        let window = app.get_webview_window("main").unwrap();
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Window close event: let JS handler (killAllChildProcesses) do its thing,
        // then the window closes naturally. No prevent_close needed.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
