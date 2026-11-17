import React from 'react';
import { useStore } from '../store';
import { Bug, Check, Download, FolderSearch, RefreshCw } from 'lucide-react';

const Section = ({ title, desc, action, children }) => (
  <section className="bg-surface border border-border rounded-xl p-5 flex flex-col gap-4">
    <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
      <div>
        <h2 className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase m-0">{title}</h2>
        {desc && <p className="text-[11px] text-muted mt-1 mb-0">{desc}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

const Toggle = ({ active, onToggle, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!active}
    aria-label={label}
    onClick={onToggle}
    className={`w-10 h-[22px] shrink-0 p-0 ${active ? 'bg-accent' : 'bg-border'} rounded-[11px] cursor-pointer relative transition-colors duration-200`}
  >
    <span className={`block w-[18px] h-[18px] bg-white rounded-full absolute top-0.5 transition-all duration-200 ${active ? 'right-0.5' : 'left-0.5'}`}></span>
  </button>
);

/** A folder setting: edits stay local until "Apply", which moves DevStack to the new folder. */
const FolderField = ({ id, settingKey, label, desc }) => {
  const { settings, updateSetting, browseForFolder, t } = useStore();
  const saved = settings[settingKey] || '';
  const [value, setValue] = React.useState(saved);
  React.useEffect(() => setValue(saved), [saved]);
  // Same folder written differently (\ vs /, trailing slash) is not a change: Apply restarts everything.
  const norm = (p) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const dirty = value.trim() !== '' && norm(value) !== norm(saved);

  const browse = async () => {
    const path = await browseForFolder();
    if (path) setValue(path.replace(/\\/g, '/'));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-textDim">{label}</label>
      <div className="flex gap-2">
        <input id={id} className="input-field flex-1 font-mono" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} />
        <button type="button" className="btn-ghost px-3 flex items-center gap-1.5" onClick={browse}>
          <FolderSearch size={14} /> {t('browse')}
        </button>
        {/* updateSetting stops services, rewrites Apache/MySQL paths and starts them again. */}
        {dirty && (
          <button type="button" className="btn-primary px-3 flex items-center gap-1.5" onClick={() => updateSetting(settingKey, value.trim())}>
            <Check size={14} /> {t('applyPath')}
          </button>
        )}
      </div>
      <span className="text-[11px] text-muted">{desc}</span>
      {dirty && <span className="text-[11px] text-warn">{t('applyPathPending')}</span>}
    </div>
  );
};

const samePath = (a, b) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();

const EditorField = ({ id, label, desc, value, placeholder, onChange, onBrowse, found }) => {
  const { t } = useStore();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-textDim">{label}</label>
      <div className="flex gap-2">
        <input id={id} className="input-field flex-1 font-mono placeholder:font-sans" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        <button type="button" className="btn-ghost px-3 flex items-center gap-1.5" onClick={onBrowse}>
          <FolderSearch size={14} /> {t('browse')}
        </button>
      </div>
      {found.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">{t('editorsFound')}</span>
          {found.map(e => (
            <button
              key={e.path}
              type="button"
              title={e.path}
              aria-pressed={samePath(value, e.path)}
              className={`text-[11px] px-2 py-0.5 rounded-md border ${samePath(value, e.path) ? 'border-accent text-accent' : 'border-border text-textDim hover:text-text'}`}
              onClick={() => onChange(e.path)}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}
      <span className="text-[11px] text-muted">{desc}</span>
    </div>
  );
};

const PageSettings = () => {
  const {
    settings, toggleSetting, updateSetting, showToast, locale, setLocale, browseForEditor, detectEditors, t,
    appUpdate, checkAppUpdate, openAppUpdateUrl, installAppUpdate,
  } = useStore();
  const [found, setFound] = React.useState([]);
  const [rescanning, setRescanning] = React.useState(false);

  React.useEffect(() => { detectEditors().then(setFound); }, []);

  // Only rescans installs and projects: initApp would auto-start services and toast "ready" again.
  const handleRescan = async () => {
    setRescanning(true);
    const s = useStore.getState();
    // allSettled: one failing scan must not hide the others' results.
    await Promise.allSettled([s.scanInstalledApache(), s.scanInstalledPhp(), s.scanInstalledMysql(), s.scanInstalledNode(), s.resolveRedis(), s.scanSites()]);
    // A PHP copied into bin/php by hand gets its CA settings now, not at the next app start.
    await s.ensurePhpCaConfig();
    setRescanning(false);
    showToast(t('installsRescanned'), 'ok');
  };

  const handleOpenInspector = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_main_devtools');
    } catch (e) {
      console.error('open_main_devtools failed:', e);
      showToast(t('inspectorError', { error: e }), 'danger');
    }
  };

  const updateStatusTone = {
    idle: 'text-muted border-border',
    checking: 'text-info border-[#2e6ef733]',
    'up-to-date': 'text-accent border-[#00e5a033]',
    available: 'text-warn border-[#f5a62333]',
    error: 'text-danger border-[#ff4d6d33]'
  };
  const updateStatusLabel = {
    checking: t('updateChecking'),
    'up-to-date': t('updateUpToDate'),
    available: t('updateAvailable'),
    error: t('updateCheckError'),
  }[appUpdate.status] || t('updateIdle');
  const installProgressPct = appUpdate.totalBytes > 0
    ? Math.min(100, Math.round((appUpdate.downloadedBytes / appUpdate.totalBytes) * 100))
    : 0;
  const installLabel = {
    downloading: `${t('updateDownloading')} ${installProgressPct}%`,
    installing: t('updateInstalling'),
    installed: t('updateInstalled'),
    error: t('updateInstallError'),
  }[appUpdate.installStatus];
  const releaseNotes = React.useMemo(
    () => (appUpdate.notes || '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/^-\s+/gm, '• '),
    [appUpdate.notes]
  );
  const configEditor = settings.configEditorPath || '';

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg">
        <h1 className="text-[20px] font-extrabold m-0">{t('settingsTitle')}</h1>
        <p className="text-[12px] text-muted m-0 mt-1">{t('settingsDesc')}</p>
      </div>

      <div className="p-6 max-w-[800px] flex flex-col gap-5">
        <Section title={t('foldersSection')} desc={t('foldersSectionDesc')}>
          <FolderField id="settings-www" settingKey="rootPath" label={t('rootDocPath')} desc={t('rootDocPathDesc')} />
          <FolderField id="settings-devstack" settingKey="devStackDir" label={t('devStackDir')} desc={t('devStackDirDesc')} />
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <div className="text-[13px] font-semibold">{t('rescanInstalls')}</div>
              <div className="text-[11px] text-muted">{t('rescanInstallsDesc')}</div>
            </div>
            <button type="button" className="btn-ghost flex items-center gap-2 shrink-0" onClick={handleRescan} disabled={rescanning}>
              <RefreshCw size={14} className={rescanning ? 'animate-spin' : ''} /> {t('rescan')}
            </button>
          </div>
        </Section>

        <Section title={t('editorsSection')}>
          <EditorField
            id="settings-project-editor"
            label={t('projectEditor')}
            desc={t('projectEditorDesc')}
            value={settings.editorPath || ''}
            placeholder={t('defaultEditorPlaceholder')}
            onChange={(v) => updateSetting('editorPath', v)}
            onBrowse={() => browseForEditor('editorPath')}
            found={found}
          />
          <EditorField
            id="settings-config-editor"
            label={t('configEditor')}
            desc={t('configEditorDesc')}
            value={configEditor}
            placeholder={t('configEditorPlaceholder')}
            onChange={(v) => updateSetting('configEditorPath', v)}
            onBrowse={() => browseForEditor('configEditorPath')}
            found={found}
          />
        </Section>

        <Section title={t('appSection')}>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="settings-language" className="text-[13px] font-semibold">{t('languageDesc')}</label>
            <select id="settings-language" className="select-field w-[180px]" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="en">English</option>
              <option value="vi">Tiếng Việt</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold">{t('startOnBoot')}</div>
              <div className="text-[11px] text-muted">{t('startOnBootDesc')}</div>
            </div>
            <Toggle active={settings.startOnBoot} onToggle={() => toggleSetting('startOnBoot')} label={t('startOnBoot')} />
          </div>
        </Section>

        <Section
          title={t('appUpdates')}
          action={(
            <button type="button" className="btn-ghost flex items-center gap-2 shrink-0" onClick={() => checkAppUpdate(false)} disabled={appUpdate.status === 'checking'}>
              <RefreshCw size={14} className={appUpdate.status === 'checking' ? 'animate-spin' : ''} /> {t('checkForUpdates')}
            </button>
          )}
        >
          <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
            <div className="text-[13px]">
              <span className="text-muted">{t('currentVersion')}:</span> <span className="font-bold">{appUpdate.currentVersion || '—'}</span>
            </div>
            <div className="text-[13px]">
              <span className="text-muted">{t('latestVersion')}:</span> <span className="font-bold">{appUpdate.latestVersion || '—'}</span>
            </div>
            <div className={`tag bg-transparent ${updateStatusTone[appUpdate.status] || updateStatusTone.idle}`}>{updateStatusLabel}</div>
          </div>
          {appUpdate.lastCheckedAt && (
            <div className="text-[11px] text-muted -mt-2">{t('lastChecked')}: {new Date(appUpdate.lastCheckedAt).toLocaleString()}</div>
          )}

          {installLabel && (
            <div className="flex flex-col gap-2">
              <div className="text-[12px] text-textDim">{installLabel}</div>
              {appUpdate.installStatus === 'downloading' && (
                <div className="bar-bg"><div className="bar-fill" style={{ width: `${installProgressPct}%` }} /></div>
              )}
            </div>
          )}

          {appUpdate.error && (
            <div className="text-[12px] text-danger bg-[#ff4d6d12] border border-[#ff4d6d33] rounded-lg p-3">{appUpdate.error}</div>
          )}

          {appUpdate.available && (
            <div className="flex items-center gap-2">
              {appUpdate.canInstall ? (
                <button type="button" className="btn-primary flex items-center gap-2" onClick={installAppUpdate} disabled={appUpdate.installStatus === 'downloading' || appUpdate.installStatus === 'installing'}>
                  <Download size={14} /> {t('installUpdateTo', { version: appUpdate.latestVersion })}
                </button>
              ) : (
                <button type="button" className="btn-primary flex items-center gap-2" onClick={openAppUpdateUrl} disabled={!appUpdate.downloadUrl && !appUpdate.htmlUrl}>
                  <Download size={14} /> {appUpdate.downloadUrl ? t('downloadUpdate') : t('openReleasePage')}
                </button>
              )}
            </div>
          )}

          {releaseNotes && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-textDim">{t('releaseNotes')}</summary>
              <div className="mt-2 text-textDim whitespace-pre-wrap max-h-44 overflow-y-auto leading-relaxed bg-panel/50 border border-border rounded-lg p-3">
                {releaseNotes}
              </div>
            </details>
          )}
        </Section>

        <details className="bg-surface border border-border rounded-xl p-5 group">
          <summary className="cursor-pointer text-[11px] font-bold text-muted tracking-[0.08em] uppercase">{t('advancedSection')}</summary>
          <div className="flex items-center justify-between gap-3 mt-4">
            <div>
              <div className="text-[13px] font-semibold">{t('inspect')}</div>
              <div className="text-[11px] text-muted">{t('inspectDesc')}</div>
            </div>
            <button type="button" className="btn-ghost flex items-center gap-2 shrink-0" onClick={handleOpenInspector}>
              <Bug size={14} /> {t('open')}
            </button>
          </div>
          {!appUpdate.nativeConfigured && (
            <div className="text-[11px] text-muted mt-3">{t('updateNativeSetupHint')}</div>
          )}
        </details>
      </div>
    </div>
  );
};

export default PageSettings;
