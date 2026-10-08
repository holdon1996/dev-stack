import React, { useEffect, useState } from 'react';
import { Database, RefreshCw, Plus, Trash2, Download, Upload, ArrowUp, ArrowDown, Play, ExternalLink, Loader } from 'lucide-react';
import { useStore } from '../store';

const DatabaseTools = () => {
  const {
    services, dbList, dbImportQueue, loadDatabases, createDatabase, dropDatabase, exportDatabases,
    setDbImportQueue, importDumps, openAdminTool, t,
  } = useStore();
  const running = services.find(s => s.type === 'db')?.status === 'running';
  const [newDb, setNewDb] = useState('');
  const [selected, setSelected] = useState([]);
  const [backupOnDrop, setBackupOnDrop] = useState(true);
  const [options, setOptions] = useState({ recreate: true, disableFk: true, backup: true });
  const [importing, setImporting] = useState(false);

  useEffect(() => { if (running) loadDatabases(); }, [running]);

  const pickFiles = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const files = await open({ multiple: true, filters: [{ name: 'SQL', extensions: ['sql'] }] });
    if (!files) return;
    const added = (Array.isArray(files) ? files : [files]).map(file => ({
      file,
      db: file.split(/[\\/]/).pop().replace(/\.sql$/i, '').replace(/[^A-Za-z0-9_$-]/g, '_'),
      status: 'pending', pct: 0, error: '',
    }));
    setDbImportQueue([...dbImportQueue, ...added]);
  };

  const editQueue = (i, patch) => setDbImportQueue(dbImportQueue.map((item, j) => j === i ? { ...item, ...patch } : item));
  const move = (i, delta) => {
    const next = [...dbImportQueue];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    setDbImportQueue(next);
  };

  const drop = async (name) => {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const ok = await ask(t(backupOnDrop ? 'dbDropConfirmBackup' : 'dbDropConfirm', { name }), { title: 'DevStack', kind: 'warning', okLabel: t('remove'), cancelLabel: t('cancel') });
    if (ok) await dropDatabase(name, { backup: backupOnDrop });
  };

  const runImport = async () => {
    setImporting(true);
    setDbImportQueue(dbImportQueue.map(item => ({ ...item, status: 'pending', pct: 0, error: '' })));
    try { await importDumps(options); } finally { setImporting(false); }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Database size={16} className="text-accent" />
        <h2 className="text-[13px] font-bold m-0 flex-1">{t('dbToolsTitle')}</h2>
        <button type="button" className="btn-ghost text-[11px] py-1 px-2 border border-border flex items-center gap-1" onClick={() => openAdminTool('adminer')} disabled={!running}>
          <ExternalLink size={11} /> Adminer
        </button>
        <button type="button" className="btn-ghost text-[11px] py-1 px-2 border border-border flex items-center gap-1" onClick={() => openAdminTool('tableplus')} disabled={!running}>
          <ExternalLink size={11} /> TablePlus
        </button>
        <button type="button" className="btn-ghost p-1.5" aria-label={t('refresh')} onClick={loadDatabases} disabled={!running}><RefreshCw size={13} /></button>
      </div>

      {!running ? (
        <div className="text-[12px] text-warn">{t('dbToolsNeedMysql')}</div>
      ) : (
        <>
          <form className="flex gap-2 mb-3" onSubmit={async (e) => { e.preventDefault(); await createDatabase(newDb.trim()); setNewDb(''); }}>
            <input aria-label={t('dbName')} className="input-field flex-1 font-mono text-[12px]" placeholder="my_database" value={newDb} onChange={e => setNewDb(e.target.value)} />
            <button type="submit" className="btn-primary text-[12px] flex items-center gap-1" disabled={!newDb.trim()}><Plus size={12} /> {t('dbCreate')}</button>
          </form>

          <div className="border border-border rounded-lg overflow-hidden mb-2">
            {dbList.length === 0 && <div className="p-3 text-[12px] text-muted italic">{t('dbNone')}</div>}
            {dbList.map(db => {
              const on = selected.includes(db.name);
              return (
                <div key={db.name} className="grid grid-cols-[24px_1fr_80px_90px_auto] gap-2 items-center px-3 py-1.5 border-b border-border last:border-0 text-[12px]">
                  <input type="checkbox" aria-label={db.name} checked={on} onChange={() => setSelected(on ? selected.filter(n => n !== db.name) : [...selected, db.name])} />
                  <span className="font-mono font-bold truncate">{db.name}</span>
                  <span className="text-muted">{t('dbTables', { count: db.tables })}</span>
                  <span className="text-muted font-mono">{db.size}</span>
                  <div className="flex gap-1">
                    <button type="button" className="btn-ghost p-1" title={t('dbExport')} onClick={() => exportDatabases([db.name])}><Download size={12} /></button>
                    <button type="button" className="btn-danger p-1 border-none" title={t('remove')} onClick={() => drop(db.name)}><Trash2 size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mb-5 text-[11px]">
            <button type="button" className="btn-ghost text-[11px] py-1 px-2 border border-border flex items-center gap-1" disabled={!selected.length} onClick={() => exportDatabases(selected)}>
              <Download size={11} /> {t('dbExportSelected', { count: selected.length })}
            </button>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={backupOnDrop} onChange={e => setBackupOnDrop(e.target.checked)} /> {t('dbBackupBeforeDrop')}
            </label>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold text-muted uppercase tracking-[0.08em] flex-1">{t('dbImportTitle')}</span>
            <button type="button" className="btn-ghost text-[11px] py-1 px-2 border border-border flex items-center gap-1" onClick={pickFiles} disabled={importing}>
              <Upload size={11} /> {t('dbChooseFiles')}
            </button>
          </div>
          {dbImportQueue.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-3">
              {dbImportQueue.map((item, i) => (
                <div key={`${item.file}-${i}`} className="bg-[#111318] border border-border rounded-lg p-2">
                  <div className="grid grid-cols-[1fr_180px_auto] gap-2 items-center">
                    <span className="text-[11px] font-mono truncate" title={item.file}>{item.file.split(/[\\/]/).pop()}</span>
                    <input aria-label={t('dbTarget')} className="input-field py-1 font-mono text-[11px]" value={item.db} onChange={e => editQueue(i, { db: e.target.value })} disabled={importing} />
                    <div className="flex gap-0.5">
                      <button type="button" className="btn-ghost p-1" aria-label={t('moveUp')} disabled={importing || i === 0} onClick={() => move(i, -1)}><ArrowUp size={11} /></button>
                      <button type="button" className="btn-ghost p-1" aria-label={t('moveDown')} disabled={importing || i === dbImportQueue.length - 1} onClick={() => move(i, 1)}><ArrowDown size={11} /></button>
                      <button type="button" className="btn-danger p-1 border-none" aria-label={t('remove')} disabled={importing} onClick={() => setDbImportQueue(dbImportQueue.filter((_, j) => j !== i))}><Trash2 size={11} /></button>
                    </div>
                  </div>
                  {item.status !== 'pending' && (
                    <div className="mt-1.5">
                      <div className="h-1 bg-border rounded-full overflow-hidden">
                        <div className={`h-full ${item.status === 'error' ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${item.status === 'error' ? 100 : item.pct || 0}%` }} />
                      </div>
                      {item.error && <pre className="text-[10px] text-danger whitespace-pre-wrap mt-1 m-0">{item.error}</pre>}
                      {item.status === 'done' && <span className="text-[10px] text-accent">✓ {t('dbImportItemDone')}</span>}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-4 text-[11px] mt-1">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={options.recreate} onChange={e => setOptions({ ...options, recreate: e.target.checked })} /> {t('dbRecreate')}</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={options.disableFk} onChange={e => setOptions({ ...options, disableFk: e.target.checked })} /> {t('dbDisableFk')}</label>
                <label className={`flex items-center gap-1.5 cursor-pointer ${options.recreate ? '' : 'opacity-40'}`}><input type="checkbox" disabled={!options.recreate} checked={options.backup} onChange={e => setOptions({ ...options, backup: e.target.checked })} /> {t('dbBackupBeforeRecreate')}</label>
                <button type="button" className="btn-primary text-[12px] flex items-center gap-1.5 ml-auto" onClick={runImport} disabled={importing}>
                  {importing ? <Loader size={12} className="animate-spin" /> : <Play size={12} />} {t('dbStartImport')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DatabaseTools;
