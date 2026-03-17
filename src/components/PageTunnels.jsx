import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { Copy, Play, Square, Download, Check, Loader, ExternalLink, Radio, Trash2 } from 'lucide-react';

const providers = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    desc: 'Free, no account needed for quick tunnels',
    gradientFrom: '#f48120',
    gradientTo: '#f4a460',
    needsAuth: false,
  },
  {
    id: 'ngrok',
    name: 'ngrok',
    desc: 'Popular tunneling, freemium plan',
    gradientFrom: '#4a65ff',
    gradientTo: '#a78bfa',
    needsAuth: true,
    authLabel: 'Auth Token',
  },
];

const PageTunnels = () => {
  const {
    tunnelProvider, tunnelStatus, tunnelPublicUrl, tunnelPort, tunnelProtocol,
    tunnelLogs, tunnelInstalled, tunnelHostHeader, sites, tunnelInstallProgress,
    setTunnelProvider, setTunnelPort, setTunnelProtocol, setTunnelHostHeader,
    startTunnel, stopTunnel, installTunnelBinary, clearTunnelLogs, showToast, t, checkTunnelsInstalled
  } = useStore();

  const [copied, setCopied] = useState(false);
  const [authToken, setAuthToken] = useState('');
  const logEndRef = useRef(null);
  const currentProvider = providers.find(p => p.id === tunnelProvider);
  const isInstalled = tunnelInstalled[tunnelProvider];

  useEffect(() => {
    checkTunnelsInstalled();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tunnelLogs]);

  const copyUrl = () => {
    if (tunnelPublicUrl) {
      navigator.clipboard.writeText(tunnelPublicUrl);
      setCopied(true);
      showToast(t('urlCopied') || 'URL copied!', 'ok');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isBusy = tunnelStatus === 'starting' || tunnelStatus === 'installing';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg">
        <h1 className="text-[18px] font-extrabold m-0 flex items-center gap-2">
          <Radio size={20} className="text-accent" /> {t('tunnelsTitle')}
        </h1>
        <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('tunnelsDesc')}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {/* Provider Cards */}
        <div className="grid grid-cols-3 gap-3">
          {providers.map(p => (
            <div
              key={p.id}
              onClick={() => { if (tunnelStatus === 'stopped') setTunnelProvider(p.id); }}
              className={`relative bg-surface border rounded-xl p-4 cursor-pointer transition-all duration-200 overflow-hidden
                ${tunnelProvider === p.id ? 'border-accent shadow-[0_0_20px_rgba(0,229,160,0.1)]' : 'border-border hover:border-[#3d4049]'}
                ${isBusy || (tunnelStatus === 'running' && tunnelProvider !== p.id) ? 'opacity-40 pointer-events-none' : ''}
              `}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ background: `linear-gradient(90deg, ${p.gradientFrom}, ${p.gradientTo})` }}
              />
              <div className="flex items-center justify-between mb-1.5 mt-1">
                <span className="text-[15px] font-bold">{p.name}</span>
                {tunnelInstalled[p.id] ? (
                  <span className="text-[10px] text-accent font-bold flex items-center gap-1"><Check size={10} /> {t('readyLabel')}</span>
                ) : (
                  <span className="text-[10px] text-muted font-bold">{t('notInstalledLabel')}</span>
                )}
              </div>
              <div className="text-[11px] text-muted leading-relaxed">{p.desc}</div>
            </div>
          ))}
        </div>

        {/* Configuration */}
        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase mb-4">{t('configuration')}</div>

          <div className={`grid gap-4 mb-5 ${currentProvider?.needsAuth ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-textDim">{t('localPort')}</label>
              <input
                type="number" className="input-field" value={tunnelPort}
                onChange={(e) => setTunnelPort(e.target.value)}
                disabled={tunnelStatus !== 'stopped'}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-textDim">{t('protocol')}</label>
              <select
                className="select-field" value={tunnelProtocol}
                onChange={(e) => setTunnelProtocol(e.target.value)}
                disabled={tunnelStatus !== 'stopped'}
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="tcp">TCP</option>
              </select>
            </div>
            {currentProvider?.needsAuth && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-textDim">{currentProvider.authLabel}</label>
                <input
                  type="password" className="input-field" value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder={t('enterToken')} disabled={tunnelStatus !== 'stopped'}
                />
              </div>
            )}
          </div>

          {/* Host Header selector - maps tunnel to a specific vhost */}
          <div className="mb-5 flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-textDim flex items-center gap-1.5">
              {t('pointToProject')}
              <span className="text-[10px] text-muted font-normal">{t('serveVhostDesc')}</span>
            </label>
            <select
              className="select-field"
              value={tunnelHostHeader}
              onChange={(e) => setTunnelHostHeader(e.target.value)}
              disabled={tunnelStatus !== 'stopped'}
            >
              <option value="">{t('noVhostSelected')}</option>
              {(sites || []).map(site => (
                <option key={site.id} value={site.domain}>{site.domain} → {site.path}</option>
              ))}
            </select>
          </div>

          {/* Actions Row */}
          <div className="flex items-center gap-3">
            {!isInstalled ? (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => installTunnelBinary(tunnelProvider)}
                disabled={isBusy}
              >
                {tunnelStatus === 'installing'
                  ? <><Loader size={14} className="animate-spin" /> {t('installingProtocol')}</>
                  : <><Download size={14} /> {t('installProtocol', { name: currentProvider?.name })}</>
                }
              </button>
            ) : tunnelStatus === 'running' ? (
              <button className="btn-danger flex items-center gap-2" onClick={stopTunnel}>
                <Square size={12} /> {t('stopTunnel')}
              </button>
            ) : (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => startTunnel(authToken)} disabled={isBusy}
              >
                {tunnelStatus === 'starting'
                  ? <><Loader size={14} className="animate-spin" /> {t('connectingProtocol')}</>
                  : <><Play size={14} /> {t('startTunnel')}</>
                }
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <span className={`status-dot ${tunnelStatus === 'running' ? 'dot-running' :
                isBusy ? 'dot-warn' : 'dot-stopped'
                }`} />
              <span className="text-[12px] text-textDim font-mono capitalize">{tunnelStatus}</span>
            </div>
          </div>

          {tunnelStatus === 'installing' && (
            <div className="mt-4 rounded-lg border border-border bg-[#111318] px-3 py-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-mono text-textDim">
                <span>Download Progress</span>
                <span>
                  {tunnelInstallProgress.pct || 0}% 
                  {tunnelInstallProgress.total
                    ? ` (${tunnelInstallProgress.downloaded || 0}/${tunnelInstallProgress.total} MB)`
                    : tunnelInstallProgress.downloaded
                      ? ` (${tunnelInstallProgress.downloaded} MB)`
                      : ''}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1b1f27]">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${Math.max(4, tunnelInstallProgress.pct || 0)}%` }}
                />
              </div>
            </div>
          )}

          {/* Public URL */}
          {tunnelPublicUrl && (
            <div className="mt-4 p-3 bg-[#0d2818] border border-[#00e5a033] rounded-lg flex items-center gap-3 animate-in">
              <ExternalLink size={16} className="text-accent flex-shrink-0" />
              <span className="text-[13px] text-accent font-mono flex-1 truncate">{tunnelPublicUrl}</span>
              <button className="btn-ghost px-2.5 py-1 flex items-center gap-1.5 text-[11px]" onClick={copyUrl}>
                {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
          )}
        </div>

        {/* Log Console */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden flex-1 min-h-[140px] flex flex-col">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">{t('output')}</span>
            <button className="btn-ghost text-[11px] px-2 py-0.5 flex items-center gap-1" onClick={clearTunnelLogs}>
              <Trash2 size={10} /> {t('clearBtn')}
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-[12px] leading-[1.8] bg-[#0c0d10]">
            {tunnelLogs.length === 0 ? (
              <span className="text-muted italic">{t('waitingTunnelActivity')}</span>
            ) : (
              tunnelLogs.map((log, i) => (
                <div key={i} className={`log-line ${log.l === 'ok' ? 'log-ok' : log.l === 'warn' ? 'log-warn' : log.l === 'err' ? 'log-err' : 'log-info'
                  }`}>
                  <span className="text-muted mr-2">[{log.t}]</span>{log.m}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageTunnels;
