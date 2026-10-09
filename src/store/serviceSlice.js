import { getApacheDir, getMailpitExe, getMysqlDir } from '../lib/paths';

const getVersionFromServicePath = (path, prefix) => {
    const normalized = (path || '').replace(/\\/g, '/');
    const match = normalized.match(new RegExp(`/${prefix}-(\\d+(?:\\.\\d+)+)(?:/|$)`, 'i'));
    return match?.[1] || null;
};

export const createServiceSlice = (set, get) => ({
    services: [
        { id: 1, name: 'Apache (DevStack)', type: 'web', version: '—', port: 80, status: 'stopped', pid: null, memory: '—' },
        { id: 2, name: 'MySQL (DevStack)', type: 'db', version: '—', port: 3306, status: 'stopped', pid: null, memory: '—' },
        { id: 3, name: 'PHP (DevStack)', type: 'php', version: '—', port: 0, status: 'stopped', pid: null, memory: '—' },
        { id: 4, name: 'Redis (DevStack)', type: 'cache', version: '-', port: 6379, status: 'stopped', pid: null, memory: '—' },
        { id: 5, name: 'Mailpit (DevStack)', type: 'mail', version: '—', port: 1025, status: 'stopped', pid: null, memory: '—' },
        { id: 6, name: 'MinIO (DevStack)', type: 'storage', version: '—', port: 9000, status: 'stopped', pid: null, memory: '—' },
    ],

    logs: { apache: [], mysql: [], php: [], redis: [], mail: [], storage: [] },
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
                mailProvider: 'mailpit',
                mailHost: '127.0.0.1',
                mailSmtpPort: 1025,
                mailUiPort: 8025,
                trayIcon: true,
                editorPath: '',
                installPathInitialized: true,
                installBaseDir: normalizedBaseDir,
            },
            sites: [],
            databases: [],
            logs: { apache: [], mysql: [], php: [], redis: [], mail: [] },
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

    startMailpit: async () => {
        const settings = get().settings;
        const mailpitExe = getMailpitExe(get());
        const host = settings.mailHost || '127.0.0.1';
        const smtpPort = parseInt(settings.mailSmtpPort || 1025, 10);
        const uiPort = parseInt(settings.mailUiPort || 8025, 10);

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const installed = await invoke('path_exists', { path: mailpitExe });
            if (!installed) {
                get().showToast('Hãy cài Mailpit trong trang Mail Server trước.', 'warn');
                return false;
            }

            const ok = await invoke('start_detached_process', {
                executable: mailpitExe,
                args: [`--smtp=${host}:${smtpPort}`, `--listen=${host}:${uiPort}`],
            });
            return !!ok;
        } catch (e) {
            console.error('startMailpit failed:', e);
            get().showToast(`Không start được Mailpit: ${e}`, 'danger');
            return false;
        }
    },

    /** Whether a service has binaries to start; Start All skips the rest instead of warning about each. */
    _serviceInstalled: async (svc) => {
        const { invoke } = await import('@tauri-apps/api/core');
        switch (svc.type) {
            case 'web': return get().apacheVersions.some(v => v.installed);
            case 'db': return get().mysqlVersions.some(v => v.installed);
            case 'cache': return !!(await get().resolveRedis());
            case 'mail': return invoke('path_exists', { path: getMailpitExe(get()) }).catch(() => false);
            case 'storage': return invoke('path_exists', { path: get().minioPaths().exe }).catch(() => false);
            default: return true;
        }
    },

    startAll: async () => {
        for (const svc of get().services) {
            if (svc.type === 'php' || svc.status === 'running') continue;
            if (!(await get()._serviceInstalled(svc))) continue;
            await get().toggleService(svc.id);
        }
    },
    stopAll: async () => {
        for (const svc of get().services) {
            if (svc.type !== 'php' && svc.status === 'running') await get().toggleService(svc.id, 'stop');
        }
    },

    /** App-level error/warning: shown in the Apache log tab and kept in logs/devstack-app.log. */
    recordAppIssue: (text, level = 'err', { fileOnly = false } = {}) => {
        if (!fileOnly) get().addServiceLog('apache', text, level);
        const d = new Date();
        const stamp = `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('sv-SE')}`;
        import('@tauri-apps/api/core')
            .then(({ invoke }) => invoke('append_app_log', { line: `${stamp} [${level}] ${text}` }))
            .catch(() => {});
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
                const runningApacheVersion = getVersionFromServicePath(webProc?.path, 'apache');
                const apacheVersions = (() => {
                    if (!runningApacheVersion) return s.apacheVersions;
                    const hasVersion = s.apacheVersions.some(v => v.version === runningApacheVersion);
                    const next = s.apacheVersions.map(v => ({
                        ...v,
                        installed: v.version === runningApacheVersion ? true : v.installed,
                        active: v.version === runningApacheVersion
                    }));

                    if (hasVersion) return next;
                    return [
                        ...next,
                        { version: runningApacheVersion, installed: true, active: true, installing: false },
                    ].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
                })();

                return {
                    apacheVersions,
                    services: s.services.map((svc, i) => {
                        if (svc.type === 'php') {
                            return {
                                ...svc,
                                status: isApacheRunning ? 'running' : 'stopped',
                                pid: isApacheRunning ? 'Apache' : null,
                                memory: '—',
                                path: get()._sitesWithFcgi().some(s => s.fcgi) ? get().t('phpRunsFcgi') : get().t('phpRunsModule'),
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
                                version: svc.type === 'mail' ? (s.settings.mailpitVersion || proc.version || svc.version) : (proc.version || svc.version),
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
            await get()._refreshPortOwners();
        } catch (e) {
            console.error('checkServicesRunning failed:', e);
        }
    },

    _isDevstackExe: (exe) => {
        const devDir = (get().settings.devStackDir || '').replace(/\//g, '\\').toLowerCase();
        return !!devDir && (exe || '').toLowerCase().startsWith(devDir);
    },

    /** Name, PID, exe and Windows service of the program holding a stopped service's port. */
    _refreshPortOwners: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const owners = {};
        for (const svc of get().services) {
            if (svc.portConflict && svc.status !== 'running' && parseInt(svc.port)) {
                owners[svc.id] = await invoke('port_owner', { port: parseInt(svc.port) }).catch(() => null);
            }
        }
        set(s => ({ services: s.services.map(svc => ({ ...svc, portOwner: owners[svc.id] || null })) }));
    },

    /** The non-DevStack process listening on one of the service's ports, if any. */
    _externalPortOwner: async (svc) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const ports = [parseInt(svc.port)];
        if (svc.type === 'mail') ports.push(parseInt(get().settings.mailUiPort || 8025));
        if (svc.type === 'storage') ports.push(parseInt(svc.port) + 1);
        for (const port of ports.filter(Boolean)) {
            const owner = await invoke('port_owner', { port }).catch(() => null);
            if (owner && !get()._isDevstackExe(owner.exe)) return { ...owner, port };
        }
        return null;
    },

    stopWindowsService: async (svc) => {
        const name = svc.portOwner?.service;
        if (!name) return;
        const { invoke } = await import('@tauri-apps/api/core');
        try {
            await invoke('stop_windows_service', { name });
            get().showToast(get().t('windowsServiceStopped', { name }), 'ok');
        } catch (e) {
            get().showToast(`${e}`, 'danger');
        }
        await new Promise(r => setTimeout(r, 1000));
        await get().checkServicesRunning();
    },

    useExternalService: (id) => set(s => ({
        services: s.services.map(svc => svc.id === id ? { ...svc, useExternal: true } : svc),
    })),

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
            get().showToast(get().t('phpFollowsApache'), 'info');
            return;
        }

        if (action === 'restart' && svc.type === 'web') {
            await get().restartApache();
            return;
        }

        if (action === 'restart') {
            const isRunning = svc.status === 'running' || svc.pid;
            get().showToast(get().t('restarting', { name: svc.name }) || `Restarting ${svc.name}...`, 'info');
            if (isRunning) {
                if (!(await get().toggleService(id, 'stop'))) return;
                await new Promise(r => setTimeout(r, 500));
            }
            await get().toggleService(id, 'start');
            return;
        }

        let activeVer = svc.version;
        if (svc.type === 'web') activeVer = get().apacheVersions.find(v => v.active && v.installed)?.version || activeVer || '...';
        if (svc.type === 'db') activeVer = get().mysqlVersions.find(v => v.active && v.installed)?.version || activeVer || '...';
        if (svc.type === 'php') activeVer = get().phpVersions.find(v => v.active && v.installed)?.version || activeVer || '...';
        if (svc.type === 'cache' || svc.type === 'storage') activeVer = 'Latest';
        if (svc.type === 'mail') activeVer = get().settings.mailpitVersion || activeVer || 'Mailpit';
        const svcLabel = `${svc.name.replace(' (DevStack)', '')} v${activeVer} (Port: ${svc.port})`;

        const isRunning = svc.status === 'running' || svc.pid;
        const shouldStop = action ? action === 'stop' : isRunning;
        const logType = svc.type === 'web' ? 'apache' : svc.type === 'db' ? 'mysql' : svc.type === 'cache' ? 'redis' : svc.type === 'mail' ? 'mail' : svc.type === 'storage' ? 'storage' : 'php';

        console.log(`[Timer] Toggle clicked for ${svc.name} - Action: ${shouldStop ? 'STOP' : 'START'}`);

        if (shouldStop) {
            get().showToast(`Stopping ${svcLabel}...`, 'info');
            get().addServiceLog(logType, `Stopping ${svcLabel} ...`, 'warn');
            set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopping' } : sv) }));

            const name = svc.type === 'web' ? 'httpd.exe' : svc.type === 'db' ? 'mysqld.exe' : svc.type === 'cache' ? 'redis-server.exe' : svc.type === 'mail' ? 'mailpit.exe' : svc.type === 'storage' ? 'minio.exe' : 'php-cgi.exe';
            const { invoke } = await import('@tauri-apps/api/core');

            const t1 = performance.now();
            if (svc.type === 'storage') await invoke('proc_stop', { id: 'minio' });
            if (svc.type === 'web') await get().stopFcgiPools();
            const killed = await invoke('kill_process_by_name_exact', { name });
            if (svc.type === 'php') await invoke('kill_process_by_name_exact', { name: 'php.exe' });
            console.log(`[Timer] Native Rust kill done in ${(performance.now() - t1).toFixed(2)}ms`);

            if (!killed && parseInt(svc.port) > 0) {
                // Started by an elevated DevStack: a normal kill is denied, so ask UAC right away.
                const owner = await invoke('port_owner', { port: parseInt(svc.port) }).catch(() => null);
                if (owner?.name?.toLowerCase() === name) {
                    get().addServiceLog(logType, get().t('stopNeedsAdmin'), 'warn');
                    await invoke('kill_process_by_port_admin', { port: parseInt(svc.port) });
                }
            }
            const success = await get()._pollUntilStable(id, 'stopped');
            console.log(`[Timer] Total Stop Time: ${(performance.now() - t0).toFixed(2)}ms`);

            if (success) {
                get().showToast(`${svcLabel} stopped.`, 'ok');
                get().addServiceLog(logType, `${svcLabel} stopped successfully.`, 'ok');
            } else {
                get().showToast(get().t('stopFailed', { name: svcLabel }), 'danger');
                get().addServiceLog(logType, get().t('stopFailed', { name: svcLabel }), 'err');
            }
            return success;
        } else {
            const owner = await get()._externalPortOwner(svc);
            if (owner) {
                const message = get().t('portOwnedBy', {
                    port: owner.port,
                    name: owner.service ? get().t('windowsServiceLabel', { name: owner.service }) : owner.name,
                    pid: owner.pid,
                    exe: owner.exe || '?',
                });
                get().showToast(message, 'danger');
                get().addServiceLog(logType, message, 'err');
                set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, portConflict: true, portOwner: owner } : sv) }));
                return;
            }
            get().showToast(`Starting ${svcLabel}...`, 'info');
            get().addServiceLog(logType, `Starting ${svcLabel}...`, 'info');
            set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'starting' } : sv) }));

            let started = true;
            const t1 = performance.now();

            if (svc.type === 'web') started = await get().startApache();
            if (svc.type === 'db') started = await get().startMysql();
            if (svc.type === 'php') started = await get().startPhp();
            if (svc.type === 'cache') started = await get().startRedis();
            if (svc.type === 'mail') started = await get().startMailpit();
            if (svc.type === 'storage') started = await get().startMinio();

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
        const oldPort = parseInt(get().services.find(s => s.id === id)?.port) || 0;

        set(s => ({
            services: s.services.map(sv => sv.id === id ? { ...sv, port: intPort } : sv)
        }));

        const svc = get().services.find(s => s.id === id);
        if (svc?.type === 'web') get().updateSettings({ port80: intPort });
        if (svc?.type === 'web' && intPort !== oldPort) {
            // Vhosts (*:port) and httpd.conf `Listen` both follow the new port.
            if (get()._managedSites().length) await get().applySites({ restart: false });
            if (svc.status === 'running') await get().restartApache();
        }
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
        if (svc?.type === 'mail') get().updateSettings({ mailSmtpPort: intPort });

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
        // Process kills (stop, close, quit) only touch binaries inside this folder.
        await import('@tauri-apps/api/core')
            .then(({ invoke }) => invoke('set_devstack_dir', { dir: get().settings.devStackDir || '' }))
            .catch(e => console.error('set_devstack_dir failed:', e));

        // Sync persisted ports to services
        const s = get().settings;
        set(state => ({
            services: state.services.map(svc => {
                if (svc.type === 'web') return { ...svc, port: s.port80 || svc.port };
                if (svc.type === 'db') return { ...svc, port: s.portMySQL || svc.port };
                if (svc.type === 'cache') return { ...svc, port: s.portRedis || svc.port };
                if (svc.type === 'php') return { ...svc, port: s.portPHP || svc.port };
                if (svc.type === 'mail') return { ...svc, port: s.mailSmtpPort || svc.port, version: s.mailpitVersion || svc.version };
                return svc;
            })
        }));

        // Initial checks and scans
        await get().detectElevation?.();
        await get().syncStartOnBootSetting?.();
        await get().checkServicesRunning();
        await get().scanInstalledApache();
        await get().scanInstalledPhp();
        await get().scanInstalledMysql();
        await get().scanInstalledNode?.();
        await get().resolveRedis();
        await get().scanSites();
        await get().initProcesses();
        await get()._adoptFcgiPoolsAfterRestart();
        await get().ensurePhpCaConfig();
        get().loadHostsFile();

        const { invoke } = await import('@tauri-apps/api/core');
        const mailpitInstalled = await invoke('path_exists', { path: getMailpitExe(get()) }).catch(() => false);
        // Mailpit auto-starts by default once it is installed (.env files expect SMTP on :1025).
        if (mailpitInstalled && get().settings.autoStartMap?.[5] === undefined) {
            get().updateSettings({ autoStartMap: { ...(get().settings.autoStartMap || {}), 5: true } });
        }
        const autoMap = get().settings.autoStartMap || {};
        get().services.forEach(svc => {
            if (svc.type !== 'php' && autoMap[svc.id] === true && svc.status !== 'running') {
                if (svc.portConflict) return; // Prevent infinite spinning
                if (svc.type === 'mail' && !mailpitInstalled) return; // nothing to start; no toast at launch
                get().toggleService(svc.id);
            }
        });

        get().showToast('DevStack ready', 'ok');
        get().runGuideChecks();
        get().fetchServiceLogs('apache');
    },

    openTerminal: async (prjPath, shell = 'cmd') => {
        if (prjPath) {
            await get().detectAndSwitchPhpForProject(prjPath);
        }

        const s = get().settings;
        const devDir = (s.devStackDir || 'C:/devstack');
        const targetPath = (prjPath || s.rootPath || devDir).replace(/\//g, '\\');
        const site = prjPath && get().sites.find(x => x.path.replace(/\\/g, '/') === prjPath.replace(/\\/g, '/'));
        const cfg = site ? get().siteConfigs[site.key] : null;
        const { invoke } = await import('@tauri-apps/api/core');
        try {
            await invoke('open_devstack_terminal', {
                shell,
                cwd: targetPath,
                pathPrefix: get().devstackPathPrefix(cfg?.phpVersion),
                env: site ? get().siteEnv(site) : get().devstackCaEnv(),
            });
        } catch (e) {
            get().showToast(`${e}`, 'danger');
        }
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
        // Claim the slot before any await: the Logs page and switchLog both call this.
        const claim = () => {};
        set(s => ({ _activeListeners: { ...s._activeListeners, [type]: claim } }));
        let streaming = false;

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

                // The generation lets a late stop end only this stream, never a newer one.
                const generation = await invoke('stream_log_file', {
                    eventName,
                    path: normalizedPath
                });
                const stop = () => {
                    unlisten();
                    invoke('stop_log_stream', { eventName, generation }).catch(() => {});
                };

                if (get()._activeListeners[type] !== claim) {
                    // Streaming was stopped while this was starting.
                    stop();
                    return;
                }
                set(s => ({ _activeListeners: { ...s._activeListeners, [type]: stop } }));
                streaming = true;
            }
        } catch (e) {
            console.error(`Stream ${type} failed`, e);
            addServiceLog(type, `Streaming failed: ${e.message || e}`, 'err');
        } finally {
            // No stream started (no log file yet, no active version, error): free the slot
            // so the next tab switch tries again.
            if (!streaming && get()._activeListeners[type] === claim) {
                set(s => {
                    const { [type]: _claim, ...rest } = s._activeListeners;
                    return { _activeListeners: rest };
                });
            }
        }
    },

    stopStreamingLogs: () => {
        const { _activeListeners } = get();
        Object.values(_activeListeners).forEach(un => un());
        set({ _activeListeners: {} });
    }
});
