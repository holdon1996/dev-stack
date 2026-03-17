import { getMysqlDir } from '../lib/paths';

export const createMysqlSlice = (set, get) => ({
    mysqlVersions: [
        { version: '8.0.45', installed: false, active: false, installing: false, downloadUrl: 'https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-8.0.45-winx64.zip' },
        { version: '5.7.44', installed: false, active: false, installing: false, downloadUrl: 'https://cdn.mysql.com/Archives/MySQL-5.7/mysql-5.7.44-winx64.zip' },
    ],
    mysqlInstallLogs: [],

    scanInstalledMysql: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
            const mysqlBinBase = `${baseDir}/bin/mysql`;

            const folders = await invoke('list_subdirs', { path: mysqlBinBase });
            set(s => {
                const updatedList = s.mysqlVersions.map(v => {
                    const found = folders.some(f => f.toLowerCase().includes(v.version.toLowerCase()));
                    return { ...v, installed: found, active: found ? v.active : false };
                });
                return { mysqlVersions: updatedList };
            });
        } catch (e) {
            console.error('scanInstalledMysql failed:', e);
        }
    },

    startMysql: async () => {
        const active = get().mysqlVersions.find(v => v.active && v.installed);
        if (!active) return false;

        const path = getMysqlDir(get(), active.version).replace(/\//g, '\\');
        const exe = `${path}\\bin\\mysqld.exe`;
        const ini = `${path}\\my.ini`;
        const port = get().settings.portMySQL || 3306;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('patch_mysql_paths', {
                iniPath: ini,
                newMysqlRoot: path.replace(/\\/g, '/'),
                port
            });
            await invoke('start_detached_process', {
                executable: exe,
                args: [`--defaults-file=${ini}`, `--port=${port}`]
            });
            return true;
        } catch (e) {
            console.error('Failed to start MySQL natively', e);
            return false;
        }
    },

    fetchMysqlVersions: async () => {
        const versions = [
            { version: '8.0.45', url: 'https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-8.0.45-winx64.zip' },
            { version: '5.7.44', url: 'https://cdn.mysql.com/Downloads/MySQL-5.7/mysql-5.7.44-winx64.zip' },
        ];
        set(s => {
            const newList = versions.map(v => {
                const old = s.mysqlVersions.find(e => e.version === v.version);
                return old ? { ...old, downloadUrl: v.url } : { version: v.version, installed: false, active: false, installing: false, downloadUrl: v.url };
            });
            return { mysqlVersions: newList };
        });
    },

    installMysqlVersion: async (version) => {
        const v = get().mysqlVersions.find(mv => mv.version === version);
        if (!v?.downloadUrl) return;

        set(s => ({
            mysqlVersions: s.mysqlVersions.map(mv => mv.version === version ? { ...mv, installing: true, progress: 0 } : mv),
            mysqlInstallLogs: [{ t: new Date().toLocaleTimeString(), m: `Installing MySQL ${version}...`, l: 'info' }]
        }));

        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const mysqlDir = `${devDir}/bin/mysql/mysql-${version}`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            const unlistenLogs = await listen('db-install-log', (event) => {
                const line = event.payload;
                set(s => ({ mysqlInstallLogs: [...s.mysqlInstallLogs, { t: new Date().toLocaleTimeString(), m: line, l: 'info' }] }));
            });

            const unlistenProgress = await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload;
                if (svcType === 'db') {
                    set({ mysqlInstallProgress: { pct, downloaded, total } });
                }
            });

            const result = await invoke('install_binary', {
                svcType: 'db',
                version,
                url: v.downloadUrl,
                destDir: mysqlDir,
                expectedSizeMb: null
            });

            unlistenLogs();
            unlistenProgress();

            if (result === "SUCCESS") {
                set(s => ({ mysqlVersions: s.mysqlVersions.map(mv => mv.version === version ? { ...mv, installed: true, installing: false } : mv) }));
                get().showToast(`MySQL ${version} installed`, 'ok');
            }
        } catch (e) {
            console.error('installMysqlVersion error:', e);
            set(s => ({
                mysqlVersions: s.mysqlVersions.map(mv => mv.version === version ? { ...mv, installing: false } : mv),
                mysqlInstallLogs: [...s.mysqlInstallLogs, { t: new Date().toLocaleTimeString(), m: `Error: ${e}`, l: 'err' }]
            }));
            get().showToast('Installation failed', 'danger');
        }
    },

    uninstallMysqlVersion: async (version) => {
        const devDir = get().settings.devStackDir.replace(/\\/g, '/');
        const destDir = `${devDir}/bin/mysql/mysql-${version}`;
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('remove_dir', { path: destDir.replace(/\//g, '\\') });
        } catch (e) { console.error('Failed to remove MySQL dir:', e); }
        set(s => ({ mysqlVersions: s.mysqlVersions.map(v => v.version === version ? { ...v, installed: false, active: false } : v) }));
        get().showToast(`MySQL ${version} uninstalled`, 'warn');
    },

    setActiveMysql: (version) => set(s => ({
        mysqlVersions: s.mysqlVersions.map(v => ({ ...v, active: v.version === version }))
    })),

    openMysqlTerminal: async (version) => {
        const v = version || get().mysqlVersions.find(v => v.active)?.version;
        if (!v) return;
        const path = getMysqlDir(get(), v).replace(/\//g, '\\');
        const port = get().settings.portMySQL || 3306;
        const { invoke } = await import('@tauri-apps/api/core');
        // Open cmd terminal in mysql directory so user can run mysql.exe interactively
        await invoke('start_detached_process', {
            executable: 'cmd.exe',
            args: ['/C', 'start', 'cmd.exe', '/K', `cd /d "${path}\\bin" && title MySQL Terminal (v${v}) && mysql.exe -u root -P ${port}`]
        });
    },

    repairMysqlFromLaragon: async (version) => {
        const { showToast, settings } = get();
        const mysqlDir = getMysqlDir(get(), version).replace(/\//g, '\\');
        const iniPath = `${mysqlDir}\\my.ini`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            // Update datadir in my.ini using native Rust
            const dataDir = `${mysqlDir}\\data`.replace(/\\/g, '/');
            const updated = await invoke('update_ini_value', { filePath: iniPath, key: 'datadir', value: dataDir });
            if (updated) {
                showToast('MySQL path fixed. Please Start again.', 'ok');
            } else {
                showToast('my.ini not found in version folder', 'warn');
            }
        } catch (e) {
            console.error('Repair MySQL error:', e);
            showToast('Failed to fix MySQL driver', 'danger');
        }
    }
});
