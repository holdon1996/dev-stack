//! Apache vhosts, hosts file, mkcert certificates, CA bundle and php.ini blocks
//! managed by DevStack. Everything DevStack owns lives between
//! `<comment> --- DEVSTACK <NAME> ---` / `<comment> --- END DEVSTACK <NAME> ---`
//! markers so hand-written configuration outside them is never touched.

use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const HOSTS_PATH: &str = "C:\\Windows\\System32\\drivers\\etc\\hosts";

/// `Command` that never flashes a console window.
pub(crate) fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    format!("{}\n{}", stdout.trim(), stderr.trim()).trim().to_string()
}

fn markers(name: &str, comment: &str) -> (String, String) {
    (
        format!("{comment} --- DEVSTACK {name} ---"),
        format!("{comment} --- END DEVSTACK {name} ---"),
    )
}

fn block_range(content: &str, name: &str, comment: &str) -> Option<(usize, usize)> {
    let (start, end) = markers(name, comment);
    let s = content.find(&start)?;
    let e = content[s..].find(&end)? + s + end.len();
    Some((s, e))
}

/// Replaces the text between DevStack markers. Appends the block when it is missing
/// and removes it when `body` is empty; content outside the markers is preserved.
pub fn replace_managed_block(content: &str, name: &str, comment: &str, body: &str) -> String {
    let (start, end) = markers(name, comment);
    let block = if body.trim().is_empty() {
        String::new()
    } else {
        format!("{start}\r\n{}\r\n{end}", body.trim_end())
    };

    match block_range(content, name, comment) {
        Some((s, e)) if block.is_empty() => {
            let rest = &content[e..];
            let rest = rest.strip_prefix("\r\n").or_else(|| rest.strip_prefix('\n')).unwrap_or(rest);
            format!("{}{}", &content[..s], rest)
        }
        Some((s, e)) => format!("{}{}{}", &content[..s], block, &content[e..]),
        None if block.is_empty() => content.to_string(),
        None => {
            let sep = if content.is_empty() || content.ends_with('\n') { "" } else { "\r\n" };
            format!("{content}{sep}\r\n{block}\r\n")
        }
    }
}

/// Reads a text file; a missing file is empty, any other error (non-UTF-8,
/// locked, access denied) is returned so callers never overwrite what they could not read.
fn read_existing(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("Cannot read {}: {e}", path.display())),
    }
}

fn write_if_changed(path: &Path, old: &str, new: &str) -> Result<(), String> {
    if old == new {
        return Ok(());
    }
    fs::write(path, new).map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

#[tauri::command]
pub fn write_managed_block(path: String, name: String, comment: String, body: String) -> Result<(), String> {
    if !matches!(comment.as_str(), "#" | ";") || !name.chars().all(|c| c.is_ascii_uppercase() || c == ' ') {
        return Err("Invalid managed block".into());
    }
    let path = PathBuf::from(path);
    let old = read_existing(&path)?;
    let new = replace_managed_block(&old, &name, &comment, &body);
    write_if_changed(&path, &old, &new)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Cannot read {path}: {e}"))
}

fn host_tokens(line: &str, directive: &str) -> Option<Vec<String>> {
    let mut parts = line.split_whitespace();
    if !parts.next()?.eq_ignore_ascii_case(directive) {
        return None;
    }
    Some(
        parts
            .map(|p| p.split(':').next().unwrap_or(p).to_ascii_lowercase())
            .collect(),
    )
}

/// Drops `<VirtualHost>` blocks whose ServerName/ServerAlias is in `names`.
fn drop_vhosts(text: &str, names: &[String]) -> (String, usize) {
    let mut out = String::new();
    let mut block = String::new();
    let mut in_block = false;
    let mut matched = false;
    let mut removed = 0;

    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        if !in_block && trimmed.to_ascii_lowercase().starts_with("<virtualhost") {
            in_block = true;
            matched = false;
            block.clear();
        }
        if !in_block {
            out.push_str(line);
            continue;
        }
        block.push_str(line);
        let hosts = host_tokens(trimmed, "ServerName").or_else(|| host_tokens(trimmed, "ServerAlias"));
        if hosts.is_some_and(|hosts| hosts.iter().any(|h| names.contains(h))) {
            matched = true;
        }
        if trimmed.to_ascii_lowercase().starts_with("</virtualhost") {
            in_block = false;
            if matched {
                removed += 1;
            } else {
                out.push_str(&block);
            }
        }
    }
    out.push_str(&block[..if in_block { block.len() } else { 0 }]);
    (out, removed)
}

/// Removes hand-written vhosts for hosts that DevStack now manages, without touching
/// the managed SITES block itself.
/// Every ServerName / ServerAlias host in `text`.
fn vhost_hosts(text: &str) -> std::collections::BTreeSet<String> {
    text.lines()
        .filter_map(|l| host_tokens(l.trim(), "ServerName").or_else(|| host_tokens(l.trim(), "ServerAlias")))
        .flatten()
        .collect()
}

pub fn remove_vhosts_outside_block(content: &str, names: &[String]) -> (String, usize) {
    let names: Vec<String> = names.iter().map(|n| n.to_ascii_lowercase()).collect();
    match block_range(content, "SITES", "#") {
        Some((s, e)) => {
            let (before, a) = drop_vhosts(&content[..s], &names);
            let (after, b) = drop_vhosts(&content[e..], &names);
            (format!("{before}{}{after}", &content[s..e]), a + b)
        }
        None => drop_vhosts(content, &names),
    }
}

fn has_listen_443(text: &str) -> bool {
    text.lines().any(|l| {
        let mut parts = l.split_whitespace();
        parts.next().is_some_and(|d| d.eq_ignore_ascii_case("Listen"))
            && parts.next().is_some_and(|p| p == "443" || p.ends_with(":443"))
    })
}

/// Removes a manual `# >>> ... >>>` / `# <<< ... <<<` region that defines its own
/// `Listen 443` (the pre-DevStack HTTPS workaround), since it would clash with ours.
pub fn remove_manual_ssl_region(content: &str) -> Option<String> {
    let lines: Vec<&str> = content.split_inclusive('\n').collect();
    let start = lines.iter().position(|l| l.trim_start().starts_with("# >>>"))?;
    let end = start + lines[start..].iter().position(|l| l.trim_start().starts_with("# <<<"))?;
    let region: String = lines[start..=end].concat();
    if !has_listen_443(&region) {
        return None;
    }
    Some(format!("{}{}", lines[..start].concat(), lines[end + 1..].concat()))
}

fn outside_sites_block(content: &str) -> String {
    match block_range(content, "SITES", "#") {
        Some((s, e)) => format!("{}{}", &content[..s], &content[e..]),
        None => content.to_string(),
    }
}

/// Enables the modules and includes that generated vhosts rely on.
pub fn ensure_vhost_prereqs(httpd_conf: &str) -> String {
    let mut content = httpd_conf.to_string();
    let lines = [
        "LoadModule rewrite_module modules/mod_rewrite.so",
        "LoadModule headers_module modules/mod_headers.so",
        "LoadModule proxy_module modules/mod_proxy.so",
        "LoadModule proxy_http_module modules/mod_proxy_http.so",
        "LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so",
        "LoadModule proxy_fcgi_module modules/mod_proxy_fcgi.so",
        "Include conf/extra/httpd-vhosts.conf",
    ];
    for line in lines {
        content = content.replace(&format!("#{line}"), line).replace(&format!("# {line}"), line);
    }
    content
}

fn httpd_exe(apache_root: &Path) -> PathBuf {
    apache_root.join("bin").join("httpd.exe")
}

fn run_config_test(apache_root: &Path) -> Result<String, String> {
    let output = hidden_command(httpd_exe(apache_root))
        .arg("-t")
        .current_dir(apache_root)
        .output()
        .map_err(|e| format!("Cannot run httpd -t: {e}"))?;
    let text = output_text(&output);
    if output.status.success() {
        Ok(text)
    } else {
        Err(text)
    }
}

#[tauri::command(async)]
pub fn apache_config_test(apache_root: String) -> Result<String, String> {
    run_config_test(Path::new(&apache_root))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReport {
    removed_legacy_vhosts: usize,
    /// Host names (ServerName / ServerAlias) of the hand-written vhosts that were removed.
    removed_hosts: Vec<String>,
    removed_manual_ssl: bool,
    /// A hand-written `# >>> ... >>>` region or balancer is still outside the DevStack block.
    manual_block_left: bool,
}

/// Writes the managed SITES block, removes conflicting hand-written vhosts, and
/// verifies the result with `httpd -t`. Both files are restored when the test fails.
#[tauri::command(async)]
pub fn apply_apache_sites(
    apache_root: String,
    vhosts_body: String,
    legacy_names: Vec<String>,
) -> Result<ApplyReport, String> {
    let root = PathBuf::from(&apache_root);
    let httpd_path = root.join("conf").join("httpd.conf");
    let vhosts_path = root.join("conf").join("extra").join("httpd-vhosts.conf");

    let old_httpd = fs::read_to_string(&httpd_path)
        .map_err(|e| format!("Cannot read {}: {e}", httpd_path.display()))?;
    let old_vhosts = read_existing(&vhosts_path)?;
    let wants_ssl = has_listen_443(&vhosts_body);

    let mut new_httpd = ensure_vhost_prereqs(&old_httpd);
    if wants_ssl {
        // Older DevStack builds appended a bare `Listen 443` to httpd.conf.
        new_httpd = new_httpd
            .split_inclusive('\n')
            .filter(|l| l.trim() != "Listen 443")
            .collect();
    }

    let (mut new_vhosts, removed_legacy_vhosts) = remove_vhosts_outside_block(&old_vhosts, &legacy_names);
    let mut removed_manual_ssl = false;
    if wants_ssl {
        if let Some(cleaned) = remove_manual_ssl_region(&new_vhosts) {
            new_vhosts = cleaned;
            removed_manual_ssl = true;
        }
        if has_listen_443(&outside_sites_block(&new_vhosts)) {
            return Err(format!(
                "{} already contains a `Listen 443` outside the DevStack block. Remove it and try again.",
                vhosts_path.display()
            ));
        }
    }
    let outside = outside_sites_block(&new_vhosts);
    let manual_block_left = outside.lines().any(|l| l.trim_start().starts_with("# >>>")) || outside.contains("balancer://");
    new_vhosts = replace_managed_block(&new_vhosts, "SITES", "#", &vhosts_body);

    if new_vhosts != old_vhosts {
        let _ = fs::write(vhosts_path.with_extension("conf.devstack.bak"), &old_vhosts);
    }
    write_if_changed(&httpd_path, &old_httpd, &new_httpd)?;
    write_if_changed(&vhosts_path, &old_vhosts, &new_vhosts)?;

    if let Err(output) = run_config_test(&root) {
        let _ = fs::write(&httpd_path, &old_httpd);
        let _ = fs::write(&vhosts_path, &old_vhosts);
        return Err(format!("httpd -t failed, changes were rolled back:\n{output}"));
    }

    let still_there = vhost_hosts(&outside_sites_block(&new_vhosts));
    let mut removed_hosts: Vec<String> = vhost_hosts(&outside_sites_block(&old_vhosts))
        .into_iter()
        .filter(|h| !still_there.contains(h))
        .collect();
    removed_hosts.sort();

    Ok(ApplyReport { removed_legacy_vhosts, removed_hosts, removed_manual_ssl, manual_block_left })
}

fn modified_secs(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs())
}

/// True when httpd.conf, conf/extra/*.conf or php.ini changed after the running
/// DevStack Apache started, i.e. a restart is needed to pick the change up.
#[tauri::command(async)]
pub fn apache_config_stale(apache_root: String, php_ini: Option<String>) -> bool {
    use sysinfo::{ProcessesToUpdate, System};

    let root = PathBuf::from(&apache_root);
    let exe = httpd_exe(&root).to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let started = sys
        .processes()
        .values()
        .filter(|p| {
            p.exe()
                .is_some_and(|e| e.to_string_lossy().replace('/', "\\").to_ascii_lowercase() == exe)
        })
        .map(|p| p.start_time())
        .min();
    let Some(started) = started else { return false };

    let mut files = vec![root.join("conf").join("httpd.conf")];
    if let Ok(entries) = fs::read_dir(root.join("conf").join("extra")) {
        files.extend(
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("conf"))),
        );
    }
    if let Some(ini) = php_ini {
        files.push(PathBuf::from(ini));
    }
    files.iter().map(|f| modified_secs(f)).max().unwrap_or(0) > started
}

fn is_valid_host(host: &str) -> bool {
    crate::cloudflare_tunnel::is_valid_domain(host)
}

#[derive(serde::Deserialize)]
pub struct HostEntry {
    ip: String,
    host: String,
}

/// Strips `remove` hosts from one hosts-file line outside the DevStack block.
/// Returns None when no host is left on the line.
fn strip_hosts_from_line(line: &str, remove: &[String]) -> Option<String> {
    let (data, comment) = match line.find('#') {
        Some(i) => (&line[..i], &line[i..]),
        None => (line, ""),
    };
    let mut tokens = data.split_whitespace();
    let Some(ip) = tokens.next() else { return Some(line.to_string()) };
    let hosts: Vec<&str> = tokens.collect();
    if hosts.is_empty() || !hosts.iter().any(|h| remove.contains(&h.to_ascii_lowercase())) {
        return Some(line.to_string());
    }
    let kept: Vec<&str> = hosts.into_iter().filter(|h| !remove.contains(&h.to_ascii_lowercase())).collect();
    if kept.is_empty() {
        return None;
    }
    let eol = if line.ends_with("\r\n") { "\r\n" } else if line.ends_with('\n') { "\n" } else { "" };
    let comment = comment.trim_end();
    let sep = if comment.is_empty() { "" } else { " " };
    Some(format!("{ip} {}{sep}{comment}{eol}", kept.join(" ")))
}

/// Rewrites the DevStack HOSTS block with `entries`. Lines outside the block are
/// kept as they are, except: hosts in `remove` (explicitly taken over) are stripped
/// from them, and exact `127.0.0.1 <host>` lines for `legacy` hosts (written by
/// older DevStack builds) are dropped.
pub fn sync_hosts_content(content: &str, entries: &[(String, String)], remove: &[String], legacy: &[String]) -> String {
    let remove: Vec<String> = remove.iter().map(|h| h.to_ascii_lowercase()).collect();
    let legacy_lines: Vec<String> = legacy.iter().map(|h| format!("127.0.0.1 {}", h.to_ascii_lowercase())).collect();
    let (before, block, after) = match block_range(content, "HOSTS", "#") {
        Some((s, e)) => (&content[..s], &content[s..e], &content[e..]),
        None => (content, "", ""),
    };
    let clean = |text: &str| -> String {
        text.split_inclusive('\n')
            .filter(|line| !legacy_lines.contains(&line.split_whitespace().collect::<Vec<_>>().join(" ").to_ascii_lowercase()))
            .filter_map(|line| strip_hosts_from_line(line, &remove))
            .collect()
    };
    let cleaned = format!("{}{}{}", clean(before), block, clean(after));
    let mut seen: Vec<String> = Vec::new();
    let body = entries
        .iter()
        .map(|(ip, host)| (ip.trim().to_string(), host.to_ascii_lowercase()))
        .filter(|(_, host)| !seen.contains(host) && { seen.push(host.clone()); true })
        .map(|(ip, host)| format!("{ip} {host}"))
        .collect::<Vec<_>>()
        .join("\r\n");
    replace_managed_block(&cleaned, "HOSTS", "#", &body)
}

#[tauri::command]
pub fn sync_hosts_domains(entries: Vec<HostEntry>, remove: Vec<String>, legacy: Vec<String>) -> Result<(), String> {
    if let Some(bad) = entries.iter().map(|e| &e.host).find(|d| !is_valid_host(d)) {
        return Err(format!("Invalid host name: {bad}"));
    }
    if let Some(bad) = entries.iter().find(|e| e.ip.trim().parse::<std::net::IpAddr>().is_err()) {
        return Err(format!("Invalid IP address: {}", bad.ip));
    }
    let entries: Vec<(String, String)> = entries.into_iter().map(|e| (e.ip, e.host)).collect();
    let path = Path::new(HOSTS_PATH);
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let body = crate::strip_utf8_bom(&bytes);
    let stacked_boms = bytes.len() - body.len() > 3;
    let old = String::from_utf8_lossy(body).to_string();
    let new = sync_hosts_content(&old, &entries, &remove, &legacy);
    if old == new && !stacked_boms {
        return Ok(());
    }
    let mut out = Vec::new();
    if crate::has_utf8_bom(&bytes) {
        out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    out.extend_from_slice(new.as_bytes());
    fs::write(path, out).map_err(|e| format!("Cannot update hosts file (run DevStack as Administrator, or an antivirus may be locking it): {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortOwner {
    pid: u32,
    name: String,
    exe: String,
    service: String,
}

/// Windows service hosted by `pid`, parsed from `tasklist /svc` CSV output.
fn service_for_pid(pid: u32) -> String {
    let Ok(output) = hidden_command("tasklist")
        .args(["/svc", "/fo", "csv", "/nh", "/fi", &format!("PID eq {pid}")])
        .output()
    else {
        return String::new();
    };
    parse_tasklist_service(&String::from_utf8_lossy(&output.stdout))
}

fn parse_tasklist_service(csv: &str) -> String {
    let fields: Vec<&str> = csv.lines().next().unwrap_or("").split("\",\"").collect();
    match fields.get(2).map(|f| f.trim().trim_matches('"')) {
        Some(service) if !service.is_empty() && service != "N/A" => service.to_string(),
        _ => String::new(),
    }
}

/// Who is listening on `port`: process name, PID, exe path and Windows service.
#[tauri::command(async)]
pub fn port_owner(port: u16) -> Option<PortOwner> {
    use sysinfo::{Pid, ProcessesToUpdate, System};
    let pid = crate::find_listening_pid(port)?;
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::Some(&[Pid::from_u32(pid)]), true);
    let process = sys.process(Pid::from_u32(pid));
    Some(PortOwner {
        pid,
        name: process.map(|p| p.name().to_string_lossy().to_string()).unwrap_or_default(),
        exe: process
            .and_then(|p| p.exe())
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default(),
        service: service_for_pid(pid),
    })
}

#[tauri::command(async)]
pub fn stop_windows_service(name: String) -> Result<String, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '$')) {
        return Err(format!("Invalid service name: {name}"));
    }
    let output = hidden_command("sc").args(["stop", &name]).output().map_err(|e| e.to_string())?;
    let text = output_text(&output);
    if output.status.success() {
        Ok(text)
    } else {
        Err(text)
    }
}

/// Flushes the DNS cache, then returns the hosts that do not resolve to 127.0.0.1.
#[tauri::command(async)]
pub fn flush_dns_and_check(domains: Vec<String>) -> Vec<String> {
    use std::net::ToSocketAddrs;
    let _ = hidden_command("ipconfig").arg("/flushdns").output();
    domains
        .into_iter()
        .filter(|d| {
            !(d.as_str(), 80)
                .to_socket_addrs()
                .is_ok_and(|mut addrs| addrs.any(|a| a.ip() == std::net::Ipv4Addr::LOCALHOST))
        })
        .collect()
}

/// Sets (or removes, when `value` is empty) a user environment variable.
#[tauri::command]
pub fn set_user_env(name: String, value: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let (env, _) = RegKey::predef(HKEY_CURRENT_USER)
            .create_subkey("Environment")
            .map_err(|e| format!("Cannot open HKCU\\Environment: {e}"))?;
        if value.is_empty() {
            let _ = env.delete_value(&name);
        } else {
            env.set_value(&name, &value).map_err(|e| format!("Cannot set {name}: {e}"))?;
        }
        crate::broadcast_environment_change();
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (name, value);
        Err("User environment variables are only supported on Windows".into())
    }
}

/// Runs a CLI tool to completion (e.g. `mc mb`), returning its combined output.
#[tauri::command(async)]
pub fn run_program(exe: String, args: Vec<String>, env: std::collections::HashMap<String, String>) -> Result<String, String> {
    let output = hidden_command(&exe)
        .args(&args)
        .envs(&env)
        .output()
        .map_err(|e| format!("Cannot run {exe}: {e}"))?;
    let text = output_text(&output);
    if output.status.success() {
        Ok(text)
    } else {
        Err(text)
    }
}

/// File names in `dir` with the given extension (case-insensitive), newest first.
#[tauri::command]
pub fn list_files(dir: String, ext: String) -> Vec<String> {
    let Ok(entries) = fs::read_dir(&dir) else { return Vec::new() };
    let mut files: Vec<(u64, String)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x.eq_ignore_ascii_case(&ext)))
        .map(|p| (modified_secs(&p), p.file_name().unwrap_or_default().to_string_lossy().to_string()))
        .collect();
    files.sort_by(|a, b| b.0.cmp(&a.0));
    files.into_iter().map(|(_, name)| name).collect()
}

// --- mkcert -------------------------------------------------------------------

fn der_tlv(der: &[u8], i: &mut usize) -> Option<(u8, usize, usize)> {
    let tag = *der.get(*i)?;
    let first = *der.get(*i + 1)? as usize;
    *i += 2;
    let len = if first < 0x80 {
        first
    } else {
        let n = first & 0x7f;
        let bytes = der.get(*i..*i + n)?;
        *i += n;
        bytes.iter().fold(0usize, |acc, b| (acc << 8) | *b as usize)
    };
    let start = *i;
    *i += len;
    (*i <= der.len()).then_some((tag, start, *i))
}

/// Reads the `notAfter` date (YYYY-MM-DD) of the first certificate in a PEM file.
pub fn pem_not_after(pem: &str) -> Option<String> {
    let b64: String = pem
        .lines()
        .skip_while(|l| !l.starts_with("-----BEGIN CERTIFICATE"))
        .skip(1)
        .take_while(|l| !l.starts_with("-----END"))
        .collect();
    let der = base64::engine::general_purpose::STANDARD.decode(b64.trim()).ok()?;

    let mut i = 0;
    let (_, cert_start, _) = der_tlv(&der, &mut i)?;
    i = cert_start;
    let (_, tbs_start, _) = der_tlv(&der, &mut i)?;
    i = tbs_start;
    let mut j = i;
    if der_tlv(&der, &mut j)?.0 == 0xA0 {
        i = j; // explicit version tag
    }
    for _ in 0..3 {
        der_tlv(&der, &mut i)?; // serial, signature algorithm, issuer
    }
    let (_, validity_start, _) = der_tlv(&der, &mut i)?;
    i = validity_start;
    der_tlv(&der, &mut i)?; // notBefore
    let (tag, s, e) = der_tlv(&der, &mut i)?;
    let text = std::str::from_utf8(&der[s..e]).ok()?;
    let (year, rest) = match tag {
        0x17 => {
            let yy: u32 = text.get(0..2)?.parse().ok()?;
            (if yy < 50 { 2000 + yy } else { 1900 + yy }, text.get(2..)?)
        }
        0x18 => (text.get(0..4)?.parse().ok()?, text.get(4..)?),
        _ => return None,
    };
    Some(format!("{year:04}-{}-{}", rest.get(0..2)?, rest.get(2..4)?))
}

#[tauri::command(async)]
pub fn mkcert_install(mkcert_exe: String) -> Result<(), String> {
    let output = hidden_command(&mkcert_exe)
        .arg("-install")
        .output()
        .map_err(|e| format!("Cannot run mkcert: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!("mkcert -install failed: {}", output_text(&output)))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertInfo {
    cert: String,
    key: String,
    not_after: Option<String>,
}

/// Generates `<cert_dir>/<name>.pem` + `<name>-key.pem` covering every host.
#[tauri::command(async)]
pub fn mkcert_generate(
    mkcert_exe: String,
    cert_dir: String,
    name: String,
    hosts: Vec<String>,
) -> Result<CertInfo, String> {
    if hosts.is_empty() || hosts.iter().any(|h| !is_valid_host(h)) {
        return Err("Certificates need at least one valid host name".into());
    }
    if name.is_empty() || name.contains(['/', '\\', '"', ':']) {
        return Err(format!("Invalid certificate name: {name}"));
    }
    fs::create_dir_all(&cert_dir).map_err(|e| format!("Cannot create {cert_dir}: {e}"))?;
    let dir = PathBuf::from(&cert_dir);
    let cert = dir.join(format!("{name}.pem"));
    let key = dir.join(format!("{name}-key.pem"));

    let output = hidden_command(&mkcert_exe)
        .arg("-cert-file")
        .arg(&cert)
        .arg("-key-file")
        .arg(&key)
        .args(&hosts)
        .current_dir(&dir)
        .output()
        .map_err(|e| format!("Cannot run mkcert: {e}"))?;
    if !output.status.success() {
        return Err(format!("mkcert failed: {}", output_text(&output)));
    }

    let not_after = fs::read_to_string(&cert).ok().and_then(|pem| pem_not_after(&pem));
    Ok(CertInfo {
        cert: cert.to_string_lossy().replace('\\', "/"),
        key: key.to_string_lossy().replace('\\', "/"),
        not_after,
    })
}

// --- CA bundle for PHP ----------------------------------------------------------

const EXPORT_ROOTS_PS: &str = "$c=@{}; foreach($s in 'Cert:\\LocalMachine\\Root','Cert:\\CurrentUser\\Root'){ Get-ChildItem $s | ForEach-Object { $c[$_.Thumbprint]=$_ } }; foreach($x in $c.Values){ '# ' + $x.Subject; [Convert]::ToBase64String($x.RawData) }";

fn pem_bundle(export: &str) -> (String, usize) {
    let mut out = String::new();
    let mut count = 0;
    for line in export.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if line.starts_with('#') {
            out.push_str(line);
            out.push('\n');
            continue;
        }
        out.push_str("-----BEGIN CERTIFICATE-----\n");
        for chunk in line.as_bytes().chunks(64) {
            out.push_str(&String::from_utf8_lossy(chunk));
            out.push('\n');
        }
        out.push_str("-----END CERTIFICATE-----\n");
        count += 1;
    }
    (out, count)
}

/// Exports the Windows root stores (machine + user, so the mkcert CA is included)
/// as a PEM bundle PHP can use for `curl.cainfo` / `openssl.cafile`.
#[tauri::command(async)]
pub fn build_ca_bundle(dest: String) -> Result<usize, String> {
    let output = hidden_command("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", EXPORT_ROOTS_PS])
        .output()
        .map_err(|e| format!("Cannot run PowerShell: {e}"))?;
    if !output.status.success() {
        return Err(format!("Exporting Windows root certificates failed: {}", output_text(&output)));
    }
    let (bundle, count) = pem_bundle(&String::from_utf8_lossy(&output.stdout));
    if count == 0 {
        return Err("No root certificates were exported".into());
    }
    if let Some(parent) = Path::new(&dest).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&dest, bundle).map_err(|e| format!("Cannot write {dest}: {e}"))?;
    Ok(count)
}

// --- PHP extensions ---------------------------------------------------------------

/// Uncomments `extension=<ext>` or appends it when php.ini has no such line.
pub fn enable_extension_line(content: &str, ext: &str) -> String {
    let active = regex::Regex::new(&format!(r"(?im)^[ \t]*extension[ \t]*=[ \t]*(php_)?{}(\.dll)?[ \t]*$", regex::escape(ext))).unwrap();
    if active.is_match(content) {
        return content.to_string();
    }
    let commented = regex::Regex::new(&format!(r"(?im)^[ \t]*;[ \t]*(extension[ \t]*=[ \t]*(php_)?{}(\.dll)?)[ \t]*$", regex::escape(ext))).unwrap();
    if commented.is_match(content) {
        return commented.replacen(content, 1, "$1").to_string();
    }
    let sep = if content.ends_with('\n') { "" } else { "\r\n" };
    format!("{content}{sep}extension={ext}\r\n")
}

#[tauri::command]
pub fn ensure_php_extension(ini_path: String, ext: String) -> Result<(), String> {
    let path = PathBuf::from(&ini_path);
    let old = fs::read_to_string(&path).map_err(|e| format!("Cannot read {ini_path}: {e}"))?;
    write_if_changed(&path, &old, &enable_extension_line(&old, &ext))
}

/// Downloads a PECL zip and extracts `dll_name` into the PHP `ext` directory.
#[tauri::command]
pub async fn install_php_ext_from_zip(url: String, ext_dir: String, dll_name: String) -> Result<(), String> {
    if dll_name.contains(['/', '\\', ':']) || !dll_name.to_ascii_lowercase().ends_with(".dll") {
        return Err(format!("Invalid extension file name: {dll_name}"));
    }
    let bytes = reqwest::get(&url)
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Download failed: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let file_name = Path::new(entry.name()).file_name().map(|n| n.to_string_lossy().to_string());
        if file_name.is_some_and(|n| n.eq_ignore_ascii_case(&dll_name)) {
            let mut data = Vec::new();
            std::io::Read::read_to_end(&mut entry, &mut data).map_err(|e| e.to_string())?;
            fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;
            return fs::write(Path::new(&ext_dir).join(&dll_name), data).map_err(|e| e.to_string());
        }
    }
    Err(format!("{dll_name} was not found in {url}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_block_replace_append_remove() {
        let base = "Listen 80\r\n# custom line\r\n";
        let added = replace_managed_block(base, "SITES", "#", "A");
        assert!(added.starts_with(base));
        assert!(added.contains("# --- DEVSTACK SITES ---\r\nA\r\n# --- END DEVSTACK SITES ---"));

        let replaced = replace_managed_block(&added, "SITES", "#", "B");
        assert!(replaced.contains("\r\nB\r\n") && !replaced.contains("\r\nA\r\n"));
        assert!(replaced.contains("# custom line"));

        let removed = replace_managed_block(&replaced, "SITES", "#", "");
        assert!(!removed.contains("DEVSTACK"));
        assert!(removed.contains("# custom line"));
    }

    #[test]
    fn removes_only_matching_legacy_vhosts_outside_block() {
        let content = "<VirtualHost *:80>\n    ServerName a.test\n</VirtualHost>\n<VirtualHost *:80>\n    ServerName keep.test\n</VirtualHost>\n# --- DEVSTACK SITES ---\n<VirtualHost *:80>\n    ServerName a.test\n</VirtualHost>\n# --- END DEVSTACK SITES ---\n";
        let (out, removed) = remove_vhosts_outside_block(content, &["A.test".into()]);
        assert_eq!(removed, 1);
        assert!(out.contains("keep.test"));
        assert_eq!(out.matches("ServerName a.test").count(), 1);
        assert!(out.find("ServerName a.test").unwrap() > out.find("DEVSTACK SITES").unwrap());
    }

    #[test]
    fn exact_server_name_match_only() {
        let content = "<VirtualHost *:80>\n    ServerName a.test.local\n</VirtualHost>\n";
        assert_eq!(remove_vhosts_outside_block(content, &["a.test".into()]).1, 0);
    }

    #[test]
    fn removes_manual_ssl_region_with_listen_443() {
        let content = "x\n# >>> repitte-global local HTTPS >>>\nListen 443\n<VirtualHost *:443>\n</VirtualHost>\n# <<< repitte-global local HTTPS <<<\ny\n";
        assert_eq!(remove_manual_ssl_region(content).unwrap(), "x\ny\n");
        assert!(remove_manual_ssl_region("# >>> a >>>\nfoo\n# <<< a <<<\n").is_none());
    }

    #[test]
    fn enables_vhost_prereqs() {
        let conf = "#LoadModule proxy_fcgi_module modules/mod_proxy_fcgi.so\n#Include conf/extra/httpd-vhosts.conf\n";
        let out = ensure_vhost_prereqs(conf);
        assert!(out.contains("\nInclude conf/extra/httpd-vhosts.conf"));
        assert!(out.starts_with("LoadModule proxy_fcgi_module"));
    }

    #[test]
    fn hosts_block_keeps_manual_lines_and_strips_taken_over_hosts() {
        let content = "127.0.0.1 localhost\r\n127.0.0.1 old.test\r\n127.0.0.1 a.test b.test # mine\r\n10.0.0.5 manual.example.com\r\n";
        let entries = vec![
            ("127.0.0.1".to_string(), "shop.test".to_string()),
            ("127.0.0.1".to_string(), "Shop.test".to_string()),
            ("192.168.1.9".to_string(), "api.lan".to_string()),
        ];
        let out = sync_hosts_content(content, &entries, &["a.test".into()], &["old.test".into(), "b.test".into()]);
        assert!(out.contains("127.0.0.1 localhost\r\n"));
        assert!(out.contains("10.0.0.5 manual.example.com\r\n"));
        assert!(!out.contains("old.test"));
        // Legacy cleanup never touches multi-host or commented hand-written lines.
        assert!(out.contains("127.0.0.1 b.test # mine\r\n"));
        assert_eq!(out.matches("shop.test").count(), 1);
        assert!(out.contains("# --- DEVSTACK HOSTS ---\r\n127.0.0.1 shop.test\r\n192.168.1.9 api.lan\r\n# --- END DEVSTACK HOSTS ---"));
        // Idempotent.
        assert_eq!(sync_hosts_content(&out, &entries, &[], &[]), out);
    }

    #[test]
    fn reads_certificate_expiry() {
        // Self-signed test certificate (openssl req -x509), notAfter=Oct 5 06:41:39 2036 GMT.
        let pem = "-----BEGIN CERTIFICATE-----
MIICBjCCAW+gAwIBAgIUBEuwanitls086Cg155mVL6EHjSQwDQYJKoZIhvcNAQEL
BQAwFTETMBEGA1UEAwwKZGV2c3RhY2sudDAeFw0yNjEwMDgwNjQxMzlaFw0zNjEw
MDUwNjQxMzlaMBUxEzARBgNVBAMMCmRldnN0YWNrLnQwgZ8wDQYJKoZIhvcNAQEB
BQADgY0AMIGJAoGBANX9nQ1q6SrDqqUKYkP02iU1bUjjR7xH7ZVq56hG16+BGmg3
mwKnWPovppNY9wH+mLBnd88I5b0p5lNZtld6lBw3KTvpCJbstuzkvthhEyYzj/7J
mc0dHJ3cy19AB7W3mrQ6bSPtk8r9RUk+AhAFGc+h9eu+s2zj+Uzl0aOQR9inAgMB
AAGjUzBRMB0GA1UdDgQWBBR/sn+D+GnV9LCHQqEOaD9FvXmzzTAfBgNVHSMEGDAW
gBR/sn+D+GnV9LCHQqEOaD9FvXmzzTAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3
DQEBCwUAA4GBAIQn9LiwArEfdQ5s1147uTeOwdpKUI60c2fv4gKhQHiMpkWUJE5h
GgQCVu8ntUZQJ02CypgoS1sskCftgMVBw+tpJnS283LK12jA8pO5JcqQpDHkHro0
R1O7Cr8GyxmTVH054MJLVX+3NEfn9yoEbSPc1SGfo5VYetg9UzBmo2za
-----END CERTIFICATE-----
";
        assert_eq!(pem_not_after(pem).as_deref(), Some("2036-10-05"));
        assert!(pem_not_after("garbage").is_none());
    }

    #[test]
    fn wraps_exported_roots_as_pem() {
        let (pem, count) = pem_bundle("# CN=Test\r\nQUJD\r\n");
        assert_eq!(count, 1);
        assert_eq!(pem, "# CN=Test\n-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----\n");
    }

    #[test]
    fn parses_service_from_tasklist() {
        assert_eq!(parse_tasklist_service("\"redis-server.exe\",\"4321\",\"Redis\"\r\n"), "Redis");
        assert_eq!(parse_tasklist_service("\"node.exe\",\"1\",\"N/A\"\r\n"), "");
        assert_eq!(parse_tasklist_service("INFO: No tasks are running"), "");
    }

    #[test]
    fn enables_or_appends_php_extension() {
        assert_eq!(enable_extension_line(";extension=redis\n", "redis"), "extension=redis\n");
        assert_eq!(enable_extension_line("extension=redis\n", "redis"), "extension=redis\n");
        assert_eq!(enable_extension_line("x\n", "redis"), "x\nextension=redis\r\n");
        assert_eq!(enable_extension_line("a\n\n;extension=redis\n", "redis"), "a\n\nextension=redis\n");
    }
}
