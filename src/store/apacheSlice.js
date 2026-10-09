import { getApacheDir, getPhpDir } from '../lib/paths';

const getApacheVersionFromFolder = (folderName) => {
    const normalized = folderName.trim().toLowerCase();
    const match = normalized.match(/(?:^|apache-)(\d+(?:\.\d+)+)/);
    return match?.[1] || null;
};

export const createApacheSlice = (set, get) => ({
    apacheVersions: [
        { version: '2.4.68', vsRuntime: 'VS18', label: 'Latest', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.68-260610-Win64-VS18.zip' },
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
                const consumed = new Set();
                const updatedList = currentList.map(v => {
                    const ver = v.version.toLowerCase();
                    const folderMatch = folders.find(f => getApacheVersionFromFolder(f) === ver);
                    if (folderMatch) {
                        consumed.add(folderMatch);
                        return { ...v, installed: true };
                    }
                    return { ...v, installed: false, active: false };
                });

                const added = folders
                    .filter(f => !consumed.has(f))
                    .map(f => getApacheVersionFromFolder(f))
                    .filter(Boolean)
                    .filter(version => !updatedList.some(v => v.version === version))
                    .map(version => {
                        const existing = currentList.find(v => v.version === version);
                        return { version, installed: true, active: !!existing?.active, installing: false };
                    });

                return {
                    apacheVersions: [...updatedList, ...added].sort((a, b) =>
                        b.version.localeCompare(a.version, undefined, { numeric: true })
                    )
                };
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
        let active = get().apacheVersions.find(v => v.active && v.installed);
        if (!active) {
            // Installed but never activated: the most common first-day blocker.
            const installed = get().apacheVersions.find(v => v.installed);
            if (!installed) {
                get().showToast(get().t('noVersionInstalled', { name: 'Apache' }), 'warn', { action: { label: get().t('guideOpenPage'), page: 'apache' } });
                return false;
            }
            await get().setActiveApache(installed.version);
            active = installed;
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
                newDocRoot: rootPath,
                port: parseInt(get().settings.port80) || 80,
            });
            await invoke('ensure_apache_log_files', {
                apacheRoot: resolvedRoot
            });
            // Sites managed before FastCGI pools existed get their pool + vhost on first start.
            const { usesFcgi } = await import('../lib/sites');
            if (get()._managedSites().some(s => usesFcgi(s.cfg) && !Number.isInteger(s.cfg.fcgiPortBase))) {
                await get().applySites({ restart: false });
            }
            if (!(await get()._apacheConfigOk(resolvedRoot))) return false;
            if (get()._managedSites().some(s => s.cfg.ssl)) {
                const owner = await invoke('port_owner', { port: 443 });
                if (owner && !/^httpd/i.test(owner.name)) {
                    get().showToast(get().t('port443Busy', { name: owner.service || owner.name, pid: owner.pid }), 'danger');
                    return false;
                }
            }
            await get().ensureFcgiBackends();
            await invoke('start_detached_process', {
                executable: `${resolvedRoot}\\bin\\httpd.exe`.replace(/\//g, '\\'),
                args: [] // Apache usually just runs with its default httpd.conf if placed correctly
            });
            return true;
        } catch (e) {
            console.error('Failed to start Apache natively', e);
            get().showToast(get().t('serviceStartFailed', { name: 'Apache', error: `${e}` }), 'danger', { action: { label: get().t('guideHowToFix'), guide: 'troubleshooting' } });
            get().addServiceLog('apache', `${e}`, 'err');
            return false;
        }
    },

    setActiveApache: async (version) => {
        set(s => ({ apacheVersions: s.apacheVersions.map(v => ({ ...v, active: v.version === version })) }));
        const activePhp = get().phpVersions.find(p => p.active && p.installed);
        if (activePhp) await get().configureApachePhp(activePhp.version, version);
        // Managed vhosts live in each version's httpd-vhosts.conf; write them for the new one.
        if (get()._managedSites().length) await get().applySites({ restart: false });
        // Only a running Apache is restarted: activating during Start (or after the first
        // install) must not start a second httpd.
        const web = get().services.find(s => s.type === 'web');
        if (web?.status === 'running' || web?.pid) await get().restartApache();
        get().showToast(`Apache ${version} activated`, 'ok');
    },

    /** Runs `httpd -t`; on failure logs the output and returns false. */
    _apacheConfigOk: async (apacheRoot) => {
        const { invoke } = await import('@tauri-apps/api/core');
        try {
            await invoke('apache_config_test', { apacheRoot });
            return true;
        } catch (output) {
            get().addServiceLog('apache', `httpd -t: ${output}`, 'err');
            get().showToast(get().t('apacheConfigTestFailed', { output: `${output}`.split('\n')[0] }), 'danger');
            return false;
        }
    },

    restartApache: async () => {
        const web = get().services.find(s => s.type === 'web');
        const apacheRoot = get()._activeApacheRoot();
        // Keep the running instance when the new config would not start.
        if (web?.status === 'running' && apacheRoot && !(await get()._apacheConfigOk(apacheRoot))) return false;
        // Starting while the old instance still holds :80 only fails with "could not bind".
        if ((web?.status === 'running' || web?.pid) && !(await get().toggleService(1, 'stop'))) return false;
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

        const unlisteners = [];
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            unlisteners.push(await listen('web-install-log', (event) => {
                const line = event.payload;
                set(s => ({ apacheInstallLogs: [...s.apacheInstallLogs, { t: new Date().toLocaleTimeString(), m: line, l: 'info' }] }));
            }));

            unlisteners.push(await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload;
                if (svcType === 'web') {
                    set({ apacheInstallProgress: { pct, downloaded, total } });
                }
            }));

            const result = await invoke('install_binary', {
                svcType: 'web',
                version,
                url: v.downloadUrl,
                destDir: destDir,
                expectedSizeMb: null
            });

            if (result !== "SUCCESS") throw result;
            set(s => ({ apacheVersions: s.apacheVersions.map(av => av.version === version ? { ...av, installed: true, installing: false } : av) }));
            get().showToast(`Apache ${version} installed`, 'ok');
            // First install: activate it so Start works right away.
            if (!get().apacheVersions.some(av => av.active && av.installed)) await get().setActiveApache(version);
        } catch (e) {
            console.error('installApacheVersion error:', e);
            set(s => ({
                apacheVersions: s.apacheVersions.map(av => av.version === version ? { ...av, installing: false } : av),
                apacheInstallLogs: [...s.apacheInstallLogs, { t: new Date().toLocaleTimeString(), m: `Error: ${e}`, l: 'err' }]
            }));
            get().showToast('Installation failed', 'danger');
        } finally {
            unlisteners.forEach(un => un());
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
        const phpDir = getPhpDir(get(), phpV);
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
