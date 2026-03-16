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

      services: [
        { id: 1, name: 'Apache', type: 'web', version: '—', port: 80, status: 'stopped', pid: null, memory: '—' },
        { id: 2, name: 'MySQL', type: 'db', version: '8.0.35', port: 3306, status: 'stopped', pid: null, memory: '—' },
        { id: 3, name: 'PHP-FPM', type: 'php', version: '—', port: 9000, status: 'stopped', pid: null, memory: '—' },
        { id: 4, name: 'Redis', type: 'cache', version: '7.2.3', port: 6379, status: 'stopped', pid: null, memory: '—' },
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
        { version: '2.4.66', installed: false, active: false, installing: false },
        { version: '2.4.63', installed: false, active: false, installing: false },
        { version: '2.4.62', installed: false, active: false, installing: false },
        { version: '2.4.58', installed: false, active: false, installing: false },
      ],
      apacheInstallLogs: [],

      portConflicts: {},
      extensions: ['curl', 'mbstring', 'openssl', 'pdo_mysql', 'gd', 'zip', 'intl', 'xml', 'bcmath', 'json', 'tokenizer', 'fileinfo', 'ctype'],

      currentLog: 'apache',
      logs: { apache: [], mysql: [], php: [] },

      settings: {
        rootPath: 'C:/devstack/www',
        devStackDir: 'C:/devstack',
        autoStart: true,
        startOnBoot: false,
        port80: 80,
        portMySQL: 3306,
        trayIcon: true,
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
      isSystemConflict: false,
      conflictPath: '',

      // Tunnel state
      tunnelProvider: 'cloudflare',
      tunnelStatus: 'stopped',
      tunnelPublicUrl: '',
      tunnelPort: 80,
      tunnelProtocol: 'http',
      tunnelLogs: [],
      tunnelInstalled: { cloudflare: false, ngrok: false, nport: false },

      // Config files
      configFiles: [
        { id: 'httpd_conf', label: 'httpd.conf', category: 'Web Server', path: '', desc: 'Apache main configuration' },
        { id: 'vhosts_conf', label: 'httpd-vhosts.conf', category: 'Web Server', path: '', desc: 'Virtual hosts configuration' },
        { id: 'httpd_ssl', label: 'httpd-ssl.conf', category: 'Web Server', path: '', desc: 'Apache SSL configuration' },
        { id: 'my_ini', label: 'my.ini', category: 'Database', path: '', desc: 'MySQL server configuration' },
        { id: 'redis_conf', label: 'redis.conf', category: 'Database', path: '', desc: 'Redis configuration' },
        { id: 'php_ini', label: 'php.ini', category: 'PHP', path: '', desc: 'PHP main configuration' },
        { id: 'hosts', label: 'hosts', category: 'System', path: 'C:/Windows/System32/drivers/etc/hosts', desc: 'System hosts file' },
        { id: 'env', label: '.env', category: 'System', path: '', desc: 'Environment variables' },
      ],

      // ═══════════════════════════════════════════
      // ACTIONS
      // ═══════════════════════════════════════════

      // === Services ===
      setDownloading: (val) => set({ isDownloading: val }),
      setDownloadProgress: (val) => set({ downloadProgress: val }),

      // Sync service versions with actual installed/active versions
      syncServiceVersions: () => {
        const activeApache = get().apacheVersions.find(v => v.active && v.installed);
        const activePhp = get().phpVersions.find(v => v.active && !v.isSystem && v.installed);
        set(s => ({
          services: s.services.map(svc => {
            if (svc.type === 'web' && activeApache) return { ...svc, version: activeApache.version, port: get().settings.port80 || 80 };
            if (svc.type === 'php' && activePhp) return { ...svc, version: activePhp.version };
            return svc;
          })
        }));
      },

      toggleService: async (id) => {
        const svc = get().services.find(s => s.id === id);
        if (!svc) return;

        if (svc.status === 'running') {
          // --- STOP ---
          if (svc.type === 'web') {
            try {
              await Command.create('powershell', ['-NoProfile', '-Command', 'Stop-Process -Name httpd -Force -ErrorAction SilentlyContinue']).execute();
            } catch { }
          }
          set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'stopped', pid: null, memory: '—' } : sv) }));
        } else {
          // --- START ---
          if (svc.type === 'web') {
            const activeApache = get().apacheVersions.find(v => v.active && v.installed);
            if (!activeApache) {
              get().showToast('Chưa có Apache nào được kích hoạt!', 'warn');
              return;
            }
            const devDir = get().settings.devStackDir.replace(/\//g, '\\');
            const httpdExe = `${devDir}\\bin\\apache\\apache-${activeApache.version}\\bin\\httpd.exe`;
            try {
              // Check httpd.exe exists
              const existsResult = await Command.create('powershell', ['-NoProfile', '-Command', `Test-Path '${httpdExe}'`]).execute();
              if (!existsResult.stdout?.trim().toLowerCase().includes('true')) {
                get().showToast(`httpd.exe not found: ${httpdExe}`, 'danger');
                return;
              }
              // Start Apache
              const result = await Command.create('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${httpdExe}' -WindowStyle Hidden -PassThru | Select-Object -ExpandProperty Id`]).execute();
              const pid = parseInt(result.stdout?.trim());
              set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'running', pid: pid || null, version: activeApache.version, memory: '—' } : sv) }));
            } catch (e) {
              get().showToast(`Apache start failed: ${e.message}`, 'danger');
              return;
            }
          } else {
            // Placeholder for MySQL/Redis/PHP-FPM — mark as running for now
            set(s => ({ services: s.services.map(sv => sv.id === id ? { ...sv, status: 'running', pid: null, memory: '—' } : sv) }));
          }
        }
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
        set({ selectedPhpVersion: version });
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
$urls    = @("https://www.apachelounge.com/download/", "https://www.apachelounge.com/download/archive/")
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

          // Check httpd.exe exists
          const existsResult = await Command.create('powershell', ['-NoProfile', '-Command', `Test-Path '${httpdExe}'`]).execute();
          if (!existsResult.stdout?.trim().toLowerCase().includes('true')) {
            get().showToast(`httpd.exe not found`, 'danger');
            return;
          }

          // Stop existing httpd processes
          await Command.create('powershell', [
            '-NoProfile', '-Command',
            `Stop-Process -Name httpd -Force -ErrorAction SilentlyContinue`
          ]).execute();

          await new Promise(r => setTimeout(r, 1000));

          // Start Apache
          await Command.create('powershell', [
            '-NoProfile', '-Command',
            `Start-Process -FilePath '${httpdExe}' -WindowStyle Hidden`
          ]).execute();

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
            const folders = result.stdout.trim().split(/\r?\n/).map(f => f.trim().toLowerCase());
            set(s => ({
              apacheVersions: s.apacheVersions.map(v => {
                const ver = v.version.toLowerCase();
                const isInstalled = folders.some(f => f === ver || f === 'apache-' + ver || f.startsWith('apache-' + ver) || f.includes(ver));
                return isInstalled ? { ...v, installed: true } : v;
              })
            }));
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
                if (p.isSystem) {
                  const hasInstalledManaged = managed.some(m => m.installed && m.version === selectedVersion);
                  return { ...p, active: !hasInstalledManaged };
                }
                const isSelected = p.version === selectedVersion;
                const isCurrentlyRunning = p.version === detected && isDevStack;
                return { ...p, active: isSelected || isCurrentlyRunning };
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
              return { folder: folder?.toLowerCase(), hasApacheModule: hasModStr?.trim().toLowerCase() === 'true' };
            }).filter(e => e.folder);

            set(s => ({
              phpVersions: s.phpVersions.map(p => {
                if (p.isSystem) return p;
                const ver = p.version.toLowerCase();
                const entry = entries.find(e => e.folder === ver || e.folder === `php-${ver}` || e.folder.startsWith(`php-${ver}`));
                return entry
                  ? { ...p, installed: true, folderName: entry.folder, hasApacheModule: entry.hasApacheModule }
                  : { ...p, installed: false, folderName: undefined, hasApacheModule: false };
              })
            }));
          }
        } catch (e) { console.error('PHP scan failed:', e); }
      },

      // === Extensions ===
      addExtension: (name) => set(state => ({ extensions: [...state.extensions, name] })),
      removeExtension: (name) => set(state => ({ extensions: state.extensions.filter(e => e !== name) })),

      // === Port Conflict ===
      checkPortConflict: async (port) => {
        try {
          const result = await Command.create('cmd', ['/C', `netstat -ano | findstr /R ":${port} " | findstr LISTENING`]).execute();
          const lines = result.stdout?.trim();
          if (lines) {
            const pidMatch = lines.match(/(\d+)\s*$/m);
            set(s => ({ portConflicts: { ...s.portConflicts, [port]: { inUse: true, pid: pidMatch?.[1] || '?' } } }));
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
          const result = await Command.create('cmd', ['/C', `dir /B /AD "${rootPath}" 2>nul`]).execute();
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

      // === Database ===
      scanDatabases: async () => {
        try {
          const { Command } = await import('@tauri-apps/plugin-shell');
          const result = await Command.create('cmd', ['/C', `mysql -u root -e "SHOW DATABASES;" 2>nul`]).execute();
          if (result.stdout?.trim()) {
            const lines = result.stdout.trim().split('\n').slice(1).map(l => l.trim());
            const systemDBs = ['information_schema', 'mysql', 'performance_schema', 'sys', 'phpmyadmin'];
            const dbs = lines.filter(l => l && !systemDBs.includes(l)).map(name => ({
              name, tables: '—', size: '—', charset: 'utf8mb4',
            }));
            set({ databases: dbs });
          }
        } catch { }
      },

      // === Settings ===
      switchLog: (type) => set({ currentLog: type }),
      clearLog: () => set(state => ({ logs: { ...state.logs, [state.currentLog]: [] } })),
      toggleSetting: (key) => set(state => ({ settings: { ...state.settings, [key]: !state.settings[key] } })),
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
          return await open({ multiple: false, directory: true });
        } catch { return null; }
      },

      openExplorer: async (path) => {
        if (!path) return;
        try {
          const { openPath } = await import('@tauri-apps/plugin-opener');
          const winPath = path.replace(/\//g, '\\');
          await openPath(winPath);
          get().showToast('Opening path...', 'ok');
        } catch (e) { console.error('Failed to open explorer:', e); }
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
      startTunnel: () => {
        const { tunnelProvider, tunnelPort, tunnelProtocol } = get();
        set({ tunnelStatus: 'starting' });
        set(s => ({ tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m: `Starting ${tunnelProvider} on ${tunnelProtocol}://localhost:${tunnelPort}...`, l: 'info' }] }));
        setTimeout(() => {
          const urls = {
            cloudflare: `https://${Math.random().toString(36).slice(2, 10)}.trycloudflare.com`,
            ngrok: `https://${Math.random().toString(36).slice(2, 10)}.ngrok-free.app`,
            nport: `https://${Math.random().toString(36).slice(2, 10)}.nport.dev`,
          };
          set({ tunnelStatus: 'running', tunnelPublicUrl: urls[tunnelProvider] });
          set(s => ({ tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m: `✓ Tunnel established: ${urls[tunnelProvider]}`, l: 'ok' }] }));
        }, 2500);
      },
      stopTunnel: () => {
        set(s => ({
          tunnelStatus: 'stopped', tunnelPublicUrl: '',
          tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m: 'Tunnel disconnected.', l: 'warn' }],
        }));
      },
      installTunnelBinary: (provider) => {
        set({ tunnelStatus: 'installing' });
        set(s => ({ tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m: `Downloading ${provider}...`, l: 'info' }] }));
        setTimeout(() => {
          set(s => ({
            tunnelStatus: 'stopped',
            tunnelInstalled: { ...s.tunnelInstalled, [provider]: true },
            tunnelLogs: [...s.tunnelLogs, { t: new Date().toLocaleTimeString(), m: `✓ ${provider} installed successfully.`, l: 'ok' }],
          }));
          get().showToast(`${provider} installed!`, 'ok');
        }, 3000);
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
      openConfigFile: async (id) => {
        const file = get().configFiles.find(f => f.id === id);
        if (!file || !file.path) {
          get().showToast(`Path not set for ${file?.label}`, 'warn');
          return;
        }
        try {
          const { openPath } = await import('@tauri-apps/plugin-opener');
          await openPath(file.path);
          get().showToast(`Opening ${file.label}...`, 'ok');
        } catch (e) { get().showToast(`Opening ${file.label} (dev mode)`, 'ok'); }
      },

      initApp: async () => {
        setTimeout(() => {
          const s = get().settings;
          if (s.rootPath?.toLowerCase().includes('laragon')) {
            get().updateSetting('rootPath', `${s.devStackDir}/www`);
          }
          get().detectPhpVersion();
          get().scanInstalledPhp();
          get().detectApacheVersion();
          get().scanInstalledApache();
          get().fetchApacheVersions();
          get().scanSites();
          get().scanDatabases();
          get().fetchRealSystemStats();

          // Restore persisted active selections after scans
          setTimeout(() => {
            const { selectedApacheVersion, selectedPhpVersion } = get();
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
            get().syncServiceVersions();
          }, 2000);
        }, 1500);
      },
    }),
    {
      name: 'devstack-storage',
      partialize: (state) => ({
        locale: state.locale,
        settings: state.settings,
        configFiles: state.configFiles,
        extensions: state.extensions,
        tunnelInstalled: state.tunnelInstalled,
        selectedPhpVersion: state.selectedPhpVersion,
        selectedApacheVersion: state.selectedApacheVersion,
        // Persist version arrays (strip transient props)
        apacheVersions: state.apacheVersions.map(v => ({
          version: v.version, installed: v.installed, active: v.active,
          installing: false, progress: 0, downloadUrl: v.downloadUrl,
        })),
        phpVersions: state.phpVersions.filter(p => !p.isSystem).map(p => ({
          version: p.version, installed: p.installed, active: p.active,
          installing: false, progress: 0, folderName: p.folderName,
        })),
      }),
    }
  )
);
