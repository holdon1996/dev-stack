import React, { useState } from 'react';
import { useStore } from '../store';
import { Globe, Database, Code, Monitor, ExternalLink, Edit3, Check, X, FileCode, FolderSearch, Terminal } from 'lucide-react';

const categoryMeta = {
  'Web Server': { icon: Globe, color: '#f48120' },
  'Database': { icon: Database, color: '#4a9eff' },
  'PHP': { icon: Code, color: '#8892be' },
  'System': { icon: Monitor, color: '#f5a623' },
};

const ConfigCard = ({ file }) => {
  const { openConfigFile, updateConfigPath, browseForFile, browseForEditor, showToast, t } = useStore();
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
    openConfigFile(file.id, false, file.path);
  };

  const isActive = file.source === 'Mặc định';

  return (
    <div className={`bg-surface border rounded-xl p-4 transition-all duration-200 group
      ${isActive ? 'border-accent shadow-[0_4px_20px_rgba(34,211,238,0.15)] ring-1 ring-accent/30 z-10' : 'border-border hover:border-[#3d4049] hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]'}
    `}>
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
        >
          <Icon size={18} style={{ color: meta.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="text-[14px] font-bold tracking-tight">{file.label}</div>
            {file.path && file.source && (
              <span className={`text-[9px] px-1.5 py-0 rounded-full font-bold uppercase border
                ${file.source === 'XAMPP' ? 'bg-orange-500/20 text-orange-500 border-orange-500/30' :
                  file.source === 'Laragon' ? 'bg-blue-500/20 text-blue-500 border-blue-500/30' :
                    'bg-accent/20 text-accent border-accent/30'}
              `}>
                {file.source === 'Mặc định' ? t('defaultLabel') : file.source}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted mb-2">{file.desc}</div>

          {editing ? (
            <div className="flex gap-1.5">
              <input
                className="input-field text-[11px] py-1 px-2 flex-1"
                value={tempPath}
                onChange={(e) => setTempPath(e.target.value)}
                placeholder={t('pathPlaceholder')}
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
                title={t('editPath')}
              >
                <Edit3 size={11} />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            className="btn-primary px-2.5 py-1.5 text-[11px] flex items-center justify-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity"
            onClick={handleOpen}
          >
            <ExternalLink size={12} /> {t('open')}
          </button>
          <button
            className="btn-ghost px-2.5 py-1 text-[10px] flex items-center justify-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity border-none"
            onClick={() => openConfigFile(file.id, true, file.path)}
            title={t('openWithTitle')}
          >
            <Edit3 size={11} /> {t('openWith')}
          </button>
        </div>
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
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {categories.map(cat => {
          const meta = categoryMeta[cat] || { icon: FileCode, color: '#6b7280' };
          const CatIcon = meta.icon;

          // Expand my_ini to show all MySQL versions if necessary
          const displayFiles = [];
          const catFiles = configFiles.filter(f => f.category === cat);

          catFiles.forEach(file => {
            const state = useStore.getState();
            const { settings, apacheVersions, phpVersions, mysqlVersions } = state;
            const devDir = settings.devStackDir.replace(/\\/g, '/');

            if (file.id === 'my_ini') {
              const installedMysqls = mysqlVersions.filter(v => v.installed);
              if (installedMysqls.length > 0) {
                installedMysqls.forEach(v => {
                  displayFiles.push({
                    ...file,
                    id: `my_ini_${v.version}`,
                    label: `my.ini (MySQL ${v.version})`,
                    path: `${devDir}/bin/mysql/mysql-${v.version}/my.ini`,
                    source: v.active ? 'Mặc định' : 'DevStack'
                  });
                });
              } else {
                displayFiles.push(file);
              }
            } else {
              let autoPath = file.path;
              if (!autoPath) {
                if (file.id === 'httpd_conf') {
                  const activeApache = apacheVersions.find(a => a.active && a.installed);
                  if (activeApache) autoPath = `${devDir}/bin/apache/apache-${activeApache.version}/conf/httpd.conf`;
                } else if (file.id === 'vhosts_conf') {
                  const activeApache = apacheVersions.find(a => a.active && a.installed);
                  if (activeApache) autoPath = `${devDir}/bin/apache/apache-${activeApache.version}/conf/extra/httpd-vhosts.conf`;
                } else if (file.id === 'httpd_ssl') {
                  const activeApache = apacheVersions.find(a => a.active && a.installed);
                  if (activeApache) autoPath = `${devDir}/bin/apache/apache-${activeApache.version}/conf/extra/httpd-ssl.conf`;
                } else if (file.id === 'php_ini') {
                  const activePhp = phpVersions.find(p => p.active && p.installed);
                  if (activePhp) autoPath = `${devDir}/bin/php/php-${activePhp.version}/php.ini`;
                }
              }
              displayFiles.push({
                ...file,
                path: autoPath || file.path,
              });
            }
          });

          // Sort active (Mặc định) to the top/left
          displayFiles.sort((a, b) => {
            if (a.source === 'Mặc định') return -1;
            if (b.source === 'Mặc định') return 1;
            return 0;
          });

          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                <CatIcon size={14} style={{ color: meta.color }} />
                <span className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase">{cat}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {displayFiles.map(file => (
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
