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
    tunnelInstalled: { cloudflare: false, ngrok: false, nport: false },

    setTunnelProvider: (p) => set({ tunnelProvider: p }),
    setTunnelPort: (p) => set({ tunnelPort: parseInt(p) || 80 }),
    setTunnelProtocol: (p) => set({ tunnelProtocol: p }),
    setTunnelHostHeader: (h) => set({ tunnelHostHeader: h }),
    setTunnelStatus: (status) => set({ tunnelStatus: status }),
    setTunnelUrl: (url) => set({ tunnelPublicUrl: url }),

    addTunnelLog: (m, l = 'info') => set(s => ({
        tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m, l }].slice(-100)
    })),
    clearTunnelLogs: () => set({ tunnelLogs: [] }),

    checkTunnelsInstalled: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/$/, '');
            const tunnelDir = `${devDir}/bin/tunnels`;

            const cloudflareExists = await invoke('path_exists', { path: `${tunnelDir}/cloudflared.exe` });
            const ngrokExists = await invoke('path_exists', { path: `${tunnelDir}/ngrok.exe` });

            set({ tunnelInstalled: { cloudflare: cloudflareExists, ngrok: ngrokExists } });
        } catch (e) {
            console.error('checkTunnelsInstalled failed', e);
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
        const { tunnelProvider, tunnelPort, tunnelProtocol } = get();

        await get().stopTunnel();

        const hostHeader = get().tunnelHostHeader || '';
        set({ tunnelStatus: 'starting', tunnelPublicUrl: '' });
        const targetDesc = hostHeader ? hostHeader : `${tunnelProtocol}://localhost:${tunnelPort}`;
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
                args = ['tunnel', '--url', `${tunnelProtocol}://localhost:${tunnelPort}`];
                if (hostHeader) args.push('--http-host-header', hostHeader);
            } else if (tunnelProvider === 'ngrok') {
                if (authToken) {
                    await invoke('start_detached_process', { executable: exePath, args: ['config', 'add-authtoken', authToken] });
                }
                args = ['http', `${tunnelProtocol}://localhost:${tunnelPort}`, '--log', 'stdout', '--log-format', 'logfmt'];
                if (hostHeader) args.push('--host-header', hostHeader);
            }

            await invoke('spawn_command_stream', {
                executable: exePath,
                args,
                eventPrefix
            });

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
