import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Check, Download, Loader, Terminal, Search, Plus, X, Trash2, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';

// Popular PHP extensions catalog for suggestions
const EXT_CATALOG = [
  'apcu', 'bcmath', 'bz2', 'calendar', 'ctype', 'curl', 'dba', 'dom', 'enchant',
  'exif', 'ffi', 'fileinfo', 'filter', 'ftp', 'gd', 'gettext', 'gmp', 'iconv',
  'igbinary', 'imagick', 'imap', 'intl', 'json', 'ldap', 'mbstring', 'memcached',
  'mongodb', 'msgpack', 'mysqli', 'mysqlnd', 'oauth', 'oci8', 'odbc', 'opcache',
  'openssl', 'pcntl', 'pcov', 'pdo', 'pdo_mysql', 'pdo_pgsql', 'pdo_sqlite',
  'pgsql', 'phar', 'posix', 'protobuf', 'pspell', 'readline', 'redis', 'session',
  'shmop', 'simplexml', 'soap', 'sockets', 'sodium', 'sqlite3', 'ssh2', 'swoole',
  'sysvmsg', 'sysvsem', 'sysvshm', 'tidy', 'tokenizer', 'uuid', 'xdebug', 'xml',
  'xmlreader', 'xmlrpc', 'xmlwriter', 'xsl', 'yaml', 'zip', 'zlib',
];

const PagePHP = () => {
  const {
    phpVersions, extensions, setActivePhp, addExtension, removeExtension,
    showToast, detectedPhpVersion, detectPhpVersion, installPhpVersion,
    scanInstalledPhp, uninstallPhpVersion, phpInstallLogs, settings, t,
    isSystemConflict, activatingPhp, installCustomPhp, syncExtensionsFromActivePhp,
    fetchPhpVersions
  } = useStore();

  const [extSearch, setExtSearch] = useState('');
  const [showExtPicker, setShowExtPicker] = useState(false);
  const [showCustomInstall, setShowCustomInstall] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const logEndRef = React.useRef(null);

  useEffect(() => {
    detectPhpVersion();
    scanInstalledPhp();
    syncExtensionsFromActivePhp();
  }, []);
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [phpInstallLogs]);

  // Filter suggestions: not yet installed, matches search
  const suggestions = EXT_CATALOG.filter(e =>
    !extensions.includes(e) && e.toLowerCase().includes(extSearch.toLowerCase())
  ).slice(0, 12);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/40 shadow-sm bg-bg flex items-center gap-4 z-10 relative">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('phpTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('phpDesc')}</p>
        </div>
        <div
          className="flex items-center gap-2 bg-surface border border-border/50 shadow-liquid rounded-2xl px-4 py-2.5 transition-all duration-300 ease-liquid"
        >
          <Terminal size={14} className="text-accent" />
          <div>
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">{t('currentPhp')}</div>
            <div className="text-[14px] font-bold font-mono text-accent">
              {detectedPhpVersion || t('notDetected')}
            </div>
          </div>
        </div>
        <button
          className="btn-primary flex items-center gap-2 px-4 py-2 text-[12px] h-[42px]"
          onClick={() => setShowCustomInstall(!showCustomInstall)}
        >
          <Plus size={16} /> {t('installByTag')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* Warning for external PHP override */}
        {phpVersions.find(p => p.active && p.isSystem) && (
          <div className="bg-red-500/10 border border-red-500/20 shadow-[0_8px_24px_rgba(255,77,109,0.1)] rounded-[24px] p-5 flex items-start gap-4 animate-in">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isSystemConflict ? 'bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-red-500/20'}`}>
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-bold text-red-500 flex items-center gap-2">
                {t('phpConflictTitle')}
                {isSystemConflict && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">{t('systemLevel')}</span>}
              </div>
              <div className="text-[12px] text-red-400 mt-1 leading-relaxed">
                {isSystemConflict ? t('phpConflictSystemDesc') : t('phpConflictDesc', { path: phpVersions.find(p => p.active && p.isSystem)?.path })}
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  className={`text-white text-[11px] font-bold px-4 py-2 rounded-lg transition-all active:scale-95 flex items-center gap-2 shadow-lg
                    ${isSystemConflict ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20' : 'bg-red-500 hover:bg-red-600 shadow-red-500/10'}
                  `}
                  onClick={() => useStore.getState().fixPhpConflict(isSystemConflict)}
                >
                  {isSystemConflict ? <ShieldAlert size={14} /> : '⚡'}
                  {isSystemConflict ? t('fixGlobal') : t('fixNow')}
                </button>
                <div className="text-[11px] text-muted font-mono italic opacity-80">
                  💡 {t('phpConflictFix')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Install Form */}
        {showCustomInstall && (
          <div className="bg-surface border border-accent/30 shadow-glow rounded-[28px] p-6 animate-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[14px] font-bold flex items-center gap-2">
                <Download size={16} className="text-accent" /> {t('installPhpCustomVersion')}
              </h3>
              <button onClick={() => setShowCustomInstall(false)} className="text-muted hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  className="input-field w-full text-[13px] py-2"
                  placeholder={t('customVersionExample')}
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                />
                <div className="text-[10px] text-muted mt-2 font-mono">
                  {t('customVersionPattern')}
                </div>
              </div>
              <button
                className="btn-primary px-6 h-[38px] flex items-center gap-2 disabled:opacity-50"
                disabled={!customTag.trim()}
                onClick={async () => {
                  const tag = customTag.trim();
                  if (!tag) return;

                  // 1. Try to find the version in our freshly scraped list (highly accurate)
                  const matched = phpVersions.find(p => p.version === tag);

                  let url = "";

                  if (matched?.downloadUrl) {
                    url = matched.downloadUrl;
                  } else {
                    // 2. Pattern fallback if not found in scraper
                    const parts = tag.split('.');
                    const major = parseInt(parts[0]);
                    const minor = parseInt(parts[1]);
                    const isNts = false; // Prioritize TS for Apache compatibility
                    const ntsSuffix = isNts ? "-nts" : "";

                    if (major === 8 && minor >= 3) {
                      url = `https://windows.php.net/downloads/releases/php-${tag}${ntsSuffix}-Win32-${major === 8 && minor === 4 ? 'vs17' : 'vs16'}-x64.zip`;
                    } else {
                      url = `https://downloads.php.net/~windows/releases/archives/php-${tag}${ntsSuffix}-Win32-vs16-x64.zip`;
                      if (major === 7) url = `https://downloads.php.net/~windows/releases/archives/php-${tag}${ntsSuffix}-Win32-vc15-x64.zip`;
                    }
                  }

                  await installCustomPhp(tag, url);
                  setShowCustomInstall(false);
                  setCustomTag('');
                }}
              >
                {t('installNow')}
              </button>
            </div>
          </div>
        )}

        {/* PHP Versions Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">{t('phpVersionsTitle')}</div>
              <div
                className="text-[10px] text-muted font-mono mt-0.5 cursor-pointer hover:text-accent transition-colors flex items-center gap-1"
                onClick={() => useStore.getState().openExplorer(`${settings.devStackDir}/bin/php/`)}
                title={t('openInExplorer')}
              >
                📁 {settings.devStackDir}/bin/php/
              </div>
            </div>
            <button className="btn-ghost text-[11px] flex items-center gap-1.5" onClick={async () => {
              showToast(t('updatingPhpList'), 'info');
              await fetchPhpVersions();
              await Promise.all([detectPhpVersion(), scanInstalledPhp()]);
              showToast(t('phpListRefreshed'), 'ok');
            }}>
              <RefreshCw size={11} /> {t('refresh')}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {phpVersions.map(p => {
              const isActuallyActive = p.active && p.installed;
              const isActivating = activatingPhp === p.version;

              return (
                <div
                  key={`${p.version}-${p.isSystem}`}
                  className={`relative bg-surface border rounded-[28px] p-5 transition-all duration-300 ease-liquid group overflow-hidden
                    ${isActuallyActive ? 'border-accent/40 shadow-glow' : 'border-border/40 shadow-liquid hover:shadow-liquid-hover hover:-translate-y-1 hover:border-border'}
                    ${isActivating ? 'border-amber-500/50 bg-amber-500/5 animate-pulse' : ''}
                  `}
                >

                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                      <div className="text-[16px] font-bold font-mono tracking-tight flex items-center gap-2">
                        PHP {p.version}
                        {p.isSystem && <span className="text-[9px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20">{t('systemLevel')}</span>}
                      </div>
                      <div className="text-[10px] text-muted font-mono mt-0.5 uppercase tracking-wider">
                        {p.threadSafe ? t('tsThreadSafe') : t('ntsNonThreadSafe')}
                      </div>
                    </div>

                    {isActuallyActive ? (
                      <div className="tag tag-active flex items-center gap-1.5 px-2 py-1 pulse">
                        <Check size={10} /> {p.isSystem ? t('systemActive') : t('active')}
                      </div>
                    ) : p.installed ? (
                      <div className="tag tag-version px-2 py-0.5 text-[10px] uppercase font-bold">{t('installed')}</div>
                    ) : (
                      <div className="text-[10px] text-muted font-bold opacity-50 tracking-widest uppercase">{t('available')}</div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4 pt-3 border-t border-border/50">
                    {!p.installed ? (
                      <button
                        className={`relative btn-ghost text-[11px] w-full py-1.5 flex items-center justify-center gap-1.5 overflow-hidden ${p.installing ? 'cursor-not-allowed opacity-80' : ''}`}
                        onClick={() => {
                          console.log(`[UI] Install clicked for PHP ${p.version}`);
                          installPhpVersion(p.version);
                        }}
                        disabled={p.installing}
                      >
                        {p.installing ? (
                          <>
                            <div
                              className="absolute inset-x-0 bottom-0 bg-accent/20 transition-all duration-300"
                              style={{ height: '100%', width: `${p.progress || 0}%` }}
                            />
                            <span className="relative z-10 flex items-center gap-2 font-bold">
                              <Loader size={12} className="animate-spin" />
                              {p.progress ? `${p.progress}%` : '...'}
                            </span>
                          </>
                        ) : (
                          <><Download size={13} /> {t('install')}</>
                        )}
                      </button>
                    ) : p.isSystem ? (
                      <div className="flex-1 text-[11px] text-red-400 font-mono italic opacity-70 px-1 py-1">
                        ⚠ {t('phpConflictDesc', { path: 'XAMPP' }).split('.')[0]}
                      </div>
                    ) : (
                      <>
                        <button
                          disabled={isActuallyActive || isActivating}
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all active:scale-95 border
                            ${isActuallyActive
                              ? 'bg-accent/5 text-accent border-accent/30 cursor-default'
                              : isActivating
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 cursor-wait'
                                : 'bg-transparent text-textDim border-border hover:border-accent hover:text-accent hover:bg-accent/5'
                            }
                          `}
                          onClick={() => setActivePhp(p.version)}
                        >
                          {isActuallyActive ? t('active') : isActivating ? <Loader size={14} className="animate-spin mx-auto" /> : t('setActive')}
                        </button>
                        <button
                          className={`btn-ghost px-2.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all
                            ${isActuallyActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}
                          `}
                          title={isActuallyActive ? t('uninstallDeactivateFirst') : t('uninstall')}
                          onClick={async () => {
                            const msg = isActuallyActive
                              ? t('phpActiveUninstallConfirm', { version: p.version })
                              : t('uninstallPhpConfirm', { version: p.version });
                            const confirmed = await ask(msg, {
                              title: 'DevStack',
                              kind: 'warning',
                              okLabel: t('uninstallLabel'),
                              cancelLabel: t('cancel')
                            });
                            if (confirmed) uninstallPhpVersion(p.version);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>

                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Installation Terminal Log */}
          {phpInstallLogs.length > 0 && (
            <div className="mt-4 bg-[#0a0c10] border border-border/50 rounded-[28px] overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
              <div className="px-5 py-3 border-b border-border/50 bg-surface flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/20 shadow-inner" />
                    <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-black/20 shadow-inner" />
                    <div className="w-3 h-3 rounded-full bg-[#28c840] border border-black/20 shadow-inner" />
                  </div>
                  <span className="text-[11px] font-bold text-muted uppercase tracking-wider ml-2">{t('installationOutput')}</span>
                </div>
                <button
                  className="text-[10px] text-muted hover:text-textDim uppercase font-bold"
                  onClick={() => useStore.setState({ phpInstallLogs: [] })}
                >
                  {t('clearLog')}
                </button>
              </div>

              {/* Progress bar riêng — chỉ hiện khi đang download */}
              {(() => {
                const installing = phpVersions.find(p => p.installing);
                const { pct, downloaded, total } = useStore.getState().phpInstallProgress;
                if (!installing || pct === 0 || pct === 100) return null;
                return (
                  <div className="px-4 py-3 border-b border-border bg-[#0d0f14]">
                    <div className="flex justify-between text-[11px] font-mono mb-1.5">
                      <span className="text-accent font-bold animate-pulse">{t('downloading')}</span>
                      <span className="text-muted">
                        {downloaded} MB {total > 0 ? `/ ${total} MB` : '/ ? MB'}
                      </span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-accent transition-all duration-300 rounded-full ${total === 0 ? 'animate-pulse' : ''}`}
                        style={{ width: `${pct || 5}%` }}
                      />
                    </div>
                    <div className="text-right text-[10px] text-muted mt-1">
                      {total > 0 ? `${pct}%` : t('mbDownloaded', { downloaded })}
                    </div>
                  </div>
                );
              })()}

              <div className="p-3 h-[160px] overflow-y-auto font-mono text-[11px] leading-relaxed scrollbar-thin">
                {phpInstallLogs.map((log, i) => (
                  <div key={i} className="flex gap-3 mb-1">
                    <span className="text-muted/50 select-none whitespace-nowrap">[{log.t}]</span>
                    <span className={`break-all ${log.l === 'ok' ? 'text-accent' :
                      log.l === 'err' ? 'text-danger' :
                        log.l === 'warn' ? 'text-warn' : 'text-textDim'
                      }`}>
                      {log.m}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Extensions Manager */}
        <div className="bg-surface border border-border/40 shadow-liquid rounded-[32px] p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[13px] font-bold uppercase tracking-wider">{t('installedExtensions')}</div>
              <div className="text-[11px] text-muted mt-0.5">{t('extensionsLoaded', { count: extensions.length })}</div>
            </div>

            <div className="relative">
              <button
                className="btn-primary flex items-center gap-2 px-4 py-2 text-[12px]"
                onClick={() => setShowExtPicker(!showExtPicker)}
              >
                <Plus size={16} /> {t('addExtension')}
              </button>

              {showExtPicker && (
                <div className="absolute top-full right-0 mt-3 w-[300px] bg-bg border border-border/50 rounded-[28px] shadow-liquid-hover z-50 overflow-hidden animate-in">
                  <div className="p-4 border-b border-border/50 bg-surface/50">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                      <input
                        autoFocus
                        className="input-field pl-9 w-full text-[13px]"
                        placeholder={t('searchExtensions')}
                        value={extSearch}
                        onChange={(e) => setExtSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-2 grid grid-cols-2 gap-1">
                    {suggestions.length > 0 ? suggestions.map(ext => (
                      <button
                        key={ext}
                        className="text-left px-3 py-2 rounded-xl hover:bg-accent/10 hover:text-accent text-[12px] font-medium transition-all duration-200 ease-liquid border border-transparent hover:border-accent/20"
                        onClick={() => {
                          addExtension(ext);
                          showToast(t('extensionAdded', { ext }), 'ok');
                          setExtSearch('');
                          setShowExtPicker(false);
                        }}
                      >
                        {ext}
                      </button>
                    )) : (
                      <div className="col-span-2 py-8 text-center text-muted text-[12px]">{t('noMatchesFound')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {extensions.map(ext => (
              <div
                key={ext}
                className="group flex items-center gap-2 bg-[#101217] border border-border/60 shadow-inner rounded-xl px-3 py-1.5 transition-all duration-300 ease-liquid hover:border-border hover:shadow-liquid hover:-translate-y-[1px]"
              >
                <span className="text-[12px] font-mono text-textDim">{ext}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all"
                  onClick={() => removeExtension(ext)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PagePHP;
