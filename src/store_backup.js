import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Command } from '@tauri-apps/plugin-shell';
import translations from './i18n';

export const useStore = create(
  persist(
    (set, get) => ({
      // ═══════════════════════════════════════════
      // STATE
      // ═══════════════════════════════════════════
      phpInstallProgress: { pct: 0, downloaded: 0, total: 0 },
      apacheInstallProgress: { pct: 0, downloaded: 0, total: 0 },
      knownExternalServices: [],
      _lastServiceCheck: 0,

      services: [
        { id: 1, name: 'Apache (DevStack)', type: 'web', version: '—', port: 80, status: 'stopped', pid: null, memory: '—' },
        { id: 2, name: 'MySQL (DevStack)', type: 'db', version: '8.0.35', port: 3306, status: 'stopped', pid: null, memory: '—' },
        { id: 3, name: 'PHP (DevStack)', type: 'php', version: '—', port: 9000, status: 'stopped', pid: null, memory: '—' },
        { id: 4, name: 'Redis (DevStack)', type: 'cache', version: '7.2.3', port: 6379, status: 'stopped', pid: null, memory: '—' },
      ],
      sites: [],
      databases: [],

      phpVersions: [
        { version: '8.4.16', installed: false, active: false, installing: false },
        { version: '8.3.29', installed: false, active: false, installing: false },
        { version: '8.2.30', installed: false, active: false, installing: false },
        { version: '8.1.34', installed: false, active: false, installing: false },
        { version: '8.0.30', installed: false, active: false, installing: false },
        { version: '7.4.33', installed: false, active: false, installing: false },
      ],
      phpInstallLogs: [],

      apacheVersions: [
        // Latest - from https://www.apachelounge.com/download/ (VS18, MSVC 2022)
        { version: '2.4.66', vsRuntime: 'VS18', label: 'Latest', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.66-260223-Win64-VS18.zip' },
        // Additional / older - from https://www.apachelounge.com/download/additional/
        { version: '2.4.57', vsRuntime: 'VS16', label: 'Last VS16', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VS16/binaries/httpd-2.4.57-win64-VS16.zip' },
        { version: '2.4.54', vsRuntime: 'VC15', label: 'Last VC15', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VC15/binaries/httpd-2.4.54-win64-VC15.zip' },
        { version: '2.4.41', vsRuntime: 'VC14', label: 'Last VC14', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VC14/binaries/httpd-2.4.41-win64-VC14.zip' },
        { version: '2.4.38', vsRuntime: 'VC11', label: 'Last VC11', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VC11/binaries/httpd-2.4.38-win64-VC11.zip' },
        { version: '2.4.23', vsRuntime: 'VC10', label: 'Last VC10 (XP/2003)', installed: false, active: false, installing: false, downloadUrl: 'https://www.apachelounge.com/download/VC10/binaries/httpd-2.4.23-win32-VC10.zip' },
      ],
      apacheInstallLogs: [],
      mysqlVersions: [
        { version: '8.0.45', installed: false, active: false, installing: false, downloadUrl: 'https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-8.0.45-winx64.zip' },
        { version: '8.0.40', installed: false, active: false, installing: false, downloadUrl: 'https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-8.0.40-winx64.zip' },
        { version: '5.7.44', installed: false, active: false, installing: false, downloadUrl: 'https://cdn.mysql.com/Archives/MySQL-5.7/mysql-5.7.44-winx64.zip' },
      ],
      selectedMysqlVersion: null,
      mysqlInstallLogs: [],
      mysqlInstallProgress: { pct: 0, downloaded: 0, total: 0 },

      portConflicts: {},
      extensions: ['curl', 'mbstring', 'openssl', 'pdo_mysql', 'gd', 'zip', 'intl', 'xml', 'bcmath', 'json', 'tokenizer', 'fileinfo', 'ctype'],

      currentLog: 'apache',
      logs: { apache: [], mysql: [], php: [] },
      addServiceLog: (type, m, l = 'info') => set(s => ({
        logs: { ...s.logs, [type]: [...(s.logs[type] || []), { t: new Date().toLocaleTimeString(), m, l }].slice(-500) }
      })),

      settings: {
        rootPath: 'C:/devstack/www',
        devStackDir: 'C:/devstack',
        autoStart: true,
        startOnBoot: false,
        port80: 80,
        portMySQL: 3306,
        trayIcon: true,
        editorPath: '',
      },

      toast: { show: false, msg: '', type: 'ok' },
      activePage: 'services',
      isDownloading: false,
      downloadProgress: 0,

      // i18n
      locale: 'en',
      t: (key, params) => {
        const locale = get().locale;
        let text = translations[locale]?.[key] || translations.en[key] || key;
        if (params) Object.entries(params).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
        return text;
      },
      setLocale: (locale) => set({ locale }),

      // System monitoring
      systemStats: { cpu: 0, ram: 0, ramTotal: 0 },
      detectedPhpVersion: null,
      selectedPhpVersion: null,
      selectedApacheVersion: null,
      selectedMysqlVersion: null,
      isSystemConflict: false,
      conflictPath: '',
      activatingPhp: null, // Track which version is being activated

      // Tunnel state
      tunnelProvider: 'cloudflare',
      tunnelStatus: 'stopped',
      tunnelPublicUrl: '',
      tunnelPort: 80,
      tunnelProtocol: 'http',
      tunnelLogs: [],
      tunnelHostHeader: '',
      tunnelInstalled: { cloudflare: false, ngrok: false, nport: false },

      // Config files
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

      // ═══════════════════════════════════════════
      // ACTIONS
      // ═══════════════════════════════════════════

      // === Services ===
      setDownloading: (val) => set({ isDownloading: val }),
      setDownloadProgress: (val) => set({ downloadProgress: val }),

      syncServiceVersions: () => {
        const activeApache = get().apacheVersions.find(v => v.active && v.installed);
        const activePhp = get().phpVersions.find(v => v.active && !v.isSystem && v.installed);
        const activeMysql = get().mysqlVersions.find(v => v.active && v.installed);
        const activeMysqlFolderName = activeMysql ? `mysql-${activeMysql.version}` : '';

        const devDir = get().settings.devStackDir;

        set(s => ({
          services: s.services.map(svc => {
            if (svc.type === 'web' && activeApache) return { ...svc, version: activeApache.version, port: get().settings.port80 || 80, autoStart: get().settings.autoStartApache || false };
            if (svc.type === 'php' && activePhp) return { ...svc, version: activePhp.version, autoStart: get().settings.autoStartPhp || false };
            if (svc.type === 'db' && (svc.id === 2 || svc.id >= 3000)) {
              const mv = s.mysqlVersions.find(v => v.version === svc.version);
              if (mv) return { ...svc, port: mv.port, name: `MySQL ${mv.version} (DevStack)`, autoStart: mv.autoStart || false };
            }
            if (svc.id === 4) return { ...svc, autoStart: get().settings.autoStartRedis || false };
            return svc;
          }),
          configFiles: s.configFiles.map(f => {
            if (activeApache) {
              if (f.id === 'httpd_conf') return { ...f, path: `${devDir}/bin/apache/apache-${activeApache.version}/conf/httpd.conf` };
              if (f.id === 'vhosts_conf') return { ...f, path: `${devDir}/bin/apache/apache-${activeApache.version}/conf/extra/httpd-vhosts.conf` };
              if (f.id === 'httpd_ssl') return { ...f, path: `${devDir}/bin/apache/apache-${activeApache.version}/conf/extra/httpd-ssl.conf` };
            } else {
              // Try to find Apache config if it's running externally
              const apacheSvc = s.services.find(sv => sv.type === 'web');
              if (apacheSvc?.status === 'running' && apacheSvc.path) {
                const exePath = apacheSvc.path.toLowerCase().replace(/\\/g, '/');
                if (f.id === 'httpd_conf') {
                  let source = 'External';
                  let inferredPath = exePath.replace('/bin/httpd.exe', '/conf/httpd.conf');
                  if (exePath.includes('/xampp/')) source = 'XAMPP';
                  else if (exePath.includes('/laragon/')) source = 'Laragon';
                  else if (exePath.includes('/wamp')) source = 'WAMP';
                  return { ...f, path: inferredPath, source };
                }
              }
            }

            if (activePhp) {
              if (f.id === 'php_ini') {
                const folder = activePhp.folderName || `php-${activePhp.version}`;
                return { ...f, path: `${devDir}/bin/php/${folder}/php.ini` };
              }
            }

            if (activeMysql) {
              if (f.id === 'my_ini') return { ...f, path: `${devDir}/bin/mysql/${activeMysqlFolderName}/my.ini` };
            } else {
              // Try to find MySQL config if it's running externally
              const mysqlSvc = s.services.find(sv => sv.type === 'db');
              if (mysqlSvc?.status === 'running' && mysqlSvc.path) {
                const exePath = mysqlSvc.path.toLowerCase().replace(/\\/g, '/');
                if (f.id === 'my_ini') {
                  let inferredPath = '';
                  let source = 'External';
                  if (exePath.includes('/xampp/')) {
                    source = 'XAMPP';
                    inferredPath = exePath.replace('/mysqld.exe', '/my.ini');
                  } else if (exePath.includes('/laragon/')) {
                    source = 'Laragon';
                    inferredPath = exePath.replace('/bin/mysqld.exe', '/my.ini');
                  } else if (exePath.includes('/program files/')) {
                    source = 'System';
                    inferredPath = exePath.replace('/bin/mysqld.exe', '/my.ini');
                  } else {
                    inferredPath = exePath.replace('/mysqld.exe', '/my.ini');
                  }
                  return { ...f, path: inferredPath, source };
                }
              }
            }
            return f;
          })
        }));
      },

      toggleService: async (id, action) => {
        const svc = get().services.find(s => s.id === id);
        if (!svc) return;

        const isRunning = svc.status === 'running' || svc.pid;
        const shouldStop = action ? action === 'stop' : isRunning;

        if (shouldStop) {
          if (svc.status !== 'restarting') {
            set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopping' } : sv) }));
          }

          try {
            if (svc.pid || svc.svcName) {
              if (svc.isExternal || id >= 1000) {
                // console.log('External branch, using service name:', svc.svcName, 'or path:', svc.path);

                let svcName = svc.svcName;

                // Only query registry if we don't have svcName
                if (!svcName && svc.path) {
                  const findSvcScript = `
$exePath = '${(svc.path || '').replace(/\\/g, '\\\\')}'.Replace('\\\\', '\\')
$found = $null
Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services" -EA SilentlyContinue | ForEach-Object {
  if ($found) { return }
  $img = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).ImagePath
  if (!$img) { return }
  $exe = $img.Trim()
  if ($exe.StartsWith('"')) { $exe = ($exe -replace '^"([^"]+)".*','$1') }
  else { $exe = ($exe -split '\\s+')[0] }
  if ($exe.ToLower() -eq $exePath.ToLower()) { $found = $_.PSChildName }
}
if ($found) { Write-Output "SVC:$found" } else { Write-Output "SVC:NOT_FOUND" }
      `.trim();

                  const utf16a = new Uint8Array(findSvcScript.length * 2);
                  for (let i = 0; i < findSvcScript.length; i++) {
                    utf16a[i * 2] = findSvcScript.charCodeAt(i) & 0xff;
                    utf16a[i * 2 + 1] = (findSvcScript.charCodeAt(i) >> 8) & 0xff;
                  }
                  const b64a = btoa(String.fromCharCode(...utf16a));

                  const findResult = await Command.create('powershell', [
                    '-NoProfile', '-NonInteractive', '-EncodedCommand', b64a
                  ]).execute();

                  const svcLine = findResult.stdout?.split('\n').find(l => l.trim().startsWith('SVC:'));
                  svcName = svcLine?.replace('SVC:', '').trim();
                  if (svcName === 'NOT_FOUND') svcName = null;
                }

                if (svcName) {
                  const elevatedScript = `Stop-Service -Name '${svcName}' -Force`;
                  const utf16b = new Uint8Array(elevatedScript.length * 2);
                  for (let i = 0; i < elevatedScript.length; i++) {
                    utf16b[i * 2] = elevatedScript.charCodeAt(i) & 0xff;
                    utf16b[i * 2 + 1] = (elevatedScript.charCodeAt(i) >> 8) & 0xff;
                  }
                  const b64b = btoa(String.fromCharCode(...utf16b));
                  get().showToast(`Đang yêu cầu quyền Admin để dừng ${svc.name}...`, 'info');
                  if (svc.type === 'web' || svc.type === 'db' || svc.type === 'php') {
                    get().addServiceLog(svc.type === 'web' ? 'apache' : svc.type === 'db' ? 'mysql' : 'php', `Stopping external service [${svcName}]...`, 'warn');
                  }
                  await Command.create('powershell', [
                    '-NoProfile', '-Command',
                    `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${b64b}'`
                  ]).execute();
                } else if (svc.pid) {
                  // Not a Windows Service but has PID — kill directly
                  await Command.create('powershell', [
                    '-NoProfile', '-Command',
                    `Stop-Process -Id ${svc.pid} -Force -ErrorAction SilentlyContinue`
                  ]).execute();
                }

                await get()._pollUntilStable(id, 'stopped', 10, 800);
              } else {
                // Internal DevStack service
                const logType = svc.type === 'web' ? 'apache' : svc.type === 'db' ? 'mysql' : svc.type === 'php' ? 'php' : null;
                if (logType) get().addServiceLog(logType, `Stopping internal service ${svc.name}...`, 'warn');

                if (svc.type === 'web') {
                  await Command.create('powershell', ['-NoProfile', '-Command',
                    `Stop-Process -Name httpd -Force -ErrorAction SilentlyContinue`
                  ]).execute();
                } else if (svc.type === 'db') {
                  if (svc.pid) {
                    await Command.create('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${svc.pid} -Force -ErrorAction SilentlyContinue`]).execute();
                  } else {
                    await Command.create('powershell', ['-NoProfile', '-Command', `Stop-Process -Name mysqld -Force -ErrorAction SilentlyContinue`]).execute();
                  }
                } else if (svc.type === 'cache') {
                  await Command.create('powershell', ['-NoProfile', '-Command',
                    `Stop-Process -Name redis-server -Force -ErrorAction SilentlyContinue`
                  ]).execute();
                } else {
                  await Command.create('powershell', ['-NoProfile', '-Command',
                    `Stop-Process -Id ${svc.pid} -Force -ErrorAction SilentlyContinue`
                  ]).execute();
                }

                await get()._pollUntilStable(id, 'stopped');
                if (logType) get().addServiceLog(logType, `Service ${svc.name} stopped successfully.`, 'ok');
              }
            }
          } catch (e) { console.error('Stop failed', e); }

        } else {
          if (svc.status !== 'restarting') {
            set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'starting' } : sv) }));
          }

          // ── THÊM VÀO ĐÂY ──
          if (svc.isExternal || id >= 1000) {
            // console.log('Start external:', { id, path: svc.path, svcName: svc.svcName, name: svc.name });

            let svcName = svc.svcName || null;

            // Chỉ query registry nếu chưa có svcName
            if (!svcName && svc.path) {
              const findSvcScript = `
$exePath = '${(svc.path || '').replace(/\\/g, '\\\\')}'.Replace('\\\\', '\\')
$found = $null
Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services" -EA SilentlyContinue | ForEach-Object {
  if ($found) { return }
  $img = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).ImagePath
  if (!$img) { return }
  $exe = $img.Trim()
  if ($exe.StartsWith('"')) { $exe = ($exe -replace '^"([^"]+)".*','$1') }
  else { $exe = ($exe -split '\\s+')[0] }
  if ($exe.ToLower() -eq $exePath.ToLower()) { $found = $_.PSChildName }
}
if ($found) { Write-Output "SVC:$found" } else { Write-Output "SVC:NOT_FOUND" }
    `.trim();

              const utf16s = new Uint8Array(findSvcScript.length * 2);
              for (let i = 0; i < findSvcScript.length; i++) {
                utf16s[i * 2] = findSvcScript.charCodeAt(i) & 0xff;
                utf16s[i * 2 + 1] = (findSvcScript.charCodeAt(i) >> 8) & 0xff;
              }
              const b64s = btoa(String.fromCharCode(...utf16s));
              const findRes = await Command.create('powershell', [
                '-NoProfile', '-NonInteractive', '-EncodedCommand', b64s
              ]).execute();
              const svcLine = findRes.stdout?.split('\n').find(l => l.trim().startsWith('SVC:'));
              svcName = svcLine?.replace('SVC:', '').trim();
              if (svcName === 'NOT_FOUND') svcName = null;
            }

            if (svcName) {
              // Windows Service — needs admin to start/stop
              // Use net start/stop via elevated cmd which is simpler and reliable
              get().showToast(`Đang yêu cầu quyền Admin để khởi động ${svc.name}...`, 'info');
              await Command.create('powershell', [
                '-NoProfile', '-Command',
                `Start-Process cmd -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '/C','net start "${svcName}"'`
              ]).execute();
            } else {
              // Not a Windows Service — start directly
              await Command.create('powershell', [
                '-NoProfile', '-Command',
                `Start-Process -FilePath '${svc.path}' -WindowStyle Hidden`
              ]).execute();
            }

            // Thay vì đợi 2.5s, chúng ta poll liên tục tối đa 15 lần (mỗi lần 1 giây) để chờ port được bind
            const success = await get()._pollUntilStable(id, 'running', 15, 1000);
            if (!success) {
              get().showToast(`Không thể khởi động ${svc.name}. Có thể do xung đột cổng hoặc quyền truy cập.`, 'danger');
              set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
            }
            return;
          }

          if (svc.type === 'web') {
            const activeApache = get().apacheVersions.find(v => v.active && v.installed);
            if (!activeApache) {
              set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              get().showToast('Chưa có Apache nào được kích hoạt!', 'warn');
              return;
            }
            const devDir = get().settings.devStackDir.replace(/\//g, '\\');
            const httpdExe = `${devDir}\\bin\\apache\\apache-${activeApache.version}\\bin\\httpd.exe`;
            try {
              get().addServiceLog('apache', `Starting Apache ${activeApache.version}...`, 'info');
              await Command.create('powershell', ['-NoProfile', '-Command',
                `Start-Process -FilePath '${httpdExe}' -WindowStyle Hidden`
              ]).execute();
              const success = await get()._pollUntilStable(id, 'running');
              if (success) {
                get().addServiceLog('apache', `Apache started successfully.`, 'ok');
              } else {
                get().addServiceLog('apache', `Apache failed to start. Port ${svc.port || 80} in use?`, 'err');
                get().showToast(`Lỗi khởi động Apache: Cần kiểm tra port ${svc.port || 80} hoặc quyền truy cập.`, 'danger');
                set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              }
            } catch (e) {
              get().addServiceLog('apache', `Error starting Apache: ${e.message}`, 'err');
              set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              get().showToast(`Apache start failed: ${e.message}`, 'danger');
            }

          } else if (svc.type === 'db') {
            const mysqlVer = get().mysqlVersions.find(v => v.version === svc.version && v.installed);
            if (!mysqlVer) {
              set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              get().showToast(`MySQL ${svc.version} chưa được cài đặt!`, 'warn');
              return;
            }
            const devDir = get().settings.devStackDir.replace(/\//g, '\\');
            const mysqldExe = `${devDir}\\bin\\mysql\\mysql-${mysqlVer.version}\\bin\\mysqld.exe`;
            const port = svc.port || mysqlVer.port || 3306;
            const iniFile = `${devDir}\\bin\\mysql\\mysql-${mysqlVer.version}\\my.ini`;
            try {
              get().addServiceLog('mysql', `Starting MySQL ${mysqlVer.version} on port ${port}...`, 'info');
              await Command.create('powershell', ['-NoProfile', '-Command',
                `Start-Process -FilePath '${mysqldExe}' -ArgumentList '--defaults-file="${iniFile}"','--port=${port}' -WindowStyle Hidden`
              ]).execute();
              const success = await get()._pollUntilStable(id, 'running');
              if (success) {
                get().addServiceLog('mysql', `MySQL started successfully.`, 'ok');
              } else {
                get().addServiceLog('mysql', `MySQL failed to start. Port ${port} in use?`, 'err');
                get().showToast(`Lỗi khởi động MySQL: Cổng ${port} có thể đang bị chiếm dụng.`, 'danger');
                set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              }
            } catch (e) {
              get().addServiceLog('mysql', `Error starting MySQL: ${e.message}`, 'err');
              set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              get().showToast(`MySQL start failed: ${e.message}`, 'danger');
            }

          } else if (svc.type === 'php') {
            // PHP-FPM start logic
            try {
              // Placeholder for FPM start command
              const success = await get()._pollUntilStable(id, 'running');
              if (!success) {
                set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              }
            } catch (e) { console.error(e); }

          } else if (svc.type === 'cache') {
            // Redis start logic
            const devDir = get().settings.devStackDir.replace(/\//g, '\\');
            const redisExe = `${devDir}\\bin\\redis\\redis-server.exe`;
            try {
              await Command.create('powershell', ['-NoProfile', '-Command',
                `Start-Process -FilePath '${redisExe}' -WindowStyle Hidden`
              ]).execute();
              const success = await get()._pollUntilStable(id, 'running');
              if (!success) {
                set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped' } : sv) }));
              }
            } catch (e) { console.error(e); }
          }
        }
      },

      restartService: async (id) => {
        const svc = get().services.find(s => s.id === id);
        if (!svc) return;

        // Set restarting state
        set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'restarting' } : sv) }));
        get().showToast(get().t('restarting', { name: svc.name }) || `Đang khởi động lại ${svc.name}...`, 'info');

        try {
          if (svc.status === 'running' || svc.pid) {
            await get().toggleService(id, 'stop');
          }

          await get().toggleService(id, 'start');

          get().showToast(get().t('restarted', { name: svc.name }) || `Đã khởi động lại ${svc.name}`, 'ok');
        } catch (e) {
          console.error('Restart failed', e);
          get().showToast(`Lỗi khi khởi động lại: ${e.message}`, 'danger');
        } finally {
          // Final sync to ensure UI is correct
          await get().checkServicesRunning();
        }
      },
      scanExternalServices: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const psScript = `
$results = @()
Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services" -EA SilentlyContinue | ForEach-Object {
  $img = (Get-ItemProperty $_.PSPath -EA SilentlyContinue).ImagePath
  if (!$img) { return }
  $exe = $img.Trim()
  if ($exe.StartsWith('"')) { $exe = ($exe -replace '^"([^"]+)".*','$1') }
  else { $exe = ($exe -split '\\s+')[0] }
  if ($exe -notmatch 'mysqld|redis-server|httpd') { return }

  $type = if ($exe -like '*mysqld*') { 'db' }
          elseif ($exe -like '*redis*') { 'cache' }
          elseif ($exe -like '*httpd*') { 'web' }
          else { 'other' }

  $svcName = $_.PSChildName
  $status = (Get-Service -Name $svcName -EA SilentlyContinue).Status

  $results += [PSCustomObject]@{
    svcName = $svcName
    path    = $exe
    type    = $type
    status  = if ($status) { $status.ToString() } else { 'Unknown' }
  }
}
if ($results.Count -eq 0) { Write-Output "EMPTY"; exit }
$results | ConvertTo-Json -Compress
    `.trim();

          const utf16 = new Uint8Array(psScript.length * 2);
          for (let i = 0; i < psScript.length; i++) {
            utf16[i * 2] = psScript.charCodeAt(i) & 0xff;
            utf16[i * 2 + 1] = (psScript.charCodeAt(i) >> 8) & 0xff;
          }
          const b64 = btoa(String.fromCharCode(...utf16));
          const result = await Command.create('powershell', [
            '-NoProfile', '-NonInteractive', '-EncodedCommand', b64
          ]).execute();

          const raw = result.stdout?.trim();
          if (!raw || raw === 'EMPTY') return;

          const entries = JSON.parse(raw);
          const list = Array.isArray(entries) ? entries : [entries];
          const devDir = get().settings.devStackDir.toLowerCase().replace(/\\/g, '/');

          const normalize = (p) => (p || '').toLowerCase().replace(/\\/g, '/');

          const externals = list
            .filter(e => {
              const isInternal = normalize(e.path).includes(devDir);
              if (isInternal) return false;
              // Only add if running OR has version info (detected by Registry scan if possible)
              // But scanExternalServices currently doesn't get version info easily.
              // So we allow it but checkServicesRunning will filter it out if still empty.
              return true;
            })
            .map(e => {
              let label = 'Unknown';
              let version = '—';
              if (e.type === 'db') {
                const m = e.path?.match(/MySQL\s+Server\s+([\d.]+)/i);
                if (m) { version = m[1]; label = `MySQL ${version} (System)`; }
                else { label = 'MySQL (System)'; }
              } else if (e.type === 'cache') {
                label = 'Redis (System)';
              } else if (e.type === 'web') {
                label = 'Apache (External)';
              }

              const getStableId = (path) => {
                if (!path) return 9999;
                const p = path.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
                return 2000 + Math.abs(p.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 2000 || 0);
              };

              const stableId = getStableId(e.path);

              return {
                id: stableId,
                name: label,
                type: e.type,
                version,
                port: '—',
                status: e.status === 'Running' ? 'running' : 'stopped',
                pid: null,
                memory: '—',
                path: e.path,
                isExternal: true,
                svcName: e.svcName,
              };
            });

          // Merge vào knownExternalServices
          set(s => {
            const known = [...s.knownExternalServices];
            for (const ext of externals) {
              const idx = known.findIndex(k => k.path?.toLowerCase() === ext.path?.toLowerCase());
              if (idx < 0) {
                // Only add if it's running or has some info
                if (ext.status === 'running' || (ext.version && ext.version !== '—')) {
                  known.push(ext);
                }
              }
            }
            return { knownExternalServices: known };
          });

        } catch (e) { console.error('scanExternalServices failed:', e); }
      },

      clearStoppedExternals: () => {
        set(s => ({
          knownExternalServices: s.knownExternalServices.filter(ext => {
            // Keep running ones or ones with version/port info
            return ext.status === 'running' || (ext.version && ext.version !== '—') || (ext.port && ext.port !== '—');
          })
        }));
        get().checkServicesRunning();
      },

      checkServicesRunning: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        const now = Date.now();
        if (now - get()._lastServiceCheck < 500) return;
        set({ _lastServiceCheck: now });
        try {
          const devDir = get().settings.devStackDir.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
          // console.log('[checkServices] devDir:', devDir);

          const psScript = `
$ErrorActionPreference = 'SilentlyContinue'

# Map PID to Port using netstat (Split method is more reliable for various IP formats)
$portMap = @{}
netstat -ano | Select-String "LISTENING" | ForEach-Object {
    $parts = $_.ToString().Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($parts.Count -ge 5) {
        $localAddr = $parts[1]
        $pPortStr = $localAddr.Split(':')[-1]
        $pPid = $parts[4]
        if ($pPortStr -match '^\\d+$') {
            $pPort = [int]$pPortStr
            if (-not $portMap.ContainsKey($pPid) -or $pPort -lt $portMap[$pPid]) {
                $portMap[$pPid] = $pPort
            }
        }
    }
}

# Map Service PID to ImagePath using Registry (often more accessible than sc qc or WMI)
$pidToSvcInfo = @{}
try {
    $tl = tasklist /svc /fo csv | ConvertFrom-Csv
    foreach ($row in $tl) {
        $pidStr = $row.PID.ToString()
        if ($row.Services -and $row.Services -ne "N/A") {
            $sName = $row.Services.Split(',')[0].Trim()
            $regPath = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\$sName"
            if (Test-Path $regPath) {
                $imgPath = (Get-ItemProperty $regPath -Name ImagePath).ImagePath
                if ($imgPath) {
                    if ($imgPath.StartsWith('"')) { $imgPath = ($imgPath -replace '^"([^"]+)".*','$1') }
                    else { $imgPath = ($imgPath -split '\\s+')[0] }
                    $sStatus = $null
                    try { $sStatus = (Get-Service -Name $sName).Status.ToString() } catch {}
                    $pidToSvcInfo[$pidStr] = [PSCustomObject]@{ Path = $imgPath; Name = $sName; SvcStatus = $sStatus }
                }
            }
        }
    }
} catch {}

$targetNames = @('mysqld', 'httpd', 'redis-server', 'php-cgi', 'php-fpm')
$allProcs = @()

foreach ($procName in $targetNames) {
  $wmiProcs = @(Get-CimInstance Win32_Process -Filter "Name='$procName.exe'" -EA SilentlyContinue)
  foreach ($w in $wmiProcs) {
    $pidStr = $w.ProcessId.ToString()
    $exePath = $w.ExecutablePath
    
    if (-not $exePath -and $pidToSvcInfo.ContainsKey($pidStr)) {
      $exePath = $pidToSvcInfo[$pidStr].Path
    }
    
    if (-not $exePath) {
      try { $exePath = (Get-Process -Id $w.ProcessId -EA SilentlyContinue).MainModule.FileName } catch {}
    }
    if (-not $exePath) { $exePath = '' }

    $port = 0
    if ($portMap.ContainsKey($pidStr)) {
      $port = [int]$portMap[$pidStr]
    } elseif ($w.CommandLine -match '--port[=\\s]+(\\d+)') {
      $port = [int]$Matches[1]
    }

    $mem = 0
    try { $mem = [Math]::Round((Get-Process -Id $w.ProcessId -EA SilentlyContinue).WorkingSet64 / 1MB, 1) } catch {}

    $exeName = if ($exePath) { [System.IO.Path]::GetFileNameWithoutExtension($exePath).ToLower() } else { $procName }
    $type = if ($exeName -like '*httpd*') { 'web' }
            elseif ($exeName -like '*mysqld*') { 'db' }
            elseif ($exeName -like '*redis*') { 'cache' }
            elseif ($exeName -like '*php*') { 'php' }
            else { 'other' }

    $cliVer = ''
    if ($exePath) {
      try {
        $verInfo = (Get-Item $exePath).VersionInfo
        $cliVer = if ($verInfo.ProductVersion) { $verInfo.ProductVersion } else { $verInfo.FileVersion }
      } catch {}

      if ($type -eq 'cache' -and (-not $cliVer -or $cliVer -eq '—' -or $cliVer -notmatch '\d')) {
        try {
          $verStr = & $exePath --version
          if ($verStr -match 'v=([\d\.]+)') { $cliVer = $Matches[1] }
        } catch {}
      }

      if ($type -eq 'db' -and (-not $cliVer -or $cliVer -notmatch '^\d+')) {
        try {
          $exeNorm = $exePath.Replace('\\','/').ToLower().TrimEnd('/')
          $regPaths = @("HKLM:\\SOFTWARE\\MySQL AB", "HKLM:\\SOFTWARE\\WOW6432Node\\MySQL AB")
          foreach ($rp in $regPaths) {
            if ($cliVer) { break }
            if (!(Test-Path $rp)) { continue }
            Get-ChildItem $rp | ForEach-Object {
              if ($cliVer) { return }
              $props = Get-ItemProperty $_.PSPath
              if ($props.Location -and $props.Version) {
                $locNorm = $props.Location.Replace('\\','/').ToLower().TrimEnd('/')
                if ($exeNorm.StartsWith($locNorm)) { $cliVer = $props.Version }
              }
            }
          }
        } catch {}
      }
    }

    $allProcs += [PSCustomObject]@{
      pid       = [int]$w.ProcessId
      parentPid = [int]$w.ParentProcessId
      type      = $type
      path      = $exePath
      cmdLine   = $w.CommandLine
      port      = $port
      mem       = $mem
      cliVer    = $cliVer
      svcName   = if ($pidToSvcInfo.ContainsKey($pidStr)) { $pidToSvcInfo[$pidStr].Name } else { $null }
      svcStatus = if ($pidToSvcInfo.ContainsKey($pidStr)) { $pidToSvcInfo[$pidStr].SvcStatus } else { $null }
    }
  }
}

if ($allProcs.Count -eq 0) { Write-Output "EMPTY"; exit }

$dbProcs   = @($allProcs | Where-Object { $_.type -eq 'db' })
$removeIds = @()
foreach ($child in $dbProcs) {
  $parent = $dbProcs | Where-Object { $_.pid -eq $child.parentPid } | Select-Object -First 1
  if ($parent) {
    if ($child.port -gt 0 -and $parent.port -eq 0) { $parent.port = $child.port }
    if ($child.cliVer -and -not $parent.cliVer)    { $parent.cliVer = $child.cliVer }
    if ($child.svcStatus -and -not $parent.svcStatus) { $parent.svcStatus = $child.svcStatus }
    $removeIds += $child.pid
  }
}
$allProcs = @($allProcs | Where-Object { $removeIds -notcontains $_.pid })

$webWithPort = @($allProcs | Where-Object { $_.type -eq 'web' -and $_.port -gt 0 })
$others      = @($allProcs | Where-Object { $_.type -ne 'web' })
if ($webWithPort.Count -gt 0) {
  $seen = @{}; $dedup = @()
  foreach ($w in $webWithPort) {
    if (-not $seen.ContainsKey($w.port)) { $seen[$w.port] = $true; $dedup += $w }
  }
  $allProcs = $others + $dedup
} else {
  $noPort = @($allProcs | Where-Object { $_.type -eq 'web' })
  $allProcs = $others + $(if ($noPort.Count) { @($noPort[0]) } else { @() })
}

$allProcs | ConvertTo-Json -Compress -Depth 3
`.trim();

          const utf16 = new Uint8Array(psScript.length * 2);
          for (let i = 0; i < psScript.length; i++) {
            utf16[i * 2] = psScript.charCodeAt(i) & 0xff;
            utf16[i * 2 + 1] = (psScript.charCodeAt(i) >> 8) & 0xff;
          }
          const b64 = btoa(String.fromCharCode(...utf16));

          const result = await Command.create('powershell', [
            '-NoProfile', '-NonInteractive', '-EncodedCommand', b64
          ]).execute();

          const raw = result.stdout?.trim();
          // console.log('[checkServices] raw stdout length:', raw?.length, '| first 200:', raw?.slice(0, 200));
          // console.log('[checkServices] full stdout:', raw);
          // console.log('[checkServices] stderr:', result.stderr);

          if (!raw || raw === 'EMPTY') {
            // console.log('[checkServices] EMPTY result, resetting');
            set(s => ({
              services: s.services
                .filter(svc => svc.id <= 4)
                .map(svc => ({ ...svc, status: 'stopped', pid: null, memory: '—', isExternal: false, path: '' })),
              knownExternalServices: [],
            }));
            return;
          }

          let procs = [];
          try {
            const parsed = JSON.parse(raw);
            procs = Array.isArray(parsed) ? parsed : [parsed];
            // console.log('[checkServices] parsed procs count:', procs.length);
            // procs.forEach(p => console.log(`proc: type=${p.type} pid=${p.pid} port=${p.port} cliVer=[${p.cliVer}] path=${p.path}`));
          } catch (e) {
            // console.log('[checkServices] JSON parse error:', e.message, '| raw:', raw?.slice(0, 300));
            return;
          }

          // Bỏ httpd worker
          const httpdPids = new Set(procs.filter(p => p.type === 'web').map(p => p.pid));
          procs = procs.filter(p => !(p.type === 'web' && httpdPids.has(p.parentPid)));
          // console.log('[checkServices] after httpd dedup:', procs.length, 'procs');

          // Build Port Conflict Map from actual running processes
          const newConflicts = {};
          procs.forEach(p => {
            if (p.port > 0) newConflicts[p.port] = { inUse: true, pid: p.pid };
          });
          set({ portConflicts: newConflicts });

          const buildLabelVersion = (p) => {
            const pathLower = (p.path || '').toLowerCase().replace(/\\/g, '/');

            let source = null;
            if (!pathLower) source = 'System';
            else if (pathLower.includes('/xampp/')) source = 'XAMPP';
            else if (pathLower.includes('/laragon/')) source = 'Laragon';
            else if (pathLower.includes('/wamp')) source = 'WAMP';
            else if (pathLower.includes('/program files/')) source = 'System';
            else if (pathLower && !pathLower.includes(devDir)) source = 'External';

            let label = 'Unknown';
            let version = p.cliVer || '—';

            if (p.type === 'db') {
              let ver = (p.cliVer && p.cliVer.includes('.') ? p.cliVer : null) || (() => {
                const m = pathLower.match(/mysql server (\d+\.\d+(?:\.\d+(?:\.\d+)?)?)/i) ||
                  pathLower.match(/mysql[\s/\\-](\d+\.\d+\.\d+)/) ||
                  pathLower.match(/mysql[\s/\\-](\d+\.\d+)/);
                if (!m) return null;
                // Limit to 3 segments: 8.0.30.0 -> 8.0.30
                return m[1].split('.').slice(0, 3).join('.');
              })();

              version = ver || '—';
              const displayVer = ver ? (ver.split('.').slice(0, 2).join('.') || ver) : '';

              if (source === 'System') {
                label = displayVer ? `MySQL ${displayVer}(System)` : 'MySQL (System)';
              } else {
                label = `MySQL${displayVer ? ' ' + displayVer : ''}${source ? ` (${source})` : ''}`;
              }
            } else if (p.type === 'web') {
              const m = pathLower.match(/apache[_\-/\\](\d+\.\d+(?:\.\d+)?)/);
              if (m) version = m[1];
              label = source ? `Apache (${source})` : 'Apache';
            } else if (p.type === 'cache') {
              const m = pathLower.match(/redis[_\-/\\](\d+\.\d+(?:\.\d+)?)/);
              if (m) version = m[1];
              label = source ? `Redis (${source})` : 'Redis';
            } else if (p.type === 'php') {
              const m = pathLower.match(/php[_\-/\\](\d+\.\d+(?:\.\d+)?)/);
              if (m) version = m[1];
              label = source ? `PHP-FPM (${source})` : 'PHP-FPM';
            }

            return { label, version };
          };

          const normalize = (p) => (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
          const validExeNames = ['mysqld.exe', 'httpd.exe', 'redis-server.exe', 'php-cgi.exe', 'php-fpm.exe'];

          set(s => {
            const managedBase = s.services
              .filter(svc => svc.id <= 4 && svc.type !== 'db')
              .map(svc => ({ ...svc, status: 'stopped', pid: null, memory: '—', isExternal: false, path: '', autoStart: svc.autoStart || false }));

            const managedDb = s.mysqlVersions
              .filter(v => v.installed)
              .map((v, idx) => ({
                id: v.active ? 2 : 3000 + idx,
                name: `MySQL ${v.version} (DevStack)`,
                type: 'db',
                status: 'stopped',
                pid: null,
                memory: '—',
                port: v.port || 3306,
                version: v.version,
                isExternal: false,
                path: '',
                autoStart: v.autoStart || false
              }));

            const managed = [...managedBase, ...managedDb];

            const consumedManagedIds = new Set();
            let updatedKnown = [...(s.knownExternalServices || [])];

            for (const p of procs) {
              const knownTypes = ['web', 'db', 'cache', 'php'];
              if (!knownTypes.includes(p.type)) continue;

              const exePath = normalize(p.path);
              const isInternal = exePath.length > 3 && exePath.includes(devDir);
              const { label, version } = buildLabelVersion(p);

              if (isInternal) {
                const target = managed.find(svc =>
                  svc.type === p.type &&
                  (p.type !== 'db' || (version && version.startsWith(svc.version)) || svc.version === version || version === '—') &&
                  !consumedManagedIds.has(svc.id)
                );
                if (target) {
                  const existingSvc = s.services.find(sv => sv.id === target.id);
                  const isTransitioning = existingSvc?.status === 'starting' || existingSvc?.status === 'stopping' || existingSvc?.status === 'restarting';

                  if (isTransitioning) {
                    const isActualRunning = (!p.svcStatus || p.svcStatus === 'Running');
                    const transitioningDone =
                      (existingSvc.status === 'starting' && isActualRunning) ||
                      (existingSvc.status === 'stopping' && !isActualRunning) ||
                      (existingSvc.status === 'restarting' && isActualRunning); // Restart done when it's running again

                    if (transitioningDone) {
                      target.status = isActualRunning ? 'running' : 'stopped';
                    } else {
                      target.status = existingSvc.status;
                    }
                  } else {
                    target.status = (p.svcStatus && p.svcStatus !== 'Running') ? 'stopped' : 'running';
                  }

                  target.pid = p.pid;
                  target.path = p.path;
                  target.memory = `${p.mem} MB`;
                  if (p.port > 0) target.port = p.port;
                  if (version !== '—') target.version = version;
                  consumedManagedIds.add(target.id);
                }
                continue;
              }

              // Update or Add to Known Externals
              const existingIdx = updatedKnown.findIndex(k => normalize(k.path) === exePath && k.type === p.type);
              const entry = {
                name: label, path: p.path, type: p.type, version, port: p.port > 0 ? p.port : '—', isExternal: true, svcName: p.svcName, status: 'running', pid: p.pid, memory: `${p.mem} MB`
              };
              if (existingIdx > -1) {
                updatedKnown[existingIdx] = { ...updatedKnown[existingIdx], ...entry };
              } else if (p.port > 0 || (version && version !== '—')) {
                updatedKnown.push({ ...entry, id: 1000 + updatedKnown.length });
              }
            }

            // Mark rest of known externals as stopped if not processed
            updatedKnown = updatedKnown.map(k => {
              const stillRunning = procs.some(p => normalize(p.path) === normalize(k.path) && p.type === k.type);
              if (!stillRunning) return { ...k, status: 'stopped', pid: null, memory: '—' };
              return k;
            });

            // Special case for PHP Module mode: If Apache is running and a PHP is active,
            // but no separate PHP process (FastCGI) was found, we mark the managed PHP service as running via Apache.
            const apacheSvc = managed.find(svc => svc.type === 'web');
            const phpSvc = managed.find(svc => svc.type === 'php');
            const activePhpVersion = s.phpVersions.find(v => v.active && !v.isSystem);

            if (phpSvc && phpSvc.status === 'stopped' && apacheSvc?.status === 'running' && activePhpVersion) {
              phpSvc.status = 'running';
              phpSvc.version = activePhpVersion.version;
              phpSvc.memory = 'Module';
            }

            const externalList = updatedKnown
              .map((k) => {
                const getStableId = (path) => {
                  if (!path) return 9999;
                  const p = path.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
                  return 2000 + Math.abs(p.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 2000 || 0);
                };
                const stableId = getStableId(k.path);
                const p = procs.find(proc => normalize(proc.path) === normalize(k.path) && proc.type === k.type);
                const existingSvc = s.services.find(sv => sv.id === stableId);
                const isTransitioning = existingSvc?.status === 'starting' || existingSvc?.status === 'stopping' || existingSvc?.status === 'restarting';

                let status = (p && (!p.svcStatus || p.svcStatus === 'Running')) ? 'running' : 'stopped';

                if (isTransitioning) {
                  const isActualRunning = (p && (!p.svcStatus || p.svcStatus === 'Running'));
                  const isActualStopped = !p;

                  const transitioningDone =
                    (existingSvc.status === 'starting' && isActualRunning) ||
                    (existingSvc.status === 'stopping' && isActualStopped) ||
                    (existingSvc.status === 'restarting' && (isActualRunning || isActualStopped));

                  if (transitioningDone) {
                    // status is already correct
                  } else {
                    status = existingSvc.status;
                  }
                }

                return {
                  id: stableId,
                  ...k,
                  status,
                  pid: p ? p.pid : null,
                  memory: p ? `${p.mem} MB` : '—',
                  port: (p && p.port > 0) ? p.port : k.port,
                  version: (p && p.cliVer && p.cliVer !== '—') ? p.cliVer : k.version,
                  svcName: (p && p.svcName) ? p.svcName : k.svcName
                };
              })
              .filter(ext => {
                // Filter out stopped external services with no useful info to reduce clutter
                if (ext.status === 'stopped' && (!ext.version || ext.version === '—') && ext.port === '—') {
                  return false;
                }
                return true;
              });

            const combined = [...managed, ...externalList].sort((a, b) => {
              // Sorting logic:
              // 1. Running services first
              // 2. Transitioning services second
              // 3. Stopped services last
              // Secondary sort: Internal before External

              const getScore = (s) => {
                if (s.status === 'running') return 0;
                if (['starting', 'stopping', 'restarting'].includes(s.status)) return 1;
                return 2;
              };

              const scoreA = getScore(a);
              const scoreB = getScore(b);

              if (scoreA !== scoreB) return scoreA - scoreB;

              // If same status, internal (id < 1000) first
              const isExtA = a.id >= 1000 ? 1 : 0;
              const isExtB = b.id >= 1000 ? 1 : 0;
              return isExtA - isExtB;
            });

            return {
              services: combined,
              knownExternalServices: updatedKnown,
            };
          });

          get().syncServiceVersions();
        } catch (e) {
          console.error('[checkServices] ERROR:', e);
        }
      },
      _pollUntilStable: async (serviceId, expectedStatus, maxAttempts = 8, intervalMs = 400) => {
        for (let i = 0; i < maxAttempts; i++) {
          await new Promise(r => setTimeout(r, intervalMs));
          await get().checkServicesRunning();
          const svc = get().services.find(s => s.id === serviceId);
          if (svc?.status === expectedStatus) return true;
          // If we are polling for stopped but it's restarting, we should probably wait
          // unless restartService manages its own calls to poll.
        }
        return false;
      },
      startAll: async () => {
        for (const svc of get().services) {
          if (svc.status !== 'running') await get().toggleService(svc.id);
        }
      },
      stopAll: async () => {
        for (const svc of get().services) {
          if (svc.status === 'running') await get().toggleService(svc.id);
        }
      },

      // === PHP Manager ===
      installPhpVersion: async (version) => {
        const major = parseInt(version.split('.')[0]);
        const minor = parseInt(version.split('.')[1]);
        // Must use Thread-Safe (TS) build — only TS includes php8apache2_4.dll for Apache mod
        const compiler = (major === 8 && minor >= 4) ? 'vs17'
          : (major === 8) ? 'vs16'
            : 'vc15';
        const isLegacy = major < 8 || (major === 8 && minor < 1);

        const addLog = (m, l = 'info') => set(s => ({
          phpInstallLogs: [...s.phpInstallLogs, { t: new Date().toLocaleTimeString(), m, l }]
        }));

        if (!window.__TAURI_INTERNALS__) {
          addLog("⚠️ Not running in Tauri environment.", "warn");
          return;
        }

        const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const primaryUrl = isLegacy
          ? 'https://windows.php.net/downloads/releases/archives'
          : 'https://windows.php.net/downloads/releases';
        const archiveUrl = 'https://windows.php.net/downloads/releases/archives';
        // Always download Thread-Safe (TS) build — TS includes php*apache2_4.dll needed by Apache
        // NTS filename has '-nts-', TS filename does NOT — our pattern is already correct
        const fileName = `php-${version}-Win32-${compiler}-x64.zip`;
        const zipPath = `${devDir}/bin/php/${fileName}`;
        const phpDir = `${devDir}/bin/php/php-${version}`;

        set(s => ({
          phpVersions: s.phpVersions.map(v => v.version === version ? { ...v, installing: true, progress: 0 } : v),
          phpInstallLogs: [{ t: new Date().toLocaleTimeString(), m: `Starting PHP ${version} installation...`, l: 'info' }],
          phpInstallProgress: { pct: 0, downloaded: 0, total: 0 },
        }));

        addLog(`📦 File: ${fileName}`, 'info');
        addLog(`📁 Destination: ${phpDir}`, 'info');

        try {
          const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

function Log($msg) { Write-Host "LOG: $msg"; [Console]::Out.Flush() }
function Progress($pct) { Write-Host "PROGRESS:$pct"; [Console]::Out.Flush() }

if (!(Test-Path '${devDir}/bin/php')) {
  New-Item -ItemType Directory -Force -Path '${devDir}/bin/php' | Out-Null
}

$urls = @('${primaryUrl}/${fileName}', '${archiveUrl}/${fileName}')
$zip  = '${zipPath}'
$dest = '${phpDir}'

Log "Preparing download..."

$downloaded = $false
foreach ($url in $urls) {
  try {
    Log "Connecting to: $url"
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Timeout   = 30000
    $request.UserAgent = 'Mozilla/5.0'
    $response = $request.GetResponse()
    $total    = $response.ContentLength
    $stream   = $response.GetResponseStream()
    $outFile  = [System.IO.File]::Create($zip)
    $buffer   = New-Object byte[] 65536
    $bytes    = 0
    $lastPct  = -1

    Log "File size: $([math]::Round($total/1MB, 1)) MB"
    Log "Downloading..."

    while ($true) {
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) { break }
      $outFile.Write($buffer, 0, $read)
      $bytes += $read
      if ($total -gt 0) {
        $pct = [math]::Floor($bytes * 100 / $total)
        if ($pct -ne $lastPct -and ($pct % 5 -eq 0)) {
          $lastPct = $pct
          $dlMB  = [math]::Round($bytes / 1MB, 1)
          $totMB = [math]::Round($total / 1MB, 1)
          Progress $pct
          Write-Host "DLSTAT:$dlMB|$totMB|$pct"
          [Console]::Out.Flush()
        }
      }
    }

    $outFile.Close(); $stream.Close(); $response.Close()
    Log "Download complete!"
    $downloaded = $true
    break
  } catch {
    Log "Failed ($url): $($_.Exception.Message)"
    if (Test-Path $zip) { Remove-Item $zip -Force }
  }
}

if (!$downloaded) { throw "All download sources failed." }

Log "Extracting to $dest..."
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $dest -Force
Remove-Item $zip -Force
Log "Extraction complete."
if (!(Test-Path "$dest/php.ini")) {
  if (Test-Path "$dest/php.ini-development") {
    Copy-Item "$dest/php.ini-development" "$dest/php.ini" -Force
    Log "Created php.ini from development template."
  }
}
Write-Host "DONE"
[Console]::Out.Flush()
          `.trim();

          const cmd = Command.create('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);

          cmd.stdout.on('data', line => {
            const l = line.trim();
            if (!l) return;
            if (l.startsWith('PROGRESS:')) {
              const pct = parseInt(l.replace('PROGRESS:', '').trim());
              if (!isNaN(pct)) set(s => ({ phpVersions: s.phpVersions.map(p => p.version === version ? { ...p, progress: pct } : p) }));
            } else if (l.startsWith('DLSTAT:')) {
              const [dlMB, totMB, pct] = l.replace('DLSTAT:', '').split('|').map(Number);
              set({ phpInstallProgress: { pct, downloaded: dlMB, total: totMB } });
            } else if (l.startsWith('LOG:')) {
              addLog(l.replace('LOG:', '').trim(), 'info');
            } else if (l === 'DONE') {
              set(s => ({ phpVersions: s.phpVersions.map(p => p.version === version ? { ...p, installed: true, installing: false, progress: 100 } : p) }));
              set({ phpInstallProgress: { pct: 100, downloaded: 0, total: 0 } });
              addLog(`✓ PHP ${version} installed successfully!`, 'ok');
              get().showToast(`PHP ${version} ready!`, 'ok');
              get().scanInstalledPhp();
            }
          });

          cmd.stderr.on('data', line => { if (line.trim()) addLog(`⚠ ${line.trim()}`, 'warn'); });
          await cmd.spawn();

        } catch (e) {
          set(s => ({ phpVersions: s.phpVersions.map(p => p.version === version ? { ...p, installing: false } : p) }));
          addLog(`❌ ERROR: ${e.message}`, 'err');
          get().showToast(`Install failed`, 'warn');
        }
      },

      addToPath: async (newPath) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const cleanNewPath = newPath.replace(/\//g, '\\');
          const script = `
$newPath = "${cleanNewPath}"
$oldPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathParts = $oldPath.Split(';', [StringSplitOptions]::RemoveEmptyEntries) | Where-Object {
  $_ -notlike '*devstack\\bin\\php*' -and $_ -notlike '*devstack\\bin\\apache*'
}
$finalPath = ($newPath + ";" + ($pathParts -join ";")).Trim(";")
[Environment]::SetEnvironmentVariable('Path', $finalPath, 'User')
$sig = '[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'
$type = Add-Type -MemberDefinition $sig -Name "Win32Environment" -Namespace "Win32" -PassThru
$res = [UIntPtr]::Zero
$type::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, "Environment", 0x0002, 1000, [ref]$res)
          `.trim();
          await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
        } catch (e) { console.error('Path update failed', e); }
      },

      setActivePhp: async (version) => {
        set({ selectedPhpVersion: version, activatingPhp: version });
        set(state => ({
          phpVersions: state.phpVersions.map(p => ({
            ...p,
            active: p.version === version && !p.isSystem,
          }))
        }));

        const v = get().phpVersions.find(pv => pv.version === version && !pv.isSystem);
        if (!v?.installed) {
          get().showToast(`PHP ${version} chưa được cài đặt`, 'warn');
          return;
        }

        const folder = v.folderName || `php-${version}`;
        const phpPath = `${get().settings.devStackDir}/bin/php/${folder}`;

        if (get().isSystemConflict) {
          get().showToast(`Đang xử lý xung đột hệ thống cho PHP ${version}...`, 'info');
          await get().fixPhpConflict(true);
        } else {
          await get().addToPath(phpPath);
          get().showToast(`Đang thiết lập PHP ${version}...`, 'info');
        }

        get().syncServiceVersions();

        // Patch Composer
        await get().patchComposerBat(version);

        // Nếu có Apache DevStack đang active → reconfigure Apache để dùng PHP mới
        const activeApache = get().apacheVersions.find(av => av.active && av.installed);
        if (activeApache) {
          await get().configureApachePhp(version, activeApache.version);
          await get().restartApache();
        }

        setTimeout(async () => {
          await get().detectPhpVersion();
          set({ activatingPhp: null });
          const current = get().detectedPhpVersion;
          if (current === version) {
            get().showToast(`✓ PHP ${version} đã được kích hoạt thành công!`, 'ok');
          } else {
            get().showToast(`⚠ Đã cập nhật PATH, hãy mở terminal mới để áp dụng PHP ${version}.`, 'warn');
          }
        }, 1500);
      },

      patchComposerBat: async (version) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const v = get().phpVersions.find(p => p.version === version && !p.isSystem);
          if (!v?.installed) return;

          const folder = v.folderName || `php-${version}`;
          const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
          const phpExe = `${devDir}\\bin\\php\\${folder}\\php.exe`;

          const script = `
$locations = @(
  "$env:ProgramData\\ComposerSetup\\bin\\composer.bat",
  "$env:APPDATA\\Composer\\vendor\\bin\\composer.bat",
  (Get-Command composer -ErrorAction SilentlyContinue)?.Source
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($bat in $locations) {
  $content = Get-Content $bat -Raw
  $newContent = $content -replace '@"[^"]*php\\.exe"', '@"${phpExe}"'
  Set-Content $bat $newContent -Encoding ASCII
  Write-Output "PATCHED:$bat"
}
          `.trim();

          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          const patched = result.stdout?.match(/PATCHED:(.+)/g)?.map(l => l.replace('PATCHED:', '').trim()) || [];
          if (patched.length > 0) {
            get().showToast(`✓ Composer → PHP ${version}`, 'ok');
          }
        } catch (e) { console.error('patchComposerBat failed:', e); }
      },

      // === Apache Manager ===
      setActiveApache: async (version) => {
        set(state => ({
          selectedApacheVersion: version,
          apacheVersions: state.apacheVersions.map(v => ({ ...v, active: v.version === version }))
        }));

        // Configure Apache với PHP đang active
        const activePhp = get().phpVersions.find(p => p.active && !p.isSystem && p.installed);
        if (activePhp) {
          await get().configureApachePhp(activePhp.version, version);
        }
        await get().restartApache();
        get().syncServiceVersions();
        get().showToast(`Apache ${version} activated`, 'ok');
      },

      installApacheVersion: async (version) => {
        const addLog = (m, l = 'info') => set(s => ({
          apacheInstallLogs: [...s.apacheInstallLogs, { t: new Date().toLocaleTimeString(), m, l }]
        }));

        if (!window.__TAURI_INTERNALS__) {
          addLog("⚠️ Not running in Tauri environment.", "warn");
          return;
        }

        const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const apacheDir = `${devDir}/bin/apache/apache-${version}`;
        const zipPath = `${devDir}/bin/apache/apache-${version}.zip`;

        // Lấy URL đã fetch sẵn, nếu không có thì để rỗng để script tự scrape
        const apacheV = get().apacheVersions.find(v => v.version === version);
        const knownUrl = apacheV?.downloadUrl || '';

        set(s => ({
          apacheVersions: s.apacheVersions.map(v => v.version === version ? { ...v, installing: true, progress: 0 } : v),
          apacheInstallLogs: [{ t: new Date().toLocaleTimeString(), m: `Starting Apache ${version} installation...`, l: 'info' }],
          apacheInstallProgress: { pct: 0, downloaded: 0, total: 0 },
        }));

        addLog(`📁 Destination: ${apacheDir}`, 'info');

        try {
          const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Log($msg)      { Write-Host "LOG: $msg"; [Console]::Out.Flush() }
function Progress($pct) { Write-Host "PROGRESS:$pct"; [Console]::Out.Flush() }

if (!(Test-Path '${devDir}/bin/apache')) {
  New-Item -ItemType Directory -Force -Path '${devDir}/bin/apache' | Out-Null
}

$zip  = '${zipPath}'
$dest = '${apacheDir}'

# ── Tìm URL download ─────────────────────────────────────────────────
$foundUrl = $null

if ('${knownUrl}' -ne '') {
  $foundUrl = '${knownUrl}'
  Log "Using cached URL: $foundUrl"
} else {
  $pages = @("https://www.apachelounge.com/download/", "https://www.apachelounge.com/download/archive/")
  foreach ($pageUrl in $pages) {
    if ($foundUrl) { break }
    Log "Scraping $pageUrl for Apache ${version}..."
    try {
      $html = & curl.exe -sL --max-redirs 10 $pageUrl
      $m    = [regex]::Match($html, 'href="([^"]*httpd-${version}[^"]*Win64[^"]*\\.zip)"')
      if ($m.Success) {
        $href     = $m.Groups[1].Value
        $foundUrl = if ($href -like "http*") { $href } else { "https://www.apachelounge.com$href" }
        Log "Found on $pageUrl : $foundUrl"
      }
    } catch { }
  }
}

if (!$foundUrl) {
  throw "Cannot find download URL for Apache ${version} on main or archive pages."
}

# ── Download ─────────────────────────────────────────────────────────
Log "Downloading from: $foundUrl"

try {
  # Bỏ qua SSL certificate check (fix một số môi trường Windows)
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  
  $wc = New-Object System.Net.WebClient
  $wc.Headers.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
  $wc.DownloadFile($foundUrl, $zip)

  if (!(Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) {
    if (Test-Path $zip) { Remove-Item $zip -Force }
    throw "Downloaded file too small — possibly an error page"
  }

  $sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
  Log "Download complete! ($sizeMB MB)"
  Progress 80

} catch {
  if (Test-Path $zip) { Remove-Item $zip -Force }
  throw "Download failed: $($_.Exception.Message)"
} finally {
  # Reset SSL callback
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null
}

Progress 90

# ── Extract ──────────────────────────────────────────────────────────
Log "Extracting..."
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$tmp = "$dest-tmp"
Expand-Archive -Path $zip -DestinationPath $tmp -Force

# Apache zip chứa folder Apache24 bên trong
$inner = Join-Path $tmp 'Apache24'
if (Test-Path $inner) {
  Get-ChildItem $inner | Move-Item -Destination $dest -Force
} else {
  Get-ChildItem $tmp | Move-Item -Destination $dest -Force
}

Remove-Item $tmp -Recurse -Force
Remove-Item $zip -Force
Log "Extraction complete."
Write-Host "DONE"
[Console]::Out.Flush()
    `.trim();

          const cmd = Command.create('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);

          cmd.stdout.on('data', line => {
            const l = line.trim();
            if (!l) return;
            if (l.startsWith('PROGRESS:')) {
              const pct = parseInt(l.replace('PROGRESS:', '').trim());
              if (!isNaN(pct)) set(s => ({ apacheVersions: s.apacheVersions.map(v => v.version === version ? { ...v, progress: pct } : v) }));
            } else if (l.startsWith('DLSTAT:')) {
              const [dlMB, totMB, pct] = l.replace('DLSTAT:', '').split('|').map(Number);
              set({ apacheInstallProgress: { pct, downloaded: dlMB, total: totMB } });
            } else if (l.startsWith('LOG:')) {
              addLog(l.replace('LOG:', '').trim(), 'info');
            } else if (l === 'DONE') {
              set(s => ({ apacheVersions: s.apacheVersions.map(v => v.version === version ? { ...v, installed: true, installing: false, progress: 100 } : v) }));
              set({ apacheInstallProgress: { pct: 100, downloaded: 0, total: 0 } });
              addLog(`✓ Apache ${version} installed successfully!`, 'ok');
              get().showToast(`Apache ${version} ready!`, 'ok');
              get().scanInstalledApache();
            }
          });

          cmd.stderr.on('data', line => { if (line.trim()) addLog(`⚠ ${line.trim()}`, 'warn'); });
          await cmd.spawn();

        } catch (e) {
          set(s => ({ apacheVersions: s.apacheVersions.map(v => v.version === version ? { ...v, installing: false } : v) }));
          addLog(`❌ ERROR: ${e.message}`, 'err');
          get().showToast(`Install failed`, 'warn');
        }
      },
      fetchApacheVersions: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const script = `
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$urls    = @(
  "https://www.apachelounge.com/download/",
  "https://www.apachelounge.com/download/archive/",
  "https://www.apachelounge.com/download/additional/",
  "https://www.apachelounge.com/download/VS17/",
  "https://www.apachelounge.com/download/VS16/"
)
$results = @()

foreach ($url in $urls) {
  $html = & curl.exe -sL --max-redirs 10 $url
  $matches = [regex]::Matches($html, 'href="([^"]*httpd-([\d.]+)[^"]*Win64[^"]*\\.zip)"')
  foreach ($m in $matches) {
    $href    = $m.Groups[1].Value
    $ver     = $m.Groups[2].Value
    $fullUrl = if ($href -like "http*") { $href } else { "https://www.apachelounge.com$href" }
    $results += "$ver|$fullUrl"
  }
}

# Deduplicate by version
$results | Sort-Object -Unique
    `.trim();

          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          if (!result.stdout?.trim()) return;

          const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
          const fetched = lines.map(line => {
            const [version, url] = line.split('|');
            return { version: version?.trim(), url: url?.trim() };
          }).filter(v => v.version && v.url);

          if (!fetched.length) return;

          // Merge với danh sách hiện tại — giữ installed/active state
          set(s => {
            const existing = s.apacheVersions;
            const newList = fetched.map(f => {
              const old = existing.find(e => e.version === f.version);
              return old
                ? { ...old, downloadUrl: f.url }
                : { version: f.version, installed: false, active: false, installing: false, downloadUrl: f.url };
            });

            // Giữ lại các version đã installed dù không còn trên trang
            const installedOld = existing.filter(e => e.installed && !newList.find(n => n.version === e.version));

            return { apacheVersions: [...newList, ...installedOld] };
          });

        } catch (e) {
          console.error('fetchApacheVersions failed:', e);
        }
      },

      configureApachePhp: async (phpVersion, apacheVersion) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
          const phpV = get().phpVersions.find(p => p.version === phpVersion && !p.isSystem);
          if (!phpV?.installed) {
            get().showToast('PHP version chưa được cài', 'warn');
            return;
          }

          const phpFolder = phpV.folderName || `php-${phpVersion}`;
          const phpDir = `${devDir}\\bin\\php\\${phpFolder}`;
          const apacheDir = `${devDir}\\bin\\apache\\apache-${apacheVersion}`;
          const httpdConf = `${apacheDir}\\conf\\httpd.conf`;
          const docRoot = `${devDir}\\www`;

          // Determine PHP module DLL by major version
          const major = parseInt(phpVersion.split('.')[0]);
          const isPhp7 = major === 7;
          const moduleFile = isPhp7 ? `${phpDir}\\php7apache2_4.dll` : `${phpDir}\\php8apache2_4.dll`;
          const moduleName = isPhp7 ? 'php7_module' : 'php_module';

          // Check if the Apache module DLL exists (NTS builds don't have it)
          const dllCheck = await Command.create('powershell', ['-NoProfile', '-Command', `Test-Path '${moduleFile}'`]).execute();
          if (!dllCheck.stdout?.trim().toLowerCase().includes('true')) {
            // NTS build detected — auto-reinstall as Thread-Safe
            get().showToast(`⚠️ PHP ${phpVersion} là bản NTS, đang tự động cài lại bản Thread-Safe...`, 'warn');
            // Remove old NTS folder and reinstall
            const cleanScript = `Remove-Item '${phpDir}' -Recurse -Force -EA 0`;
            await Command.create('powershell', ['-NoProfile', '-Command', cleanScript]).execute();
            // Update installed state so install flow triggers fresh
            set(s => ({ phpVersions: s.phpVersions.map(p => p.version === phpVersion && !p.isSystem ? { ...p, installed: false, hasApacheModule: false } : p) }));
            await get().installPhpVersion(phpVersion);
            get().showToast(`✅ Đã cài lại PHP ${phpVersion} bản Thread-Safe! Hãy thử kích hoạt lại.`, 'ok');
            return;
          }

          const port = get().settings.port80 || 80;

          // Build PS1 script content — use regular strings to avoid JS template literal backtick conflicts
          const psScript = [
            "$conf = '" + httpdConf + "'",
            "$phpDir = '" + phpDir + "'",
            "$module = '" + moduleFile + "'",
            "$moduleName = '" + moduleName + "'",
            "$apacheDir = '" + apacheDir + "'",
            "$docRoot = '" + docRoot + "'",
            "$port = '" + port + "'",
            "if (!(Test-Path $conf)) { Write-Output 'ERROR: httpd.conf not found'; exit 1 }",
            "$c = Get-Content $conf -Raw",
            "$c = $c -replace '(?m)^\\s*LoadModule php[7]?_module.*\\r?\\n', ''",
            "$c = $c -replace '(?m)^\\s*PHPIniDir.*\\r?\\n', ''",
            "$c = $c -replace '(?m)^\\s*AddType application/x-httpd-php.*\\r?\\n', ''",
            "$c = $c -replace '(?m)^\\s*# PHP Module - Auto configured by DevStack\\r?\\n', ''",
            "$c = $c -replace '(?m)^\\s*DirectoryIndex.*\\r?\\n', ''",
            "$c = $c -replace '(?m)^Listen \\d+', \"Listen $port\"",
            "if ($c -match '(?m)^#?ServerName') { $c = $c -replace '(?m)^#?ServerName .*', \"ServerName localhost:$port\" }",
            "$c = $c -replace 'ServerRoot \".*?\"', ('ServerRoot \"' + $apacheDir + '\"')",
            "if (!(Test-Path $docRoot)) { New-Item -ItemType Directory -Force -Path $docRoot | Out-Null }",
            "$c = $c -replace 'DocumentRoot \".*?\"', ('DocumentRoot \"' + $docRoot + '\"')",
            "$c = $c -replace '<Directory \".*?(?:www|htdocs).*?\">', ('<Directory \"' + $docRoot + '\">')",
            "$phpBlock = \"`r`n# PHP Module - Auto configured by DevStack`r`nLoadModule $moduleName `\"$module`\"`r`nPHPIniDir `\"$phpDir`\"`r`nAddType application/x-httpd-php .php`r`nAddType application/x-httpd-php-source .phps`r`nDirectoryIndex index.php index.html\"",
            "$c = $c.TrimEnd() + $phpBlock",
            "Set-Content $conf $c -Encoding UTF8",
            "Write-Output 'OK'",
          ].join('\r\n');

          // Encode to Base64 (UTF-16LE for -EncodedCommand)
          const encoder = new TextEncoder();
          const utf8 = encoder.encode(psScript);
          const utf16 = new Uint8Array(utf8.length * 2);
          for (let i = 0; i < utf8.length; i++) { utf16[i * 2] = utf8[i]; utf16[i * 2 + 1] = 0; }
          const b64 = btoa(String.fromCharCode(...utf16));

          const result = await Command.create('powershell', ['-NoProfile', '-EncodedCommand', b64]).execute();
          if (result.stdout?.includes('OK')) {
            get().showToast(`✓ Apache configured for PHP ${phpVersion}`, 'ok');
          } else {
            console.error('configureApachePhp error:', result.stderr);
            get().showToast(`Config error: ${result.stderr?.slice(0, 80)}`, 'danger');
          }
        } catch (e) {
          console.error('configureApachePhp failed:', e);
          get().showToast('Apache config failed: ' + e.message, 'danger');
        }
      },

      restartApache: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
          const activeApache = get().apacheVersions.find(v => v.active && v.installed);
          if (!activeApache) return;

          const httpdExe = `${devDir}\\bin\\apache\\apache-${activeApache.version}\\bin\\httpd.exe`;

          const existsResult = await Command.create('powershell', ['-NoProfile', '-Command', `Test-Path '${httpdExe}'`]).execute();
          if (!existsResult.stdout?.trim().toLowerCase().includes('true')) {
            get().showToast(`httpd.exe not found`, 'danger');
            return;
          }

          await Command.create('powershell', [
            '-NoProfile', '-Command',
            `Stop-Process -Name httpd -Force -ErrorAction SilentlyContinue`
          ]).execute();

          await new Promise(r => setTimeout(r, 1000));

          const result = await Command.create('powershell', [
            '-NoProfile', '-Command',
            `Start-Process -FilePath '${httpdExe}' -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id`
          ]).execute();

          const pid = parseInt(result.stdout?.trim());
          set(s => ({
            services: s.services.map(sv =>
              sv.type === 'web' ? { ...sv, status: 'running', pid: pid || null, version: activeApache.version, memory: '—' } : sv
            )
          }));

          await get().checkServicesRunning();
          get().showToast('Apache restarted', 'ok');
        } catch (e) {
          get().showToast('Restart Apache failed: ' + e.message, 'danger');
        }
      },

      uninstallApacheVersion: async (version) => {
        try {
          const dir = `${get().settings.devStackDir}/bin/apache/apache-${version}`;
          await Command.create('powershell', ['-NoProfile', '-Command', `Remove-Item -Path "${dir}" -Recurse -Force`]).execute();
          set(s => ({ apacheVersions: s.apacheVersions.map(v => v.version === version ? { ...v, installed: false, active: false } : v) }));
          get().showToast(`Uninstalled Apache ${version}`, 'warn');
        } catch (e) { get().showToast(`Error: ${e.message}`, 'danger'); }
      },

      detectApacheVersion: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
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

      scanInstalledApache: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
          const apacheDir = `${baseDir}/bin/apache`.replace(/\//g, '\\');
          const script = `if (Test-Path "${apacheDir}") { Get-ChildItem -Path "${apacheDir}" -Directory | Select-Object -ExpandProperty Name }`;
          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          if (result.stdout) {
            const folders = result.stdout.trim().split(/\r?\n/).map(f => f.trim());
            set(s => {
              const currentList = [...s.apacheVersions];
              const consumed = new Set();

              const updatedList = currentList.map(v => {
                const ver = v.version.toLowerCase();
                const folderMatch = folders.find(f => {
                  const fLow = f.toLowerCase();
                  return fLow === ver || fLow === 'apache-' + ver || fLow.startsWith('apache-' + ver);
                });
                if (folderMatch) {
                  consumed.add(folderMatch);
                  return { ...v, installed: true };
                }
                return v;
              });

              const added = folders
                .filter(f => !consumed.has(f))
                .map(f => {
                  const ver = f.toLowerCase().replace('apache-', '');
                  return { version: ver, installed: true, active: false, installing: false };
                });

              return {
                apacheVersions: [...updatedList, ...added].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
              };
            });
          }
        } catch (e) { console.error('Apache scan failed:', e); }
      },

      fixPhpConflict: async (forceGlobal = false) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const { phpVersions, selectedPhpVersion, isSystemConflict } = get();

          let target = phpVersions.find(v => v.version === selectedPhpVersion && !v.isSystem);
          if (!target) {
            target = [...phpVersions]
              .filter(v => v.installed && !v.isSystem)
              .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
          }
          if (!target) {
            get().showToast('Không tìm thấy PHP DevStack đã cài.', 'warn');
            return;
          }

          const folder = target.folderName || `php-${target.version}`;
          const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
          const devPath = `${devDir}\\bin\\php\\${folder}`;

          const userScript = `
$newPath = '${devPath}'
$old = [Environment]::GetEnvironmentVariable('Path', 'User')
$parts = $old -split ';' | Where-Object { $_ -ne '' -and $_ -notlike '*php*' -and $_ -notlike '*xampp*' }
$final = ($newPath + ';' + ($parts -join ';')).Trim(';')
[Environment]::SetEnvironmentVariable('Path', $final, 'User')
          `.trim();

          const machineScript = `
$old = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$parts = $old -split ';' | Where-Object { $_ -ne '' -and $_ -notlike '*php*' -and $_ -notlike '*xampp*' }
$final = ($parts -join ';').Trim(';')
[Environment]::SetEnvironmentVariable('Path', $final, 'Machine')
          `.trim();

          const broadcastScript = `
$sig = '[DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, UIntPtr w, string l, uint f, uint t, out UIntPtr r);'
$type = Add-Type -MemberDefinition $sig -Name "WinEnv_$([Guid]::NewGuid().ToString('N'))" -Namespace Win32 -PassThru
$r = [UIntPtr]::Zero
$type::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, 'Environment', 2, 1000, [ref]$r)
          `.trim();

          await Command.create('powershell', ['-NoProfile', '-Command', userScript + '; ' + broadcastScript]).execute();

          const needMachineFix = forceGlobal || isSystemConflict;
          if (needMachineFix) {
            get().showToast('Đang yêu cầu quyền Admin...', 'info');
            const fullScript = machineScript + '; ' + broadcastScript;
            const utf16Bytes = new Uint8Array(new Uint16Array([...fullScript].map(c => c.charCodeAt(0))).buffer);
            const base64 = btoa(String.fromCharCode(...utf16Bytes));
            await Command.create('powershell', [
              '-NoProfile', '-Command',
              `Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-WindowStyle','Hidden','-EncodedCommand','${base64}'`
            ]).execute();
            get().showToast('System PATH đã được làm sạch!', 'ok');
          }

          setTimeout(async () => {
            await get().detectPhpVersion();
            const current = get().detectedPhpVersion;
            if (current === target.version) {
              get().showToast(`✓ PHP ${target.version} đang hoạt động!`, 'ok');
            } else {
              get().showToast(`⚠ Hãy mở terminal mới để áp dụng PHP ${target.version}.`, 'warn');
            }
          }, 1500);

        } catch (e) {
          console.error('fixPhpConflict error:', e);
          get().showToast('Fix thất bại: ' + e.message, 'danger');
        }
      },

      uninstallPhpVersion: async (version) => {
        try {
          const dir = `${get().settings.devStackDir}/bin/php/php-${version}`;
          await Command.create('powershell', ['-NoProfile', '-Command', `Remove-Item -Path "${dir}" -Recurse -Force`]).execute();
          set(s => ({ phpVersions: s.phpVersions.map(p => p.version === version ? { ...p, installed: false, active: false } : p) }));
          get().showToast(`Uninstalled PHP ${version}`, 'warn');
          get().detectPhpVersion();
        } catch (e) { get().showToast(`Failed to uninstall: ${e.message}`, 'danger'); }
      },

      detectPhpVersion: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const psScript = `
$userPath    = [Environment]::GetEnvironmentVariable('Path', 'User')
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$fullPath    = ($userPath + ';' + $machinePath) -split ';' | Where-Object { $_ -ne '' }

$phpExe = $null
foreach ($dir in $fullPath) {
  $candidate = Join-Path $dir 'php.exe'
  if (Test-Path $candidate) { $phpExe = $candidate; break }
}

if ($phpExe) {
  $ver = & $phpExe -v 2>&1 | Select-Object -First 1
  Write-Output "PATH:$phpExe"
  Write-Output "VER:$ver"
} else {
  Write-Output "NOTFOUND"
}
          `.trim();

          const result = await Command.create('powershell', ['-NoProfile', '-Command', psScript]).execute();
          const lines = result.stdout?.trim().split(/\r?\n/) || [];

          if (!lines.length || lines[0] === 'NOTFOUND') {
            set({ detectedPhpVersion: null });
            return;
          }

          const phpPath = lines.find(l => l.startsWith('PATH:'))?.replace('PATH:', '').trim() || '';
          const verLine = lines.find(l => l.startsWith('VER:'))?.replace('VER:', '').trim() || '';
          const match = verLine.match(/PHP\s+([\d.]+)/);
          if (!match) { set({ detectedPhpVersion: null }); return; }

          const detected = match[1];
          const isDevStack = phpPath.toLowerCase().includes('devstack');

          const tsScript = `& '${phpPath.replace(/'/g, "''")}' -i 2>&1 | Select-String 'Thread Safety'`;
          const tsResult = await Command.create('powershell', ['-NoProfile', '-Command', tsScript]).execute();
          const isTS = tsResult.stdout?.toLowerCase().includes('enabled');

          set({ detectedPhpVersion: detected, conflictPath: phpPath });

          const phpDir = phpPath.substring(0, phpPath.lastIndexOf('\\')).toLowerCase();
          const checkScript = `
$d = '${phpDir.replace(/\\/g, '\\\\')}'
$m = [Environment]::GetEnvironmentVariable('Path', 'Machine').ToLower()
$u = [Environment]::GetEnvironmentVariable('Path', 'User').ToLower()
if ($m.Contains($d)) { "machine" } elseif ($u.Contains($d)) { "user" } else { "unknown" }
          `.trim();

          const checkResult = await Command.create('powershell', ['-NoProfile', '-Command', checkScript]).execute();
          const scope = checkResult.stdout?.trim().toLowerCase();
          set({ isSystemConflict: scope === 'machine' });

          set(s => {
            const selectedVersion = get().selectedPhpVersion;
            const managed = s.phpVersions.filter(p => !p.isSystem);
            const isExternalPhp = !isDevStack && phpPath;

            let newList = managed;
            if (isExternalPhp) {
              const alreadyExists = managed.some(p => p.version === detected && p.isSystem);
              if (!alreadyExists) {
                newList = [{ version: detected, installed: true, active: false, threadSafe: isTS, isSystem: true, path: phpPath }, ...managed];
              }
            }

            return {
              phpVersions: newList.map(p => {
                let isActive = false;
                if (isDevStack) {
                  // If DevStack PHP is on PATH, only match that one
                  isActive = (p.version === detected && !p.isSystem);
                } else {
                  // Otherwise, if this is the System PHP being detected
                  isActive = (p.isSystem && p.version === detected);
                }
                return { ...p, active: isActive };
              })
            };
          });

        } catch (e) {
          console.error('detectPhpVersion failed:', e);
          set({ detectedPhpVersion: null });
        }
      },

      scanInstalledPhp: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const baseDir = get().settings.devStackDir.replace(/[\\/]+$/, '');
          const phpDir = `${baseDir}/bin/php`.replace(/\//g, '\\');
          const script = [
            `$base = '${phpDir}'`,
            `if (!(Test-Path $base)) { exit 0 }`,
            `foreach ($d in (Get-ChildItem $base -Directory)) {`,
            `  $hasMod = (Test-Path "$($d.FullName)\\php8apache2_4.dll") -or (Test-Path "$($d.FullName)\\php7apache2_4.dll")`,
            `  Write-Output "$($d.Name)|$hasMod"`,
            `}`,
          ].join('\n');
          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();

          if (result.stdout) {
            const entries = result.stdout.trim().split(/\r?\n/).map(line => {
              const [folder, hasModStr] = line.trim().split('|');
              return {
                folder: folder,
                version: folder.toLowerCase().replace('php-', ''),
                hasApacheModule: hasModStr?.trim().toLowerCase() === 'true'
              };
            }).filter(e => e.folder);

            set(s => {
              const currentList = [...s.phpVersions];
              const consumed = new Set();

              const updatedList = currentList.map(p => {
                if (p.isSystem) return p;
                const entry = entries.find(e => e.version === p.version || e.folder.toLowerCase() === p.version.toLowerCase());
                if (entry) {
                  consumed.add(entry.folder);
                  return {
                    ...p,
                    installed: true,
                    folderName: entry.folder,
                    hasApacheModule: entry.hasApacheModule,
                    threadSafe: entry.hasApacheModule
                  };
                }
                return { ...p, installed: false, folderName: undefined, hasApacheModule: false };
              });

              const added = entries
                .filter(e => !consumed.has(e.folder))
                .map(e => ({
                  version: e.version,
                  installed: true,
                  active: false,
                  installing: false,
                  folderName: e.folder,
                  hasApacheModule: e.hasApacheModule,
                  threadSafe: e.hasApacheModule
                }));

              return {
                phpVersions: [...updatedList, ...added].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
              };
            });
          }
        } catch (e) { console.error('PHP scan failed:', e); }
      },

      // === Extensions ===
      addExtension: (name) => set(state => ({ extensions: [...state.extensions, name] })),
      removeExtension: (name) => set(state => ({ extensions: state.extensions.filter(e => e !== name) })),

      // === Port Conflict ===
      checkPortConflict: async (port) => {
        if (!port || port === '—') return false;
        try {
          const psScript = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`;
          const result = await Command.create('powershell', ['-NoProfile', '-Command', psScript]).execute();
          const pid = result.stdout?.trim();
          if (pid) {
            set(s => ({ portConflicts: { ...s.portConflicts, [port]: { inUse: true, pid: pid } } }));
            return true;
          }
          set(s => ({ portConflicts: { ...s.portConflicts, [port]: null } }));
          return false;
        } catch { return false; }
      },

      fetchRealSystemStats: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const psScript = `
$os    = Get-CimInstance Win32_OperatingSystem
$cpu   = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$total = [math]::Round($os.TotalVisibleMemorySize / 1024 / 1024, 1)
$free  = [math]::Round($os.FreePhysicalMemory / 1024 / 1024, 1)
$used  = [math]::Round($total - $free, 1)
Write-Output "$([math]::Round($cpu,0))|$used|$total"
          `.trim();
          const result = await Command.create('powershell', ['-NoProfile', '-Command', psScript]).execute();
          if (result.stdout) {
            const data = result.stdout.trim().split('|');
            if (data.length === 3) {
              const [cpu, used, total] = data.map(Number);
              set({ systemStats: { cpu: cpu || 0, ram: used || 0, ramTotal: total || 16 } });
            }
          }
        } catch (e) { console.error('Failed to fetch real stats', e); }
      },

      // === Sites ===
      scanSites: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const rootPath = get().settings.rootPath;
          const winPath = rootPath.replace(/\//g, '\\');
          const script = `Get-ChildItem -Path "${winPath}" -Directory -Force -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name`;
          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          if (result.stdout?.trim()) {
            const folders = result.stdout.trim().split('\n').map(f => f.trim()).filter(f => !f.startsWith('.'));
            const sites = folders.map((name, i) => ({
              id: i + 1,
              domain: name.toLowerCase().replace(/[^a-z0-9-]/g, '') + '.test',
              path: rootPath.replace(/\\/g, '/') + '/' + name,
              php: get().detectedPhpVersion?.split('.').slice(0, 2).join('.') || '8.2',
              ssl: false,
            }));
            set({ sites });
          } else { set({ sites: [] }); }
        } catch { set({ sites: [] }); }
      },

      setupVirtualHost: async (site) => {
        try {
          const activeApache = get().apacheVersions.find(v => v.active && v.installed);
          if (!activeApache) {
            get().showToast('Chưa có Apache nào được kích hoạt!', 'warn');
            return;
          }
          const httpdConf = (get().settings.devStackDir + '/bin/apache/apache-' + activeApache.version + '/conf/httpd.conf').replace(/\//g, '\\');
          const vhostsConf = (get().settings.devStackDir + '/bin/apache/apache-' + activeApache.version + '/conf/extra/httpd-vhosts.conf').replace(/\//g, '\\');
          // Apache config MUST use forward slashes on Windows, backslashes cause 403
          const docRoot = site.path.replace(/\\/g, '/');
          const domain = site.domain;
          const port = get().settings.port80 || 80;
          const domainEsc = domain.replace(/\./g, '\\.');

          const psLines = [
            '$hostsFile = "$env:windir\\System32\\drivers\\etc\\hosts"',
            '$vhostsFile = "' + vhostsConf + '"',
            '$httpdConf  = "' + httpdConf + '"',
            '',
            '# 1) Add hosts entry',
            '$hostsContent = Get-Content $hostsFile -Raw -ErrorAction SilentlyContinue',
            'if ($hostsContent -notmatch "(?m)^\\s*127\\.0\\.0\\.1\\s+' + domainEsc + '\\s*$") {',
            '  Add-Content -Path $hostsFile -Value "`n127.0.0.1`t' + domain + '" -Force',
            '}',
            '',
            '# 2) Enable Include httpd-vhosts.conf in httpd.conf',
            'if (Test-Path $httpdConf) {',
            '  $httpdContent = Get-Content $httpdConf -Raw',
            '  if ($httpdContent -match "#\\s*(Include\\s+conf/extra/httpd-vhosts\\.conf)") {',
            '    $httpdContent = $httpdContent -replace "#\\s*(Include\\s+conf/extra/httpd-vhosts\\.conf)","$1"',
            '    Set-Content -Path $httpdConf -Value $httpdContent -Encoding UTF8 -Force',
            '  }',
            '}',
            '',
            '# 3) Add default catch-all vhost if vhosts file is empty/missing',
            '$vhostsContent = Get-Content $vhostsFile -Raw -ErrorAction SilentlyContinue',
            'if (-not $vhostsContent -or $vhostsContent -notmatch "<VirtualHost") {',
            '  $defaultBlock = "<VirtualHost _default_:' + port + '>`n    DocumentRoot `"' + docRoot.replace(/\\/g, '\\\\') + '`"`n</VirtualHost>"',
            '  Set-Content -Path $vhostsFile -Value $defaultBlock -Encoding UTF8 -Force',
            '  $vhostsContent = Get-Content $vhostsFile -Raw',
            '}',
            '',
            '# 4) Add specific vhost block',
            'if ($vhostsContent -notmatch "(?i)ServerName\\s+' + domainEsc + '") {',
            '  $vhostBlock = "`n<VirtualHost *:' + port + '>`n    DocumentRoot `"' + docRoot + '`"`n    ServerName ' + domain + '`n    <Directory `"' + docRoot + '`">`n        Options Indexes FollowSymLinks`n        AllowOverride All`n        Require all granted`n    </Directory>`n</VirtualHost>"',
            '  Add-Content -Path $vhostsFile -Value $vhostBlock -Force',
            '}',
          ];
          const script = psLines.join('\n');

          const utf16b = new Uint8Array(script.length * 2);
          for (let i = 0; i < script.length; i++) {
            utf16b[i * 2] = script.charCodeAt(i) & 0xff;
            utf16b[i * 2 + 1] = (script.charCodeAt(i) >> 8) & 0xff;
          }
          const b64b = btoa(String.fromCharCode(...utf16b));
          get().showToast(`Đang yêu cầu quyền Admin để thiết lập ${domain}...`, 'info');
          await Command.create('powershell', [
            '-NoProfile', '-Command',
            `Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${b64b}'`
          ]).execute();

          get().showToast(`Đã thiết lập Virtual Host cho ${domain}`, 'ok');
          get().restartService(1); // Restart Apache
        } catch (e) {
          get().showToast('Lỗi thiết lập Virtual Host: ' + e.message, 'danger');
        }
      },

      editHostsFile: async () => {
        try {
          const args = ['-NoProfile', '-Command',
            'Start-Process notepad.exe -ArgumentList "$env:windir\\System32\\drivers\\etc\\hosts" -Verb RunAs'];
          await Command.create('powershell', args).execute();
          get().showToast('Đang mở file hosts bằng quyền Admin...', 'info');
        } catch (e) { get().showToast('Không thể mở file hosts', 'danger'); }
      },

      scanInstalledMysql: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
          const mysqlDir = `${baseDir}/bin/mysql`.replace(/\//g, '\\');
          const script = `
            if (Test-Path "${mysqlDir}") {
               Get-ChildItem -Path "${mysqlDir}" -Directory | ForEach-Object {
                 $ini = Join-Path $_.FullName "my.ini"
                 $p = 3306
                 if (Test-Path $ini) {
                    $content = Get-Content $ini -Raw
                    if ($content -match "(?ms)\\[mysqld\\s*\\].*?^port\\s*=\\s*(\\d+)") {
                        $p = $matches[1]
                    } elseif ($content -match "port\\s*=\\s*(\\d+)") {
                        $p = $matches[1]
                    }
                 }
                 Write-Output "$($_.Name)|$p"
               }
            }
          `.trim();
          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          if (result.stdout) {
            // console.log('MySQL Scan Raw Output:', result.stdout);
            const lines = result.stdout.trim().split(/\r?\n/).map(l => l.trim());
            set(s => {
              const currentList = [...s.mysqlVersions];
              const consumed = new Set();

              const updatedList = currentList.map(v => {
                const ver = v.version.toLowerCase();
                const match = lines.find(l => {
                  const [folder] = l.split('|');
                  const fLow = folder.toLowerCase();
                  return fLow === ver || fLow === 'mysql-' + ver || fLow.startsWith('mysql-' + ver);
                });
                if (match) {
                  const [folder, port] = match.split('|');
                  consumed.add(folder);
                  return { ...v, installed: true, port: parseInt(port) || 3306 };
                }
                return v;
              });

              const added = lines.filter(l => !consumed.has(l.split('|')[0])).map(l => {
                const [folder, port] = l.split('|');
                return {
                  version: folder.replace('mysql-', '').replace('-winx64', ''),
                  installed: true, active: false, installing: false, port: parseInt(port) || 3306
                };
              });

              return {
                mysqlVersions: [...updatedList, ...added].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
              };
            });
          }
        } catch (e) { console.error('MySQL scan failed:', e); }
      },

      setMysqlPort: async (version, newPort) => {
        try {
          const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
          const iniPath = `${baseDir}/bin/mysql/mysql-${version}/my.ini`.replace(/\//g, '\\');

          const script = `
            $ini = "${iniPath}"
            if (Test-Path $ini) {
                $content = Get-Content $ini -Raw
                if ($content -match "port\\s*=") {
                    $content = $content -replace "port\\s*=\\s*\\d+", "port=${newPort}"
                    Set-Content -Path $ini -Value $content -Encoding ASCII -Force
                    Write-Output "OK: Synchronized all port settings"
                } else {
                    $content = $content -replace "(?m)\\[mysqld\\s*\\]", "[mysqld]\`r\`nport=${newPort}"
                    Set-Content -Path $ini -Value $content -Encoding ASCII -Force
                    Write-Output "OK: Port added to mysqld section"
                }
            } else {
                Write-Output "ERROR: Not Found"
            }
          `.trim();

          // console.log('Initiating Port Update:', { version, newPort, iniPath });
          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          // console.log('Port Update Result:', result);

          if (result.stdout.includes('OK')) {
            get().showToast(`Đã đổi MySQL ${version} sang port ${newPort}`, 'ok');
            await get().scanInstalledMysql();
            get().syncServiceVersions();
          }
        } catch (e) { get().showToast(`Lỗi: ${e.message}`, 'danger'); }
      },

      openMysqlTerminal: async (version) => {
        try {
          const v = get().mysqlVersions.find(mv => mv.version === version);
          if (!v) return;

          const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
          const binDir = `${baseDir}/bin/mysql/mysql-${version}/bin`.replace(/\//g, '\\');
          const port = v.port || 3306;

          const terminalInnerCmd = `echo --- MySQL ${version} (Port ${port}) --- && echo Command: mysql -u root -P ${port} && echo. && mysql -u root -P ${port}`;

          await Command.create('cmd', ['/C', 'start', '', '/D', binDir, 'cmd', '/K', terminalInnerCmd]).execute();
        } catch (e) { get().showToast(`Lỗi: ${e.message}`, 'danger'); }
      },

      fetchMysqlVersions: async () => {
        // Since scraping MySQL strictly is hard due to session cookies on dev.mysql.com,
        // we use regular CDN URLs which are more reliable.
        const versions = [
          { version: '8.0.45', url: 'https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-8.0.45-winx64.zip' },
          { version: '8.0.40', url: 'https://cdn.mysql.com/Downloads/MySQL-8.0/mysql-8.0.40-winx64.zip' },
          { version: '5.7.44', url: 'https://cdn.mysql.com/Downloads/MySQL-5.7/mysql-5.7.44-winx64.zip' },
        ];

        set(s => {
          const existing = s.mysqlVersions;
          const newList = versions.map(v => {
            const old = existing.find(e => e.version === v.version);
            return old
              ? { ...old, downloadUrl: v.url }
              : { version: v.version, installed: false, active: false, installing: false, downloadUrl: v.url };
          });
          const installedOld = existing.filter(e => e.installed && !newList.find(n => n.version === e.version));
          return { mysqlVersions: [...newList, ...installedOld].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true })) };
        });
      },

      installMysqlVersion: async (version, customUrl = null) => {
        const addLog = (m, l = 'info') => set(s => ({
          mysqlInstallLogs: [...s.mysqlInstallLogs, { t: new Date().toLocaleTimeString(), m, l }]
        }));

        if (!window.__TAURI_INTERNALS__) {
          addLog("⚠️ Not running in Tauri environment.", "warn");
          return;
        }

        const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const mysqlBaseDir = `${devDir}/bin/mysql`;
        const destDir = `${mysqlBaseDir}/mysql-${version}`;
        const zipPath = `${mysqlBaseDir}/mysql-${version}.zip`;

        // Find or create version entry
        let mysqlV = get().mysqlVersions.find(v => v.version === version);
        if (!mysqlV && customUrl) {
          mysqlV = { version, installed: false, active: false, installing: true, downloadUrl: customUrl };
          set(s => ({ mysqlVersions: [...s.mysqlVersions, mysqlV] }));
        }

        const downloadUrl = customUrl || mysqlV?.downloadUrl;

        if (!downloadUrl) {
          addLog(`❌ Cannot find download URL for MySQL ${version}`, 'err');
          return;
        }

        set(s => ({
          mysqlVersions: s.mysqlVersions.map(v => v.version === version ? { ...v, installing: true, progress: 0 } : v),
          mysqlInstallLogs: [{ t: new Date().toLocaleTimeString(), m: `Starting MySQL ${version} installation...`, l: 'info' }],
          mysqlInstallProgress: { pct: 0, downloaded: 0, total: 0 },
        }));

        addLog(`📁 Destination: ${destDir}`, 'info');

        try {
          const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Log($msg)      { Write-Host "LOG: $msg"; [Console]::Out.Flush() }
function Progress($pct) { Write-Host "PROGRESS:$pct"; [Console]::Out.Flush() }

if (!(Test-Path '${mysqlBaseDir}')) {
  New-Item -ItemType Directory -Force -Path '${mysqlBaseDir}' | Out-Null
}

$zip  = '${zipPath}'
$dest = '${destDir}'
$url  = '${downloadUrl}'

# Ensure we use direct CDN link even if persistent state has the old redirector URL
if ($url -like "*dev.mysql.com*") {
  $url = $url.Replace("dev.mysql.com", "cdn.mysql.com").Replace("/get/", "/")
}

Log "Downloading MySQL..."
Log "URL: $url"

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  
  try {
    Log "Trying curl.exe (more robust)..."
    & curl.exe -L -f --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --output "$zip" "$url"
    if ($LASTEXITCODE -ne 0) { throw "curl exited with code $LASTEXITCODE" }
  } catch {
    Log "curl failed, trying Invoke-WebRequest fallback..."
    $headers = @{
      "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    Invoke-WebRequest -Uri $url -OutFile $zip -Headers $headers -UseBasicParsing
  }

  if (!(Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) {
    if (Test-Path $zip) { Remove-Item $zip -Force }
    throw "Downloaded file too small or invalid"
  }

  $sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
  Log "Download complete! ($sizeMB MB)"

} catch {
  if (Test-Path $zip) { Remove-Item $zip -Force }
  throw "Download failed: $($_.Exception.Message)"
}

Progress 85

# Extract
Log "Extracting..."
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$tmp = "$dest-tmp"
Expand-Archive -Path $zip -DestinationPath $tmp -Force

# MySQL zip contains a folder name like mysql-8.x.x-winx64
$inner = Get-ChildItem $tmp -Directory | Select-Object -First 1
if ($inner) {
  Get-ChildItem $inner.FullName | Move-Item -Destination $dest -Force
} else {
  Get-ChildItem $tmp | Move-Item -Destination $dest -Force
}

Remove-Item $tmp -Recurse -Force
Remove-Item $zip -Force

Progress 95

# Initialize MySQL data folder if not exists
if (!(Test-Path "$dest/data")) {
  Log "Initializing MySQL data directory..."
  $mysqld = "$dest/bin/mysqld.exe"
  if (Test-Path $mysqld) {
    & $mysqld --initialize-insecure --console
    Log "Data directory initialized."
  }
}

# Create a basic my.ini if not exists
if (!(Test-Path "$dest/my.ini")) {
  Log "Searching for a free port..."
  $freePort = 3306
  while (Get-NetTCPConnection -LocalPort $freePort -ErrorAction SilentlyContinue) {
    if ($freePort -ge 3999) { $freePort = 3306; break }
    $freePort++
  }
  Log "Assigning Port: $freePort"

  Log "Creating default my.ini ..."
  $ini = @"
[mysqld]
port=$freePort
basedir=\"$($dest.Replace('\\','/'))\"
datadir=\"$($dest.Replace('\\','/'))/data\"
character-set-server=utf8mb4
sql_mode=NO_ENGINE_SUBSTITUTION,STRICT_TRANS_TABLES
"@
  $ini | Set-Content "$dest/my.ini" -Encoding ASCII
}

Log "--------------------------------------------"
Log "MYSQL READY!"
Log "User: root"
Log "Pass: (empty)"
Log "Port: $freePort (Assigned)"
Log "--------------------------------------------"

Log "Extraction and setup complete."
Write-Host "DONE"
[Console]::Out.Flush()
    `.trim();

          const cmd = Command.create('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);

          cmd.stdout.on('data', async line => {
            const l = line.trim();
            if (!l) return;
            if (l.startsWith('PROGRESS:')) {
              const pct = parseInt(l.replace('PROGRESS:', '').trim());
              if (!isNaN(pct)) set(s => ({ mysqlVersions: s.mysqlVersions.map(v => v.version === version ? { ...v, progress: pct } : v) }));
            } else if (l.startsWith('LOG:')) {
              addLog(l.replace('LOG:', '').trim(), 'info');
            } else if (l === 'DONE') {
              set(s => ({ mysqlVersions: s.mysqlVersions.map(v => v.version === version ? { ...v, installed: true, installing: false, progress: 100 } : v) }));
              set({ mysqlInstallProgress: { pct: 100, downloaded: 0, total: 0 } });
              addLog(`✓ MySQL ${version} installed successfully!`, 'ok');

              // Auto-copy my.ini-development → my.ini if my.ini doesn't exist
              try {
                const mysqlDir = `${get().settings.devStackDir}/bin/mysql/mysql-${version}`.replace(/\//g, '\\');
                const copyScript = `
$dir = '${mysqlDir}'
$myIni = Join-Path $dir 'my.ini'
$src = $null
foreach ($candidate in @('my.ini-development', 'my-default.ini', 'my.ini-example')) {
  $path = Join-Path $dir $candidate
  if (Test-Path $path) { $src = $path; break }
}
if (-not (Test-Path $myIni)) {
  if ($src) {
    Copy-Item -Path $src -Destination $myIni -Force
    Write-Output "COPIED:$src"
  } else {
    Write-Output "NO_SRC"
  }
} else {
  Write-Output "EXISTS"
}
                `.trim();
                const iniResult = await Command.create('powershell', ['-NoProfile', '-Command', copyScript]).execute();
                const out = iniResult.stdout?.trim() || '';
                if (out.startsWith('COPIED:')) {
                  addLog(`📋 Đã tạo my.ini từ ${out.replace('COPIED:', '')}`, 'ok');
                } else if (out === 'EXISTS') {
                  addLog('ℹ my.ini đã tồn tại, bỏ qua copy.', 'info');
                } else {
                  addLog('⚠ Không tìm thấy file mẫu my.ini, hãy tạo thủ công.', 'warn');
                }
              } catch (e) {
                addLog('⚠ Không thể copy my.ini: ' + e.message, 'warn');
              }

              get().showToast(`MySQL ${version} ready!`, 'ok');
              await get().scanInstalledMysql();
            }
          });

          cmd.stderr.on('data', line => {
            const l = line.trim();
            if (!l) return;

            // Granular Progress Parsing for curl: " 23  233M   23 54.8M ..."
            // Regex matches: start with number, then size (e.g. 233M), then another number
            const curlMatch = l.match(/^(\d+)\s+[\d.A-Z]+\s+(\d+)/);
            if (curlMatch) {
              const pctValue = parseInt(curlMatch[1]);
              if (!isNaN(pctValue)) {
                const overallPct = Math.floor(pctValue * 0.8);
                set(s => ({
                  mysqlVersions: s.mysqlVersions.map(v => v.version === version ? { ...v, progress: overallPct } : v)
                }));
                // Log progress every 20% to keep user informed without spamming
                if (pctValue > 0 && pctValue % 20 === 0) {
                  addLog(`[Download] ${pctValue}% complete...`, 'info');
                }
              }
              return;
            }

            if (l) addLog(`⚠ ${l}`, 'warn');
          });
          await cmd.spawn();

        } catch (e) {
          set(s => ({ mysqlVersions: s.mysqlVersions.map(v => v.version === version ? { ...v, installing: false } : v) }));
          addLog(`❌ ERROR: ${e.message}`, 'err');
          get().showToast(`Install failed`, 'warn');
        }
      },

      uninstallMysqlVersion: async (version) => {
        try {
          const dir = `${get().settings.devStackDir}/bin/mysql/mysql-${version}`;
          await Command.create('powershell', ['-NoProfile', '-Command', `Remove-Item -Path "${dir}" -Recurse -Force`]).execute();
          set(s => ({ mysqlVersions: s.mysqlVersions.map(v => v.version === version ? { ...v, installed: false, active: false } : v) }));
          get().showToast(`Uninstalled MySQL ${version}`, 'warn');
        } catch (e) { get().showToast(`Error: ${e.message}`, 'danger'); }
      },

      setActiveMysql: async (version) => {
        set(state => ({
          selectedMysqlVersion: version,
          mysqlVersions: state.mysqlVersions.map(v => ({ ...v, active: v.version === version }))
        }));

        get().syncServiceVersions();
        get().showToast(`Đã chọn MySQL ${version} làm mặc định`, 'ok');
      },

      createProject: async (name) => {
        if (!window.__TAURI_INTERNALS__ || !name) return;
        try {
          const root = get().settings.rootPath;
          const prjPath = `${root}/${name}`.replace(/\//g, '\\');
          const script = `
            if (!(Test-Path "${prjPath}")) {
              New-Item -ItemType Directory -Path "${prjPath}" -Force | Out-Null
              Set-Content -Path "${prjPath}\\index.php" -Value "<?php phpinfo(); ?>"
              Write-Output "OK"
            } else {
              Write-Output "EXISTS"
            }
          `.trim();
          const result = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          if (result.stdout.includes('OK')) {
            get().showToast(get().t('projectCreated', { name }), 'ok');
            get().scanSites();
            return true;
          } else {
            get().showToast('Tên thư mục đã tồn tại!', 'warn');
            return false;
          }
        } catch (e) {
          get().showToast('Failed to create project', 'danger');
          return false;
        }
      },

      // === Database ===
      scanDatabases: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
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

          const result = await Command.create('powershell', [
            '-NoProfile', '-Command',
            `& '${mysqlBin}' -u root -N -e "${query}"`
          ]).execute();

          if (result.stdout) {
            const lines = result.stdout.trim().split(/\r?\n/).map(l => l.trim());
            const tableCounts = {};
            const sizes = {};
            const dbNames = [];

            lines.forEach(line => {
              const parts = line.split(/\s+/);
              if (parts.length === 1) {
                // Potential DB name from first query
                if (!isNaN(parts[0])) return; // Skip if it's just a number
                dbNames.push(parts[0]);
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

      toggleServiceAutoStart: (id) => {
        const svc = get().services.find(s => s.id === id);
        if (!svc) return;

        if (svc.type === 'db' && !svc.isExternal) {
          // MySQL managed version
          set(state => ({
            mysqlVersions: state.mysqlVersions.map(v => v.version === svc.version ? { ...v, autoStart: !v.autoStart } : v)
          }));
        } else if (svc.id <= 4) {
          // Core services (Apache, PHP, Redis) - map to global settings for now or individual
          const keyMap = { 1: 'autoStartApache', 3: 'autoStartPhp', 4: 'autoStartRedis' };
          const key = keyMap[svc.id];
          if (key) get().toggleSetting(key);
        } else {
          // Other/External
          set(state => ({
            knownExternalServices: state.knownExternalServices.map(k => k.id === id ? { ...k, autoStart: !k.autoStart } : k)
          }));
        }
        get().syncServiceVersions();
      },

      updateServicePort: async (id, port) => {
        const svc = get().services.find(s => s.id === id);
        if (!svc) return;
        const p = parseInt(port);
        if (isNaN(p) || p <= 0) return;

        if (svc.type === 'db' && !svc.isExternal) {
          await get().setMysqlPort(svc.version, p);
        } else if (svc.id === 1) {
          get().updateSetting('port80', p);
        } else if (svc.id === 4) {
          get().updateSetting('portRedis', p); // Assuming this setting exists or will be helpful
        }
        get().syncServiceVersions();
      },

      // === Settings ===
      switchLog: (type) => set({ currentLog: type }),
      clearLog: () => set(state => ({ logs: { ...state.logs, [state.currentLog]: [] } })),
      toggleSetting: async (key) => {
        const newVal = !get().settings[key];
        set(state => ({ settings: { ...state.settings, [key]: newVal } }));

        // If toggling startOnBoot, sync with Windows Registry
        if (key === 'startOnBoot' && window.__TAURI_INTERNALS__) {
          try {
            const regKey = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
            const appName = 'DevStack';
            if (newVal) {
              // Get the path of the running exe via Tauri
              const { appDataDir } = await import('@tauri-apps/api/path');
              const exeDir = (await appDataDir()).replace(/AppData.*/, '').trim();
              // Get executable path from process
              const psResult = await Command.create('powershell', [
                '-NoProfile', '-Command',
                `(Get-Process -Id $PID).Path`
              ]).execute();
              const exePath = psResult.stdout?.trim();
              if (exePath) {
                await Command.create('powershell', [
                  '-NoProfile', '-Command',
                  `Set-ItemProperty -Path '${regKey}' -Name '${appName}' -Value '"${exePath}"'`
                ]).execute();
                get().showToast('DevStack sẽ tự khởi động cùng Windows ✓', 'ok');
              } else {
                get().showToast('Không thể lấy đường dẫn exe', 'warn');
              }
            } else {
              await Command.create('powershell', [
                '-NoProfile', '-Command',
                `Remove-ItemProperty -Path '${regKey}' -Name '${appName}' -ErrorAction SilentlyContinue`
              ]).execute();
              get().showToast('Đã tắt khởi động cùng Windows', 'info');
            }
          } catch (e) {
            console.error('startOnBoot registry error:', e);
            get().showToast('Không thể cập nhật Registry: ' + e.message, 'danger');
          }
        }
      },
      updateSetting: (key, val) => {
        set(state => {
          const newSettings = { ...state.settings, [key]: val };
          if (key === 'devStackDir') {
            const cleanVal = val.replace(/[\\\/]+$/, '');
            newSettings.rootPath = `${cleanVal}/www`;
          }
          return { settings: newSettings };
        });
        if (key === 'rootPath' || key === 'devStackDir') setTimeout(() => get().scanSites(), 300);
      },

      // === File browsing ===
      browseForFile: async (configId) => {
        try {
          const { open } = await import('@tauri-apps/plugin-dialog');
          const path = await open({ multiple: false, directory: false });
          if (path) {
            set(s => ({ configFiles: s.configFiles.map(f => f.id === configId ? { ...f, path } : f) }));
            get().showToast('Path updated!', 'ok');
          }
        } catch { get().showToast('Browse not available', 'info'); }
      },
      browseForFolder: async () => {
        try {
          const { open } = await import('@tauri-apps/plugin-dialog');
          const path = await open({ multiple: false, directory: true });
          return path;
        } catch (e) {
          get().showToast(`Lỗi chọn thư mục: ${e.message}`, 'danger');
          return null;
        }
      },
      browseForEditor: async () => {
        try {
          const { open } = await import('@tauri-apps/plugin-dialog');
          const path = await open({
            multiple: false,
            directory: false,
            filters: [{ name: 'Executables', extensions: ['exe'] }]
          });
          if (path) {
            get().updateSetting('editorPath', path);
            get().showToast('Đã lưu trình soạn thảo mặc định!', 'ok');
          }
        } catch (e) {
          get().showToast(`Lỗi chọn editor: ${e.message}`, 'danger');
        }
      },

      openExplorer: async (path) => {
        if (!path) return;
        try {
          const { openPath } = await import('@tauri-apps/plugin-opener');
          const winPath = path.replace(/\//g, '\\');
          await openPath(winPath);
          get().showToast('✓ Đang mở thư mục/tệp...', 'ok');
        } catch (e) {
          console.error('Opener plugin failed, trying shell fallback:', e);
          try {
            // Fallback for Windows using explorer.exe
            await Command.create('cmd', ['/c', 'start', '', path.replace(/\//g, '\\')]).execute();
            get().showToast('✓ Đang mở...', 'ok');
          } catch (err) {
            get().showToast(`Lỗi mở: ${e.message || e || 'Unknown error'}`, 'danger');
          }
        }
      },

      openExternalUrl: async (url) => {
        if (!url) return;
        try {
          const { openUrl } = await import('@tauri-apps/plugin-opener');
          await openUrl(url);
        } catch (e) {
          console.error('Failed to open URL:', e);
          get().showToast(`Lỗi mở URL: ${e.message || e}`, 'danger');
        }
      },

      // === Navigation & Toast ===
      setActivePage: (page) => set({ activePage: page }),
      showToast: (msg, type = 'ok') => {
        set({ toast: { show: true, msg, type } });
        setTimeout(() => {
          set(state => state.toast.msg === msg ? { toast: { ...state.toast, show: false } } : state);
        }, 2800);
      },
      addService: (svc) => set(state => ({ services: [...state.services, svc] })),
      addSite: (site) => set(state => ({ sites: [...state.sites, site] })),
      addDB: (db) => set(state => ({ databases: [...state.databases, db] })),
      removeSite: (id) => set(state => ({ sites: state.sites.filter(s => s.id !== id) })),
      removeDB: (name) => set(state => ({ databases: state.databases.filter(d => d.name !== name) })),

      // === Tunnel ===
      setTunnelProvider: (p) => set({ tunnelProvider: p }),
      setTunnelPort: (p) => set({ tunnelPort: parseInt(p) || 80 }),
      setTunnelProtocol: (p) => set({ tunnelProtocol: p }),
      setTunnelHostHeader: (h) => set({ tunnelHostHeader: h }),
      startTunnel: async (authToken = '') => {
        const { tunnelProvider, tunnelPort, tunnelProtocol } = get();
        const addLog = (m, l = 'info') => set(s => ({
          tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m, l }]
        }));

        if (!window.__TAURI_INTERNALS__) return;

        // Dừng tiến trình cũ trước khi chạy mới
        await get().stopTunnel();

        const hostHeader = get().tunnelHostHeader || '';
        set({ tunnelStatus: 'starting', tunnelPublicUrl: '' });
        const targetDesc = hostHeader ? hostHeader : `${tunnelProtocol}://localhost:${tunnelPort}`;
        addLog(`Starting ${tunnelProvider} on ${targetDesc}...`, 'info');

        const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
        const exePath = `${devDir}\\bin\\tunnels\\${tunnelProvider}.exe`;

        try {
          if (tunnelProvider === 'cloudflare') {
            const hostHeaderArg = hostHeader ? `--http-host-header=${hostHeader}` : '';
            const cmd = Command.create('powershell', [
              '-NoProfile', '-Command',
              `& "${exePath}" tunnel --url ${tunnelProtocol}://localhost:${tunnelPort}${hostHeaderArg ? ' ' + hostHeaderArg : ''}`
            ]);

            cmd.stdout.on('data', line => {
              if (line.trim()) addLog(`[STDOUT] ${line.trim()}`);
            });

            cmd.stderr.on('data', line => {
              const l = line.trim();
              if (!l) return;
              addLog(l, 'info');

              const match = l.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
              if (match && get().tunnelStatus === 'starting') {
                set({ tunnelStatus: 'running', tunnelPublicUrl: match[0] });
                addLog(`✓ Tunnel established: ${match[0]}`, 'ok');
              }
            });

            cmd.on('close', ({ code }) => {
              if (get().tunnelStatus !== 'stopped') {
                set({ tunnelStatus: 'stopped' });
                addLog(`Tunnel closed with code ${code}`, 'warn');
              }
            });

            await cmd.spawn();
          } else if (tunnelProvider === 'ngrok') {
            if (authToken) {
              addLog('Configuring authtoken...');
              await Command.create('powershell', ['-NoProfile', '-Command', `& "${exePath}" config add-authtoken ${authToken}`]).execute();
            }

            const hostHeaderFlag = hostHeader ? `--host-header=${hostHeader}` : '';
            const cmd = Command.create('powershell', [
              '-NoProfile', '-Command',
              `& "${exePath}" http ${tunnelProtocol}://localhost:${tunnelPort}${hostHeaderFlag ? ' ' + hostHeaderFlag : ''} --log stdout --log-format logfmt`
            ]);

            cmd.stdout.on('data', line => {
              const l = line.trim();
              if (!l) return;
              addLog(l, 'info');

              const match = l.match(/url=(https:\/\/[^\s]+)/);
              if (match && get().tunnelStatus === 'starting') {
                set({ tunnelStatus: 'running', tunnelPublicUrl: match[1] });
                addLog(`✓ Tunnel established: ${match[1]}`, 'ok');
              }
            });

            cmd.stderr.on('data', line => { if (line.trim()) addLog(line.trim(), 'warn'); });

            cmd.on('close', ({ code }) => {
              if (get().tunnelStatus !== 'stopped') {
                set({ tunnelStatus: 'stopped' });
                addLog(`Tunnel closed with code ${code}`, 'warn');
              }
            });

            await cmd.spawn();
          } else {
            addLog(`❌ Tunnel provider ${tunnelProvider} not implemented`, 'err');
            set({ tunnelStatus: 'stopped' });
          }
        } catch (e) {
          addLog(`❌ ERROR: ${e.message}`, 'err');
          set({ tunnelStatus: 'stopped' });
        }
      },
      stopTunnel: async () => {
        const addLog = (m, l = 'info') => set(s => ({
          tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m, l }]
        }));

        try {
          const { tunnelProvider } = get();
          const exeName = tunnelProvider === 'cloudflare' ? 'cloudflared' : tunnelProvider;

          if (window.__TAURI_INTERNALS__) {
            await Command.create('powershell', [
              '-NoProfile', '-Command',
              `Stop-Process -Name "${exeName}" -Force -ErrorAction SilentlyContinue`
            ]).execute();
          }

          set({ tunnelStatus: 'stopped', tunnelPublicUrl: '' });
          addLog('Tunnel disconnected.', 'warn');
        } catch (e) {
          console.error('Stop tunnel failed:', e);
        }
      },
      installTunnelBinary: async (provider) => {
        const addLog = (m, l = 'info') => set(s => ({
          tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m, l }]
        }));

        if (!window.__TAURI_INTERNALS__) return;

        try {
          const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
          const tunnelDir = `${devDir}\\bin\\tunnels`;
          const exePath = `${tunnelDir}\\${provider}.exe`;

          set({ tunnelStatus: 'installing' });
          addLog(`Downloading ${provider}...`);

          let downloadUrl = '';
          let isZip = false;

          if (provider === 'cloudflare') {
            downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
          } else if (provider === 'ngrok') {
            downloadUrl = 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip';
            isZip = true;
          }

          if (!downloadUrl) {
            addLog(`❌ Không có link tải cho provider: ${provider}`, 'err');
            set({ tunnelStatus: 'stopped' });
            return;
          }

          const psScript = `
$tunnelDir = '${tunnelDir}'
if (!(Test-Path $tunnelDir)) { New-Item -ItemType Directory -Force -Path $tunnelDir | Out-Null }
$url = '${downloadUrl}'
$dest = '${exePath}'
try {
  if ('${isZip}' -eq 'true') {
    $zipPath = "$tunnelDir\\temp.zip"
    Write-Host "LOG:Downloading from $url..."
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    Write-Host "LOG:Extracting..."
    Expand-Archive -Path $zipPath -DestinationPath $tunnelDir -Force
    Remove-Item $zipPath -Force
  } else {
    Write-Host "LOG:Downloading from $url..."
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  }
  Write-Host "DONE"
} catch { Write-Host "ERR:$($_.Exception.Message)" }
          `.trim();

          const cmd = Command.create('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);

          cmd.stdout.on('data', line => {
            const l = line.trim();
            if (!l) return;
            if (l.startsWith('LOG:')) {
              addLog(l.replace('LOG:', '').trim(), 'info');
            } else if (l === 'DONE') {
              set(s => ({
                tunnelStatus: 'stopped',
                tunnelInstalled: { ...s.tunnelInstalled, [provider]: true }
              }));
              addLog(`✓ ${provider} installed successfully!`, 'ok');
              get().showToast(`${provider} installed!`, 'ok');
            } else if (l.startsWith('ERR:')) {
              addLog(`❌ ${l.replace('ERR:', '').trim()}`, 'err');
              set({ tunnelStatus: 'stopped' });
            }
          });

          cmd.stderr.on('data', line => { if (line.trim()) addLog(`⚠ ${line.trim()}`, 'warn'); });
          await cmd.spawn();

        } catch (e) {
          set({ tunnelStatus: 'stopped' });
          addLog(`❌ ERROR: ${e.message}`, 'err');
          get().showToast(`Install failed`, 'warn');
        }
      },
      checkTunnelsInstalled: async () => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const devDir = get().settings.devStackDir.replace(/\//g, '\\').replace(/[\\]+$/, '');
          const tunnelDir = `${devDir}\\bin\\tunnels`;
          const script = `
if (Test-Path "${tunnelDir}\\cloudflare.exe") { Write-Output "cloudflare=1" } else { Write-Output "cloudflare=0" }
if (Test-Path "${tunnelDir}\\ngrok.exe") { Write-Output "ngrok=1" } else { Write-Output "ngrok=0" }
          `.trim();
          const res = await Command.create('powershell', ['-NoProfile', '-Command', script]).execute();
          if (res.stdout) {
            const installed = { ...get().tunnelInstalled };
            res.stdout.split(/\r?\n/).forEach(line => {
              if (line.includes('=')) {
                const [k, v] = line.split('=');
                installed[k.trim()] = v.trim() === '1';
              }
            });
            set({ tunnelInstalled: installed });
          }
        } catch (e) { }
      },
      clearTunnelLogs: () => set({ tunnelLogs: [] }),

      openTerminal: async (prjPath) => {
        if (!window.__TAURI_INTERNALS__) return;
        try {
          const s = get().settings;
          const devDir = (s.devStackDir || 'C:/devstack').replace(/\//g, '\\');
          let path = (prjPath || s.rootPath || devDir).replace(/\//g, '\\');

          const phpActive = get().phpVersions.find(v => v.active && !v.isSystem);
          const apacheActive = get().apacheVersions.find(v => v.active);

          let envPaths = [];
          if (phpActive?.installed) {
            const folder = phpActive.folderName || `php-${phpActive.version}`;
            envPaths.push(`${devDir}\\bin\\php\\${folder}`);
          }
          if (apacheActive?.installed) {
            envPaths.push(`${devDir}\\bin\\apache\\apache-${apacheActive.version}\\bin`);
          }

          const pathStr = envPaths.join(';');
          const innerScript = `
if (Test-Path '${path}') { Set-Location '${path}' } else { Set-Location '${devDir}' };
$env:Path = '${pathStr};' + $env:Path;
Clear-Host;
Write-Host '--- DEVSTACK TERMINAL ---' -ForegroundColor Green;
Write-Host 'Active PHP: ${phpActive?.version || 'None'}' -ForegroundColor Cyan;
php -v;
          `.replace(/\n/g, ' ').trim();

          const fullCmd = `Start-Process powershell -ArgumentList '-NoExit', '-Command', "${innerScript.replace(/"/g, '\\"')}"`;
          await Command.create('powershell', ['-NoProfile', '-Command', fullCmd]).execute();
        } catch (e) {
          console.error('Terminal error:', e);
          get().showToast('Failed to open terminal', 'danger');
        }
      },

      // === Config ===
      updateConfigPath: (id, path) => set(s => ({
        configFiles: s.configFiles.map(f => f.id === id ? { ...f, path } : f)
      })),
      openConfigFile: async (id, forceOpenWith = false) => {
        const file = get().configFiles.find(f => f.id === id);
        if (!file || !file.path) {
          get().showToast(`Chưa cấu hình đường dẫn cho ${file?.label || 'file'}`, 'warn');
          return;
        }
        try {
          const winPath = file.path.replace(/\//g, '\\');
          const editor = get().settings.editorPath;

          if (forceOpenWith) {
            // Trigger Windows "Open With" dialog
            await Command.create('powershell', ['-NoProfile', '-Command', `Start-Process rundll32.exe -ArgumentList "shell32.dll,OpenAs_RunDLL ${winPath}"`]).execute();
            get().showToast(`Đang mở bảng chọn ứng dụng...`, 'ok');
          } else if (editor) {
            // Use custom editor if set
            const editorWin = editor.replace(/\//g, '\\');
            await Command.create('powershell', ['-NoProfile', '-Command', `Start-Process '${editorWin}' -ArgumentList '${winPath}'`]).execute();
            get().showToast(`Đang mở bằng editor đã chọn...`, 'ok');
          } else {
            // Use Notepad as default if no custom editor is set
            await Command.create('powershell', ['-NoProfile', '-Command', `Start-Process notepad.exe '${winPath}'`]).execute();
            get().showToast(`Đang mở bằng Notepad...`, 'ok');
          }
        } catch (e) {
          console.error('Config open error:', e);
          const msg = e instanceof Error ? e.message : String(e);
          get().showToast(`Không thể mở file: ${msg.slice(0, 50)}`, 'danger');
        }
      },

      initApp: async () => {
        if (!get().startTime) set({ startTime: Date.now() });
        setTimeout(async () => {
          const s = get().settings;
          if (s.rootPath?.toLowerCase().includes('laragon')) {
            get().updateSetting('rootPath', `${s.devStackDir}/www`);
          }

          // Cleanup hallucinated versions from persistent state
          const badVersions = ['8.4.16', '8.4.8', '8.4.4'];
          set(prev => ({
            mysqlVersions: prev.mysqlVersions.filter(v => !badVersions.includes(v.version) || v.installed)
          }));

          get().detectPhpVersion();
          get().scanInstalledPhp();
          get().detectApacheVersion();
          get().scanInstalledApache();
          get().fetchApacheVersions();
          get().scanInstalledPhp();
          get().scanInstalledMysql();
          get().fetchMysqlVersions();
          get().scanSites();
          get().scanDatabases();
          get().fetchRealSystemStats();
          set({ _lastServiceCheck: 0 });
          get().checkServicesRunning();

          setTimeout(() => {
            const { selectedApacheVersion, selectedPhpVersion, selectedMysqlVersion } = get();
            if (selectedApacheVersion) {
              set(s => ({
                apacheVersions: s.apacheVersions.map(v => ({ ...v, active: v.version === selectedApacheVersion && v.installed }))
              }));
            }
            if (selectedPhpVersion) {
              set(s => ({
                phpVersions: s.phpVersions.map(p => p.isSystem ? p : { ...p, active: p.version === selectedPhpVersion && p.installed })
              }));
            }
            if (selectedMysqlVersion) {
              set(s => ({
                mysqlVersions: s.mysqlVersions.map(v => ({ ...v, active: v.version === selectedMysqlVersion && v.installed }))
              }));
            }
            get().syncServiceVersions();
            set({ _lastServiceCheck: 0 });
            get().checkServicesRunning();

            if (get()._pollInterval) clearInterval(get()._pollInterval);
            const interval = setInterval(() => get().checkServicesRunning(), 5000);
            set({ _pollInterval: interval });
          }, 2000);
        }, 1500);
      },
    }),
    {
      name: 'devstack-storage',
      version: 4,
      migrate: (persisted, version) => {
        if (version < 2) {
          return { ...persisted, knownExternalServices: [] };
        }
        if (version < 4) {
          // Update apacheVersions list to the new canonical list from ApacheLounge
          // Preserve user's installed/active state for existing versions
          const CANONICAL_APACHE = [
            { version: '2.4.66', vsRuntime: 'VS18', label: 'Latest', downloadUrl: 'https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.66-260223-Win64-VS18.zip' },
            // Additional / older - from https://www.apachelounge.com/download/additional/
            { version: '2.4.57', vsRuntime: 'VS16', label: 'Last VS16', downloadUrl: 'https://www.apachelounge.com/download/VS16/binaries/httpd-2.4.57-win64-VS16.zip' },
            { version: '2.4.54', vsRuntime: 'VC15', label: 'Last VC15', downloadUrl: 'https://www.apachelounge.com/download/VC15/binaries/httpd-2.4.54-win64-VC15.zip' },
            { version: '2.4.41', vsRuntime: 'VC14', label: 'Last VC14', downloadUrl: 'https://www.apachelounge.com/download/VC14/binaries/httpd-2.4.41-win64-VC14.zip' },
            { version: '2.4.38', vsRuntime: 'VC11', label: 'Last VC11', downloadUrl: 'https://www.apachelounge.com/download/VC11/binaries/httpd-2.4.38-win64-VC11.zip' },
            { version: '2.4.23', vsRuntime: 'VC10', label: 'Last VC10 (XP/2003)', downloadUrl: 'https://www.apachelounge.com/download/VC10/binaries/httpd-2.4.23-win32-VC10.zip' },
          ];
          const oldList = persisted.apacheVersions || [];
          const merged = CANONICAL_APACHE.map(canonical => {
            const existing = oldList.find(v => v.version === canonical.version);
            return {
              ...canonical,
              installed: existing?.installed || false,
              active: existing?.active || false,
              installing: false,
              progress: 0,
            };
          });
          return { ...persisted, apacheVersions: merged };
        }
        return persisted;
      },
      partialize: (state) => ({
        locale: state.locale,
        settings: state.settings,
        configFiles: state.configFiles,
        extensions: state.extensions,
        tunnelInstalled: state.tunnelInstalled,
        selectedPhpVersion: state.selectedPhpVersion,
        selectedApacheVersion: state.selectedApacheVersion,
        selectedMysqlVersion: state.selectedMysqlVersion,
        // Persist version arrays (strip transient props)
        apacheVersions: state.apacheVersions.map(v => ({
          version: v.version, installed: v.installed, active: v.active,
          installing: false, progress: 0, downloadUrl: v.downloadUrl,
          vsRuntime: v.vsRuntime, label: v.label,
        })),
        phpVersions: state.phpVersions.filter(p => !p.isSystem).map(p => ({
          version: p.version, installed: p.installed, active: p.active,
          installing: false, progress: 0, folderName: p.folderName,
        })),
        mysqlVersions: state.mysqlVersions.map(v => ({
          version: v.version, installed: v.installed, active: v.active,
          installing: false, progress: 0
        })),
        knownExternalServices: state.knownExternalServices,
      }),
    }
  )
);
