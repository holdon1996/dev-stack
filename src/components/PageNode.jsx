import React, { useEffect, useRef, useState } from 'react';
import { ask } from '@tauri-apps/plugin-dialog';
import { Boxes, Download, Loader, RefreshCw, Trash2, Globe } from 'lucide-react';
import { useStore } from '../store';

const PageNode = () => {
  const {
    nodeVersions,
    nodeInstallLogs,
    nodeInstallProgress,
    nodePathStatus,
    activatingNode,
    settings,
    scanInstalledNode,
    installNodeVersion,
    setActiveNode,
    uninstallNodeVersion,
    setNodeGlobalPath,
    refreshNodePathStatus,
    showToast,
    t,
  } = useStore();

  const [customTag, setCustomTag] = useState('');
  const logEndRef = useRef(null);

  useEffect(() => {
    scanInstalledNode();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [nodeInstallLogs]);

  const activeNode = nodeVersions.find((version) => version.active);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-border/40 shadow-sm bg-bg flex items-center gap-4 z-10 relative">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('nodeTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('nodeDesc')}</p>
        </div>

        <div className="flex items-center gap-2 bg-surface border border-border/50 shadow-liquid rounded-2xl px-4 py-2.5 transition-all duration-300 ease-liquid">
          <Boxes size={14} className="text-accent" />
          <div>
            <div className="text-[10px] text-muted font-bold tracking-wider uppercase">{t('currentNode')}</div>
            <div className="text-[14px] font-bold font-mono text-accent">
              {activeNode ? `v${activeNode.version}` : '—'}
            </div>
          </div>
        </div>

        <button
          className="btn-ghost flex items-center gap-2 px-4 py-2 text-[12px] h-[42px]"
          onClick={scanInstalledNode}
        >
          <RefreshCw size={14} /> {t('refresh')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <div className={`border rounded-[28px] p-6 ${nodePathStatus.devstackFirst ? 'bg-accent/5 border-accent/30' : 'bg-warn/5 border-warn/30'}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[320px]">
              <div className="text-[13px] font-bold uppercase tracking-wider flex items-center gap-2">
                <Globe size={14} className={nodePathStatus.devstackFirst ? 'text-accent' : 'text-warn'} />
                {t('nodeGlobalPriority')}
              </div>
              <div className="text-[12px] text-textDim mt-2">
                {nodePathStatus.devstackFirst ? t('nodeGlobalPriorityOk') : t('nodeGlobalPriorityHint')}
              </div>
              <div className="mt-3 text-[11px] text-muted font-mono break-all">
                {nodePathStatus.currentNodePath || t('nodeCurrentPathUnknown')}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="btn-ghost flex items-center gap-2" onClick={refreshNodePathStatus}>
                <RefreshCw size={14} /> {t('refresh')}
              </button>
              <button className="btn-primary flex items-center gap-2" onClick={setNodeGlobalPath}>
                <Globe size={14} /> {t('nodeUseGlobally')}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border/40 shadow-liquid rounded-[28px] p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[13px] font-bold uppercase tracking-wider">{t('installNodeByTag')}</div>
              <div className="text-[11px] text-muted mt-1">{t('nodeTagHint')}</div>
            </div>

            <div className="flex items-center gap-3 flex-1 min-w-[320px] justify-end">
              <input
                className="input-field max-w-[280px]"
                placeholder={t('nodeTagPlaceholder')}
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
              />
              <button
                className="btn-primary flex items-center gap-2"
                onClick={async () => {
                  if (!customTag.trim()) {
                    showToast(t('nodeInvalidTag'), 'danger');
                    return;
                  }
                  await installNodeVersion(customTag);
                  setCustomTag('');
                }}
              >
                <Download size={14} /> {t('installNow')}
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">{t('nodeVersionsTitle')}</div>
              <div className="text-[10px] text-muted font-mono mt-0.5">📁 {settings.devStackDir}/bin/node</div>
            </div>
          </div>

          {nodeVersions.length === 0 ? (
            <div className="bg-surface border border-border/40 rounded-[28px] p-8 text-[13px] text-muted">
              {t('nodeNoVersions')}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {nodeVersions.map((node) => {
                const isActive = !!node.active;
                const isInstalling = !!node.installing;
                const isActivating = activatingNode === node.version;

                return (
                  <div
                    key={node.version}
                    className={`relative bg-surface border rounded-[28px] p-5 transition-all duration-300 ease-liquid group overflow-hidden
                      ${isActive ? 'border-accent/40 shadow-glow' : 'border-border/40 shadow-liquid hover:shadow-liquid-hover hover:-translate-y-1 hover:border-border'}
                      ${isActivating ? 'border-amber-500/50 bg-amber-500/5 animate-pulse' : ''}
                    `}
                  >
                    <div className="flex justify-between items-start mb-3 gap-3">
                      <div className="flex flex-col">
                        <div className="text-[16px] font-bold font-mono tracking-tight">Node {node.version}</div>
                        <div className="text-[10px] text-muted font-mono mt-0.5 uppercase tracking-wider">
                          {isActive ? t('nodeCurrentAlias') : t('available')}
                        </div>
                      </div>

                      {isActive ? (
                        <div className="tag tag-active flex items-center gap-1.5 px-2 py-1 pulse">
                          {t('active')}
                        </div>
                      ) : (
                        <div className="tag tag-version px-2 py-0.5 text-[10px] uppercase font-bold">
                          {t('installed')}
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-muted font-mono bg-panel/50 border border-border rounded-2xl px-3 py-2">
                      {node.path}
                    </div>

                    <div className="flex gap-2 mt-4 pt-3 border-t border-border/50">
                      <button
                        disabled={isActive || isActivating || isInstalling}
                        className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all active:scale-95 border
                          ${isActive
                            ? 'bg-accent/5 text-accent border-accent/30 cursor-default'
                            : isActivating
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 cursor-wait'
                              : 'bg-transparent text-textDim border-border hover:border-accent hover:text-accent hover:bg-accent/5'
                          }
                        `}
                        onClick={() => setActiveNode(node.version)}
                      >
                        {isActive ? t('active') : isActivating ? <Loader size={14} className="animate-spin mx-auto" /> : t('setActive')}
                      </button>

                      <button
                        className={`btn-ghost px-2.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all
                          ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}
                        `}
                        title={t('uninstall')}
                        onClick={async () => {
                          const confirmed = await ask(t('uninstallNodeConfirm', { version: node.version }), {
                            title: 'DevStack',
                            kind: 'warning',
                            okLabel: t('uninstallLabel'),
                            cancelLabel: t('cancel')
                          });
                          if (confirmed) {
                            await uninstallNodeVersion(node.version);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {nodeInstallLogs.length > 0 ? (
          <div className="bg-[#0a0c10] border border-border/50 rounded-[28px] overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.6)]">
            <div className="px-5 py-3 border-b border-border/50 bg-surface flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/20 shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-black/20 shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840] border border-black/20 shadow-inner" />
                </div>
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider ml-2">{t('nodeInstallOutput')}</span>
              </div>
              <button
                className="text-[10px] text-muted hover:text-textDim uppercase font-bold"
                onClick={() => useStore.setState({ nodeInstallLogs: [] })}
              >
                {t('clearLog')}
              </button>
            </div>

            {nodeInstallProgress.pct > 0 && nodeInstallProgress.pct < 100 ? (
              <div className="px-4 py-3 border-b border-border bg-[#0d0f14]">
                <div className="flex justify-between text-[11px] font-mono mb-1.5">
                  <span className="text-accent font-bold animate-pulse">{t('downloading')}</span>
                  <span className="text-muted">
                    {nodeInstallProgress.downloaded} MB {nodeInstallProgress.total > 0 ? `/ ${nodeInstallProgress.total} MB` : '/ ? MB'}
                  </span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300 rounded-full"
                    style={{ width: `${nodeInstallProgress.pct || 5}%` }}
                  />
                </div>
                <div className="text-right text-[10px] text-muted mt-1">
                  {nodeInstallProgress.total > 0 ? `${nodeInstallProgress.pct}%` : t('mbDownloaded', { downloaded: nodeInstallProgress.downloaded })}
                </div>
              </div>
            ) : null}

            <div className="p-3 h-[180px] overflow-y-auto font-mono text-[11px] leading-relaxed scrollbar-thin">
              {nodeInstallLogs.map((log, index) => (
                <div key={`${log.t}-${index}`} className="flex gap-3 mb-1">
                  <span className="text-muted/50 select-none whitespace-nowrap">[{log.t}]</span>
                  <span
                    className={`break-all ${log.l === 'ok' ? 'text-accent' : log.l === 'err' ? 'text-danger' : log.l === 'warn' ? 'text-warn' : 'text-textDim'}`}
                  >
                    {log.m}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PageNode;
