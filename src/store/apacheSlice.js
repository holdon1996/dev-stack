import { getApacheDir } from '../lib/paths';

export const createApacheSlice = (set, get) => ({
    apacheVersions: [
        { version: '2.4.66', vsRuntime: 'VS18', label: 'Latest', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.66-260223-Win64-VS18.zip' },
        { version: '2.4.57', vsRuntime: 'VS16', label: 'Last VS16', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VS16/binaries/httpd-2.4.57-win64-VS16.zip' },
        { version: '2.4.23', vsRuntime: 'VC10', label: 'Last VC10 (XP/2003)', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VC10/binaries/httpd-2.4.23-win32-VC10.zip' },
    ],
    apacheInstallLogs: [],

    scanInstalledApache: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
            const apacheBinBase = `${baseDir}/bin/apache`;

            const folders = await invoke('list_subdirs', { path: apacheBinBase });
            set(s => {
                const currentList = [...s.apacheVersions];
                const updatedList = currentList.map(v => {
                    const ver = v.version.toLowerCase();
                    const found = folders.some(f => f.toLowerCase().includes(ver));
                    return { ...v, installed: found, active: found ? v.active : false };
                });
                return { apacheVersions: updatedList };
            });
        } catch (e) {
            console.error('scanInstalledApache failed:', e);
        }
    },

    detectApacheVersion: async () => {
        try {
            const { Command } = await import('@tauri-apps/plugin-shell');
            const result = await Command.create('cmd', ['/C', 'httpd -v']).execute();
            const match = result.stdout?.match(/Apache\/([\d.]+)/);
            if (match) {
                const detected = match[1];
                set(s => ({
                    apacheVersions: s.apacheVersions.map(v => v.version === detected ? { ...v, installed: true, active: true } : v)
                }));
            }
        } catch { }
    },

    fetchApacheVersions: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            // Dynamically fetched from apachelounge.com via Rust reqwest — no PS, no hardcode
            const fetched = await invoke('fetch_apache_versions');
            if (!fetched?.length) return;

            set(s => {
                const newList = fetched.map(f => {
                    const old = s.apacheVersions.find(e => e.version === f.version);
                    return old
                        ? { ...old, downloadUrl: f.url }
                        : { version: f.version, installed: false, active: false, installing: false, downloadUrl: f.url };
                });
                // Keep any locally installed versions not in the fetched list
                const installedOld = s.apacheVersions.filter(e => e.installed && !newList.find(n => n.version === e.version));
                return { apacheVersions: [...newList, ...installedOld] };
            });
        } catch (e) {
            console.error('fetchApacheVersions failed:', e);
        }
    },

    startApache: async () => {
        const active = get().apacheVersions.find(v => v.active && v.installed);
        if (!active) {
            get().showToast('No active Apache version found!', 'warn');
            return false;
        }

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const candidates = [
                getApacheDir(get(), active.version),
                get().settings.installBaseDir ? `${get().settings.installBaseDir.replace(/[\\\/]+$/, '')}/bin/apache/apache-${active.version}` : null,
            ].filter(Boolean);

            let resolvedRoot = null;
            for (const candidate of candidates) {
                const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
                const exeCandidate = `${normalized}/bin/httpd.exe`.replace(/\//g, '\\');
                const exists = await invoke('path_exists', { path: exeCandidate });
                if (exists) {
                    resolvedRoot = normalized;
                    break;
                }
            }

            if (!resolvedRoot) {
                throw `httpd.exe not found for Apache ${active.version}. Check that DevStack directory is correct in Settings and Apache is installed there.`;
            }

            const rootPath = get().settings.rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
            await invoke('create_dir', { path: rootPath.replace(/\//g, '\\') });
            await invoke('patch_apache_paths', {
                newServerRoot: resolvedRoot,
                newDocRoot: rootPath
            });
            await invoke('ensure_apache_log_files', {
                apacheRoot: resolvedRoot
            });
            await invoke('start_detached_process', {
                executable: `${resolvedRoot}\\bin\\httpd.exe`.replace(/\//g, '\\'),
                args: [] // Apache usually just runs with its default httpd.conf if placed correctly
            });
            return true;
        } catch (e) {
            console.error('Failed to start Apache natively', e);
            return false;
        }
    },

    setActiveApache: async (version) => {
        set(s => ({ apacheVersions: s.apacheVersions.map(v => ({ ...v, active: v.version === version })) }));
        const activePhp = get().phpVersions.find(p => p.active && p.installed);
        if (activePhp) await get().configureApachePhp(activePhp.version, version);
        await get().restartApache();
        get().showToast(`Apache ${version} activated`, 'ok');
    },

    restartApache: async () => {
        await get().toggleService(1, 'stop');
        await new Promise(r => setTimeout(r, 1000));
        await get().toggleService(1, 'start');
    },

    installApacheVersion: async (version) => {
        const v = get().apacheVersions.find(av => av.version === version);
        if (!v?.downloadUrl) return get().showToast('Download URL not found', 'danger');

        set(s => ({
            apacheVersions: s.apacheVersions.map(av => av.version === version ? { ...av, installing: true, progress: 0 } : av),
            apacheInstallLogs: [{ t: new Date().toLocaleTimeString(), m: `Installing Apache ${version}...`, l: 'info' }]
        }));

        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const destDir = `${devDir}/bin/apache/apache-${version}`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            const unlistenLogs = await listen('web-install-log', (event) => {
                const line = event.payload;
                set(s => ({ apacheInstallLogs: [...s.apacheInstallLogs, { t: new Date().toLocaleTimeString(), m: line, l: 'info' }] }));
            });

            const unlistenProgress = await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload;
                if (svcType === 'web') {
                    set({ apacheInstallProgress: { pct, downloaded, total } });
                }
            });

            const result = await invoke('install_binary', {
                svcType: 'web',
                version,
                url: v.downloadUrl,
                destDir: destDir,
                expectedSizeMb: null
            });

            unlistenLogs();
            unlistenProgress();

            if (result === "SUCCESS") {
                set(s => ({ apacheVersions: s.apacheVersions.map(av => av.version === version ? { ...av, installed: true, installing: false } : av) }));
                get().showToast(`Apache ${version} installed`, 'ok');
            }
        } catch (e) {
            console.error('installApacheVersion error:', e);
            set(s => ({
                apacheVersions: s.apacheVersions.map(av => av.version === version ? { ...av, installing: false } : av),
                apacheInstallLogs: [...s.apacheInstallLogs, { t: new Date().toLocaleTimeString(), m: `Error: ${e}`, l: 'err' }]
            }));
            get().showToast('Installation failed', 'danger');
        }
    },

    uninstallApacheVersion: async (version) => {
        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const destDir = `${devDir}/bin/apache/apache-${version}`;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('remove_dir', { path: destDir.replace(/\//g, '\\') });
        } catch (e) { console.error('Failed to remove Apache dir:', e); }
        set(s => ({ apacheVersions: s.apacheVersions.map(v => v.version === version ? { ...v, installed: false, active: false } : v) }));
        get().showToast(`Apache ${version} uninstalled`, 'warn');
    },

    configureApachePhp: async (phpVersion, apacheVersion) => {
        const phpV = get().phpVersions.find(p => p.version === phpVersion);
        if (!phpV?.installed) return;
        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const apacheConf = `${devDir}/bin/apache/apache-${apacheVersion}/conf/httpd.conf`;
        const phpDir = `${devDir}/bin/php/php-${phpVersion}`;
        const major = parseInt(phpVersion.split('.')[0]);
        const modFile = major === 7 ? "php7apache2_4.dll" : "php8apache2_4.dll";
        const modName = major === 7 ? "php7_module" : "php_module";

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('configure_apache_php', {
                apacheConfPath: apacheConf,
                phpDir,
                phpVersion,
                modName,
                modFile
            });
        } catch (e) {
            console.error('Failed to configure Apache PHP natively', e);
        }
    }
});
