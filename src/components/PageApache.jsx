import React, { useEffect } from 'react';
import { useStore } from '../store';
import {
  Check, Download, Loader, Server, RefreshCw,
  Trash2, Globe, FileCode, Play, Square, RotateCcw
} from 'lucide-react';

const PageApache = () => {
  const {
    apacheVersions, apacheInstallLogs, apacheInstallProgress,
    installApacheVersion, uninstallApacheVersion,
    detectApacheVersion, scanInstalledApache, fetchApacheVersions,
    setActiveApache, restartApache,
    settings, showToast, t,
    phpVersions, selectedPhpVersion,
  } = useStore();

  const logEndRef = React.useRef(null);

  useEffect(() => {
    detectApacheVersion();
    scanInstalledApache();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [apacheInstallLogs]);

  const activeApache = apacheVersions.find(v => v.active && v.installed);
  const activePhp = phpVersions.find(p => p.active && !p.isSystem && p.installed);
  const isDownloading = apacheVersions.some(v => v.installing);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center justify-between">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold tracking-tight m-0 text-text">Apache Server</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">
            Manage Apache HTTP Server versions and configurations
          </p>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-3">
          {activeApache && (
            <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted font-bold tracking-wider uppercase">Active</span>
                <span className="text-[13px] font-bold font-mono text-accent">
                  Apache {activeApache.version}
                </span>
              </div>
            </div>
          )}
          {activePhp && (
            <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted font-bold tracking-wider uppercase">PHP Module</span>
                <span className="text-[13px] font-bold font-mono text-info">
                  PHP {activePhp.version}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

        {/* Apache Versions Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">Apache Versions</div>
              <div
                className="text-[10px] text-muted font-mono mt-0.5 cursor-pointer hover:text-accent transition-colors flex items-center gap-1"
                onClick={() => useStore.getState().openExplorer(`${settings.devStackDir}/bin/apache/`)}
                title="Open in Explorer"
              >
                📁 {settings.devStackDir}/bin/apache/
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeApache && (
                <button
                  className="btn-ghost text-[11px] flex items-center gap-1.5 text-accent"
                  onClick={() => restartApache()}
                  title="Restart Apache"
                >
                  <RotateCcw size={11} /> Restart
                </button>
              )}
              <button
                className="btn-ghost text-[11px] flex items-center gap-1.5"
                onClick={() => { detectApacheVersion(); scanInstalledApache(); fetchApacheVersions(); }}
              >
                <RefreshCw size={11} /> Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {apacheVersions.map(v => (
              <div
                key={v.version}
                className={`relative bg-surface border rounded-xl p-4 transition-all duration-200 overflow-hidden group
                  ${v.active ? 'border-accent shadow-[0_0_20px_rgba(34,211,238,0.1)] ring-1 ring-accent/20' : 'border-border hover:border-[#3d4049]'}
                `}
              >
                {/* Top bar */}
                {v.installed && (
                  <div className={`absolute top-0 left-0 right-0 h-[3px] ${v.active ? 'bg-accent' : 'bg-transparent'}`} />
                )}

                <div className="flex items-start justify-between mb-3 mt-0.5">
                  <div>
                    <div className="text-[16px] font-bold font-mono">Apache {v.version}</div>
                    <div className="text-[10px] text-muted font-mono mt-0.5 uppercase tracking-wider">
                      Windows x64 / {parseInt(v.version.split('.')[2]) >= 65 ? 'VS18' : 'VS17'}
                    </div>
                  </div>
                  {v.installed ? (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.active ? 'bg-accent/15 text-accent' : 'bg-border text-textDim'
                      }`}>
                      {v.active ? '● Active' : 'Installed'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted font-bold opacity-50 tracking-widest uppercase">
                      Available
                    </span>
                  )}
                </div>

                <div className="flex gap-2 mt-4 pt-3 border-t border-border/50">
                  {!v.installed ? (
                    <button
                      className={`relative btn-ghost text-[11px] w-full py-1.5 flex items-center justify-center gap-1.5 overflow-hidden
                        ${v.installing ? 'cursor-not-allowed opacity-80' : ''}
                      `}
                      onClick={() => installApacheVersion(v.version)}
                      disabled={v.installing}
                    >
                      {v.installing ? (
                        <>
                          <div
                            className="absolute inset-x-0 bottom-0 bg-accent/20 transition-all duration-300"
                            style={{ height: '100%', width: `${v.progress || 0}%` }}
                          />
                          <span className="relative z-10 flex items-center gap-2 font-bold">
                            <Loader size={12} className="animate-spin" />
                            {v.progress ? `${v.progress}%` : 'Starting...'}
                          </span>
                        </>
                      ) : (
                        <><Download size={13} /> Download & Install</>
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        disabled={v.active}
                        className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all active:scale-95
                          ${v.active
                            ? 'bg-accent/10 text-accent border border-accent/20 cursor-default'
                            : 'bg-accent text-white hover:bg-accent-light shadow-lg shadow-accent/20'
                          }
                        `}
                        onClick={() => setActiveApache(v.version)}
                      >
                        {v.active ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <Check size={12} /> Active
                          </span>
                        ) : 'Set Active'}
                      </button>
                      {!v.active && (
                        <button
                          className="btn-ghost px-2.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Uninstall"
                          onClick={() => {
                            if (confirm(`Uninstall Apache ${v.version}?`)) uninstallApacheVersion(v.version);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Installation Log */}
          {apacheInstallLogs.length > 0 && (
            <div className="mt-4 bg-[#0a0c10] border border-border rounded-xl overflow-hidden shadow-2xl">
              <div className="px-4 py-2 border-b border-border bg-[#13151a] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider ml-1">
                    Installation Output
                  </span>
                </div>
                <button
                  className="text-[10px] text-muted hover:text-textDim uppercase font-bold"
                  onClick={() => useStore.setState({ apacheInstallLogs: [] })}
                >
                  Clear Log
                </button>
              </div>

              {/* Progress bar — chỉ hiện khi đang download */}
              {(() => {
                const installing = apacheVersions.find(v => v.installing);
                const { pct, downloaded, total } = apacheInstallProgress || {};
                if (!installing || !pct || pct === 0 || pct === 100) return null;
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
                {apacheInstallLogs.map((log, i) => (
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

        {/* Info cards */}
        {activeApache && (
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">
              Active Configuration
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div className="flex flex-col gap-1">
                <span className="text-muted text-[10px] uppercase font-bold">Document Root</span>
                <span
                  className="font-mono text-accent cursor-pointer hover:underline"
                  onClick={() => useStore.getState().openExplorer(settings.rootPath)}
                >
                  {settings.rootPath}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-[10px] uppercase font-bold">Config File</span>
                <span
                  className="font-mono text-textDim cursor-pointer hover:text-accent transition-colors"
                  onClick={() => useStore.getState().openExplorer(
                    `${settings.devStackDir}/bin/apache/apache-${activeApache.version}/conf`
                  )}
                >
                  {settings.devStackDir}/bin/apache/apache-{activeApache.version}/conf/httpd.conf
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-[10px] uppercase font-bold">PHP Module</span>
                <span className="font-mono text-info">
                  {activePhp ? `php${activePhp.version.split('.')[0]}apache2_4.dll` : 'Not configured'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted text-[10px] uppercase font-bold">Port</span>
                <span className="font-mono text-textDim">80</span>
              </div>
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center text-info">
                <Globe size={18} />
              </div>
              <div className="text-[13px] font-bold uppercase tracking-wider">Public Access</div>
            </div>
            <p className="text-[12px] text-muted mb-4">
              Expose local projects via Cloudflare Tunnel or Ngrok.
            </p>
            <button
              className="btn-ghost w-full py-2 text-[12px]"
              onClick={() => useStore.setState({ activePage: 'tunnels' })}
            >
              Open Tunnels Page
            </button>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <FileCode size={18} />
              </div>
              <div className="text-[13px] font-bold uppercase tracking-wider">Virtual Hosts</div>
            </div>
            <p className="text-[12px] text-muted mb-4">
              Auto-create <code className="text-accent">.test</code> domains for each project in www/.
            </p>
            <button
              className="btn-ghost w-full py-2 text-[12px]"
              onClick={() => useStore.setState({ activePage: 'sites' })}
            >
              Manage Local Domains
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PageApache;
