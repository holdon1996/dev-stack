import { getApacheDir, getMysqlDir, getRedisDir } from '../lib/paths';

export const createServiceSlice = (set, get) => ({
    services: [
        { id: 1, name: 'Apache (DevStack)', type: 'web', version: '—', port: 80, status: 'stopped', pid: null, memory: '—' },
        { id: 2, name: 'MySQL (DevStack)', type: 'db', version: '—', port: 3306, status: 'stopped', pid: null, memory: '—' },
        { id: 3, name: 'PHP (DevStack)', type: 'php', version: '—', port: 9000, status: 'stopped', pid: null, memory: '—' },
        { id: 4, name: 'Redis (DevStack)', type: 'cache', version: '-', port: 6379, status: 'stopped', pid: null, memory: '—' },
    ],

    logs: { apache: [], mysql: [], php: [], redis: [] },
    currentLog: 'apache',
    portConflicts: {},
    _lastServiceCheck: 0,

    _resetPersistedForFreshInstall: (baseDir) => {
        const normalizedBaseDir = baseDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const rootPath = `${normalizedBaseDir}/www`;

        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) {
            console.error('failed to clear persisted storage:', e);
        }

        set(state => ({
            settings: {
                rootPath,
                devStackDir: normalizedBaseDir,
                autoStart: true,
                startOnBoot: false,
                port80: 80,
                portMySQL: 3306,
                trayIcon: true,
                editorPath: '',
                installPathInitialized: true,
                installBaseDir: normalizedBaseDir,
            },
            sites: [],
            databases: [],
            logs: { apache: [], mysql: [], php: [], redis: [] },
            portConflicts: {},
            apacheVersions: state.apacheVersions.map(v => ({ ...v, installed: false, active: false, installing: false, progress: 0 })),
            mysqlVersions: state.mysqlVersions.map(v => ({ ...v, installed: false, active: false, installing: false, progress: 0 })),
            phpVersions: state.phpVersions.map(v => ({ ...v, installed: false, active: false, installing: false, progress: 0 })),
            services: state.services.map(svc => ({ ...svc, version: '—', status: 'stopped', pid: null, memory: '—', path: '', portConflict: false })),
        }));
    },

    switchLog: (id) => {
        get().stopStreamingLogs?.();
        set({ currentLog: id });
        get().streamServiceLogs?.(id);
    },
    clearLog: () => set(s => ({ logs: { ...s.logs, [s.currentLog]: [] } })),

    startAll: async () => {
        for (const svc of get().services) {
            if (svc.type !== 'php' && svc.status !== 'running') await get().toggleService(svc.id);
        }
    },
    stopAll: async () => {
        for (const svc of get().services) {
            if (svc.type !== 'php' && svc.status === 'running') await get().toggleService(svc.id, 'stop');
        }
    },

    addServiceLog: (type, m, l = 'info') => set(s => ({
        logs: {
            ...s.logs,
            [type]: [...(s.logs[type] || []), { t: new Date().toLocaleTimeString(), m, l }].slice(-200)
        }
    })),

    checkServicesRunning: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const devDir = get().settings.devStackDir || 'C:/devstack';
            const procList = await invoke('scan_processes', { devDir });

            // Prepare list of ports to check in ONE batch call to Rust
            const portsToCheck = get().services.map(s => parseInt(s.port) || 0);
            const conflicts = await invoke('check_ports_status', { ports: portsToCheck });

            set(s => {
                const webSvcIdx = s.services.findIndex(x => x.type === 'web');
                const webMatches = procList.filter(p => p.type === 'web');
                const webProc = webMatches.find(p => p.is_devstack);
                const isApacheRunning = !!webProc;

                return {
                    services: s.services.map((svc, i) => {
                        if (svc.type === 'php') {
                            return {
                                ...svc,
                                status: isApacheRunning ? 'running' : 'stopped',
                                pid: isApacheRunning ? 'Apache' : null,
                                memory: '—',
                                path: 'Module of Apache',
                                portConflict: conflicts[i]
                            };
                        }

                        const matches = procList.filter(p => p.type === svc.type);
                        const proc = matches.find(p => p.is_devstack);

                        if (proc) {
                            if (svc.status === 'stopping') return svc; // Keep spinner while it dies

                            return {
                                ...svc,
                                status: 'running',
                                pid: proc.pid,
                                version: proc.version || svc.version,
                                memory: proc.memory + ' MB',
                                path: proc.path,
                                portConflict: false
                            };
                        }

                        if (svc.status === 'starting') return svc;

                        // Use the result from the batch port check
                        // Don't show conflict if service is actively starting/stopping
                        const isTransitioning = svc.status === 'starting' || svc.status === 'stopping';
                        return { ...svc, status: 'stopped', pid: null, memory: '—', path: '', portConflict: isTransitioning ? false : conflicts[i] };
                    })
                };
            });
        } catch (e) {
            console.error('checkServicesRunning failed:', e);
        }
    },

    killPort: async (port) => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const success = await invoke('kill_process_by_port', { port: parseInt(port) });
            if (success) {
                set(s => ({
                    portConflicts: { ...s.portConflicts, [port]: null },
                    services: s.services.map(svc =>
                        parseInt(svc.port) === parseInt(port)
                            ? { ...svc, portConflict: false }
                            : svc
                    )
                }));
                get().showToast(`Successfully killed process on port ${port}`, 'ok');
                await new Promise(r => setTimeout(r, 350));
                await get().checkServicesRunning();
                await new Promise(r => setTimeout(r, 350));
                await get().checkServicesRunning();
                const svc = get().services.find(s => parseInt(s.port) === parseInt(port));
                if (svc?.portConflict) {
                    get().showToast(`Port ${port} is still in use after kill attempt.`, 'warn');
                }
            } else {
                get().showToast(`Requesting Admin rights to kill process on port ${port}...`, 'info');
                const elevated = await invoke('kill_process_by_port_admin', { port: parseInt(port) });
                await new Promise(r => setTimeout(r, 500));
                await get().checkServicesRunning();
                await new Promise(r => setTimeout(r, 400));
                await get().checkServicesRunning();

                const svc = get().services.find(s => parseInt(s.port) === parseInt(port));
                if (elevated && !svc?.portConflict) {
                    set(s => ({
                        portConflicts: { ...s.portConflicts, [port]: null },
                        services: s.services.map(item =>
                            parseInt(item.port) === parseInt(port)
                                ? { ...item, portConflict: false }
                                : item
                        )
                    }));
                    get().showToast(`Successfully killed process on port ${port} with Admin rights.`, 'ok');
                } else {
                    get().showToast(`Could not kill process on port ${port}, even with Admin rights.`, 'danger');
                }
            }
        } catch {
            get().showToast('Failed to kill process - might need Admin rights', 'danger');
        }
    },

    toggleService: async (id, action) => {
        const t0 = performance.now();
        const svc = get().services.find(s => s.id === id);
        if (!svc) return;

        if (svc.type === 'php') {
            get().showToast('PHP runs inside Apache. Please Start/Stop Apache instead.', 'info');
            return;
        }

        let activeVer = svc.version;
        if (activeVer === '—' || !activeVer) {
            if (svc.type === 'web') activeVer = get().apacheVersions.find(v => v.active)?.version || '...';
            if (svc.type === 'db') activeVer = get().mysqlVersions.find(v => v.active)?.version || '...';
            if (svc.type === 'php') activeVer = get().phpVersions.find(v => v.active)?.version || '...';
            if (svc.type === 'cache') activeVer = 'Latest';
        }
        const svcLabel = `${svc.name.replace(' (DevStack)', '')} v${activeVer} (Port: ${svc.port})`;

        const isRunning = svc.status === 'running' || svc.pid;
        const shouldStop = action ? action === 'stop' : isRunning;
        const logType = svc.type === 'web' ? 'apache' : svc.type === 'db' ? 'mysql' : svc.type === 'cache' ? 'redis' : 'php';

        console.log(`[Timer] Toggle clicked for ${svc.name} - Action: ${shouldStop ? 'STOP' : 'START'}`);

        if (shouldStop) {
            get().showToast(`Stopping ${svcLabel}...`, 'info');
            get().addServiceLog(logType, `Stopping ${svcLabel} ...`, 'warn');
            set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopping' } : sv) }));

            const name = svc.type === 'web' ? 'httpd.exe' : svc.type === 'db' ? 'mysqld.exe' : svc.type === 'cache' ? 'redis-server.exe' : 'php-cgi.exe';
            const { invoke } = await import('@tauri-apps/api/core');

            const t1 = performance.now();
            await invoke('kill_process_by_name_exact', { name });
            if (svc.type === 'php') await invoke('kill_process_by_name_exact', { name: 'php.exe' });
            console.log(`[Timer] Native Rust kill done in ${(performance.now() - t1).toFixed(2)}ms`);

            const success = await get()._pollUntilStable(id, 'stopped');
            console.log(`[Timer] Total Stop Time: ${(performance.now() - t0).toFixed(2)}ms`);

            if (success) {
                get().showToast(`${svcLabel} stopped.`, 'ok');
                get().addServiceLog(logType, `${svcLabel} stopped successfully.`, 'ok');
            } else {
                get().showToast(`${svcLabel} stopped (force).`, 'warn');
                get().addServiceLog(logType, `${svcLabel} stopped (force).`, 'warn');
            }
        } else {
            get().showToast(`Starting ${svcLabel}...`, 'info');
            get().addServiceLog(logType, `Starting ${svcLabel}...`, 'info');
            set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'starting' } : sv) }));

            let started = true;
            const t1 = performance.now();

            if (svc.type === 'web') started = await get().startApache();
            if (svc.type === 'db') started = await get().startMysql();
            if (svc.type === 'php') started = await get().startPhp();
            if (svc.type === 'cache') started = await get().startRedis();

            console.log(`[Timer] Native Rust spawn done in ${(performance.now() - t1).toFixed(2)}ms`);

            if (started === false) {
                get().addServiceLog(logType, `${svcLabel} failed to start.`, 'err');
                set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
                return;
            }

            const success = await get()._pollUntilStable(id, 'running');
            console.log(`[Timer] Total Start Time: ${(performance.now() - t0).toFixed(2)}ms`);

            if (success) {
                const finalPid = get().services.find(s => s.id === id)?.pid || 'Unknown';
                get().showToast(`${svcLabel} is running.`, 'ok');
                get().addServiceLog(logType, `${svcLabel} started successfully. PID: ${finalPid}`, 'ok');
            } else {
                get().showToast(`${svcLabel} start timed out.`, 'danger');
                get().addServiceLog(logType, `${svcLabel} start timed out or port conflict.`, 'err');
            }
        }
    },

    _pollUntilStable: async (id, targetStatus, maxAttempts = 12) => {
        // Delays aligned with Rust scan_processes 500ms throttle
        // Each delay >= 500ms ensures fresh process data on every poll
        const delays = [300, 500, 600, 800, 1000, 1000, 1500, 1500, 2000, 2000, 2000, 2000];

        for (let i = 0; i < maxAttempts; i++) {
            // Give the OS a tiny fraction of time to spin up the process tree
            const delay = delays[i] || 1000;
            await new Promise(r => setTimeout(r, delay));

            await get().checkServicesRunning();
            const svc = get().services.find(s => s.id === id);
            if (svc && svc.status === targetStatus) return true;
        }

        // Fallback if timed out: reset to stopped if it was starting, or running if it failed to stop
        set(s => ({
            services: s.services.map(sv => {
                if (sv.id === id) {
                    if (sv.status === 'starting') return { ...sv, status: 'stopped' };
                    if (sv.status === 'stopping') return { ...sv, status: 'running' };
                }
                return sv;
            })
        }));
        return false;
    },

    updateServicePort: async (id, port) => {
        const intPort = parseInt(port) || 0;
        const { invoke } = await import('@tauri-apps/api/core');

        set(s => ({
            services: s.services.map(sv => sv.id === id ? { ...sv, port: intPort } : sv)
        }));

        const svc = get().services.find(s => s.id === id);
        if (svc?.type === 'web') get().updateSettings({ port80: intPort });
        if (svc?.type === 'db') {
            get().updateSettings({ portMySQL: intPort });
            // Sync with my.ini
            const activeV = get().mysqlVersions.find(v => v.active)?.version;
            if (activeV) {
                const iniPath = getMysqlDir(get(), activeV).replace(/\//g, '\\') + '\\my.ini';
                await invoke('update_ini_value', { filePath: iniPath, key: 'port', value: intPort.toString() });
            }
        }
        if (svc?.type === 'cache') get().updateSettings({ portRedis: intPort });
        if (svc?.type === 'php') get().updateSettings({ portPHP: intPort });

        get().showToast(`Updated ${svc?.name} port to ${intPort} and saved to config`, 'ok');
        get().checkServicesRunning();
    },

    initApp: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const settings = get().settings;
            const normalizedDevDir = (settings.devStackDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
            const normalizedRootPath = (settings.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
            const normalizedInstallBase = (settings.installBaseDir || '').replace(/\\/g, '/').replace(/\/+$/, '');
            const isDefaultPath =
                normalizedDevDir.toLowerCase() === 'c:/devstack' &&
                normalizedRootPath.toLowerCase() === 'c:/devstack/www';
            const isMissingPath = !settings.devStackDir || !settings.rootPath;
            const detectedBaseDir = await invoke('detect_install_base_dir');
            if (detectedBaseDir) {
                const baseDir = detectedBaseDir.replace(/\\/g, '/').replace(/\/+$/, '');
                const rootPath = `${baseDir}/www`;
                const installDirChanged =
                    !!normalizedInstallBase &&
                    normalizedInstallBase.toLowerCase() !== baseDir.toLowerCase();
                const legacyPersistedDirMismatch =
                    !normalizedInstallBase &&
                    !!normalizedDevDir &&
                    normalizedDevDir.toLowerCase() !== baseDir.toLowerCase();
                const shouldAdoptInstallDir =
                    installDirChanged ||
                    legacyPersistedDirMismatch ||
                    ((!settings.installPathInitialized && (isDefaultPath || isMissingPath)) || isDefaultPath);

                const wasFreshInstall = await invoke('ensure_install_marker', { baseDir });

                if (shouldAdoptInstallDir) {
                    await invoke('ensure_devstack_layout', { baseDir });

                    if (wasFreshInstall || installDirChanged || legacyPersistedDirMismatch) {
                        get()._resetPersistedForFreshInstall(baseDir);
                    } else {
                        set(s => ({
                            settings: {
                                ...s.settings,
                                devStackDir: baseDir,
                                rootPath,
                                installPathInitialized: true,
                                installBaseDir: baseDir,
                            }
                        }));
                    }

                } else if (!normalizedInstallBase) {
                    set(s => ({
                        settings: {
                            ...s.settings,
                            installBaseDir: baseDir,
                        }
                    }));
                }
            }
        } catch (e) {
            console.error('install path initialization failed:', e);
        }

        // Sync persisted ports to services
        const s = get().settings;
        set(state => ({
            services: state.services.map(svc => {
                if (svc.type === 'web') return { ...svc, port: s.port80 || svc.port };
                if (svc.type === 'db') return { ...svc, port: s.portMySQL || svc.port };
                if (svc.type === 'cache') return { ...svc, port: s.portRedis || svc.port };
                if (svc.type === 'php') return { ...svc, port: s.portPHP || svc.port };
                return svc;
            })
        }));

        // Initial checks and scans
        await get().detectElevation?.();
        await get().checkServicesRunning();
        get().scanInstalledApache();
        get().scanInstalledPhp();
        get().scanInstalledMysql();
        get().scanSites();

        const autoMap = get().settings.autoStartMap || {};
        get().services.forEach(svc => {
            if (svc.type !== 'php' && autoMap[svc.id] === true && svc.status !== 'running') {
                if (svc.portConflict?.inUse) return; // Prevent infinite spinning
                get().toggleService(svc.id);
            }
        });

        get().showToast('DevStack ready', 'ok');
        get().fetchServiceLogs('apache');
    },

    killAllChildProcesses: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const processes = ['httpd.exe', 'mysqld.exe', 'redis-server.exe', 'php-cgi.exe', 'php.exe'];
            await Promise.all(processes.map(name => invoke('kill_process_by_name_exact', { name })));
        } catch (e) {
            console.error('Failed to kill processes natively', e);
        }
    },

    openTerminal: async (prjPath) => {
        if (prjPath) {
            await get().detectAndSwitchPhpForProject(prjPath);
        }

        const s = get().settings;
        const devDir = (s.devStackDir || 'C:/devstack');
        const targetPath = (prjPath || s.rootPath || devDir).replace(/\//g, '\\');

        const phpActive = get().phpVersions.find(v => v.active);
        const { invoke } = await import('@tauri-apps/api/core');

        // We use cmd.exe as a wrapper to set the title and current directory easily
        // but start it detached.
        await invoke('start_detached_process', {
            executable: 'cmd.exe',
            args: ['/C', 'start', 'cmd.exe', '/K', `cd /d "${targetPath}" && title DevStack Terminal`]
        });
    },

    checkPortConflict: async (port) => {
        if (!port || port === '—') return false;
        try {
            const intPort = parseInt(port);
            const { invoke } = await import('@tauri-apps/api/core');
            const [isBusy] = await invoke('check_ports_status', { ports: [intPort] });

            if (isBusy) {
                set(s => ({ portConflicts: { ...s.portConflicts, [port]: { inUse: true, pid: 'Unknown' } } }));
                return true;
            }
            set(s => ({ portConflicts: { ...s.portConflicts, [port]: null } }));
            return false;
        } catch (e) {
            console.error('checkPortConflict failed:', e);
            return false;
        }
    },

    _activeListeners: {},
    fetchServiceLogs: async (type) => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { settings, apacheVersions, mysqlVersions } = get();
            let logPath = "";

            if (type === 'apache') {
                const act = apacheVersions.find(a => a.active && a.installed);
                if (act) {
                    const base = getApacheDir(get(), act.version);
                    // Match the file in your screenshot: "error_log" (underscore)
                    logPath = `${base}/logs/error_log`;
                    // Backup check if underscore version doesn't exist
                    const altPath = `${base}/logs/error.log`;
                    const exists = await invoke('path_exists', { path: logPath.replace(/\//g, '\\') });
                    if (!exists) {
                        const altExists = await invoke('path_exists', { path: altPath.replace(/\//g, '\\') });
                        if (altExists) logPath = altPath;
                    }
                }
            } else if (type === 'mysql') {
                const act = mysqlVersions.find(m => m.active && m.installed);
                if (act) {
                    const base = getMysqlDir(get(), act.version);
                    // Check standard locations
                    const paths = [
                        `${base}/data/mysql_error.log`,
                        `${base}/mysql_error.log`,
                        `${base}/data/${settings.computerName || 'mysql'}.err`
                    ];
                    for (const p of paths) {
                        if (await invoke('path_exists', { path: p.replace(/\//g, '\\') })) {
                            logPath = p;
                            break;
                        }
                    }
                }
            }

            if (logPath) {
                const normalizedPath = logPath.replace(/\//g, '\\');
                const exists = await invoke('path_exists', { path: normalizedPath });

                if (!exists) {
                    get().addServiceLog(type, `Log file not found at: ${normalizedPath}`, 'warn');
                    return;
                }

                const tail = await invoke('read_file_tail', { path: normalizedPath, lines: 50 });
                if (tail) {
                    const lines = tail.split('\n').filter(l => l.trim()).map(m => ({
                        t: 'File',
                        m,
                        l: m.toLowerCase().includes('error') ? 'err' : 'info'
                    }));
                    set(s => ({ logs: { ...s.logs, [type]: [...(s.logs[type] || []), ...lines].slice(-200) } }));
                }
            }
        } catch (e) {
            console.error('fetchServiceLogs failed', e);
            get().addServiceLog(type, `Failed to load logs: ${e.message || e}`, 'err');
        }
    },

    streamServiceLogs: async (type) => {
        const { _activeListeners, addServiceLog } = get();
        if (_activeListeners[type]) return;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');
            const { settings, apacheVersions, mysqlVersions } = get();

            let logPath = "";
            if (type === 'apache') {
                const act = apacheVersions.find(a => a.active && a.installed);
                if (act) {
                    const base = getApacheDir(get(), act.version);
                    logPath = `${base}/logs/error_log`;
                    const altPath = `${base}/logs/error.log`;
                    const exists = await invoke('path_exists', { path: logPath.replace(/\//g, '\\') });
                    if (!exists) {
                        const altExists = await invoke('path_exists', { path: altPath.replace(/\//g, '\\') });
                        if (altExists) logPath = altPath;
                    }
                }
            } else if (type === 'mysql') {
                const act = mysqlVersions.find(m => m.active && m.installed);
                if (act) {
                    const base = getMysqlDir(get(), act.version);
                    const paths = [
                        `${base}/data/mysql_error.log`,
                        `${base}/mysql_error.log`,
                        `${base}/data/error.log`
                    ];
                    for (const p of paths) {
                        if (await invoke('path_exists', { path: p.replace(/\//g, '\\') })) {
                            logPath = p;
                            break;
                        }
                    }
                }
            }

            if (logPath) {
                const normalizedPath = logPath.replace(/\//g, '\\');
                const exists = await invoke('path_exists', { path: normalizedPath });

                if (!exists) {
                    addServiceLog(type, `Log file not yet created — start the service first to generate logs.`, 'warn');
                    return;
                }

                const eventName = `log-stream-${type}`;
                const unlisten = await listen(eventName, (event) => {
                    addServiceLog(type, `[File] ${event.payload}`, event.payload.toLowerCase().includes('error') ? 'err' : 'info');
                });

                await invoke('stream_log_file', {
                    eventName,
                    path: normalizedPath
                });

                set(s => ({ _activeListeners: { ...s._activeListeners, [type]: unlisten } }));
            }
        } catch (e) {
            console.error(`Stream ${type} failed`, e);
            addServiceLog(type, `Streaming failed: ${e.message || e}`, 'err');
        }
    },

    stopStreamingLogs: () => {
        const { _activeListeners } = get();
        Object.values(_activeListeners).forEach(un => un());
        set({ _activeListeners: {} });
    }
});
