import { getPhpDir } from '../lib/paths';

export const createPhpSlice = (set, get) => ({
    phpVersions: [
        { version: '8.5.4', installed: false, active: false, installing: false, downloadUrl: 'https://downloads.php.net/~windows/releases/php-8.5.4-Win32-vs17-x64.zip', threadSafe: true, sizeMb: 33.5 },
        { version: '8.4.19', installed: false, active: false, installing: false, downloadUrl: 'https://downloads.php.net/~windows/releases/php-8.4.19-Win32-vs17-x64.zip', threadSafe: true, sizeMb: 32.5 },
        { version: '8.3.30', installed: false, active: false, installing: false, downloadUrl: 'https://downloads.php.net/~windows/releases/php-8.3.30-Win32-vs16-x64.zip', threadSafe: true, sizeMb: 31.0 },
        { version: '8.2.30', installed: false, active: false, installing: false, downloadUrl: 'https://downloads.php.net/~windows/releases/php-8.2.30-Win32-vs16-x64.zip', threadSafe: true, sizeMb: 30.5 },
        { version: '8.1.34', installed: false, active: false, installing: false, downloadUrl: 'https://downloads.php.net/~windows/releases/php-8.1.34-Win32-vs16-x64.zip', threadSafe: true, sizeMb: 29.5 },
        { version: '7.4.33', installed: false, active: false, installing: false, downloadUrl: 'https://downloads.php.net/~windows/releases/archives/php-7.4.33-Win32-vc15-x64.zip', threadSafe: true, sizeMb: 25.0 },
    ],
    phpInstallLogs: [],
    mysqlInstallLogs: [],
    apacheInstallLogs: [],
    phpInstallProgress: { pct: 0, downloaded: 0, total: 0 },
    mysqlInstallProgress: { pct: 0, downloaded: 0, total: 0 },
    apacheInstallProgress: { pct: 0, downloaded: 0, total: 0 },

    _phpFallbacks: {
        '8.5.4': 'https://downloads.php.net/~windows/releases/php-8.5.4-Win32-vs17-x64.zip',
        '8.4.19': 'https://downloads.php.net/~windows/releases/php-8.4.19-Win32-vs17-x64.zip',
        '8.3.30': 'https://downloads.php.net/~windows/releases/php-8.3.30-Win32-vs16-x64.zip',
        '8.2.30': 'https://downloads.php.net/~windows/releases/php-8.2.30-Win32-vs16-x64.zip',
        '8.1.34': 'https://downloads.php.net/~windows/releases/php-8.1.34-Win32-vs16-x64.zip',
        '7.4.33': 'https://downloads.php.net/~windows/releases/archives/php-7.4.33-Win32-vc15-x64.zip',
    },

    scanInstalledPhp: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
            const phpBinBase = `${baseDir}/bin/php`;

            const folders = await invoke('list_subdirs', { path: phpBinBase });
            set(s => {
                const updatedList = s.phpVersions.map(p => {
                    const found = folders.some(f => f.includes(p.version));
                    const url = p.downloadUrl || get()._phpFallbacks[p.version];
                    return { ...p, installed: found, active: found ? p.active : false, downloadUrl: url };
                });
                return { phpVersions: updatedList };
            });
            await get().syncExtensionsFromActivePhp();
        } catch (e) {
            console.error('scanInstalledPhp failed:', e);
        }
    },

    setPhpActive: (version) => set(s => ({
        phpVersions: s.phpVersions.map(v => ({
            ...v,
            active: v.version === version
        }))
    })),

    // Killer feature logic: Switch PHP version by project path
    detectAndSwitchPhpForProject: async (projectPath) => {
        // Read .devstack JSON file natively using tauri-plugin-fs
        try {
            const { readTextFile } = await import('@tauri-apps/plugin-fs');
            const devstackFile = projectPath.replace(/\\/g, '/') + '/.devstack';
            const content = await readTextFile(devstackFile);
            const data = JSON.parse(content);
            if (data?.php) {
                const version = data.php.trim();
                const match = get().phpVersions.find(v => v.version.startsWith(version));
                if (match && !match.active) {
                    get().setPhpActive(match.version);
                    get().showToast(`Switched PHP to ${match.version} for project`, 'info');
                }
            }
        } catch {
            // .devstack file doesn't exist or can't be parsed — that's fine
        }
    },

    detectedPhpVersion: null,
    conflictPath: null,
    isSystemConflict: false,
    extensions: [],
    phpInstallProgress: { pct: 0, downloaded: 0, total: 0 },
    activatingPhp: null,

    syncExtensionsFromActivePhp: async () => {
        const active = get().phpVersions.find(v => v.active && v.installed);
        if (!active) {
            set({ extensions: [] });
            return [];
        }

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const devDir = get().settings.devStackDir.replace(/\\/g, '/');
            const iniPath = `${devDir}/bin/php/php-${active.version}/php.ini`.replace(/\//g, '\\');
            const extensions = await invoke('get_php_ini_extensions', { iniPath });
            const normalized = Array.isArray(extensions) ? extensions : [];
            set({ extensions: normalized });
            return normalized;
        } catch (e) {
            console.error('syncExtensionsFromActivePhp failed:', e);
            set({ extensions: [] });
            return [];
        }
    },

    startPhp: async () => {
        const active = get().phpVersions.find(v => v.active && v.installed);
        if (!active) return false;
        get().showToast(`PHP ${active.version} is managed via Apache module.`, 'info');
        return true;
    },

    detectPhpVersion: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            // Use path_exists to check for php.exe; resolution is done by checking active PHP dir
            const phpActive = get().phpVersions.find(v => v.active && v.installed);
            if (phpActive) {
                const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
                // Check both standard bin folder and likely extracted root
                const phpExes = [
                    `${devDir}/bin/php/php-${phpActive.version}/php.exe`,
                    `${devDir}/bin/php/php-${phpActive.version}/bin/php.exe`
                ];

                for (const exe of phpExes) {
                    const exists = await invoke('path_exists', { path: exe.replace(/\//g, '\\') });
                    if (exists) {
                        set({ detectedPhpVersion: phpActive.version });
                        return;
                    }
                }
            }
            set({ detectedPhpVersion: null });
        } catch { }
    },

    fetchPhpVersions: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            // Dynamically fetched from windows.php.net via Rust reqwest — no PS, no hardcode
            const fetched = await invoke('fetch_php_versions');
            console.log('[Store] Fetched PHP versions from remote:', fetched);
            if (!fetched?.length) {
                console.warn('[Store] fetchPhpVersions returned empty list. Using fallback URLs.');
                return;
            }

            set(s => {
                const newList = [];
                // Process fetched versions, prioritize TS if multiple versions exist
                fetched.forEach(f => {
                    const existing = newList.find(x => x.version === f.version);
                    if (!existing) {
                        newList.push({
                            version: f.version,
                            installed: false, active: false, installing: false,
                            downloadUrl: f.url,
                            threadSafe: !f.is_nts,
                            sizeMb: f.size_mb || null
                        });
                    } else if (existing && !f.is_nts) {
                        existing.downloadUrl = f.url;
                        existing.threadSafe = true;
                        if (f.size_mb) existing.sizeMb = f.size_mb;
                    }
                });

                // Keep only 6 latest unique versions (newest minor per major) + any locally installed
                // First deduplicate by picking newer version within same major.minor, then cap at 6
                const seenMinor = new Set();
                const finalVersions = newList
                    .filter(n => {
                        const key = n.version.split('.').slice(0, 2).join('.');
                        if (seenMinor.has(key)) return false;
                        seenMinor.add(key);
                        return true;
                    })
                    .slice(0, 5);

                // Merge with current state to preserve 'installed' and 'active' status
                const mergedVersions = finalVersions.map(n => {
                    const old = s.phpVersions.find(o => o.version === n.version);
                    if (old) return { ...old, downloadUrl: n.downloadUrl, threadSafe: n.threadSafe, sizeMb: n.sizeMb };
                    return n;
                });

                // Add back any versions that are installed but not in the new list
                const legacyInstalled = s.phpVersions.filter(v =>
                    v.installed && !mergedVersions.some(f => f.version === v.version)
                );

                const combined = [...mergedVersions, ...legacyInstalled];
                console.log('[Store] Updated PHP versions list. Total:', combined.length);
                return { phpVersions: combined };
            });
        } catch (e) {
            console.error('fetchPhpVersions failed:', e);
        }
    },

    installPhpVersion: async (version) => {
        let v = get().phpVersions.find(pv => pv.version === version);
        console.log(`[Store] installPhpVersion triggered for ${version}. Found version object:`, v);

        // Ensure we have a URL, try fallback if missing in object
        const url = v?.downloadUrl || get()._phpFallbacks[version];

        if (!url) {
            console.warn(`[Store] No downloadUrl found for PHP ${version}. Aborting.`);
            get().showToast(`Không tìm thấy link tải cho PHP ${version}`, 'danger');
            return;
        }

        set(s => ({
            phpVersions: s.phpVersions.map(pv => pv.version === version ? { ...pv, installing: true, progress: 0 } : pv),
            phpInstallLogs: [
                { t: new Date().toLocaleTimeString(), m: `Installing PHP ${version}...`, l: 'info' },
                { t: new Date().toLocaleTimeString(), m: `Attempting URL: ${url}`, l: 'info' }
            ],
            phpInstallProgress: { pct: 0, downloaded: 0, total: 0 }
        }));

        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const phpDir = `${devDir}/bin/php/php-${version}`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            const unlistenLogs = await listen('php-install-log', (event) => {
                const line = event.payload;
                set(s => ({ phpInstallLogs: [...s.phpInstallLogs, { t: new Date().toLocaleTimeString(), m: line, l: 'info' }] }));
            });

            const unlistenProgress = await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload;
                if (svcType === 'php') {
                    set({ phpInstallProgress: { pct, downloaded, total } });
                }
            });

            const result = await invoke('install_binary', {
                svcType: 'php',
                version,
                url: url,
                destDir: phpDir,
                expectedSizeMb: v?.sizeMb || null
            });

            unlistenLogs();
            unlistenProgress();

            if (result === "SUCCESS") {
                set(s => ({ phpVersions: s.phpVersions.map(pv => pv.version === version ? { ...pv, installed: true, installing: false } : pv) }));
                get().showToast(`PHP ${version} installed`, 'ok');
            }
        } catch (e) {
            console.error('installPhpVersion error:', e);
            set(s => ({
                phpVersions: s.phpVersions.map(pv => pv.version === version ? { ...pv, installing: false } : pv),
                phpInstallLogs: [...s.phpInstallLogs, { t: new Date().toLocaleTimeString(), m: `Error: ${e}`, l: 'err' }]
            }));
            get().showToast('Installation failed', 'danger');
        }
    },

    installCustomPhp: async (version, url) => {
        set(s => ({
            phpVersions: s.phpVersions.map(pv => pv.version === version ? { ...pv, installing: true, progress: 0 } : pv),
            phpInstallLogs: [
                { t: new Date().toLocaleTimeString(), m: `Starting custom install for PHP ${version}...`, l: 'info' },
                { t: new Date().toLocaleTimeString(), m: `Attempting URL: ${url}`, l: 'info' }
            ],
            phpInstallProgress: { pct: 0, downloaded: 0, total: 0 }
        }));

        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const phpDir = `${devDir}/bin/php/php-${version}`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            let logsReceived = new Set();
            const unlistenLogs = await listen('php-install-log', (event) => {
                const line = event.payload;
                if (logsReceived.has(line)) return;
                logsReceived.add(line);
                set(s => ({ phpInstallLogs: [...s.phpInstallLogs, { t: new Date().toLocaleTimeString(), m: line, l: 'info' }] }));
            });

            const unlistenProgress = await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload;
                if (svcType === 'php') {
                    set(s => ({
                        phpInstallProgress: { pct, downloaded, total },
                        phpVersions: s.phpVersions.map(p => p.version === version ? { ...p, progress: pct } : p)
                    }));
                }
            });

            const result = await invoke('install_binary', {
                svcType: 'php',
                version,
                url: url,
                destDir: phpDir,
                expectedSizeMb: null  // custom install has no known size
            });

            unlistenLogs();
            unlistenProgress();

            if (result === "SUCCESS") {
                set(s => ({
                    phpVersions: s.phpVersions.map(pv => pv.version === version ? { ...pv, installed: true, installing: false, progress: 100 } : pv)
                }));
                await get().scanInstalledPhp();
                get().showToast(`Custom PHP ${version} installed`, 'ok');
            } else {
                set(s => ({ phpVersions: s.phpVersions.map(pv => pv.version === version ? { ...pv, installing: false } : pv) }));
            }
        } catch (e) {
            console.error('installCustomPhp error:', e);
            set(s => ({ phpVersions: s.phpVersions.map(pv => pv.version === version ? { ...pv, installing: false } : pv) }));
            get().showToast(`Custom install failed: ${e}`, 'danger');
        }
    },

    uninstallPhpVersion: async (version) => {
        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const destDir = `${devDir}/bin/php/php-${version}`;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('remove_dir', { path: destDir.replace(/\//g, '\\') });
        } catch (e) { console.error('Failed to remove PHP dir:', e); }
        set(s => ({ phpVersions: s.phpVersions.map(v => v.version === version ? { ...v, installed: false, active: false } : v) }));
        get().showToast(`PHP ${version} uninstalled`, 'warn');
    },

    setActivePhp: async (version) => {
        set({ activatingPhp: version });
        set(s => ({
            phpVersions: s.phpVersions.map(v => ({ ...v, active: v.version === version }))
        }));

        const activeApache = get().apacheVersions.find(a => a.active && a.installed);
        if (activeApache) {
            await get().configureApachePhp(version, activeApache.version);
            await get().restartApache();
        }

        set({ activatingPhp: null });
        await get().syncExtensionsFromActivePhp();
        get().showToast(`PHP ${version} activated`, 'ok');
    },

    addExtension: async (ext) => {
        const active = get().phpVersions.find(v => v.active && v.installed);
        if (!active) return;

        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const iniPath = `${devDir}/bin/php/php-${active.version}/php.ini`.replace(/\//g, '\\');

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const ok = await invoke('enable_php_extension', { iniPath, ext });
            if (!ok) {
                get().showToast(`Extension ${ext} not found in php.ini`, 'warn');
                return;
            }
            await get().syncExtensionsFromActivePhp();
        } catch (e) {
            console.error('addExtension failed:', e);
            get().showToast(`Failed to enable ${ext}`, 'danger');
            return;
        }
        get().showToast(`Extension ${ext} enabled`, 'ok');
    },

    removeExtension: async (ext) => {
        const active = get().phpVersions.find(v => v.active && v.installed);
        if (!active) return;

        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const iniPath = `${devDir}/bin/php/php-${active.version}/php.ini`.replace(/\//g, '\\');

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const ok = await invoke('disable_php_extension', { iniPath, ext });
            if (!ok) {
                get().showToast(`Failed to disable ${ext}`, 'warn');
                return;
            }
            await get().syncExtensionsFromActivePhp();
            get().showToast(`Extension ${ext} disabled`, 'ok');
        } catch (e) {
            console.error('removeExtension failed:', e);
            get().showToast(`Failed to disable ${ext}`, 'danger');
        }
    },

    patchPhpIni: async (version) => {
        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const iniPath = `${devDir}/bin/php/php-${version}/php.ini`.replace(/\//g, '\\');
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const ok = await invoke('patch_php_ini_extensions', { iniPath });
            if (ok) {
                await get().syncExtensionsFromActivePhp();
                get().showToast(`PHP ${version} extensions enabled`, 'ok');
            }
        } catch (e) { console.error('patchPhpIni failed:', e); }
    }
});
