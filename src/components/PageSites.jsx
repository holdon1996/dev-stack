import React from 'react';
import { useStore } from '../store';
import { ExternalLink, Folder, Trash2, Lock, Unlock } from 'lucide-react';

const PageSites = () => {
  const { sites, removeSite, showToast, t } = useStore();

  const openInBrowser = async (site) => {
    const url = `${site.ssl ? 'https' : 'http'}://${site.domain}`;
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  const openFolder = async (site) => {
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(site.path);
    } catch {
      showToast(`Folder: ${site.path}`, 'info');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] flex items-center bg-bg">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('vhostsTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('vhostsDesc')}</p>
        </div>
        <button className="btn-primary">{t('addHost')}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 px-6">
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4.5 py-3.5 border-b border-border grid grid-cols-[2fr_3fr_80px_60px_120px] gap-3 text-[11px] text-muted font-bold tracking-widest uppercase bg-surface">
            <span>{t('domain')}</span>
            <span>{t('rootPath')}</span>
            <span>{t('php')}</span>
            <span>{t('ssl')}</span>
            <span></span>
          </div>

          <div className="flex flex-col">
            {sites.map(site => (
              <div key={site.id} className="service-row grid grid-cols-[2fr_3fr_80px_60px_120px] gap-3 items-center">
                <div className="text-[13px] font-bold text-info font-mono truncate">
                  {site.ssl ? 'https' : 'http'}://{site.domain}
                </div>
                <div className="text-[12px] text-muted font-mono truncate" title={site.path}>
                  {site.path}
                </div>
                <div className="flex">
                  <span className="tag tag-version">PHP {site.php}</span>
                </div>
                <div className="flex justify-center">
                  {site.ssl ? <Lock size={16} className="text-accent" /> : <Unlock size={16} className="text-muted" />}
                </div>
                <div className="flex gap-1.5 justify-end">
                  <button
                    className="btn-ghost p-1.5"
                    title={t('openInBrowser')}
                    onClick={() => openInBrowser(site)}
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    className="btn-ghost p-1.5"
                    title={t('openFolder')}
                    onClick={() => openFolder(site)}
                  >
                    <Folder size={14} />
                  </button>
                  <button
                    className="btn-danger p-1.5 border-none"
                    onClick={() => {
                      if (confirm(t('deleteHostConfirm', { domain: site.domain }))) {
                        removeSite(site.id);
                        showToast(t('hostRemoved'), 'warn');
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {sites.length === 0 && (
              <div className="p-10 text-center text-muted italic">{t('noHosts')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageSites;
