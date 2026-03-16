import React from 'react';
import { useStore } from '../store';
import { Database, ExternalLink, Trash2 } from 'lucide-react';

const PageDatabase = () => {
  const { databases, removeDB, showToast, t } = useStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0">{t('dbTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">MySQL 8.0 · port 3306</p>
        </div>
        <button className="btn-ghost flex items-center gap-2">
          <ExternalLink size={14} /> phpMyAdmin
        </button>
        <div className="w-2.5"></div>
        <button className="btn-primary">{t('newDatabase')}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 px-6">
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4.5 py-3.5 border-b border-border grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-3 text-[11px] text-muted font-bold tracking-widest uppercase bg-surface">
            <span>{t('database')}</span>
            <span>{t('tables')}</span>
            <span>{t('size')}</span>
            <span>{t('charset')}</span>
            <span></span>
          </div>

          <div className="flex flex-col">
            {databases.map(db => (
              <div key={db.name} className="service-row grid grid-cols-[2fr_1fr_1fr_1fr_120px] gap-3 items-center">
                <div className="flex items-center gap-2.5">
                  <Database size={16} className="text-accent" />
                  <span className="text-[13px] font-bold font-mono tracking-tight">{db.name}</span>
                </div>
                <span className="text-[13px] text-textDim font-mono">{db.tables}</span>
                <span className="text-[13px] text-textDim font-mono">{db.size}</span>
                <div className="flex"><span className="tag tag-version">{db.charset}</span></div>
                <div className="flex gap-1.5 justify-end">
                  <button className="btn-ghost text-[11px] px-2 py-1">{t('manage')}</button>
                  <button
                    className="btn-danger p-1.5 border-none"
                    onClick={() => {
                      if (confirm(t('dropConfirm', { name: db.name }))) {
                        removeDB(db.name);
                        showToast(t('dbDropped', { name: db.name }), 'warn');
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageDatabase;
