import translations from '../i18n';

export const createUiSlice = (set, get) => ({
    activePage: 'services',
    toast: { show: false, msg: '', type: 'ok' },
    isDownloading: false,
    downloadProgress: 0,
    locale: 'vi',
    isElevated: false,

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
