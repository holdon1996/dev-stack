import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Check, Download, Loader, Terminal, Search, Plus, X, Trash2, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';

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
    isSystemConflict, selectedPhpVersion
  } = useStore();

  const [extSearch, setExtSearch] = useState('');
  const [showExtPicker, setShowExtPicker] = useState(false);
  const logEndRef = React.useRef(null);

  useEffect(() => {
    detectPhpVersion();
    scanInstalledPhp();
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
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center gap-4">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('phpTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('phpDesc')}</p>
        </div>
        <div
          className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 cursor-pointer hover:bg-surface/80 transition-colors"
          onClick={() => useStore.getState().openTerminal()}
          title="Open DevStack Terminal"
        >
          <Terminal size={14} className="text-accent" />
          <div>
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">{t('currentPhp')}</div>
            <div className="text-[14px] font-bold font-mono text-accent">
              {detectedPhpVersion || t('notDetected')}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* Warning for external PHP override */}
        {phpVersions.find(p => p.active && p.isSystem) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isSystemConflict ? 'bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-red-500/20'}`}>
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-bold text-red-500 flex items-center gap-2">
                {t('phpConflictTitle')}
                {isSystemConflict && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">System Level</span>}
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

        {/* PHP Versions Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">PHP Versions</div>
              <div
                className="text-[10px] text-muted font-mono mt-0.5 cursor-pointer hover:text-accent transition-colors flex items-center gap-1"
                onClick={() => useStore.getState().openExplorer(`${settings.devStackDir}/bin/php/`)}
                title="Open in Explorer"
              >
                📁 {settings.devStackDir}/bin/php/
              </div>
            </div>
            <button className="btn-ghost text-[11px] flex items-center gap-1.5" onClick={() => { detectPhpVersion(); scanInstalledPhp(); }}>
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {phpVersions.map(p => {
              const isSelected = p.version === selectedPhpVersion && !p.isSystem;
              const isActuallyActive = p.active;
              const isBlocked = isSelected && !isActuallyActive;
              const isSystemOverride = p.isSystem && isActuallyActive;

              return (
                <div
                  key={`${p.version}-${p.isSystem}`}
                  className={`relative bg-surface border rounded-xl p-4 transition-all duration-300 group overflow-hidden
                    ${isActuallyActive ? 'border-accent shadow-[0_0_20px_rgba(34,211,238,0.15)] ring-1 ring-accent/30' : 'border-border hover:border-[#3d4049]'}
                    ${isBlocked ? 'border-amber-500/50 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.1)]' : ''}
                  `}
                >

                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                      <div className="text-[16px] font-bold font-mono tracking-tight flex items-center gap-2">
                        PHP {p.version}
                        {p.isSystem && <span className="text-[9px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20">SYSTEM</span>}
                      </div>
                      <div className="text-[10px] text-muted font-mono mt-0.5 uppercase tracking-wider">
                        {p.threadSafe ? 'TS (Thread Safe)' : 'NTS (Non-Thread Safe)'}
                      </div>
                    </div>

                    {isActuallyActive ? (
                      <div className="tag tag-active flex items-center gap-1.5 px-2 py-1 pulse">
                        <Check size={10} /> {p.isSystem ? t('systemActive') : t('active')}
                      </div>
                    ) : isBlocked ? (
                      <div className="tag bg-amber-500/20 text-amber-500 border-amber-500/30 flex items-center gap-1.5 px-2 py-1">
                        <Loader size={10} className="animate-spin" /> {t('waitActivation')}
                      </div>
                    ) : p.installed ? (
                      <div className="tag tag-version px-2 py-0.5 text-[10px] uppercase font-bold">{t('installed')}</div>
                    ) : (
                      <div className="text-[10px] text-muted font-bold opacity-50 tracking-widest uppercase">Available</div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4 pt-3 border-t border-border/50">
                    {!p.installed ? (
                      <button
                        className={`relative btn-ghost text-[11px] w-full py-1.5 flex items-center justify-center gap-1.5 overflow-hidden ${p.installing ? 'cursor-not-allowed opacity-80' : ''}`}
                        onClick={() => installPhpVersion(p.version)}
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
                          disabled={isActuallyActive}
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all active:scale-95
                            ${isActuallyActive
                              ? 'bg-accent/10 text-accent border border-accent/20 cursor-default'
                              : isBlocked
                                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                                : 'bg-accent text-white hover:bg-accent-light shadow-lg shadow-accent/20'
                            }
                          `}
                          onClick={() => setActivePhp(p.version)}
                        >
                          {isActuallyActive ? t('active') : t('setActive')}
                        </button>
                        <button
                          className={`btn-ghost px-2.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all
                            ${isActuallyActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}
                          `}
                          title={isActuallyActive ? 'Uninstall (will deactivate first)' : 'Uninstall'}
                          onClick={() => {
                            const msg = isActuallyActive
                              ? `PHP ${p.version} đang được kích hoạt!\nUninstall sẽ tắt active và xóa folder.\nBạn có chắc không?`
                              : `Uninstall PHP ${p.version}?`;
                            if (confirm(msg)) uninstallPhpVersion(p.version);
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
            <div className="mt-4 bg-[#0a0c10] border border-border rounded-xl overflow-hidden shadow-2xl">
              <div className="px-4 py-2 border-b border-border bg-[#13151a] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider ml-1">Installation Output</span>
                </div>
                <button
                  className="text-[10px] text-muted hover:text-textDim uppercase font-bold"
                  onClick={() => useStore.setState({ phpInstallLogs: [] })}
                >
                  Clear Log
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
                      <span className="text-accent font-bold">Downloading...</span>
                      <span className="text-muted">{downloaded} MB / {total} MB</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-300 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-right text-[10px] text-muted mt-1">{pct}%</div>
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
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[13px] font-bold uppercase tracking-wider">{t('installedExtensions')}</div>
              <div className="text-[11px] text-muted mt-0.5">{extensions.length} extensions loaded</div>
            </div>

            <div className="relative">
              <button
                className="btn-primary flex items-center gap-2 px-4 py-2 text-[12px]"
                onClick={() => setShowExtPicker(!showExtPicker)}
              >
                <Plus size={16} /> {t('addExtension')}
              </button>

              {showExtPicker && (
                <div className="absolute top-full right-0 mt-2 w-[300px] bg-bg border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-border bg-surface/50">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                      <input
                        autoFocus
                        className="input-field pl-9 w-full text-[13px]"
                        placeholder="Search extensions..."
                        value={extSearch}
                        onChange={(e) => setExtSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto p-2 grid grid-cols-2 gap-1">
                    {suggestions.length > 0 ? suggestions.map(ext => (
                      <button
                        key={ext}
                        className="text-left px-3 py-2 rounded-lg hover:bg-accent/10 hover:text-accent text-[12px] font-medium transition-colors border border-transparent hover:border-accent/20"
                        onClick={() => {
                          addExtension(ext);
                          setExtSearch('');
                        }}
                      >
                        {ext}
                      </button>
                    )) : (
                      <div className="col-span-2 py-8 text-center text-muted text-[12px]">No matches found</div>
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
                className="group flex items-center gap-2 bg-[#13151a] border border-border rounded-lg px-3 py-1.5 transition-all duration-200 hover:border-[#3d4049]"
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
