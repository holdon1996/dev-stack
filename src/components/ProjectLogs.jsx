import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import { getLogDir, toWinPath } from '../lib/paths';

/** Per-vhost Apache logs (logs/<project>-error|access.log) and Laravel storage/logs. */
const ProjectLogs = () => {
  const { sites, siteConfigs, t } = useStore();
  const managed = sites.filter(s => siteConfigs[s.key]?.managed);
  const [siteKey, setSiteKey] = useState(managed[0]?.key || '');
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState('');
  const [content, setContent] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const site = managed.find(s => s.key === siteKey);
    if (!site) return;
    (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const logDir = getLogDir(useStore.getState());
      const cfg = siteConfigs[site.key];
      const list = [
        { label: t('apacheErrorLog'), path: `${logDir}/${site.key}-error.log` },
        { label: t('apacheAccessLog'), path: `${logDir}/${site.key}-access.log` },
      ];
      if (cfg.type === 'laravel') {
        const appRoot = [site.path, cfg.docRoot.replace(/\/?public$/, '')].filter(Boolean).join('/');
        const dir = `${appRoot}/storage/logs`;
        const names = await invoke('list_files', { dir: toWinPath(dir), ext: 'log' });
        list.push(...names.map(name => ({ label: t('laravelLog', { name }), path: `${dir}/${name}` })));
      }
      setFiles(list);
      setFile(list[0].path);
    })();
  }, [siteKey]);

  const load = async () => {
    if (!file) return;
    const { invoke } = await import('@tauri-apps/api/core');
    const text = await invoke('read_file_tail', { path: toWinPath(file), lines: 400 }).catch(() => '');
    setContent(text);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [file]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [content]);

  if (!managed.length) {
    return <div className="flex-1 p-10 text-center text-muted italic">{t('projectLogsEmpty')}</div>;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-2.5 border-b border-[#1a1c22] bg-bg flex items-center gap-2">
        <select aria-label={t('project')} className="select-field w-[260px]" value={siteKey} onChange={e => setSiteKey(e.target.value)}>
          {managed.map(s => <option key={s.key} value={s.key}>{s.key}</option>)}
        </select>
        <select aria-label={t('logFile')} className="select-field flex-1" value={file} onChange={e => setFile(e.target.value)}>
          {files.map(f => <option key={f.path} value={f.path}>{f.label}</option>)}
        </select>
        <button type="button" className="btn-ghost p-2" aria-label={t('refresh')} onClick={load}><RefreshCw size={14} /></button>
        <button
          type="button"
          className="btn-ghost p-2"
          aria-label={t('openInEditor')}
          onClick={async () => {
            const { invoke } = await import('@tauri-apps/api/core');
            invoke('open_file_default', { path: toWinPath(file), editor: null, admin: false }).catch(() => useStore.getState().showToast(t('logFileNotFound'), 'warn'));
          }}
        >
          <ExternalLink size={14} />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 px-6 bg-[#0a0b0d] font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-textDim">
        {content || <span className="text-muted italic">{t('noLogs')}</span>}
      </div>
    </div>
  );
};

export default ProjectLogs;
