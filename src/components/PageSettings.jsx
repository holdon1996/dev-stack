import React from 'react';
import { useStore } from '../store';
import { Bug, FolderSearch, RefreshCw } from 'lucide-react';

const PageSettings = () => {
  const { settings, toggleSetting, updateSetting, showToast, locale, setLocale, browseForFolder, browseForEditor, initApp, t } = useStore();

  // Local state for paths to prevent immediate rescanning while typing
  const [localRootPath, setLocalRootPath] = React.useState(settings.rootPath);
  const [localDevDir, setLocalDevDir] = React.useState(settings.devStackDir);

  React.useEffect(() => {
    setLocalRootPath(settings.rootPath);
    setLocalDevDir(settings.devStackDir);
  }, [settings.rootPath, settings.devStackDir]);

  const Toggle = ({ active, onToggle }) => (
    <div
      onClick={onToggle}
      className={`w-10 h-[22px] ${active ? 'bg-accent' : 'bg-border'} rounded-[11px] cursor-pointer relative transition-colors duration-200`}
    >
      <div className={`w-[18px] h-[18px] bg-white rounded-full absolute top-0.5 transition-all duration-200 ${active ? 'right-0.5' : 'left-0.5'}`}></div>
    </div>
  );

  const handleBrowse = async (key) => {
    const path = await browseForFolder();
    if (path) {
      if (key === 'rootPath') setLocalRootPath(path);
      if (key === 'devStackDir') setLocalDevDir(path);
      showToast(t('pathSelectedSave'), 'info');
    }
  };

  const handleApplyChanges = async () => {
    const { updateServicePort, services, apacheVersions, scanInstalledApache } = useStore.getState();

    // Update permanent settings (may no-op if value unchanged, that's fine)
    updateSetting('rootPath', localRootPath);
    updateSetting('devStackDir', localDevDir);

    // Always force-patch httpd.conf regardless of whether the value "changed".
    // updateSetting skips processing when oldValue === newValue, so we do the patch here directly.
    const { invoke } = await import('@tauri-apps/api/core');
    const dsDir = localDevDir.replace(/\\/g, '/').replace(/\/$/, '');
    const docRoot = localRootPath.replace(/\\/g, '/').replace(/\/$/, '');

    // Find active Apache: use current state first, fallback to scan
    let activeApache = apacheVersions.find(v => v.active && v.installed)
      || apacheVersions.find(v => v.installed);

    if (!activeApache) {
      // Try scanning in case something wasn't detected yet
      await scanInstalledApache();
      activeApache = useStore.getState().apacheVersions.find(v => v.active && v.installed)
        || useStore.getState().apacheVersions.find(v => v.installed);
    }

    if (activeApache) {
      const serverRoot = `${dsDir}/bin/apache/apache-${activeApache.version}`;
      invoke('patch_apache_paths', {
        newServerRoot: serverRoot,
        newDocRoot: docRoot
      }).then((path) => {
        showToast(`✓ Apache config synced: ${path}`, 'ok');
      }).catch(err => {
        console.error('patch_apache_paths failed:', err);
        showToast(t('apacheConfigError', { error: err }), 'danger');
      });
    } else {
      showToast(t('noApacheVersionToPatch'), 'warn');
    }

    if (services.find(s => s.type === 'web')) await updateServicePort(1, settings.port80);
    if (services.find(s => s.type === 'db')) await updateServicePort(2, settings.portMySQL);

    showToast(t('settingsSaved'), 'ok');
  };

  const handleRescan = () => {
    // Sync local state to store before init
    updateSetting('rootPath', localRootPath);
    updateSetting('devStackDir', localDevDir);

    setTimeout(() => {
      initApp();
      showToast('Rescanning...', 'info');
    }, 100);
  };

  const handleOpenInspector = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_main_devtools');
      showToast(t('inspectorOpened'), 'ok');
    } catch (e) {
      console.error('open_main_devtools failed:', e);
      showToast(t('inspectorError', { error: e }), 'danger');
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('settingsTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('settingsDesc')}</p>
        </div>
        <button className="btn-ghost flex items-center gap-2 mr-2" onClick={handleOpenInspector}>
          <Bug size={14} /> {t('inspect')}
        </button>
        <button className="btn-ghost flex items-center gap-2" onClick={handleRescan}>
          <RefreshCw size={14} /> {t('rescan')}
        </button>
      </div>

      <div className="p-6 max-w-[800px] flex flex-col gap-5">
        {/* Language */}
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
          <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase border-b border-border pb-3">{t('language')}</div>
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold">{t('languageDesc')}</div>
            <select className="select-field w-[180px]" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="en">🇺🇸 English</option>
              <option value="vi">🇻🇳 Tiếng Việt</option>
            </select>
          </div>
        </div>

        {/* Paths */}
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
          <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase border-b border-border pb-3">{t('general')}</div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-textDim">{t('rootDocPath')}</label>
            <div className="flex gap-2">
              <input className="input-field flex-1" value={localRootPath} onChange={(e) => setLocalRootPath(e.target.value)} />
              <button className="btn-ghost px-3 flex items-center gap-1.5" onClick={() => handleBrowse('rootPath')}>
                <FolderSearch size={14} /> {t('browse')}
              </button>
            </div>
            <span className="text-[11px] text-muted">{t('rootDocPathDesc')}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-textDim">{t('devStackDir')}</label>
            <div className="flex gap-2">
              <input className="input-field flex-1" value={localDevDir} onChange={(e) => setLocalDevDir(e.target.value)} />
              <button className="btn-ghost px-3 flex items-center gap-1.5" onClick={() => handleBrowse('devStackDir')}>
                <FolderSearch size={14} /> {t('browse')}
              </button>
            </div>
            <span className="text-[11px] text-muted">{t('devStackDirDesc')}</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold">{t('startOnBoot')}</div>
              <div className="text-[11px] text-muted">{t('startOnBootDesc')}</div>
            </div>
            <Toggle active={settings.startOnBoot} onToggle={() => toggleSetting('startOnBoot')} />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <label className="text-[13px] font-semibold text-textDim">{t('defaultEditor')}</label>
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                value={settings.editorPath}
                placeholder={t('defaultEditorPlaceholder')}
                onChange={(e) => updateSetting('editorPath', e.target.value)}
              />
              <button
                className="btn-ghost px-3 flex items-center gap-1.5"
                onClick={browseForEditor}
              >
                <FolderSearch size={14} /> {t('browse')}
              </button>
            </div>
            <span className="text-[11px] text-muted">{t('defaultEditorDesc')}</span>
          </div>
        </div>

        {/* Ports */}
        <div className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
          <div className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase border-b border-border pb-3">{t('ports')}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-textDim">{t('httpPort')}</label>
              <input type="number" className="input-field" value={settings.port80} onChange={(e) => updateSetting('port80', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-textDim">{t('mysqlPort')}</label>
              <input type="number" className="input-field" value={settings.portMySQL} onChange={(e) => updateSetting('portMySQL', e.target.value)} />
            </div>
          </div>
          <button className="btn-primary self-start mt-2" onClick={handleApplyChanges}>
            {t('saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageSettings;
