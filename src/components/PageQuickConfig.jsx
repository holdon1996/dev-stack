import React, { useState } from 'react';
import { useStore } from '../store';
import { Globe, Database, Code, Monitor, ExternalLink, Edit3, Check, X, FileCode, FolderSearch, Terminal } from 'lucide-react';

const categoryMeta = {
  'Web Server': { icon: Globe, color: '#f48120' },
  'Database':   { icon: Database, color: '#4a9eff' },
  'PHP':        { icon: Code, color: '#8892be' },
  'System':     { icon: Monitor, color: '#f5a623' },
};

const ConfigCard = ({ file }) => {
  const { openConfigFile, updateConfigPath, browseForFile, showToast, t } = useStore();
  const [editing, setEditing] = useState(false);
  const [tempPath, setTempPath] = useState(file.path);

  const meta = categoryMeta[file.category] || { icon: FileCode, color: '#6b7280' };
  const Icon = meta.icon;

  const handleSave = () => {
    updateConfigPath(file.id, tempPath);
    setEditing(false);
    showToast(t('pathUpdated', { label: file.label }), 'ok');
  };

  const handleBrowse = () => {
    browseForFile(file.id);
  };

  const handleOpen = () => {
    if (!file.path) {
      setTempPath('');
      setEditing(true);
      showToast(t('setPathFirst'), 'warn');
      return;
    }
    openConfigFile(file.id);
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4 transition-all duration-200 hover:border-[#3d4049] hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] group">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
        >
          <Icon size={18} style={{ color: meta.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold tracking-tight mb-0.5">{file.label}</div>
          <div className="text-[11px] text-muted mb-2">{file.desc}</div>

          {editing ? (
            <div className="flex gap-1.5">
              <input
                className="input-field text-[11px] py-1 px-2 flex-1"
                value={tempPath}
                onChange={(e) => setTempPath(e.target.value)}
                placeholder="C:/path/to/file..."
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
              <button
                className="btn-ghost py-1 px-2 text-[11px]"
                onClick={handleBrowse}
                title={t('browse')}
              >
                <FolderSearch size={12} />
              </button>
              <button className="btn-primary py-1 px-2 text-[11px]" onClick={handleSave}><Check size={12} /></button>
              <button className="btn-ghost py-1 px-2 text-[11px]" onClick={() => setEditing(false)}><X size={12} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted font-mono truncate flex-1">
                {file.path || t('pathNotConfigured')}
              </span>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost py-0.5 px-1.5 text-[10px]"
                onClick={handleBrowse}
                title={t('browse')}
              >
                <FolderSearch size={11} />
              </button>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost py-0.5 px-1.5 text-[10px]"
                onClick={() => { setTempPath(file.path); setEditing(true); }}
                title="Edit path"
              >
                <Edit3 size={11} />
              </button>
            </div>
          )}
        </div>

        <button
          className="btn-ghost px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
          onClick={handleOpen}
        >
          <ExternalLink size={12} /> {t('open')}
        </button>
      </div>
    </div>
  );
};

const PageQuickConfig = () => {
  const { configFiles, t } = useStore();
  const categories = [...new Set(configFiles.map(f => f.category))];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-extrabold m-0 flex items-center gap-2">
            <FileCode size={20} className="text-accent" /> {t('configTitle')}
          </h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('configDesc')}</p>
        </div>
        <button 
          className="btn-primary flex items-center gap-2 px-4 py-2 text-[12px]"
          onClick={() => useStore.getState().openTerminal()}
        >
          <Terminal size={14} /> Open Dev Terminal
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {categories.map(cat => {
          const meta = categoryMeta[cat] || { icon: FileCode, color: '#6b7280' };
          const CatIcon = meta.icon;
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <CatIcon size={14} style={{ color: meta.color }} />
                <span className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">{cat}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {configFiles.filter(f => f.category === cat).map(file => (
                  <ConfigCard key={file.id} file={file} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PageQuickConfig;
