import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { ExternalLink, Folder, Trash2, Lock, Link, Settings2, Terminal, Play, Square, RotateCcw, AlertTriangle } from 'lucide-react';
import SiteConfigModal from './SiteConfigModal';
import { siteProcesses } from '../lib/sites';

export const ConfigStaleBadge = () => {
  const { apacheConfigStale, restartApache, t } = useStore();
  if (!apacheConfigStale) return null;
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-[11px] font-bold text-warn bg-warn/10 border border-warn/30 rounded-lg px-2.5 py-1 hover:bg-warn/20"
      onClick={() => restartApache()}
      title={t('restartApache')}
    >
      <AlertTriangle size={12} /> {t('configChangedRestart')}
    </button>
  );
};

const GroupBar = () => {
  const { groupNames, startGroup, stopGroup, restartGroup, t } = useStore();
  const groups = groupNames();
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {groups.map(group => (
        <div key={group} className="flex items-center gap-1 bg-surface border border-border rounded-lg pl-3 pr-1 py-1">
          <span className="text-[12px] font-bold mr-2">{group}</span>
          <button type="button" className="btn-ghost p-1.5 text-accent" title={t('groupStart')} onClick={() => startGroup(group)}><Play size={12} /></button>
          <button type="button" className="btn-ghost p-1.5" title={t('groupRestart')} onClick={() => restartGroup(group)}><RotateCcw size={12} /></button>
          <button type="button" className="btn-ghost p-1.5 text-danger" title={t('groupStop')} onClick={() => stopGroup(group)}><Square size={12} /></button>
        </div>
      ))}
    </div>
  );
};

const PageSites = () => {
  const { sites, scanSites, showToast, t, siteConfigs, procs, siteProcessId, enableSite, siteApplying } = useStore();
  const [isCreating, setIsCreating] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [editing, setEditing] = useState(null);

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

  const runningCount = (site) => {
    const cfg = siteConfigs[site.key];
    if (!cfg?.managed) return 0;
    return siteProcesses(cfg).filter(p => procs[siteProcessId(site, p)]?.running).length;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] flex items-center bg-bg gap-3">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('vhostsTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('vhostsDesc')}</p>
        </div>
        <ConfigStaleBadge />
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
        <GroupBar />
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4.5 py-3.5 border-b border-border grid grid-cols-[2fr_90px_2fr_70px_150px] gap-3 text-[11px] text-muted font-bold tracking-widest uppercase bg-surface">
            <span>{t('domain')}</span>
            <span>{t('siteType')}</span>
            <span>{t('rootPath')}</span>
            <span>{t('processesShort')}</span>
            <span className="text-right">{t('action')}</span>
          </div>

          <div className="flex flex-col">
            {sites.map(site => {
              const cfg = siteConfigs[site.key];
              const managed = !!cfg?.managed;
              const running = runningCount(site);
              return (
                <div key={site.id} className="service-row grid grid-cols-[2fr_90px_2fr_70px_150px] gap-3 items-center">
                  <div className="min-w-0">
                    <div
                      className="text-[13px] font-bold text-info font-mono truncate cursor-pointer hover:text-accent hover:underline flex items-center gap-1.5"
                      onClick={() => openInBrowser(site)}
                    >
                      {site.ssl && <Lock size={12} className="text-accent shrink-0" />}
                      {site.ssl ? 'https' : 'http'}://{site.domain} <ExternalLink size={12} className="shrink-0" />
                    </div>
                    {managed && cfg.aliases?.length > 0 && (
                      <div className="text-[10px] text-muted font-mono truncate">{cfg.aliases.join(', ')}</div>
                    )}
                    {managed && cfg.group && <div className="text-[10px] text-textDim">{cfg.group}</div>}
                  </div>
                  <div>
                    {managed
                      ? <span className="tag font-mono text-[10px]">{cfg.type}{cfg.type === 'proxy' ? `:${cfg.proxyPort}` : ''}</span>
                      : <span className="text-[10px] text-muted">{t('notManaged')}</span>}
                  </div>
                  <div className="text-[12px] text-muted font-mono truncate" title={site.path}>
                    {site.path}{managed && cfg.docRoot ? <span className="text-textDim">/{cfg.docRoot}</span> : null}
                  </div>
                  <div className="text-[11px] font-mono">
                    {running > 0 ? <span className="text-accent">● {running}</span> : <span className="text-muted">—</span>}
                  </div>
                  <div className="flex gap-1.5 justify-end">
                    {!managed && (
                      <button
                        className="btn-ghost p-1.5 text-accent"
                        title={t('createVhostSync')}
                        disabled={siteApplying}
                        onClick={() => enableSite(site)}
                      >
                        <Link size={14} />
                      </button>
                    )}
                    <button className="btn-ghost p-1.5" title={t('siteSettings')} onClick={() => setEditing(site)}>
                      <Settings2 size={14} />
                    </button>
                    <button className="btn-ghost p-1.5" title={t('openTerminal')} onClick={() => useStore.getState().openTerminal(site.path)}>
                      <Terminal size={14} />
                    </button>
                    <button className="btn-ghost p-1.5" title={t('openFolder')} onClick={() => useStore.getState().openExplorer(site.path)}>
                      <Folder size={14} />
                    </button>
                    <button
                      className="btn-danger p-1.5 border-none"
                      title={t('remove')}
                      onClick={async () => {
                        const { confirm } = await import('@tauri-apps/plugin-dialog');
                        const yes = await confirm(
                          t('deleteHostConfirm', { domain: site.domain }) + '\n\n' + t('deleteProjectWarning'),
                          { title: t('deleteProjectTitle'), kind: 'warning' }
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
              );
            })}
            {sites.length === 0 && (
              <div className="p-10 text-center text-muted italic">{t('noHosts')}</div>
            )}
          </div>
        </div>
      </div>

      {editing && <SiteConfigModal site={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default PageSites;
