import { getMysqlDir, getDevDir, getPhpDir } from '../lib/paths';

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
        let active = get().mysqlVersions.find(v => v.active && v.installed);
        if (!active) {
            const installed = get().mysqlVersions.find(v => v.installed);
            if (!installed) {
                get().showToast(get().t('noVersionInstalled', { name: 'MySQL' }), 'warn', { action: { label: get().t('guideOpenPage'), page: 'database' } });
                return false;
            }
            await get().setActiveMysql(installed.version);
            active = installed;
        }

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
            get().showToast(get().t('serviceStartFailed', { name: 'MySQL', error: `${e}` }), 'danger', { action: { label: get().t('guideHowToFix'), guide: 'troubleshooting' } });
            get().addServiceLog('mysql', `${e}`, 'err');
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

        const unlisteners = [];
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            unlisteners.push(await listen('db-install-log', (event) => {
                const line = event.payload;
                set(s => ({ mysqlInstallLogs: [...s.mysqlInstallLogs, { t: new Date().toLocaleTimeString(), m: line, l: 'info' }] }));
            }));

            unlisteners.push(await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload;
                if (svcType === 'db') {
                    set({ mysqlInstallProgress: { pct, downloaded, total } });
                }
            }));

            const result = await invoke('install_binary', {
                svcType: 'db',
                version,
                url: v.downloadUrl,
                destDir: mysqlDir,
                expectedSizeMb: null
            });

            if (result !== "SUCCESS") throw result;
            set(s => ({ mysqlVersions: s.mysqlVersions.map(mv => mv.version === version ? { ...mv, installed: true, installing: false } : mv) }));
            get().showToast(`MySQL ${version} installed`, 'ok');
            if (!get().mysqlVersions.some(mv => mv.active && mv.installed)) await get().setActiveMysql(version);
        } catch (e) {
            console.error('installMysqlVersion error:', e);
            set(s => ({
                mysqlVersions: s.mysqlVersions.map(mv => mv.version === version ? { ...mv, installing: false } : mv),
                mysqlInstallLogs: [...s.mysqlInstallLogs, { t: new Date().toLocaleTimeString(), m: `Error: ${e}`, l: 'err' }]
            }));
            get().showToast('Installation failed', 'danger');
        } finally {
            unlisteners.forEach(un => un());
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

    setActiveMysql: async (version) => {
        const target = get().mysqlVersions.find(v => v.version === version && v.installed);
        if (!target) {
            get().showToast(`MySQL ${version} chưa được cài đặt`, 'warn');
            return;
        }

        const mysqlSvc = get().services.find(s => s.type === 'db');
        const wasRunning = mysqlSvc?.status === 'running' || !!mysqlSvc?.pid;
        get().addServiceLog?.('mysql', `Switching MySQL default version to ${version}...`, 'info');

        if (wasRunning && mysqlSvc) {
            get().showToast(`Đang đổi MySQL sang ${version}...`, 'info');
            get().addServiceLog?.('mysql', `Stopping current MySQL before switching to ${version}...`, 'warn');
            // The old mysqld would keep :3306 and the new version could not start.
            if (!(await get().toggleService(mysqlSvc.id, 'stop'))) return;
        }

        set(s => ({
            mysqlVersions: s.mysqlVersions.map(v => ({ ...v, active: v.version === version })),
            services: s.services.map(svc => svc.type === 'db' ? { ...svc, version } : svc)
        }));

        if (wasRunning && mysqlSvc) {
            get().addServiceLog?.('mysql', `Starting MySQL ${version}...`, 'info');
            await get().toggleService(mysqlSvc.id, 'start');
            await get().checkServicesRunning();
            get().addServiceLog?.('mysql', `MySQL ${version} is now active.`, 'ok');
            get().showToast(`Đã đổi và khởi động lại MySQL ${version}`, 'ok');
        } else {
            get().addServiceLog?.('mysql', `MySQL ${version} selected as default.`, 'ok');
            get().showToast(`Đã chọn MySQL ${version} làm mặc định`, 'ok');
            await get().checkServicesRunning();
        }
    },

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

    dbList: [],
    dbImportQueue: [],

    _mysqlTools: () => {
        const active = get().mysqlVersions.find(v => v.active && v.installed);
        if (!active) throw get().t('noActiveMysql');
        const bin = `${getMysqlDir(get(), active.version)}/bin`.replace(/\//g, '\\');
        return { mysql: `${bin}\\mysql.exe`, mysqldump: `${bin}\\mysqldump.exe`, port: parseInt(get().settings.portMySQL || 3306, 10) };
    },

    _sql: async (sql) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { mysql, port } = get()._mysqlTools();
        return invoke('mysql_exec', { mysqlExe: mysql, port, sql });
    },

    loadDatabases: async () => {
        try {
            const out = await get()._sql(
                "SELECT s.schema_name, COUNT(t.table_name), ROUND(COALESCE(SUM(t.data_length + t.index_length), 0) / 1024 / 1024, 2) " +
                "FROM information_schema.schemata s LEFT JOIN information_schema.tables t ON t.table_schema = s.schema_name " +
                "WHERE s.schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys') " +
                "GROUP BY s.schema_name ORDER BY s.schema_name;"
            );
            set({ dbList: out.split(/\r?\n/).filter(Boolean).map(line => {
                const [name, tables, size] = line.split('\t');
                return { name, tables: parseInt(tables, 10) || 0, size: `${size} MB` };
            }) });
        } catch (e) {
            set({ dbList: [] });
            get().showToast(`${e}`.split('\n')[0], 'warn');
        }
    },

    _validDbName: (name) => /^[A-Za-z0-9_$-]{1,64}$/.test(name),

    createDatabase: async (name) => {
        if (!get()._validDbName(name)) return get().showToast(get().t('dbNameInvalid'), 'warn');
        try {
            await get()._sql(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
            get().showToast(get().t('dbCreated', { name }), 'ok');
            await get().loadDatabases();
        } catch (e) {
            get().showToast(`${e}`, 'danger');
        }
    },

    /** mysqldump of the given databases into <devstack>/backups. Returns the file path. */
    backupDatabases: async (names) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { mysqldump, port } = get()._mysqlTools();
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
        const dest = `${getDevDir(get())}/backups/${names.join('+')}-${stamp}.sql`.replace(/\//g, '\\');
        return invoke('mysql_dump', { mysqldumpExe: mysqldump, port, databases: names, dest });
    },

    exportDatabases: async (names) => {
        try {
            const dest = await get().backupDatabases(names);
            get().showToast(get().t('dbExported', { path: dest }), 'ok');
        } catch (e) {
            get().showToast(`${e}`, 'danger');
        }
    },

    /** Drops with FOREIGN_KEY_CHECKS=0 (cross-schema FKs), after an optional backup. */
    dropDatabase: async (name, { backup = true } = {}) => {
        if (!get()._validDbName(name)) return false;
        try {
            if (backup) {
                const dest = await get().backupDatabases([name]);
                get().addServiceLog('mysql', get().t('dbBackedUp', { path: dest }), 'info');
            }
            await get()._sql(`SET FOREIGN_KEY_CHECKS=0; DROP DATABASE IF EXISTS \`${name}\`;`);
            get().showToast(get().t('dbDropped', { name }), 'warn');
            await get().loadDatabases();
            return true;
        } catch (e) {
            get().showToast(`${e}`, 'danger');
            return false;
        }
    },

    setDbImportQueue: (queue) => set({ dbImportQueue: queue }),

    /** Imports each `{ file, db }` in order, optionally recreating the DB first. */
    importDumps: async ({ recreate, disableFk, backup }) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');
        const { mysql, port } = get()._mysqlTools();
        await get().loadDatabases(); // fresh list decides which DBs need a backup before recreate
        const update = (i, patch) => set(s => ({ dbImportQueue: s.dbImportQueue.map((item, j) => j === i ? { ...item, ...patch } : item) }));
        const unlisten = await listen('db-import-progress', ({ payload }) => {
            const i = get().dbImportQueue.findIndex(item => item.file === payload.file && item.status === 'running');
            if (i >= 0) update(i, { pct: payload.pct });
        });
        let failed = 0;
        try {
            for (let i = 0; i < get().dbImportQueue.length; i++) {
                const { file, db } = get().dbImportQueue[i];
                if (!get()._validDbName(db)) {
                    update(i, { status: 'error', error: get().t('dbNameInvalid') });
                    failed++;
                    continue;
                }
                update(i, { status: 'running', pct: 0, error: '' });
                try {
                    if (recreate) {
                        if (backup && get().dbList.some(d => d.name === db && d.tables > 0)) await get().backupDatabases([db]);
                        await get()._sql(`SET FOREIGN_KEY_CHECKS=0; DROP DATABASE IF EXISTS \`${db}\`; CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
                    } else {
                        await get()._sql(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
                    }
                    await invoke('mysql_import', { mysqlExe: mysql, port, database: db, file, disableFk });
                    update(i, { status: 'done', pct: 100 });
                } catch (e) {
                    update(i, { status: 'error', error: `${e}` });
                    failed++;
                }
            }
        } finally {
            unlisten();
        }
        await get().loadDatabases();
        get().showToast(failed ? get().t('dbImportFailed', { count: failed }) : get().t('dbImportDone'), failed ? 'danger' : 'ok');
    },

    /** Opens Adminer (served by php -S, auto-login as root) or TablePlus. */
    openAdminTool: async (tool) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        const { t, showToast } = get();
        const { port } = get()._mysqlTools();
        if (tool === 'tableplus') {
            const candidates = ['C:\\Program Files\\TablePlus\\TablePlus.exe', 'C:\\Program Files (x86)\\TablePlus\\TablePlus.exe'];
            for (const exe of candidates) {
                if (await invoke('path_exists', { path: exe })) {
                    await invoke('start_detached_process', { executable: exe, args: [] });
                    showToast(t('tablePlusOpened', { url: `mysql://root@127.0.0.1:${port}` }), 'info');
                    return;
                }
            }
            showToast(t('tablePlusNotFound'), 'warn');
            return;
        }

        const dir = `${getDevDir(get())}/bin/tools/adminer`.replace(/\//g, '\\');
        const php = get().phpVersions.find(v => v.active && v.installed);
        if (!php) return showToast(t('noActivePhp'), 'warn');
        try {
            if (!(await invoke('path_exists', { path: `${dir}\\adminer.php` }))) {
                await invoke('create_dir', { path: dir });
                await invoke('download_file', { url: 'https://github.com/vrana/adminer/releases/download/v4.8.1/adminer-4.8.1-mysql.php', destPath: `${dir}\\adminer.php` });
            }
            await invoke('write_text_file', {
                path: `${dir}\\index.php`,
                content: `<?php\n// DevStack: log in to the local MySQL as root without a password.\nfunction adminer_object() {\n    class DevStackAdminer extends Adminer {\n        function credentials() { return array('127.0.0.1:${port}', 'root', ''); }\n        function login($login, $password) { return true; }\n    }\n    return new DevStackAdminer;\n}\ninclude __DIR__ . '/adminer.php';\n`,
            });
            if (!get().procs.adminer?.running) {
                const phpDir = getPhpDir(get(), php).replace(/\//g, '\\');
                await get().startProcess({ id: 'adminer', command: `"${phpDir}\\php.exe" -S 127.0.0.1:8090 -t "${dir}"`, cwd: dir, pathPrefix: phpDir });
                await new Promise(r => setTimeout(r, 800));
            }
            await openUrl(`http://127.0.0.1:8090/?server=127.0.0.1:${port}&username=root`);
        } catch (e) {
            showToast(`${e}`, 'danger');
        }
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
