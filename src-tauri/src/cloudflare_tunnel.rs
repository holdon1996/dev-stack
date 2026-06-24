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
    public_url: String,
    dns_route_updated: bool,
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

fn is_valid_domain(domain: &str) -> bool {
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

fn config_uses_tunnel(config_path: &Path, tunnel_id: &str) -> bool {
    std::fs::read_to_string(config_path)
        .ok()
        .and_then(|config| {
            config.lines().find_map(|line| {
                line.trim()
                    .strip_prefix("tunnel:")
                    .map(|value| value.trim().to_string())
            })
        })
        .is_some_and(|configured_id| configured_id == tunnel_id)
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

#[tauri::command]
pub fn prepare_cloudflare_tunnel(
    executable: String,
    domain: String,
    tunnel_name: String,
    protocol: String,
    port: u16,
    host_header: String,
) -> Result<PreparedTunnel, String> {
    let domain = domain.trim().trim_end_matches('.').to_ascii_lowercase();
    let tunnel_name = validate_tunnel_name(&tunnel_name)?;
    if !is_valid_domain(&domain) {
        return Err("Enter a valid custom domain, for example app.example.com".into());
    }
    if !matches!(protocol.as_str(), "http" | "https") {
        return Err("Custom domains support HTTP or HTTPS origins only".into());
    }
    validate_host_header(&host_header)?;

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
    let config_path = config_dir.join(format!("{}.yml", domain.replace('.', "-")));
    let dns_route_updated = !config_uses_tunnel(&config_path, &tunnel.id);
    if dns_route_updated {
        let output = run_cloudflared(
            &executable,
            &[
                "tunnel",
                "route",
                "dns",
                "--overwrite-dns",
                &tunnel.id,
                &domain,
            ],
        )?;
        ensure_success(output, "create the DNS route")?;
    }

    let host_header_yaml = if host_header.is_empty() {
        String::new()
    } else {
        format!("\n    originRequest:\n      httpHostHeader: {host_header}")
    };
    let credentials_yaml = credentials_path.to_string_lossy().replace('\\', "/");
    let config = format!(
        "tunnel: {}\ncredentials-file: {}\n\ningress:\n  - hostname: {}\n    service: {}://localhost:{}{}\n  - service: http_status:404\n",
        tunnel.id, credentials_yaml, domain, protocol, port, host_header_yaml
    );
    std::fs::write(&config_path, config).map_err(|error| error.to_string())?;

    Ok(PreparedTunnel {
        tunnel_name,
        config_path: path_string(&config_path),
        public_url: format!("https://{domain}"),
        dns_route_updated,
    })
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::{config_uses_tunnel, is_valid_domain, validate_tunnel_name};
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
    fn detects_when_config_points_to_another_tunnel() {
        let path = std::env::temp_dir().join("devstack-cloudflare-config-test.yml");
        fs::write(
            &path,
            "tunnel: old-id\ningress:\n  - service: http_status:404\n",
        )
        .unwrap();
        assert!(config_uses_tunnel(&path, "old-id"));
        assert!(!config_uses_tunnel(&path, "new-id"));
        fs::remove_file(path).unwrap();
    }
}
