import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Trash2, RefreshCw } from 'lucide-react';

const PageLogs = () => {
  const { logs, currentLog, switchLog, clearLog, showToast, t, fetchServiceLogs, streamServiceLogs } = useStore();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, currentLog]);

  useEffect(() => {
    // Ensure streaming setup when landing on logs page
    streamServiceLogs(currentLog);
  }, [currentLog]);

  const tabs = [
    { id: 'apache', label: 'Apache' },
    { id: 'mysql', label: 'MySQL' },
    { id: 'php', label: 'PHP' },
  ];

  const currentLines = logs[currentLog] || [];

  const getLogClass = (level) => {
    switch (level) {
      case 'success': return 'text-accent';
      case 'warn': return 'text-warn';
      case 'err': case 'danger': return 'text-danger';
      case 'info': return 'text-info font-medium';
      default: return 'text-muted';
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1a1c22] bg-bg flex items-center gap-3">
        <h1 className="text-[18px] font-extrabold tracking-tight flex-1">{t('logsTitle')}</h1>

        <div className="flex bg-panel border border-border rounded-lg overflow-hidden">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => switchLog(tab.id)}
              className={`tab px-4 py-1.5 cursor-pointer text-[12px] font-bold ${currentLog === tab.id ? 'bg-accent/10 text-accent border-b-2 border-accent' : 'text-muted hover:text-textDim'}`}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-ghost p-2"
            title={t('refreshLogsTooltip')}
            onClick={() => fetchServiceLogs(currentLog)}
          >
            <RefreshCw size={14} />
          </button>

          {currentLog === 'apache' && (
            <>
              <button
                className="btn-ghost text-[10px] px-2 py-1 flex items-center border border-border rounded"
                onClick={async () => {
                  const { settings, apacheVersions } = useStore.getState();
                  const v = apacheVersions.find(a => a.active)?.version;
                  if (!v) return showToast(t('noActiveApache'), 'warn');
                  const { invoke } = await import('@tauri-apps/api/core');
                  const apacheRoot = `${settings.devStackDir}\\bin\\apache\\apache-${v}`;
                  await invoke('ensure_apache_log_files', { apacheRoot });
                  const base = `${apacheRoot}\\logs`;
                  const p1 = `${base}\\error_log`;
                  const p2 = `${base}\\error.log`;
                  const e1 = await invoke('path_exists', { path: p1 });
                  const path = e1 ? p1 : p2;
                  invoke('open_file_default', { path, editor: null, admin: false }).catch(() => showToast(t('logFileNotFound'), 'warn'));
                }}
              >
                {t('errorLog')}
              </button>
              <button
                className="btn-ghost text-[10px] px-2 py-1 flex items-center border border-border rounded"
                onClick={async () => {
                  const { settings, apacheVersions } = useStore.getState();
                  const v = apacheVersions.find(a => a.active)?.version;
                  if (!v) return showToast(t('noActiveApache'), 'warn');
                  const { invoke } = await import('@tauri-apps/api/core');
                  const apacheRoot = `${settings.devStackDir}\\bin\\apache\\apache-${v}`;
                  await invoke('ensure_apache_log_files', { apacheRoot });
                  const base = `${apacheRoot}\\logs`;
                  const p1 = `${base}\\access_log`;
                  const p2 = `${base}\\access.log`;
                  const e1 = await invoke('path_exists', { path: p1 });
                  const path = e1 ? p1 : p2;
                  invoke('open_file_default', { path, editor: null, admin: false }).catch(() => showToast(t('logFileNotFound'), 'warn'));
                }}
              >
                {t('accessLog')}
              </button>
            </>
          )}

          {currentLog === 'mysql' && (
            <button
              className="btn-ghost text-[10px] px-2 py-1 flex items-center border border-border rounded"
              onClick={async () => {
                const { settings, mysqlVersions } = useStore.getState();
                const v = mysqlVersions.find(m => m.active)?.version;
                if (!v) return showToast(t('noActiveMysql'), 'warn');
                const path = `${settings.devStackDir}\\bin\\mysql\\mysql-${v}\\data`.replace(/\//g, '\\');
                const { invoke } = await import('@tauri-apps/api/core');
                invoke('start_detached_process', { executable: 'explorer.exe', args: [path] });
              }}
              title={t('openDataFolderTitle')}
            >
              {t('dataFolder')}
            </button>
          )}

          {currentLog === 'php' && (
            <button
              className="btn-ghost text-[10px] px-2 py-1 flex items-center border border-border rounded"
              onClick={async () => {
                const { settings, phpVersions } = useStore.getState();
                const v = phpVersions.find(p => p.active)?.version;
                if (!v) return showToast(t('noActivePhp'), 'warn');
                const path = `${settings.devStackDir}\\bin\\php\\php-${v}`.replace(/\//g, '\\');
                const { invoke } = await import('@tauri-apps/api/core');
                invoke('start_detached_process', { executable: 'explorer.exe', args: [path] });
              }}
            >
              {t('phpFolder')}
            </button>
          )}

          <button className="btn-ghost !text-danger ml-2" title={t('clearUiLogTitle')} onClick={() => { clearLog(); showToast(t('logCleared'), 'info'); }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-5 px-6 bg-[#0a0b0d] font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words"
      >
        {currentLines.length === 0 ? (
          <div className="text-muted italic text-center py-10">{t('noLogs')}</div>
        ) : (
          currentLines.map((line, idx) => (
            <div key={idx} className="mb-1 flex gap-3">
              <span className="text-muted shrink-0 select-none">[{line.t}]</span>
              <span className={getLogClass(line.l)}>{line.m}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PageLogs;
