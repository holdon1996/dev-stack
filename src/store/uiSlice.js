import translations from '../i18n';

export const createUiSlice = (set, get) => ({
    activePage: 'services',
    startTime: Date.now(),
    toast: { show: false, msg: '', type: 'ok' },
    isDownloading: false,
    downloadProgress: 0,
    locale: 'vi',
    isElevated: false,
    appUpdate: {
        status: 'idle',
        currentVersion: '',
        latestVersion: '',
        available: false,
        canInstall: false,
        source: 'github',
        nativeConfigured: false,
        notes: '',
        publishedAt: '',
        htmlUrl: '',
        downloadUrl: '',
        assetName: '',
        error: '',
        lastCheckedAt: '',
        installStatus: 'idle',
        downloadedBytes: 0,
        totalBytes: 0,
    },

    setActivePage: (page) => {
        const prev = get().activePage;
        if (prev === 'logs' && page !== 'logs') {
            get().stopStreamingLogs?.();
        }
        set({ activePage: page });
    },

    showToast: (msg, type = 'ok') => {
        set({ toast: { show: true, msg, type } });
        setTimeout(() => {
            set({ toast: { show: false, msg: '', type: 'ok' } });
        }, 5000);
    },

    setDownloading: (val) => set({ isDownloading: val }),
    setDownloadProgress: (val) => set({ downloadProgress: val }),
    detectElevation: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const elevated = await invoke('is_app_elevated');
            set({ isElevated: !!elevated });
        } catch (e) {
            console.error('detectElevation failed:', e);
            set({ isElevated: false });
        }
    },

    setLocale: (locale) => set({ locale }),

    checkAppUpdate: async (silent = false) => {
        set(state => ({
            appUpdate: {
                ...state.appUpdate,
                status: 'checking',
                error: '',
            }
        }));

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const result = await Promise.race([
                invoke('check_app_update'),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Update check timed out')), 15000);
                })
            ]);
            const now = new Date().toISOString();

            set({
                appUpdate: {
                    status: result.available ? 'available' : 'up-to-date',
                    currentVersion: result.current_version || '',
                    latestVersion: result.latest_version || '',
                    available: !!result.available,
                    canInstall: !!result.can_install,
                    source: result.source || 'github',
                    nativeConfigured: !!result.native_configured,
                    notes: result.notes || '',
                    publishedAt: result.published_at || '',
                    htmlUrl: result.html_url || '',
                    downloadUrl: result.download_url || '',
                    assetName: result.asset_name || '',
                    error: '',
                    lastCheckedAt: now,
                    installStatus: 'idle',
                    downloadedBytes: 0,
                    totalBytes: 0,
                }
            });

            if (!silent) {
                get().showToast(
                    result.available
                        ? get().t('updateAvailableToast', { version: result.latest_version })
                        : get().t('updateCurrentToast'),
                    result.available ? 'info' : 'ok'
                );
            }
        } catch (e) {
            set(state => ({
                appUpdate: {
                    ...state.appUpdate,
                    status: 'error',
                    error: `${e}`,
                    lastCheckedAt: new Date().toISOString(),
                }
            }));

            if (!silent) {
                get().showToast(get().t('updateCheckFailed', { error: `${e}` }), 'danger');
            }
        }
    },

    openAppUpdateUrl: async () => {
        const { downloadUrl, htmlUrl } = get().appUpdate;
        const target = downloadUrl || htmlUrl;
        if (!target) {
            get().showToast(get().t('updateNoLink'), 'warn');
            return;
        }

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('open_external_target', { target });
        } catch (e) {
            console.error('openAppUpdateUrl failed:', e);
            get().showToast(get().t('updateOpenLinkFailed', { error: `${e}` }), 'danger');
        }
    },

    installAppUpdate: async () => {
        const { appUpdate } = get();
        if (!appUpdate.available || !appUpdate.canInstall) {
            get().showToast(get().t('updateNativeNotConfigured'), 'warn');
            return;
        }

        let unlisten = null;
        let downloaded = 0;

        try {
            const { listen } = await import('@tauri-apps/api/event');
            const { invoke } = await import('@tauri-apps/api/core');

            set(state => ({
                appUpdate: {
                    ...state.appUpdate,
                    installStatus: 'downloading',
                    downloadedBytes: 0,
                    totalBytes: 0,
                    error: '',
                }
            }));

            unlisten = await listen('app-update-download', (event) => {
                const payload = event.payload || {};
                if (payload.event === 'Started') {
                    set(state => ({
                        appUpdate: {
                            ...state.appUpdate,
                            installStatus: 'downloading',
                            totalBytes: payload.data?.contentLength || 0,
                            downloadedBytes: 0,
                        }
                    }));
                } else if (payload.event === 'Progress') {
                    downloaded += payload.data?.chunkLength || 0;
                    set(state => ({
                        appUpdate: {
                            ...state.appUpdate,
                            installStatus: 'downloading',
                            downloadedBytes: downloaded,
                        }
                    }));
                } else if (payload.event === 'Finished') {
                    set(state => ({
                        appUpdate: {
                            ...state.appUpdate,
                            installStatus: 'installing',
                        }
                    }));
                }
            });

            await invoke('install_app_update');

            set(state => ({
                appUpdate: {
                    ...state.appUpdate,
                    installStatus: 'installed',
                }
            }));

            get().showToast(get().t('updateInstallStarted'), 'ok');
        } catch (e) {
            console.error('installAppUpdate failed:', e);
            set(state => ({
                appUpdate: {
                    ...state.appUpdate,
                    installStatus: 'error',
                    error: `${e}`,
                }
            }));
            get().showToast(get().t('updateInstallFailed', { error: `${e}` }), 'danger');
        } finally {
            if (unlisten) unlisten();
        }
    },

    t: (key, params) => {
        const locale = get().locale;
        let text = translations[locale]?.[key] || translations.en[key] || key;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, v);
            });
        }
        return text;
    },

    // System Stats (moved here as it's UI/Monitoring)
    systemStats: { cpu: 0, ram: 0, ramTotal: 0 },
    updateSystemStats: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const stats = await invoke('get_system_stats');
            if (stats) {
                // Return data is in GB from Rust
                set({ systemStats: { cpu: stats.cpu, ram: stats.used_ram, ramTotal: stats.total_ram } });
            }
        } catch (e) {
            console.error('Rust get_system_stats failed:', e);
        }
    },
    openExplorer: async (path) => {
        if (!path) return;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const winPath = path.replace(/\//g, '\\');
            await invoke('start_detached_process', {
                executable: "explorer.exe",
                args: [winPath]
            });
        } catch (e) {
            console.error('openExplorer failed:', e);
        }
    }
});
