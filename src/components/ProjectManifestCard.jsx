import React, { useEffect, useState } from 'react';
import { FileText, Download, Upload, Loader, FolderOpen } from 'lucide-react';
import { useStore } from '../store';
import Card from './Card';

/** Team setup in one step: import a project's devstack.json, or export the current sites to one. */
const ProjectManifestCard = () => {
  const { findProjectManifests, importProjectManifest, exportProjectManifest, groupNames, siteApplying, settings, t } = useStore();
  const [found, setFound] = useState([]);
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { findProjectManifests().then(setFound); }, [settings.rootPath]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const www = (settings.rootPath || '').replace(/\//g, '\\').replace(/\\+$/, '');

  return (
    <Card
      title={t('manifestTitle')}
      desc={t('manifestDesc')}
      actions={(
        <button type="button" className="btn-ghost flex items-center gap-1.5 border border-border text-[12px] py-1.5 px-3" disabled={busy || siteApplying} onClick={() => run(() => importProjectManifest())}>
          <FolderOpen size={13} /> {t('manifestPickFile')}
        </button>
      )}
    >
      {found.length === 0 && <p className="text-[11px] text-muted italic m-0 mb-3">{t('manifestNoneFound')}</p>}
      <div className="flex flex-col gap-1.5 mb-4">
        {found.map(file => (
          <div key={file} className="flex items-center gap-3 text-[12px]">
            <FileText size={13} className="text-accent shrink-0" />
            <span className="flex-1 font-mono truncate" title={file}>{file.startsWith(www) ? file.slice(www.length + 1) : file}</span>
            <button type="button" className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1" disabled={busy || siteApplying} onClick={() => run(() => importProjectManifest(file))}>
              {busy ? <Loader size={12} className="animate-spin" /> : <Download size={12} />} {t('manifestImport')}
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select aria-label={t('groupName')} className="select-field w-[220px]" value={group} onChange={e => setGroup(e.target.value)}>
          <option value="">{t('allManagedProjects')}</option>
          {groupNames().map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button type="button" className="btn-ghost flex items-center gap-1.5 border border-border text-[12px] py-1.5 px-3" disabled={busy} onClick={() => run(() => exportProjectManifest(group))}>
          <Upload size={13} /> {t('manifestExport')}
        </button>
        <span className="text-[11px] text-muted">{t('manifestExportHint')}</span>
      </div>
    </Card>
  );
};

export default ProjectManifestCard;
