# Cloudflare Custom Domain

## Goal
Keep quick tunnels unchanged while letting users expose a selected local project on a Cloudflare custom domain without manually managing tunnel IDs or config files.

## Tasks
- [x] Add native commands to inspect Cloudflare login state and provision a named tunnel, DNS route, and generated config.
- [x] Extend the tunnel store with quick/custom modes, custom-domain settings, login flow, and named-tunnel startup arguments.
- [x] Add a compact Cloudflare-only custom-domain UI using the existing project selector.
- [x] Add matching English and Vietnamese translations and persist reusable custom-domain settings.
- [x] Verify frontend build, Rust compilation/tests, lint, and the generated cloudflared command path.

## Done When
- [x] Quick Cloudflare and Ngrok behavior remains unchanged.
- [x] A logged-in Cloudflare user can select a project, enter a domain, and start a named tunnel with a generated config.
- [x] Missing login and invalid inputs produce actionable UI feedback.
