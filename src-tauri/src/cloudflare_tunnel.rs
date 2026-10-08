use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

#[derive(Debug, Deserialize)]
struct TunnelRecord {
    id: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedTunnel {
    tunnel_name: String,
    config_path: String,
    public_urls: Vec<String>,
    dns_routes_updated: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelRoute {
    hostname: String,
    port: u16,
    host_header: String,
}

fn cloudflare_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .ok_or("Could not determine the current user profile directory")?;
    Ok(PathBuf::from(home).join(".cloudflared"))
}

fn run_cloudflared(executable: &str, args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new(executable);
    command.args(args);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
        .output()
        .map_err(|error| format!("Could not run cloudflared: {error}"))
}

fn command_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    [stdout, stderr]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn ensure_success(output: Output, action: &str) -> Result<String, String> {
    let text = command_text(&output);
    if output.status.success() {
        Ok(text)
    } else if text.is_empty() {
        Err(format!("Cloudflare failed to {action}"))
    } else {
        Err(text)
    }
}

pub(crate) fn is_valid_domain(domain: &str) -> bool {
    if domain.len() > 253 || !domain.contains('.') {
        return false;
    }

    domain.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    })
}

fn validate_host_header(host_header: &str) -> Result<(), String> {
    if host_header.is_empty()
        || host_header
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
    {
        Ok(())
    } else {
        Err("The selected project has an invalid host name".into())
    }
}

fn validate_tunnel_name(tunnel_name: &str) -> Result<String, String> {
    let tunnel_name = tunnel_name.trim();
    if tunnel_name.is_empty()
        || tunnel_name.len() > 100
        || !tunnel_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        return Err(
            "Use 1-100 letters, numbers, hyphens, or underscores for the tunnel name".into(),
        );
    }
    Ok(tunnel_name.to_string())
}

/// Hostnames already routed by `config_path`, when it belongs to `tunnel_id`.
fn routed_hostnames(config_path: &Path, tunnel_id: &str) -> Vec<String> {
    let Ok(config) = std::fs::read_to_string(config_path) else { return Vec::new() };
    let same_tunnel = config
        .lines()
        .find_map(|line| line.trim().strip_prefix("tunnel:").map(|v| v.trim().to_string()))
        .is_some_and(|id| id == tunnel_id);
    if !same_tunnel {
        return Vec::new();
    }
    config
        .lines()
        .filter_map(|line| line.trim().strip_prefix("- hostname:").map(|h| h.trim().to_string()))
        .collect()
}

/// Origin URL for a local port: Apache on 443 speaks TLS with an mkcert certificate,
/// every other port is plain HTTP.
fn origin_service(port: u16) -> String {
    if port == 443 {
        "https://localhost:443".into()
    } else {
        format!("http://localhost:{port}")
    }
}

fn ingress_yaml(route: &TunnelRoute) -> String {
    let mut origin = Vec::new();
    if !route.host_header.is_empty() {
        origin.push(format!("      httpHostHeader: {}", route.host_header));
    }
    if route.port == 443 {
        origin.push("      noTLSVerify: true".into());
        if !route.host_header.is_empty() {
            origin.push(format!("      originServerName: {}", route.host_header));
        }
    }
    let origin = if origin.is_empty() { String::new() } else { format!("\n    originRequest:\n{}", origin.join("\n")) };
    format!("  - hostname: {}\n    service: {}{}\n", route.hostname, origin_service(route.port), origin)
}

fn list_tunnels(executable: &str) -> Result<Vec<TunnelRecord>, String> {
    let output = run_cloudflared(executable, &["tunnel", "list", "--output", "json"])?;
    if !output.status.success() {
        return Err(command_text(&output));
    }
    serde_json::from_slice(&output.stdout).map_err(|error| format!("Invalid tunnel list: {error}"))
}

fn find_or_create_tunnel(executable: &str, name: &str) -> Result<TunnelRecord, String> {
    if let Some(tunnel) = list_tunnels(executable)?
        .into_iter()
        .find(|tunnel| tunnel.name == name)
    {
        return Ok(tunnel);
    }

    let output = run_cloudflared(executable, &["tunnel", "create", name])?;
    ensure_success(output, "create the tunnel")?;
    list_tunnels(executable)?
        .into_iter()
        .find(|tunnel| tunnel.name == name)
        .ok_or_else(|| "Cloudflare created the tunnel but its ID could not be found".into())
}

#[tauri::command]
pub fn cloudflare_is_authenticated() -> Result<bool, String> {
    Ok(cloudflare_dir()?.join("cert.pem").is_file())
}

#[tauri::command]
pub fn cloudflare_login(executable: String) -> Result<String, String> {
    std::fs::create_dir_all(cloudflare_dir()?).map_err(|error| error.to_string())?;
    let output = run_cloudflared(&executable, &["tunnel", "login"])?;
    ensure_success(output, "authenticate this computer")?;

    if !cloudflare_is_authenticated()? {
        return Err("Cloudflare login finished without creating cert.pem".into());
    }
    Ok("Cloudflare account connected".into())
}

/// Writes `~/.cloudflared/devstack/<tunnel>.yml` with one ingress rule per route
/// and points DNS for hostnames that are new to this tunnel.
#[tauri::command(async)]
pub fn prepare_cloudflare_tunnel(
    executable: String,
    tunnel_name: String,
    routes: Vec<TunnelRoute>,
) -> Result<PreparedTunnel, String> {
    let tunnel_name = validate_tunnel_name(&tunnel_name)?;
    if routes.is_empty() {
        return Err("Add at least one hostname to the tunnel".into());
    }
    let mut routes = routes;
    for route in &mut routes {
        route.hostname = route.hostname.trim().trim_end_matches('.').to_ascii_lowercase();
        if !is_valid_domain(&route.hostname) {
            return Err(format!("Enter a valid custom domain instead of '{}', for example app.example.com", route.hostname));
        }
        validate_host_header(&route.host_header)?;
    }

    let base_dir = cloudflare_dir()?;
    if !base_dir.join("cert.pem").is_file() {
        return Err("CLOUDFLARE_LOGIN_REQUIRED".into());
    }

    let tunnel = find_or_create_tunnel(&executable, &tunnel_name)?;
    let credentials_path = base_dir.join(format!("{}.json", tunnel.id));
    if !credentials_path.is_file() {
        return Err(format!(
            "Tunnel credentials were not found at {}",
            credentials_path.display()
        ));
    }

    let config_dir = base_dir.join("devstack");
    std::fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    let config_path = config_dir.join(format!("{tunnel_name}.yml"));
    let already_routed = routed_hostnames(&config_path, &tunnel.id);

    let mut dns_routes_updated = Vec::new();
    for route in routes.iter().filter(|r| !already_routed.contains(&r.hostname)) {
        let output = run_cloudflared(
            &executable,
            &["tunnel", "route", "dns", "--overwrite-dns", &tunnel.id, &route.hostname],
        )?;
        ensure_success(output, "create the DNS route")?;
        dns_routes_updated.push(route.hostname.clone());
    }

    let credentials_yaml = credentials_path.to_string_lossy().replace('\\', "/");
    let ingress: String = routes.iter().map(ingress_yaml).collect();
    let config = format!(
        "tunnel: {}\ncredentials-file: {}\n\ningress:\n{}  - service: http_status:404\n",
        tunnel.id, credentials_yaml, ingress
    );
    std::fs::write(&config_path, config).map_err(|error| error.to_string())?;

    Ok(PreparedTunnel {
        tunnel_name,
        config_path: path_string(&config_path),
        public_urls: routes.iter().map(|r| format!("https://{}", r.hostname)).collect(),
        dns_routes_updated,
    })
}

/// Config for quick tunnels. Passing it stops cloudflared from loading
/// `~/.cloudflared/config.yml`, whose catch-all `http_status:404` ingress would
/// otherwise answer every trycloudflare.com request.
#[tauri::command]
pub fn cloudflare_quick_config() -> Result<String, String> {
    let dir = cloudflare_dir()?.join("devstack");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join("quick-tunnel.yml");
    // An empty file makes cloudflared log an error, so it carries one harmless key.
    std::fs::write(&path, "# DevStack quick tunnel: keeps ~/.cloudflared/config.yml from being loaded.\nno-autoupdate: true\n")
        .map_err(|error| error.to_string())?;
    Ok(path_string(&path))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownRoute {
    hostname: String,
    host_header: String,
    port: u16,
    tunnel_name: String,
}

fn parse_routes(config: &str, tunnel_name: &str) -> Vec<KnownRoute> {
    let mut routes: Vec<KnownRoute> = Vec::new();
    for line in config.lines().map(str::trim) {
        if let Some(hostname) = line.strip_prefix("- hostname:") {
            routes.push(KnownRoute { hostname: hostname.trim().to_string(), host_header: String::new(), port: 80, tunnel_name: tunnel_name.to_string() });
        } else if let (Some(service), Some(route)) = (line.strip_prefix("service:"), routes.last_mut()) {
            if let Some(port) = service.trim().rsplit(':').next().and_then(|p| p.trim_end_matches('/').parse().ok()) {
                route.port = port;
            }
        } else if let (Some(header), Some(route)) = (line.strip_prefix("httpHostHeader:"), routes.last_mut()) {
            route.host_header = header.trim().to_string();
        }
    }
    routes
}

/// Hostname routes found in DevStack tunnel configs, including the per-hostname
/// files older builds wrote, so hostname ownership survives an upgrade.
#[tauri::command]
pub fn cloudflare_known_routes() -> Vec<KnownRoute> {
    let Ok(dir) = cloudflare_dir().map(|d| d.join("devstack")) else { return Vec::new() };
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "yml") && p.file_stem().is_some_and(|s| s != "quick-tunnel"))
        .flat_map(|p| {
            let name = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
            parse_routes(&std::fs::read_to_string(&p).unwrap_or_default(), &name)
        })
        .collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    status: u16,
    server: String,
    cf_mitigated: String,
}

/// Requests a public URL without running JavaScript, the way a webhook sender would,
/// so Cloudflare challenges (which browsers pass silently) become visible.
#[tauri::command]
pub async fn probe_public_url(url: String) -> Result<ProbeResult, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(&url)
        .header("User-Agent", "DevStack-webhook-probe")
        .send()
        .await
        .map_err(|e| format!("Could not reach {url}: {e}"))?;
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    };
    Ok(ProbeResult {
        status: response.status().as_u16(),
        server: header("server"),
        cf_mitigated: header("cf-mitigated"),
    })
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::{ingress_yaml, is_valid_domain, parse_routes, routed_hostnames, validate_tunnel_name, TunnelRoute};
    use std::fs;

    #[test]
    fn validates_custom_domains() {
        assert!(is_valid_domain("app.example.com"));
        assert!(is_valid_domain("example.com"));
        assert!(!is_valid_domain("localhost"));
        assert!(!is_valid_domain("-app.example.com"));
        assert!(!is_valid_domain("app..example.com"));
    }

    #[test]
    fn validates_project_tunnel_names() {
        assert_eq!(validate_tunnel_name("ugcm-be").unwrap(), "ugcm-be");
        assert!(validate_tunnel_name("ugcm be").is_err());
        assert!(validate_tunnel_name("").is_err());
    }

    #[test]
    fn reads_hostnames_only_for_the_same_tunnel() {
        let path = std::env::temp_dir().join("devstack-cloudflare-config-test.yml");
        fs::write(
            &path,
            "tunnel: old-id\ningress:\n  - hostname: a.example.com\n    service: http://localhost:80\n  - service: http_status:404\n",
        )
        .unwrap();
        assert_eq!(routed_hostnames(&path, "old-id"), vec!["a.example.com".to_string()]);
        assert!(routed_hostnames(&path, "new-id").is_empty());
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn parses_routes_from_tunnel_config() {
        let config = "tunnel: x\ningress:\n  - hostname: api.thach.website\n    service: http://localhost:80\n    originRequest:\n      httpHostHeader: ugcm-be.test\n  - service: http_status:404\n";
        let routes = parse_routes(config, "api-thach-website");
        assert_eq!(routes.len(), 1);
        assert_eq!((routes[0].hostname.as_str(), routes[0].host_header.as_str(), routes[0].port), ("api.thach.website", "ugcm-be.test", 80));
    }

    #[test]
    fn origin_scheme_follows_port() {
        let http = ingress_yaml(&TunnelRoute { hostname: "a.example.com".into(), port: 80, host_header: "a.test".into() });
        assert!(http.contains("service: http://localhost:80"));
        assert!(!http.contains("noTLSVerify"));

        let https = ingress_yaml(&TunnelRoute { hostname: "a.example.com".into(), port: 443, host_header: "a.test".into() });
        assert!(https.contains("service: https://localhost:443"));
        assert!(https.contains("noTLSVerify: true") && https.contains("originServerName: a.test"));
    }
}
