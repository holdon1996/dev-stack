import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import {
  Database, Trash2, Server, Wrench,
  Check, Download, Loader, RefreshCw, Plus, Link as LinkIcon, Edit2, Terminal
} from 'lucide-react';
import { ask } from '@tauri-apps/plugin-dialog';

const PageDatabase = () => {
  const {
    showToast, t,
    mysqlVersions, mysqlInstallLogs, mysqlInstallProgress,
    scanInstalledMysql, fetchMysqlVersions, installMysqlVersion, uninstallMysqlVersion,
    setActiveMysql, setMysqlPort, openMysqlTerminal, settings,
    repairMysqlFromLaragon,
  } = useStore();

  const logEndRef = useRef(null);
  const [customVersion, setCustomVersion] = useState('');
  const [customLink, setCustomLink] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    scanInstalledMysql();
    fetchMysqlVersions();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mysqlInstallLogs]);

  const services = useStore(s => s.services);
  const runningMysqls = services.filter(svc => svc.type === 'db' && svc.status === 'running');

  const activeV = mysqlVersions.find(v => v.active && v.installed);
  const activeSvc = services.find(s => s.type === 'db' && s.name.includes('(DevStack)'));

  const handleCustomInstall = () => {
    if (!customVersion) {
      showToast(t('enterVersionContent'), 'warn');
      return;
    }

    let link = customLink;
    if (!link) {
      const v = customVersion.split('.');
      const majorMinor = v.length >= 2 ? `${v[0]}.${v[1]}` : '8.0';
      const folder = majorMinor === '5.7' ? 'MySQL-5.7' : `MySQL-${majorMinor}`;
      link = `https://cdn.mysql.com/Downloads/${folder}/mysql-${customVersion}-winx64.zip`;
    } else if (!link.toLowerCase().endsWith('.zip')) {
      showToast(t('linkMustBeZip'), 'warn');
      return;
    }

    installMysqlVersion(customVersion, link);
    setCustomVersion('');
    setCustomLink('');
    setShowCustom(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-extrabold m-0 flex items-center gap-2">
            <Server size={20} className="text-accent" /> {t('mysqlServerTitle')}
          </h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono flex items-center gap-2">
            {runningMysqls.length > 0 ? (
              <>{t('runningInstances', { count: runningMysqls.length })}</>
            ) : t('serverStopped')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 max-w-[70%]">
          {runningMysqls.map((svc, idx) => (
            <div
              key={svc.id || idx}
              className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-surface/80 transition-colors shrink-0"
              title={`${svc.name} - Port: ${svc.port}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${svc.id < 1000 ? 'bg-accent' : 'bg-orange-500'} animate-pulse`} />
              <div className="flex flex-col">
                <div className="text-[8px] text-muted font-bold uppercase tracking-wider leading-none mb-0.5">
                  {(svc.name || 'MySQL').replace('(DevStack)', '').trim()}
                </div>
                <div className="text-[12px] font-bold font-mono text-accent leading-none">
                  v{svc.version !== '—' ? svc.version : '...'}
                  <span className="text-[9px] text-muted opacity-50 ml-1 font-sans font-medium">:{svc.port}</span>
                </div>
              </div>
            </div>
          ))}

          <button
            className="btn-ghost flex items-center gap-2 py-2 ml-2"
            onClick={async () => {
              await Promise.all([scanInstalledMysql(), fetchMysqlVersions()]);
              showToast(t('mysqlListRefreshed'), 'ok');
            }}
          >
            <RefreshCw size={14} /> {t('refresh')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">

          {/* Connection Info */}
          {mysqlVersions.find(v => v.active && v.installed) && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-accent/5 border border-accent/20 rounded-xl p-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-accent font-bold uppercase tracking-wider">{t('host')}</span>
                <span className="text-[13px] font-mono font-bold">127.0.0.1</span>
              </div>
              <div className="flex flex-col gap-1 border-l border-accent/10 pl-4">
                <span className="text-[10px] text-accent font-bold uppercase tracking-wider">{t('username')}</span>
                <span className="text-[13px] font-mono font-bold">root</span>
              </div>
              <div className="flex flex-col gap-1 border-l border-accent/10 pl-4">
                <span className="text-[10px] text-accent font-bold uppercase tracking-wider">{t('password')}</span>
                <span className="text-[11px] text-muted italic font-medium">{t('noPassword')}</span>
              </div>
              <div className="flex flex-col gap-1 border-l border-accent/10 pl-4">
                <span className="text-[10px] text-accent font-bold uppercase tracking-wider">{t('activePort')}</span>
                <span className="text-[13px] font-mono font-bold text-accent">
                  {activeSvc?.port || activeV?.port || '—'}
                </span>
              </div>
              <div className="flex items-end justify-end border-l border-accent/10 pl-4 gap-2">
                {activeSvc?.status !== 'running' && (
                  <span className="text-[10px] text-warn font-bold flex items-center gap-1 mr-2">
                    {t('notRunningWarning')}
                  </span>
                )}
                <button
                  className={`py-1.5 px-3 flex items-center gap-1.5 text-[11px] h-fit font-bold rounded-lg transition-all active:scale-95
                    ${activeSvc?.status === 'running'
                      ? 'btn-primary'
                      : 'bg-warn/10 border border-warn/40 text-warn hover:bg-warn/20'
                    }`}
                  onClick={async () => {
                    if (activeSvc?.status !== 'running') {
                      const svc = useStore.getState().services.find(s => s.type === 'db' && s.name?.includes('DevStack') && s.version === activeV?.version);
                      if (svc) {
                        showToast(t('startingMysql', { version: activeV.version }), 'info');
                        await useStore.getState().toggleService(svc.id);
                      }
                    }
                    openMysqlTerminal(activeV?.version);
                  }}
                >
                  <Terminal size={14} /> {t('quickConnect')}
                </button>
              </div>
            </div>
          )}

          {/* Custom Install Form */}
          <div className="bg-surface border border-dashed border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                  <Plus size={18} />
                </div>
                <div>
                  <div className="text-[13px] font-bold">{t('installCustomVersion')}</div>
                  <div className="text-[11px] text-muted">{t('customInstallDesc')}</div>
                </div>
              </div>
              <button
                className={`btn-ghost text-[11px] px-3 py-1 ${showCustom ? 'bg-border' : ''}`}
                onClick={() => setShowCustom(!showCustom)}
              >
                {showCustom ? t('cancel') : t('addOtherVersion')}
              </button>
            </div>

            {showCustom && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-muted uppercase ml-1">{t('versionLabel')}</label>
                    <input
                      type="text"
                      placeholder={t('versionPlaceholder')}
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-[12px] focus:border-accent outline-none"
                      value={customVersion}
                      onChange={e => setCustomVersion(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-muted uppercase ml-1">{t('downloadLinkLabel')}</label>
                    <input
                      type="text"
                      placeholder={t('downloadLinkPlaceholder')}
                      className="bg-bg border border-border rounded-lg px-3 py-2 text-[12px] focus:border-accent outline-none"
                      value={customLink}
                      onChange={e => setCustomLink(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 mt-1">
                  <div className="text-[11px] text-muted italic flex items-center gap-1.5">
                    <LinkIcon size={12} />
                    {t('autoFindLinkDesc')}
                  </div>
                  <button className="btn-primary flex items-center gap-2 py-2 px-6" onClick={handleCustomInstall}>
                    <Download size={14} /> {t('startDownloadSetup')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Versions Grid */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">{t('installedAvailableVersions')}</div>
              <div
                className="text-[10px] text-muted font-mono cursor-pointer hover:text-accent transition-colors flex items-center gap-1"
                onClick={() => useStore.getState().openExplorer(`${settings.devStackDir}/bin/mysql/`)}
                title={t('openInExplorer')}
              >
                📁 {settings.devStackDir}/bin/mysql/
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mysqlVersions.map(v => (
                <div
                  key={v.version}
                  className={`relative bg-surface border rounded-xl p-4 transition-all duration-200 overflow-hidden group
                    ${v.active ? 'border-accent shadow-[0_0_20px_rgba(34,211,238,0.1)] ring-1 ring-accent/20' : 'border-border hover:border-[#3d4049]'}
                  `}
                >
                  {v.installed && (
                    <div className={`absolute top-0 left-0 right-0 h-[3px] ${v.active ? 'bg-accent' : 'bg-transparent'}`} />
                  )}

                  <div className="flex items-start justify-between mb-3 mt-0.5">
                    <div>
                      <div className="text-[16px] font-bold font-mono text-text">MySQL {v.version}</div>
                      <div className="text-[10px] text-muted font-mono mt-0.5 uppercase tracking-wider">
                        {t('communityServer')}
                      </div>
                      {v.installed && (
                        <div
                          className={`flex items-center gap-1.5 mt-2 px-2 py-0.5 w-fit border rounded-md transition-all group/port ${v.active ? 'bg-accent/5 border-accent/20 cursor-pointer hover:bg-accent/10 hover:border-accent/40' : 'bg-surface border-border opacity-50 cursor-not-allowed'}`}
                          title={v.active ? t('clickToChangePort') : t('onlyActivePortChangable')}
                          onClick={() => {
                            if (!v.active) return;
                            const currentPort = settings.portMySQL || 3306;
                            const p = window.prompt(t('enterNewPort', { version: v.version }), currentPort);
                            if (p && !isNaN(p)) {
                              const mysqlSvc = useStore.getState().services.find(s => s.type === 'db');
                              if (mysqlSvc) useStore.getState().updateServicePort(mysqlSvc.id, parseInt(p));
                            }
                          }}
                        >
                          <span className="text-[10px] font-bold font-mono text-accent">PORT: {v.active ? (settings.portMySQL || 3306) : 3306}</span>
                          {v.active && <Edit2 size={10} className="text-accent/40 group-hover/port:text-accent transition-colors" />}
                        </div>
                      )}
                    </div>
                    {v.installed ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.active ? 'bg-accent/15 text-accent' : 'bg-border text-textDim'}`}>
                        {v.active ? `● ${t('defaultVersion')}` : t('installedState')}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted font-bold opacity-30 tracking-widest uppercase">{t('availableState')}</span>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4 pt-3 border-t border-border/50 flex-wrap">
                    {!v.installed ? (
                      <button
                        className={`relative btn-ghost text-[11px] w-full py-1.5 flex items-center justify-center gap-1.5 overflow-hidden
                            ${v.installing ? 'cursor-not-allowed opacity-80' : ''}
                          `}
                        onClick={() => installMysqlVersion(v.version)}
                        disabled={v.installing}
                      >
                        {v.installing ? (
                          <>
                            <div
                              className="absolute inset-x-0 bottom-0 bg-accent/20 transition-all duration-300"
                              style={{ height: '100%', width: `${v.progress || 0}%` }}
                            />
                            <span className="relative z-10 flex items-center gap-2 font-bold text-accent">
                              <Loader size={12} className="animate-spin" />
                              {v.progress ? `${v.progress}%` : t('starting')}
                            </span>
                          </>
                        ) : (
                          <><Download size={13} /> {t('install')}</>
                        )}
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={v.active}
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all active:scale-90 border
                            ${v.active
                              ? 'bg-accent/5 text-accent border-accent/30 cursor-default'
                              : 'bg-transparent text-textDim border-border hover:border-accent hover:text-accent hover:bg-accent/5'
                            }
                          `}
                          onClick={() => setActiveMysql(v.version)}
                        >
                          {v.active ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <Check size={12} /> {t('defaultVersion')}
                            </span>
                          ) : t('setDefault')}
                        </button>
                        {!v.active && (
                          <button
                            className="bg-red-500/10 text-red-400 hover:text-red-300 hover:bg-red-500/20 px-2.5 rounded-lg transition-colors border border-red-500/20"
                            title={t('deleteVersion')}
                            onClick={async () => {
                              const confirmed = await ask(t('uninstallMysqlConfirm', { version: v.version }), {
                                title: 'DevStack',
                                kind: 'warning',
                                okLabel: t('uninstallLabel'),
                                cancelLabel: t('cancel')
                              });
                              if (confirmed) uninstallMysqlVersion(v.version);
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        {/* Repair button — always visible for installed versions */}
                        <button
                          className="bg-warn/10 text-warn hover:bg-warn/20 px-2.5 rounded-lg transition-colors border border-warn/20 flex items-center gap-1 text-[11px] font-bold"
                          title={t('fixMysqlDriverDesc')}
                          onClick={() => repairMysqlFromLaragon(v.version)}
                        >
                          <Wrench size={12} /> {t('fixDriver')}
                        </button>
                      </>
                    )}

                    {!v.installed && !['8.0.45', '8.0.40', '5.7.44'].includes(v.version) && (
                      <button
                        className="btn-ghost text-red-400 hover:text-red-500 p-2"
                        title={t('removeFromList')}
                        onClick={() => useStore.setState(s => ({
                          mysqlVersions: s.mysqlVersions.filter(mv => mv.version !== v.version)
                        }))}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Installation Log */}
          {mysqlInstallLogs.length > 0 && (
            <div className="mt-2 bg-[#0a0c10] border border-border rounded-xl overflow-hidden shadow-2xl">
              <div className="px-4 py-2 border-b border-border bg-[#13151a] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider ml-1">
                    {t('installationOutput')}
                  </span>
                </div>
                <button
                  className="text-[10px] text-muted hover:text-textDim uppercase font-bold"
                  onClick={() => useStore.setState({ mysqlInstallLogs: [] })}
                >
                  {t('clearLog')}
                </button>
              </div>

              {/* Progress bar */}
              {(() => {
                const installing = mysqlVersions.find(v => v.installing);
                const { pct, downloaded, total } = mysqlInstallProgress || {};
                if (!installing || !pct || pct === 0 || pct === 100) return null;
                return (
                  <div className="px-4 py-3 border-b border-border bg-[#0d0f14]">
                    <div className="flex justify-between text-[11px] font-mono mb-1.5">
                      <span className="text-accent font-bold">{t('downloading')}</span>
                      <span className="text-muted">{t('mbTotal', { downloaded, total })}</span>
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

              <div className="p-3 h-[180px] overflow-y-auto font-mono text-[11px] leading-relaxed scrollbar-thin">
                {mysqlInstallLogs.map((log, i) => (
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

          <div className="text-[11px] text-muted font-mono italic bg-surface/50 p-4 rounded-xl border border-border/50">
            {t('mysqlArchiveTip')}
            <br />
            <a href="https://downloads.mysql.com/archives/community/" target="_blank" className="text-accent hover:underline mt-2 inline-block">
              MySQL Archives ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageDatabase;
