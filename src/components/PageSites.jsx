import React, { useEffect } from 'react';
import { useStore } from '../store';
import { ExternalLink, Folder, Trash2, Lock, Unlock, Link } from 'lucide-react';
import { Command } from '@tauri-apps/plugin-shell';

const PageSites = () => {
  const { sites, removeSite, scanSites, showToast, t } = useStore();
  const [isCreating, setIsCreating] = React.useState(false);
  const [projectName, setProjectName] = React.useState('');

  useEffect(() => {
    scanSites();
  }, []);

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setIsCreating(false);
      return;
    }
    const success = await useStore.getState().createProject(projectName.trim());
    if (success) {
      setProjectName('');
      setIsCreating(false);
    }
  };

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
    useStore.getState().openExplorer(site.path);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] flex items-center bg-bg">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('vhostsTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('vhostsDesc')}</p>
        </div>
        <div className="flex gap-2 items-center">
          {isCreating ? (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-200">
              <input
                autoFocus
                type="text"
                placeholder={t('projectName')}
                className="input-field py-1.5 px-3 text-[12px] w-[180px]"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateProject();
                  if (e.key === 'Escape') { setIsCreating(false); setProjectName(''); }
                }}
              />
              <button className="btn-primary py-1.5 px-3 text-[12px]" onClick={handleCreateProject}>
                {t('ok')}
              </button>
              <button className="btn-ghost py-1.5 px-3 text-[12px]" onClick={() => { setIsCreating(false); setProjectName(''); }}>
                {t('cancel')}
              </button>
            </div>
          ) : (
            <button
              className="btn-ghost flex items-center gap-2 border border-border"
              onClick={() => setIsCreating(true)}
            >
              {t('createNewProject')}
            </button>
          )}
          {!isCreating && (
            <>
              <button
                className="btn-ghost flex items-center gap-2 border border-border text-[12px] py-1.5 px-3"
                onClick={() => useStore.getState().openConfigFile('hosts')}
              >
                {t('openHostsFile')}
              </button>
              <button
                className="btn-ghost flex items-center gap-2 border border-border text-[12px] py-1.5 px-3"
                onClick={async () => {
                  const { apacheVersions, settings, showToast } = useStore.getState();
                  const activeApache = apacheVersions.find(v => v.active && v.installed);
                  if (!activeApache) { showToast(t('noActiveApacheSites'), 'warn'); return; }
                  const vhostsPath = `${settings.devStackDir}/bin/apache/apache-${activeApache.version}/conf/extra/httpd-vhosts.conf`;

                  const { invoke } = await import('@tauri-apps/api/core');
                  invoke('open_file_default', {
                    path: vhostsPath.replace(/\//g, '\\'),
                    editor: 'notepad.exe',
                    admin: false
                  }).catch(() => showToast(t('vhostsNotFound'), 'danger'));
                  showToast(t('openingVhosts'), 'info');
                }}
              >
                {t('openVhostsFile')}
              </button>
              <button
                className="btn-primary py-1.5 px-3 text-[12px]"
                onClick={() => useStore.getState().openExplorer(useStore.getState().settings.rootPath)}
              >
                {t('openWwwFolder')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 px-6">
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4.5 py-3.5 border-b border-border grid grid-cols-[2fr_3fr_60px_100px] gap-3 text-[11px] text-muted font-bold tracking-widest uppercase bg-surface">
            <span>{t('domain')}</span>
            <span>{t('rootPath')}</span>
            <span className="whitespace-nowrap">{t('action')}</span>
            <span></span>
          </div>

          <div className="flex flex-col">
            {sites.map(site => (
              <div key={site.id} className="service-row grid grid-cols-[2fr_3fr_60px_100px] gap-3 items-center">
                <div
                  className="text-[13px] font-bold text-info font-mono truncate cursor-pointer hover:text-accent hover:underline flex items-center gap-1.5"
                  onClick={() => openInBrowser(site)}
                >
                  {site.ssl ? 'https' : 'http'}://{site.domain} <ExternalLink size={12} />
                </div>
                <div className="text-[12px] text-muted font-mono truncate" title={site.path}>
                  {site.path}
                </div>
                {/* <div
                  className="flex justify-center cursor-pointer hover:scale-110 transition-transform"
                  onClick={() => useStore.getState().toggleSiteSSL(site.id)}
                  title={site.ssl ? t('clickToDisableHttps') : t('clickToEnableHttps')}
                >
                  {site.ssl ? <Lock size={16} className="text-accent" /> : <Unlock size={16} className="text-muted" />}
                </div> */}
                <div className="flex gap-1.5 justify-end">
                  <button
                    className="btn-ghost p-1.5 text-accent"
                    title={t('createVhostSync')}
                    onClick={() => useStore.getState().setupVirtualHost(site)}
                  >
                    <Link size={14} />
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
                    onClick={async () => {
                      const { confirm } = await import('@tauri-apps/plugin-dialog');
                      const yes = await confirm(
                        t('deleteHostConfirm', { domain: site.domain }) + '\\n\\nCẢNH BÁO: Hành động này sẽ xoá luôn thư mục mã nguồn và dữ liệu bên trong!',
                        { title: 'Xác nhận xóa dự án', kind: 'warning' }
                      );
                      if (yes) {
                        await useStore.getState().removeSite(site.id, site.domain, site.path);
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
    </div >
  );
};

export default PageSites;
