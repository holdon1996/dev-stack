# DevStack Project Context

## Tech Stack
- **Core:** Tauri v2 + React (Vite)
- **State:** Zustand (Slice Pattern for modularity)
- **Backend:** 100% Native Rust — NO PowerShell. All system tasks use Rust commands via `invoke()`.
- **Styling:** Tailwind CSS

## Architecture & Structure
- `src/store/`: Modular state management.
  - `index.js`: Store combiner.
  - `*Slice.js`: Domain-specific state/actions — all invoke Rust commands, zero PowerShell.
- `src/lib/`: Low-level utilities.
  - `paths.js`: Centralized path management.
  - `ssl.js`: SSL/mkcert helpers using native `path_exists` + `start_detached_process`.
  - ~~`ps.js`: DEPRECATED — PowerShell wrapper. Do NOT use in new code.~~
- `src/hooks/`: React hooks for logic/monitoring.
  - `useServicePoll.js`: Adaptive polling (1s active / 5s idle).
  - `useSystemStats.js`: 2s system resource monitoring.

## Rust Commands (src-tauri/src/lib.rs)
All commands use `CREATE_NO_WINDOW` flag — completely silent, no console popups.

| Command | Purpose |
|---|---|
| `scan_processes` | Detect running DevStack services via sysinfo |
| `get_system_stats` | CPU/RAM metrics |
| `check_ports_status` | Check if ports are bound (native TCP) |
| `kill_process_by_name` | Kill process by name (sysinfo) |
| `kill_process_by_name_exact` | Kill process by exact name (sysinfo) |
| `kill_process_by_port` | Find PID via netstat, kill via taskkill |
| `start_detached_process` | Launch service binary silently |
| `path_exists` | Check file/dir existence |
| `remove_dir` | Delete directory recursively |
| `list_subdirs` | List subdirectories |
| `update_ini_value` | Update key=value in INI files |
| `configure_apache_php` | Update DEVSTACK PHP CONFIG block in httpd.conf |
| `setup_virtual_host` | Add/update VirtualHost in httpd-vhosts.conf |
| `install_binary` | Download + extract binary with progress events |
| `run_mysql_query` | Execute MySQL query via mysql.exe |
| `open_file_default` | Open file in editor (or default app) |
| `enable_php_extension` | Uncomment extension line in php.ini |
| `patch_php_ini_extensions` | Enable common extensions + set PHP defaults |

## Critical Rules
- **Rule 1:** Files MUST NOT exceed 300 lines (modularize into slices/services/helpers).
- **Rule 2:** NO heavy business logic in UI components (use slices or services).
- **Rule 3:** DONT scan external services (focus ONLY on DevStack managed binaries).
- **Rule 4:** ALL new features MUST use native Rust commands — NO PowerShell, NO shell scripts.
- **Rule 5:** All Rust child processes MUST use `CREATE_NO_WINDOW` (0x08000000) on Windows.
- **Rule 6:** Prefer `sysinfo` for process management over spawning external tools.

## Current Progress & Focus
- **Phase 1 [DONE]:** Store refactored to Slices, Adaptive Polling implemented.
- **Phase 2 [DONE]:** Rust optimization — process scanning, system stats, all system tasks.
- **Phase 3 [DONE]:** Full PowerShell elimination — 100% native Rust backend.
- **Phase 4 [NEXT]:** SSL automation with mkcert, advanced UI polish, installer improvements.

## Known Issues / Tasks
- `addExtension` in phpSlice calls `enable_php_extension` Rust command (newly added).
- `uninstallApacheVersion/MySQL/PHP` calls `remove_dir` Rust command (newly added).
- `apacheSlice.fetchApacheVersions` and `phpSlice.fetchPhpVersions` now use static hardcoded URL lists — update manually when new versions are released.
- Tauri config deprecation warning: `trayIcon` in `tauri.conf.json` line 30 (non-critical).
