export const createConfigSlice = (set, get) => ({
    settings: {
        rootPath: 'C:/devstack/www',
        devStackDir: 'C:/devstack',
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
        installPathInitialized: false,
        installBaseDir: '',
    },

    sites: [],
    databases: [],
    portConflicts: {},

    toggleSetting: async (key) => {
        if (key === 'startOnBoot') {
            const nextValue = !get().settings.startOnBoot;
            try {
                const currentPlatform = navigator.userAgent.toLowerCase().includes('windows') ? 'windows' : 'other';

                if (currentPlatform === 'windows') {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('set_start_on_boot', { enabled: nextValue });
                } else {
                    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
                    if (nextValue) await enable();
                    else await disable();
                }

                set(s => ({ settings: { ...s.settings, startOnBoot: nextValue } }));
                get().showToast(nextValue ? get().t('startOnBootEnabled') : get().t('startOnBootDisabled'), nextValue ? 'ok' : 'info');
            } catch (e) {
                console.error('startOnBoot update error', e);
                get().showToast(get().t('startOnBootUpdateError', { error: `${e}` }), 'danger');
            }
            return;
        }

        set(s => ({ settings: { ...s.settings, [key]: !s.settings[key] } }));
    },

    syncStartOnBootSetting: async () => {
        try {
            const currentPlatform = navigator.userAgent.toLowerCase().includes('windows') ? 'windows' : 'other';
            let enabled = false;

            if (currentPlatform === 'windows') {
                const { invoke } = await import('@tauri-apps/api/core');
                enabled = !!(await invoke('get_start_on_boot'));
            } else {
                const { isEnabled } = await import('@tauri-apps/plugin-autostart');
                enabled = await isEnabled();
            }

            set(s => ({ settings: { ...s.settings, startOnBoot: enabled } }));
        } catch (e) {
            console.error('startOnBoot sync error', e);
        }
    },

    toggleAutoStartService: (id) => {
        set(s => {
            const currentMap = s.settings.autoStartMap || {};
            return {
                settings: {
                    ...s.settings,
                    autoStartMap: { ...currentMap, [id]: !currentMap[id] }
                }
            };
        });
    },

    updateSetting: (key, value) => {
        const oldValue = get().settings[key];
        if (oldValue === value) return; // No change, skip

        set(s => ({ settings: { ...s.settings, [key]: value } }));

        // Auto rescan and patch if critical paths change
        if (key === 'devStackDir' || key === 'rootPath') {
            const { initApp, showToast, stopAll, addServiceLog } = get();
            showToast('Đang chuyển đổi thư mục cài đặt...', 'info');
            addServiceLog('apache', `📁 Thư mục làm việc thay đổi sang: ${value}`, 'info');

            // 1. Stop all current services to avoid file locks
            stopAll().finally(async () => {
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const { scanInstalledApache, scanInstalledMysql, apacheVersions, mysqlVersions } = get();

                    // 2. Scan new directory for installed binaries
                    await scanInstalledApache();
                    await scanInstalledMysql();

                    const currentSettings = get().settings;
                    const dsDir = (key === 'devStackDir' ? value : currentSettings.devStackDir).replace(/\\/g, '/').replace(/\/$/, '');
                    const docRoot = (key === 'rootPath' ? value : currentSettings.rootPath).replace(/\\/g, '/').replace(/\/$/, '');

                    // 3. Patch Apache Config (Roots + PHP Module)
                    const activeApache = get().apacheVersions.find(v => v.active && v.installed) || get().apacheVersions.find(v => v.installed);
                    if (activeApache) {
                        const serverRoot = `${dsDir}/bin/apache/apache-${activeApache.version}`;
                        addServiceLog('apache', `🛠 Đang đồng bộ Apache config tại ${serverRoot}...`, 'info');
                        await invoke('patch_apache_paths', { newServerRoot: serverRoot, newDocRoot: docRoot });
                    }

                    // 4. Patch MySQL Config (basedir/datadir)
                    const activeMysql = get().mysqlVersions.find(v => v.active && v.installed) || get().mysqlVersions.find(v => v.installed);
                    if (activeMysql) {
                        const mysqlRoot = `${dsDir}/bin/mysql/mysql-${activeMysql.version}`;
                        const iniPath = `${mysqlRoot}/my.ini`.replace(/\//g, '\\');
                        addServiceLog('mysql', `🛠 Đang đồng bộ MySQL config tại ${mysqlRoot}...`, 'info');
                        await invoke('patch_mysql_paths', {
                            iniPath,
                            newMysqlRoot: mysqlRoot,
                            port: parseInt(currentSettings.portMySQL, 10) || 3306
                        });
                    }

                    // 5. Re-init app and restart auto-services
                    set({ portConflicts: {} });
                    setTimeout(() => initApp(), 1000);
                    showToast('Đồng bộ cấu hình hoàn tất', 'ok');
                } catch (e) {
                    console.error("Path synchronization failed:", e);
                    showToast('Lỗi khi đồng bộ cấu hình', 'danger');
                    addServiceLog('apache', `❌ Lỗi đồng bộ: ${e}`, 'err');
                }
            });
        }
    },

    updateSettings: (newSettings) => set(s => ({
        settings: { ...s.settings, ...newSettings }
    })),

    browseForFolder: async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({ directory: true, multiple: false });
            return selected;
        } catch (e) {
            console.error('browseForFolder failed', e);
            return null;
        }
    },

    browseForEditor: async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: false, multiple: false,
                filters: [{ name: 'Executable', extensions: ['exe'] }]
            });
            if (selected) {
                get().updateSetting('editorPath', selected);
            }
        } catch (e) { console.error('browseForEditor failed', e); }
    },

    updateConfigPath: (id, path) => set(s => ({
        configFiles: s.configFiles.map(f => f.id === id ? { ...f, path } : f)
    })),

    browseForFile: async (id) => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({ multiple: false, title: 'Select Config File' });
            if (selected) {
                get().updateConfigPath(id, selected);
            }
        } catch (e) {
            console.error('browseForFile failed', e);
        }
    },

    resolveConfigPath: (id, explicitPath = "") => {
        if (explicitPath) return explicitPath;

        if (id.startsWith('my_ini_')) {
            const version = id.replace('my_ini_', '');
            return `${get().settings.devStackDir}/bin/mysql/mysql-${version}/my.ini`;
        }

        const sourceFile = get().configFiles.find(f => f.id === id);
        let path = sourceFile?.path || "";

        if (!path) {
            const devDir = get().settings.devStackDir;
            if (id === 'httpd_conf') {
                const act = get().apacheVersions.find(a => a.active && a.installed);
                if (act) path = `${devDir}/bin/apache/apache-${act.version}/conf/httpd.conf`;
            } else if (id === 'vhosts_conf') {
                const act = get().apacheVersions.find(a => a.active && a.installed);
                if (act) path = `${devDir}/bin/apache/apache-${act.version}/conf/extra/httpd-vhosts.conf`;
            } else if (id === 'httpd_ssl') {
                const act = get().apacheVersions.find(a => a.active && a.installed);
                if (act) path = `${devDir}/bin/apache/apache-${act.version}/conf/extra/httpd-ssl.conf`;
            } else if (id === 'php_ini') {
                const act = get().phpVersions.find(p => p.active && p.installed);
                if (act) path = `${devDir}/bin/php/php-${act.version}/php.ini`;
            } else if (id === 'redis_conf') {
                const activeRedis = get().redisVersions?.find(v => v.active);
                if (activeRedis) path = `${devDir}/bin/redis/redis-${activeRedis.version}/redis.conf`;
            } else if (id === 'env') {
                path = `${devDir}/.env`;
            }
        }

        return path;
    },

    openConfigFile: async (id, forceEditor = false, explicitPath = "") => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const path = get().resolveConfigPath(id, explicitPath);

            if (!path) {
                get().showToast(get().t('pathNotConfigured'), 'warn');
                return;
            }

            const winPath = path.replace(/\//g, '\\');
            const editor = get().settings.editorPath || null;
            const isAdmin = id === 'hosts';

            if (forceEditor) {
                await invoke('start_detached_process', {
                    executable: 'rundll32.exe',
                    args: ['shell32.dll,OpenAs_RunDLL', winPath]
                });
                get().showToast(get().t('openWithTitle'), 'ok');
                return;
            }

            if (isAdmin) {
                get().showToast('Mở file hosts bằng quyền Admin...', 'info');
            }

            await invoke('open_file_default', {
                path: winPath,
                editor: editor,
                admin: isAdmin
            });

        } catch (e) {
            console.error('openConfigFile error:', e);
            get().showToast('Failed to open file', 'danger');
        }
    },

    configFiles: [
        { id: 'httpd_conf', label: 'httpd.conf', category: 'Web Server', path: '', desc: 'Apache main configuration', source: null },
        { id: 'vhosts_conf', label: 'httpd-vhosts.conf', category: 'Web Server', path: '', desc: 'Virtual hosts configuration', source: null },
        { id: 'httpd_ssl', label: 'httpd-ssl.conf', category: 'Web Server', path: '', desc: 'Apache SSL configuration', source: null },
        { id: 'my_ini', label: 'my.ini', category: 'Database', path: '', desc: 'MySQL server configuration', source: null },
        { id: 'redis_conf', label: 'redis.conf', category: 'Database', path: '', desc: 'Redis configuration', source: null },
        { id: 'php_ini', label: 'php.ini', category: 'PHP', path: '', desc: 'PHP main configuration', source: null },
        { id: 'hosts', label: 'hosts', category: 'System', path: 'C:/Windows/System32/drivers/etc/hosts', desc: 'System hosts file', source: 'System' },
        { id: 'env', label: '.env', category: 'System', path: '', desc: 'Environment variables', source: null },
    ],

    removeSite: async (id, siteDomain, sitePath) => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { settings, apacheVersions } = get();
            const activeApache = apacheVersions.find(v => v.active)?.version;

            if (activeApache && siteDomain) {
                const vhostsFile = `${settings.devStackDir}/bin/apache/apache-${activeApache}/conf/extra/httpd-vhosts.conf`.replace(/\\/g, '\\\\');
                await invoke('remove_virtual_host', { domain: siteDomain, vhostsFile });
                // Auto restart apache to clear config
                get().restartApache();
            }

            if (sitePath) {
                try {
                    await invoke('remove_dir', { path: sitePath.replace(/\\/g, '\\\\') });
                } catch (e) {
                    console.error('Failed to remove docroot dir:', e);
                }
            }

            set(state => ({ sites: state.sites.filter(s => s.id !== id) }));
            get().scanSites();
        } catch (e) {
            console.error('removeSite error:', e);
            get().showToast('Error removing site', 'danger');
        }
    },

    scanSites: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { detectFramework, suggestPhpVersion } = await import('../lib/project');

            const rootPath = get().settings.rootPath;
            if (!rootPath) return;

            // Native Rust listing is 100x faster and zero-overhead
            const folders = await invoke('list_subdirs', { path: rootPath });

            if (folders && folders.length > 0) {
                const existingSites = get().sites; // preserve ssl state
                const sites = await Promise.all(folders.filter(f => !f.startsWith('.')).map(async (name, i) => {
                    const sitePath = rootPath.replace(/\\/g, '/') + '/' + name;
                    const framework = await detectFramework(sitePath);
                    const suggestedPhp = suggestPhpVersion(framework);
                    const domain = name.toLowerCase().replace(/[^a-z0-9-]/g, '') + '.test';
                    const existing = existingSites.find(s => s.domain === domain);

                    return {
                        id: i + 1,
                        domain,
                        path: sitePath,
                        php: suggestedPhp,
                        framework: framework,
                        ssl: existing?.ssl ?? false, // preserve ssl toggle state
                    };
                }));
                set({ sites });
            } else { set({ sites: [] }); }
        } catch (e) {
            console.error('scanSites error:', e);
            set({ sites: [] });
        }
    },

    createProject: async (name) => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const rootPath = get().settings.rootPath;
            if (!rootPath) {
                get().showToast('Root path not configured', 'danger');
                return false;
            }

            const projectPath = `${rootPath}/${name}`.replace(/\//g, '\\');

            // Native directory creation
            const success = await invoke('create_dir', { path: projectPath });

            if (success) {
                // Create default index.php
                const indexPath = `${projectPath}\\index.php`;
                const content = `<?php\n\nphpinfo();\n`;
                await invoke('write_text_file', { path: indexPath, content });

                get().showToast(`Project "${name}" created`, 'ok');
                await get().scanSites();
                return true;
            }
            return false;
        } catch (e) {
            console.error('createProject error:', e);
            get().showToast(typeof e === 'string' ? e : 'Failed to create project', 'danger');
            return false;
        }
    },

    setupVirtualHost: async (site) => {
        const { domain, path: docRoot } = site;
        const { settings, apacheVersions, showToast, scanSites } = get();
        const activeApache = apacheVersions.find(v => v.active && v.installed);

        if (!activeApache) {
            showToast('No active Apache version found', 'warn');
            return;
        }

        const devDir = settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const apacheBase = `${devDir}/bin/apache/apache-${activeApache.version}`;
        const httpdConf = `${apacheBase}/conf/httpd.conf`.replace(/\//g, '\\');
        const vhostsFile = `${apacheBase}/conf/extra/httpd-vhosts.conf`.replace(/\//g, '\\');
        const port = settings.port80 || 80;

        try {
            const { checkMkcert, generateCert } = await import('../lib/ssl');
            const { invoke } = await import('@tauri-apps/api/core');

            showToast('Updating Virtual Host (Admin rights may be requested)...', 'info');

            let sslConfig = { cert: '', key: '', enabled: false };
            if (site.ssl) {
                const hasMkcert = await checkMkcert(settings);
                if (hasMkcert) {
                    const certs = await generateCert(settings, domain);
                    sslConfig = { ...certs, enabled: true };
                } else {
                    showToast(
                        `⚠️ mkcert not found at ${devDir}/bin/tools/mkcert.exe — SSL skipped. Download from https://github.com/FiloSottile/mkcert/releases`,
                        'danger'
                    );
                    return; // stop here so user knows they need mkcert
                }
            }

            const result = await invoke('setup_virtual_host', {
                domain,
                docRoot,
                httpdConf,
                vhostsFile,
                port: parseInt(port),
                sslEnabled: sslConfig.enabled,
                sslCert: sslConfig.cert || "",
                sslKey: sslConfig.key || ""
            });

            if (result === "SUCCESS") {
                showToast(`✓ Site ${domain} configured ${site.ssl ? '(HTTPS)' : '(HTTP)'}. Restarting Apache...`, 'ok');
                // Auto-restart Apache so the new vhost/SSL config takes effect immediately
                await get().restartApache();
            }
            scanSites();
        } catch (e) {
            console.error('setupVirtualHost error:', e);
            showToast(typeof e === 'string' ? e : 'Failed to setup Virtual Host', 'danger');
        }
    },

    scanDatabases: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const dbSvc = get().services.find(s => s.type === 'db');
            if (!dbSvc || dbSvc.status !== 'running') {
                set({ databases: [] });
                return;
            }

            let mysqlBin = 'mysql';
            if (dbSvc.path) {
                mysqlBin = dbSvc.path.replace('mysqld.exe', 'mysql.exe').replace(/\//g, '\\');
            }

            const query = [
                "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema','mysql','performance_schema','sys','phpmyadmin');",
                "SELECT TABLE_SCHEMA, COUNT(*) FROM information_schema.TABLES GROUP BY TABLE_SCHEMA;",
                "SELECT TABLE_SCHEMA, ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) FROM information_schema.TABLES GROUP BY TABLE_SCHEMA;"
            ].join(' ');

            const raw = await invoke('run_mysql_query', {
                exePath: mysqlBin,
                query,
                port: parseInt(get().settings.portMySQL || 3306, 10)
            });

            if (raw) {
                const lines = raw.trim().split(/\r?\n/).map(l => l.trim());
                const tableCounts = {};
                const sizes = {};
                const dbNames = [];

                lines.forEach(line => {
                    const parts = line.split(/\s+/);
                    if (parts.length === 1) {
                        if (isNaN(parts[0])) dbNames.push(parts[0]);
                    } else if (parts.length >= 2) {
                        const schema = parts[0];
                        const val = parts[1];
                        if (line.includes('.') || parts.length === 2 && val.includes('.')) {
                            sizes[schema] = val + ' MB';
                        } else {
                            tableCounts[schema] = val;
                        }
                    }
                });

                const dbs = dbNames.map(name => ({
                    name,
                    tables: tableCounts[name] || '0',
                    size: sizes[name] || '0 MB',
                    charset: 'utf8mb4',
                }));
                set({ databases: dbs });
            }
        } catch (e) {
            console.error("Scan DB error:", e);
        }
    },

    updateSettings: (newSettings) => set(s => ({
        settings: { ...s.settings, ...newSettings }
    })),

    toggleSiteSSL: async (id) => {
        const site = get().sites.find(s => s.id === id);
        if (!site) return;

        const newSslState = !site.ssl;

        // Toggle state in UI immediately for responsive feel
        set(s => ({ sites: s.sites.map(s2 => s2.id === id ? { ...s2, ssl: newSslState } : s2) }));

        const { settings, apacheVersions, showToast } = get();
        const activeApache = apacheVersions.find(v => v.active && v.installed);
        if (!activeApache) {
            showToast('Không tìm thấy Apache đang active', 'warn');
            return;
        }

        const devDir = settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const apacheBase = `${devDir}/bin/apache/apache-${activeApache.version}`;
        const httpdConf = `${apacheBase}/conf/httpd.conf`.replace(/\//g, '\\');
        const vhostsFile = `${apacheBase}/conf/extra/httpd-vhosts.conf`.replace(/\//g, '\\');

        try {
            const { checkMkcert, installMkcert, generateCert } = await import('../lib/ssl');
            const { invoke } = await import('@tauri-apps/api/core');

            let sslConfig = { cert: '', key: '', enabled: false };

            if (newSslState) {
                // Auto-install mkcert if missing
                const hasMkcert = await checkMkcert(settings);
                if (!hasMkcert) {
                    showToast('🔐 Đang tải mkcert...', 'info');
                    try {
                        await installMkcert(settings);
                        showToast('✓ mkcert đã được cài tự động', 'ok');
                    } catch (e) {
                        showToast(`❌ Không tải được mkcert: ${e}`, 'danger');
                        // Revert ssl toggle
                        set(s => ({ sites: s.sites.map(s2 => s2.id === id ? { ...s2, ssl: false } : s2) }));
                        return;
                    }
                }

                showToast(`🔐 Đang tạo cert cho ${site.domain}...`, 'info');
                const certs = await generateCert(settings, site.domain);
                sslConfig = { ...certs, enabled: true };
            }

            const result = await invoke('setup_virtual_host', {
                domain: site.domain,
                docRoot: site.path,
                httpdConf,
                vhostsFile,
                port: parseInt(settings.port80 || 80),
                sslEnabled: sslConfig.enabled,
                sslCert: sslConfig.cert || '',
                sslKey: sslConfig.key || ''
            });

            if (result === 'SUCCESS') {
                const modeLabel = newSslState ? 'HTTPS ✓' : 'HTTP';
                showToast(`${site.domain} → ${modeLabel}. Đang restart Apache...`, 'ok');
                await get().restartApache();
            }
        } catch (e) {
            console.error('toggleSiteSSL error:', e);
            showToast(typeof e === 'string' ? e : `Lỗi: ${e?.message || e}`, 'danger');
            // Revert on failure
            set(s => ({ sites: s.sites.map(s2 => s2.id === id ? { ...s2, ssl: !newSslState } : s2) }));
        }
    },

    setMysqlPort: (port) => set(s => ({
        settings: { ...s.settings, portMySQL: parseInt(port) || 3306 },
        services: s.services.map(sv => sv.type === 'db' ? { ...sv, port: parseInt(port) || 3306 } : sv)
    })),

    setApachePort: (port) => set(s => ({
        settings: { ...s.settings, port80: parseInt(port) || 80 },
        services: s.services.map(sv => sv.type === 'web' ? { ...sv, port: parseInt(port) || 80 } : sv)
    })),
});
