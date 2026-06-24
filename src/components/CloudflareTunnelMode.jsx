import React, { useEffect } from 'react';
import { Check, Loader, LogIn } from 'lucide-react';
import { useStore } from '../store';

export const getDefaultTunnelName = (site) => {
  const folder = site?.path?.split(/[\\/]/).filter(Boolean).pop();
  return (folder || site?.domain?.replace(/\.test$/i, '') || '')
    .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
};

const CloudflareTunnelMode = ({ disabled, isInstalled }) => {
  const {
    tunnelMode, tunnelCustomDomain, tunnelCustomName, tunnelHostHeader,
    cloudflareAuthStatus, sites, t, setTunnelMode, setTunnelCustomDomain,
    setTunnelCustomName, setTunnelProtocol, connectCloudflare
  } = useStore();

  useEffect(() => {
    if (tunnelMode !== 'custom' || tunnelCustomName || !tunnelHostHeader) return;
    setTunnelCustomName(getDefaultTunnelName(sites.find(site => site.domain === tunnelHostHeader)));
  }, [tunnelMode, tunnelCustomName, tunnelHostHeader, sites, setTunnelCustomName]);

  const selectMode = (mode) => {
    setTunnelMode(mode);
    if (mode === 'custom') {
      setTunnelProtocol('http');
      if (!tunnelCustomName) {
        setTunnelCustomName(getDefaultTunnelName(sites.find(site => site.domain === tunnelHostHeader)));
      }
    }
  };

  return (
    <div className="mb-5 rounded-lg border border-border bg-[#111318] p-3.5">
      <div className="mb-3 flex gap-2">
        {['quick', 'custom'].map(mode => (
          <button
            key={mode}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-[11px] font-bold transition-colors ${
              tunnelMode === mode
                ? 'border-accent bg-[#0d2818] text-accent'
                : 'border-border text-textDim hover:border-[#3d4049]'
            }`}
            onClick={() => selectMode(mode)}
            disabled={disabled}
          >
            {t(mode === 'quick' ? 'quickTunnelMode' : 'customDomainMode')}
          </button>
        ))}
      </div>

      {tunnelMode === 'custom' && (
        <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)_auto] items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cloudflare-tunnel-name" className="text-[12px] font-semibold text-textDim">
              {t('cloudflareTunnelName')}
            </label>
            <input
              id="cloudflare-tunnel-name"
              type="text"
              className="input-field"
              value={tunnelCustomName}
              onChange={(event) => setTunnelCustomName(event.target.value)}
              placeholder="ugcm-be"
              pattern="[A-Za-z0-9_-]{1,100}"
              maxLength={100}
              disabled={disabled}
              spellCheck={false}
            />
            <span className="text-[10px] text-muted">{t('cloudflareTunnelNameHint')}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="cloudflare-custom-domain" className="text-[12px] font-semibold text-textDim">
              {t('customDomain')}
            </label>
            <input
              id="cloudflare-custom-domain"
              type="text"
              className="input-field"
              value={tunnelCustomDomain}
              onChange={(event) => setTunnelCustomDomain(event.target.value)}
              placeholder="app.example.com"
              disabled={disabled}
              spellCheck={false}
            />
            <span className="text-[10px] text-muted">{t('customDomainHint')}</span>
          </div>

          {isInstalled && cloudflareAuthStatus !== 'connected' ? (
            <button
              type="button"
              className="btn-ghost flex items-center gap-2 whitespace-nowrap"
              onClick={connectCloudflare}
              disabled={disabled || cloudflareAuthStatus === 'connecting'}
            >
              {cloudflareAuthStatus === 'connecting'
                ? <><Loader size={13} className="animate-spin" /> {t('cloudflareConnecting')}</>
                : <><LogIn size={13} /> {t('connectCloudflare')}</>}
            </button>
          ) : isInstalled ? (
            <span className="mb-2 flex items-center gap-1.5 whitespace-nowrap text-[11px] font-bold text-accent">
              <Check size={12} /> {t('cloudflareConnected')}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default CloudflareTunnelMode;
