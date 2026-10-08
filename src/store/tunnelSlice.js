// Global-ish listeners for this slice to survive across calls but stay unique
let tunnelListeners = { stdout: null, stderr: null, exit: null };

export const createTunnelSlice = (set, get) => ({
    tunnelProvider: 'cloudflare',
    tunnelStatus: 'stopped',
    tunnelPublicUrl: '',
    tunnelPort: 80,
    tunnelProtocol: 'http',
    tunnelLogs: [],
    tunnelInstallProgress: { pct: 0, downloaded: 0, total: 0 },
    tunnelHostHeader: '',
    tunnelMode: 'quick',
    tunnelCustomDomain: '',
    tunnelCustomName: '',
    cloudflareAuthStatus: 'unknown',
    tunnelRoutes: [],
    tunnelProbePath: '/',
    tunnelInstalled: { cloudflare: false, ngrok: false, nport: false },

    setTunnelProvider: (p) => set({ tunnelProvider: p }),
    setTunnelPort: (p) => set({ tunnelPort: parseInt(p) || 80 }),
    setTunnelProtocol: (p) => set({ tunnelProtocol: p }),
    setTunnelHostHeader: (h) => set({ tunnelHostHeader: h }),
    setTunnelMode: (mode) => set({ tunnelMode: mode }),
    setTunnelCustomDomain: (domain) => set({ tunnelCustomDomain: domain }),
    setTunnelCustomName: (name) => set({ tunnelCustomName: name }),
    setTunnelStatus: (status) => set({ tunnelStatus: status }),
    setTunnelUrl: (url) => set({ tunnelPublicUrl: url }),

    addTunnelLog: (m, l = 'info') => set(s => ({
        tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m, l }].slice(-100)
    })),
    clearTunnelLogs: () => set({ tunnelLogs: [] }),

    setTunnelProbePath: (path) => set({ tunnelProbePath: path }),

    /** Adds hostname routes found in existing DevStack tunnel configs (incl. older builds). */
    loadKnownTunnelRoutes: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const known = await invoke('cloudflare_known_routes').catch(() => []);
        set(s => ({
            tunnelRoutes: [
                ...s.tunnelRoutes,
                ...known
                    .filter(k => !s.tunnelRoutes.some(r => r.hostname === k.hostname))
                    .map(k => ({
                        hostname: k.hostname,
                        tunnelName: k.tunnelName,
                        siteKey: s.sites.find(site => site.domain === k.hostHeader)?.key || k.hostHeader,
                        hostHeader: k.hostHeader,
                        port: k.port,
                    })),
            ],
        }));
    },

    removeTunnelRoute: (hostname) => set(s => ({ tunnelRoutes: s.tunnelRoutes.filter(r => r.hostname !== hostname) })),

    /**
     * Requests the public URL the way a webhook sender would (no JS). Browsers pass
     * Cloudflare challenges silently, server-to-server webhooks do not.
     */
    probeTunnel: async (baseUrl) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const path = get().tunnelProbePath.trim() || '/';
        const url = baseUrl.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
        for (let attempt = 0; attempt < 4; attempt++) {
            await new Promise(r => setTimeout(r, 5000));
            if (get().tunnelStatus !== 'running') return;
            try {
                const res = await invoke('probe_public_url', { url });
                const challenged = res.cfMitigated === 'challenge' || (res.status === 403 && /cloudflare/i.test(res.server));
                if (challenged) {
                    get().addTunnelLog(get().t('tunnelChallengeWarn'), 'warn');
                    get().showToast(get().t('tunnelChallengeWarn'), 'warn');
                    return;
                }
                if (res.status !== 530 && res.status !== 502) {
                    get().addTunnelLog(get().t('tunnelProbeOk', { url, status: res.status }), 'ok');
                    return;
                }
            } catch (e) {
                get().addTunnelLog(`${e}`, 'warn');
            }
        }
    },

    checkTunnelsInstalled: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/$/, '');
            const tunnelDir = `${devDir}/bin/tunnels`;

            const cloudflareExists = await invoke('path_exists', { path: `${tunnelDir}/cloudflared.exe` });
            const ngrokExists = await invoke('path_exists', { path: `${tunnelDir}/ngrok.exe` });
            const cloudflareAuthenticated = cloudflareExists
                ? await invoke('cloudflare_is_authenticated')
                : false;

            set({
                tunnelInstalled: { cloudflare: cloudflareExists, ngrok: ngrokExists },
                cloudflareAuthStatus: cloudflareAuthenticated ? 'connected' : 'disconnected'
            });
            await get().loadKnownTunnelRoutes();
        } catch (e) {
            console.error('checkTunnelsInstalled failed', e);
        }
    },

    connectCloudflare: async () => {
        const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
        const executable = `${devDir}\\bin\\tunnels\\cloudflared.exe`;
        set({ cloudflareAuthStatus: 'connecting' });
        get().addTunnelLog('Opening Cloudflare authorization...', 'info');

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('cloudflare_login', { executable });
            set({ cloudflareAuthStatus: 'connected' });
            get().addTunnelLog('✓ Cloudflare account connected.', 'ok');
        } catch (error) {
            const message = error?.message || error?.toString?.() || 'Cloudflare login failed';
            set({ cloudflareAuthStatus: 'disconnected' });
            get().addTunnelLog(`❌ ${message}`, 'err');
        }
    },

    stopTunnel: async () => {
        try {
            const { tunnelProvider } = get();
            const exeName = tunnelProvider === 'cloudflare' ? 'cloudflared.exe' : `${tunnelProvider}.exe`;

            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('kill_process_by_name_exact', { name: exeName });

            set({ tunnelStatus: 'stopped', tunnelPublicUrl: '' });
            get().addTunnelLog('Tunnel disconnected.', 'warn');
        } catch (e) {
            console.error('Stop tunnel failed:', e);
        }
    },

    startTunnel: async (authToken = '') => {
        const {
            tunnelProvider, tunnelPort, tunnelProtocol, tunnelMode,
            tunnelCustomDomain, tunnelCustomName, tunnelHostHeader, tunnelRoutes, sites, t
        } = get();
        // Apache on 443 speaks TLS, every other local port is plain HTTP.
        const originScheme = tunnelProtocol === 'tcp' ? 'tcp' : tunnelPort === 443 ? 'https' : 'http';

        await get().stopTunnel();

        const hostHeader = tunnelHostHeader || '';
        const isCustomCloudflare = tunnelProvider === 'cloudflare' && tunnelMode === 'custom';
        if (isCustomCloudflare && (!hostHeader || !tunnelCustomDomain.trim() || !tunnelCustomName.trim())) {
            get().addTunnelLog('Select a project, tunnel name, and custom domain first.', 'warn');
            return;
        }
        const hostname = tunnelCustomDomain.trim().toLowerCase();
        const siteKey = sites.find(site => site.domain === hostHeader)?.key || hostHeader;
        if (isCustomCloudflare) {
            const owner = tunnelRoutes.find(r => r.hostname === hostname);
            if (owner && owner.siteKey !== siteKey) {
                const { ask } = await import('@tauri-apps/plugin-dialog');
                const move = await ask(t('tunnelHostnameTaken', { hostname, project: owner.siteKey, target: siteKey }), {
                    title: 'DevStack', kind: 'warning', okLabel: t('tunnelMoveHostname'), cancelLabel: t('cancel'),
                });
                if (!move) return;
            }
        }
        set({ tunnelStatus: 'starting', tunnelPublicUrl: '' });
        const targetDesc = isCustomCloudflare
            ? `${tunnelCustomDomain.trim()} → ${hostHeader}`
            : hostHeader || `${originScheme}://localhost:${tunnelPort}`;
        get().addTunnelLog(`Starting ${tunnelProvider} on ${targetDesc}...`, 'info');

        const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
        const exePath = `${devDir}\\bin\\tunnels\\${tunnelProvider === 'cloudflare' ? 'cloudflared' : tunnelProvider}.exe`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            const eventPrefix = 'tunnel-svc';

            // Clean up existing listeners to avoid memory leaks and duplicate triggers
            if (tunnelListeners.stdout) tunnelListeners.stdout();
            if (tunnelListeners.stderr) tunnelListeners.stderr();
            if (tunnelListeners.exit) tunnelListeners.exit();

            tunnelListeners.stdout = await listen(`${eventPrefix}-stdout`, event => {
                const l = event.payload.trim();
                if (l) get().addTunnelLog(`[STDOUT] ${l}`);

                // Ngrok v3 with --log=stdout --log-format=logfmt writes the tunnel URL to STDOUT
                // Format: url=https://xxxx.ngrok-free.app or url=https://xxxx.ngrok.io
                const ngrokStdoutMatch = l.match(/url=(https:\/\/[^\s]+)/);
                if (ngrokStdoutMatch && get().tunnelStatus === 'starting') {
                    set({ tunnelStatus: 'running', tunnelPublicUrl: ngrokStdoutMatch[1] });
                    get().addTunnelLog(`✓ Tunnel established: ${ngrokStdoutMatch[1]}`, 'ok');
                }
            });

            tunnelListeners.stderr = await listen(`${eventPrefix}-stderr`, event => {
                const l = event.payload.trim();
                if (!l) return;
                get().addTunnelLog(l, 'info');

                // Extract Cloudflare URL
                const match = l.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if (match && get().tunnelStatus === 'starting') {
                    set({ tunnelStatus: 'running', tunnelPublicUrl: match[0] });
                    get().addTunnelLog(`✓ Tunnel established: ${match[0]}`, 'ok');
                    get().probeTunnel(match[0]);
                }

                // Extract Ngrok URL
                const ngrokMatch = l.match(/url=(https:\/\/[^\s]+)/);
                if (ngrokMatch && get().tunnelStatus === 'starting') {
                    set({ tunnelStatus: 'running', tunnelPublicUrl: ngrokMatch[1] });
                    get().addTunnelLog(`✓ Tunnel established: ${ngrokMatch[1]}`, 'ok');
                }
            });

            tunnelListeners.exit = await listen(`${eventPrefix}-exit`, event => {
                const code = event.payload;
                if (get().tunnelStatus !== 'stopped') {
                    set({ tunnelStatus: 'stopped' });
                    get().addTunnelLog(`Tunnel closed with code ${code}`, 'warn');
                }
            });

            let args = [];
            if (tunnelProvider === 'cloudflare') {
                if (isCustomCloudflare) {
                    // One named tunnel serves every hostname assigned to it; each keeps its own host header.
                    const tunnelName = tunnelCustomName.trim();
                    const routes = [
                        ...get().tunnelRoutes.filter(r => r.hostname !== hostname),
                        { hostname, tunnelName, siteKey, hostHeader, port: tunnelPort },
                    ];
                    const prepared = await invoke('prepare_cloudflare_tunnel', {
                        executable: exePath,
                        tunnelName,
                        routes: routes.filter(r => r.tunnelName === tunnelName).map(({ hostname: h, port, hostHeader: hh }) => ({ hostname: h, port, hostHeader: hh })),
                    });
                    set({ tunnelRoutes: routes, tunnelPublicUrl: `https://${hostname}` });
                    args = ['tunnel', '--config', prepared.configPath, 'run', prepared.tunnelName];
                    get().addTunnelLog(`Using config: ${prepared.configPath} (${prepared.publicUrls.join(', ')})`, 'info');
                    for (const dns of prepared.dnsRoutesUpdated) {
                        get().addTunnelLog(t('tunnelDnsRouted', { hostname: dns }), 'warn');
                    }
                } else {
                    // An empty DevStack config keeps ~/.cloudflared/config.yml (and its catch-all 404) out.
                    const quickConfig = await invoke('cloudflare_quick_config');
                    args = ['tunnel', '--config', quickConfig, '--url', `${originScheme}://localhost:${tunnelPort}`];
                    if (hostHeader) args.push('--http-host-header', hostHeader);
                    if (originScheme === 'https') {
                        args.push('--no-tls-verify');
                        if (hostHeader) args.push('--origin-server-name', hostHeader);
                    }
                }
            } else if (tunnelProvider === 'ngrok') {
                if (authToken) {
                    await invoke('start_detached_process', { executable: exePath, args: ['config', 'add-authtoken', authToken] });
                }
                args = ['http', `${originScheme}://localhost:${tunnelPort}`, '--log', 'stdout', '--log-format', 'logfmt'];
                if (hostHeader) args.push('--host-header', hostHeader);
            }

            await invoke('spawn_command_stream', {
                executable: exePath,
                args,
                eventPrefix
            });

            if (isCustomCloudflare) {
                set({ tunnelStatus: 'running' });
                get().addTunnelLog(`✓ Tunnel established: https://${hostname}`, 'ok');
                get().probeTunnel(`https://${hostname}`);
            }

        } catch (e) {

            const errMsg = e?.message || e?.toString() || 'Unknown error';
            get().addTunnelLog(`❌ ERROR: ${errMsg}`, 'err');
            console.error('startTunnel failed:', e, 'Path:', exePath);
            set({ tunnelStatus: 'stopped' });
        }

    },

    installTunnelBinary: async (provider) => {
        try {
            const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/$/, '');
            const destDir = `${devDir}/bin/tunnels`;
            const exeName = provider === 'cloudflare' ? 'cloudflared.exe' : `${provider}.exe`;

            set({ tunnelStatus: 'installing', tunnelInstallProgress: { pct: 0, downloaded: 0, total: 0 } });
            get().addTunnelLog(`Downloading ${provider}...`);

            let downloadUrl = '';
            if (provider === 'cloudflare') {
                downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
            } else if (provider === 'ngrok') {
                downloadUrl = 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip';
            }

            if (!downloadUrl) {
                get().addTunnelLog(`❌ No download link for ${provider}`, 'err');
                set({ tunnelStatus: 'stopped' });
                return;
            }

            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            let result = null;
            let unlisten = null;
            let unlistenProgress = await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload || {};
                if (svcType !== 'tunnel') return;
                set({ tunnelInstallProgress: { pct: pct || 0, downloaded: downloaded || 0, total: total || 0 } });
            });

            if (provider === 'cloudflare') {
                unlisten = await listen('tunnel-install-log', (event) => {
                    get().addTunnelLog(event.payload, 'info');
                });
                get().addTunnelLog(`Download URL: ${downloadUrl}`, 'info');
                get().addTunnelLog('Downloading standalone cloudflared.exe...', 'info');
                await invoke('download_file_with_progress', {
                    svcType: 'tunnel',
                    label: 'cloudflared.exe',
                    url: downloadUrl,
                    destPath: `${destDir}/${exeName}`.replace(/\//g, '\\')
                });
                result = "SUCCESS";
            } else {
                unlisten = await listen('tunnel-install-log', (event) => {
                    get().addTunnelLog(event.payload, 'info');
                });
                get().addTunnelLog(`Download URL: ${downloadUrl}`, 'info');

                // ZIP-based installers such as ngrok still go through the generic extractor.
                result = await invoke('install_binary', {
                    svcType: 'tunnel',
                    version: 'latest',
                    url: downloadUrl,
                    destDir: `${destDir}/${exeName.replace('.exe', '')}`,
                    expectedSizeMb: null
                });
            }

            if (unlisten) unlisten();
            if (unlistenProgress) unlistenProgress();

            if (result === "SUCCESS") {
                set(s => ({
                    tunnelStatus: 'stopped',
                    tunnelInstalled: { ...s.tunnelInstalled, [provider]: true },
                    tunnelInstallProgress: { pct: 100, downloaded: s.tunnelInstallProgress.downloaded, total: s.tunnelInstallProgress.total }
                }));
                get().addTunnelLog(`✓ ${provider} installed successfully!`, 'ok');
                get().showToast(`${provider} installed!`, 'ok');
            }
        } catch (e) {
            set({ tunnelStatus: 'stopped' });
            const errMsg = e?.message || e?.toString?.() || 'Unknown error';
            get().addTunnelLog(`❌ ERROR: ${errMsg}`, 'err');
            get().showToast(`Install failed`, 'warn');
        }
    }
});
