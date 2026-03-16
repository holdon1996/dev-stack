import React from 'react';
import { useStore } from '../store';
import { FolderSearch, RefreshCw } from 'lucide-react';

const PageSettings = () => {
  const { settings, toggleSetting, updateSetting, showToast, locale, setLocale, browseForFolder, initApp, t } = useStore();

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
      updateSetting(key, path);
      showToast('Path updated!', 'ok');
    }
  };

  const handleRescan = () => {
    initApp();
    showToast('Rescanning...', 'info');
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('settingsTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('settingsDesc')}</p>
        </div>
        <button className="btn-ghost flex items-center gap-2" onClick={handleRescan}>
          <RefreshCw size={14} /> Rescan
        </button>
      </div>

      <div className="p-6 max-w-[600px] flex flex-col gap-5">
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
              <input className="input-field flex-1" value={settings.rootPath} onChange={(e) => updateSetting('rootPath', e.target.value)} />
              <button className="btn-ghost px-3 flex items-center gap-1.5" onClick={() => handleBrowse('rootPath')}>
                <FolderSearch size={14} /> {t('browse')}
              </button>
            </div>
            <span className="text-[11px] text-muted">{t('rootDocPathDesc')}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-textDim">{t('devStackDir')}</label>
            <div className="flex gap-2">
              <input className="input-field flex-1" value={settings.devStackDir} onChange={(e) => updateSetting('devStackDir', e.target.value)} />
              <button className="btn-ghost px-3 flex items-center gap-1.5" onClick={() => handleBrowse('devStackDir')}>
                <FolderSearch size={14} /> {t('browse')}
              </button>
            </div>
            <span className="text-[11px] text-muted">{t('devStackDirDesc')}</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold">{t('autoStartServices')}</div>
              <div className="text-[11px] text-muted">{t('autoStartDesc')}</div>
            </div>
            <Toggle active={settings.autoStart} onToggle={() => toggleSetting('autoStart')} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold">{t('startOnBoot')}</div>
              <div className="text-[11px] text-muted">{t('startOnBootDesc')}</div>
            </div>
            <Toggle active={settings.startOnBoot} onToggle={() => toggleSetting('startOnBoot')} />
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
          <button className="btn-primary self-start mt-2" onClick={() => showToast(t('settingsSaved'), 'ok')}>
            {t('saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageSettings;
