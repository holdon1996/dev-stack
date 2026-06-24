# Cloudflare Tunnel Names by Project

## Goal
Default each custom Cloudflare tunnel to the selected project folder name while keeping the name editable and never deleting older tunnels automatically.

## Tasks
- [x] Derive and persist an editable tunnel name from the selected project folder.
- [x] Pass the chosen name through the store into native tunnel provisioning.
- [x] Reuse a matching existing tunnel and reroute DNS only when the generated config points to a different tunnel ID.
- [x] Add English and Vietnamese labels, hints, and input validation.
- [x] Verify React build, Rust tests, formatting, and focused static checks.

## Done When
- [x] Selecting `C:\devstack\www\ugcm-be` defaults the tunnel name to `ugcm-be`.
- [x] Restarting reuses the same named tunnel and config file.
- [x] Previously created tunnels remain untouched.
