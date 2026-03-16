import React, { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Trash2 } from 'lucide-react';

const PageLogs = () => {
  const { logs, currentLog, switchLog, clearLog, showToast, t } = useStore();
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, currentLog]);

  const tabs = [
    { id: 'apache', label: 'Apache' },
    { id: 'mysql', label: 'MySQL' },
    { id: 'php', label: 'PHP' },
  ];

  const currentLines = logs[currentLog] || [];

  const getLogClass = (level) => {
    switch (level) {
      case 'ok': return 'text-accent';
      case 'warn': return 'text-warn';
      case 'err': return 'text-danger';
      case 'info': return 'text-info';
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
              className={`tab ${currentLog === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </div>
          ))}
        </div>

        <button className="btn-ghost" onClick={() => { clearLog(); showToast('Log cleared.', 'info'); }}>
          <Trash2 size={14} />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-5 px-6 bg-[#0a0b0d] font-mono text-[12px] leading-relaxed"
      >
        {currentLines.length === 0 ? (
          <div className="text-muted italic text-center py-10">{t('noLogs')}</div>
        ) : (
          currentLines.map((line, idx) => (
            <div key={idx} className="mb-1">
              <span className="text-muted mr-2">{line.t}</span>
              <span className={getLogClass(line.l)}>{line.m}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PageLogs;
