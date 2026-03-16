import React, { useEffect } from 'react';
import { useStore } from '../store';
import { Play, Square, RotateCcw, Globe, Database, Settings, Zap, AlertTriangle, CheckCircle } from 'lucide-react';

const MetricCard = ({ label, value, color }) => (
  <div className="metric-card shine">
    <div className="text-[11px] text-muted font-bold tracking-wider uppercase mb-2">{label}</div>
    <div className={`text-[28px] font-extrabold ${color}`}>{value}</div>
  </div>
);

const ServiceRow = ({ service }) => {
  const { toggleService, showToast, portConflicts, checkPortConflict, t } = useStore();

  const icons = { web: Globe, db: Database, php: Settings, cache: Zap };
  const Icon = icons[service.type] || Zap;
  const conflict = portConflicts[service.port];

  useEffect(() => {
    if (service.status === 'stopped') checkPortConflict(service.port);
  }, [service.status]);

  return (
    <div className="service-row">
      <span className={`status-dot ${service.status === 'running' ? 'dot-running' : 'dot-stopped'}`}></span>
      <span className="text-[18px] w-7 text-center flex justify-center">
        <Icon size={18} className={service.status === 'running' ? 'text-accent' : 'text-muted'} />
      </span>
      <div className="flex-1">
        <div className="text-[14px] font-bold tracking-tight">{service.name}</div>
        <div className="text-[11px] text-muted font-mono">
          {service.status === 'running' ? `PID ${service.pid}` : t('notRunning')}
        </div>
      </div>
      <span className="tag tag-version">{service.version}</span>
      <span className="tag tag-port">:{service.port}</span>

      {/* Port conflict indicator */}
      {service.status === 'stopped' && conflict?.inUse && (
        <span className="flex items-center gap-1 text-[10px] text-warn font-bold" title={`Port ${service.port} in use by PID ${conflict.pid}`}>
          <AlertTriangle size={12} /> Port in use
        </span>
      )}
      {service.status === 'stopped' && conflict === null && (
        <span className="flex items-center gap-1 text-[10px] text-accent font-bold">
          <CheckCircle size={12} /> Port free
        </span>
      )}

      <span className="text-[12px] text-muted font-mono w-[70px] text-right">{service.memory}</span>
      <div className="flex gap-1.5 ml-2">
        {service.status === 'running' ? (
          <button className="btn-danger" onClick={async () => { await toggleService(service.id); showToast(`${service.name} stopped.`, 'warn'); }}>
            {t('stop')}
          </button>
        ) : (
          <button
            className="btn-primary"
            onClick={async () => {
              // Final check before starting
              const isBusy = await checkPortConflict(service.port);
              if (isBusy) {
                showToast(`Cannot start ${service.name}: Port ${service.port} is busy! (PID: ${portConflicts[service.port]?.pid || '?'})`, 'danger');
                return;
              }
              await toggleService(service.id);
              showToast(`${service.name} started.`, 'ok');
            }}
          >
            {t('start')}
          </button>
        )}
        <button className="btn-ghost px-2"><RotateCcw size={14} /></button>
      </div>
    </div>
  );
};

const PageServices = () => {
  const { services, sites, startAll, stopAll, showToast, t } = useStore();
  const runningCount = services.filter(s => s.status === 'running').length;
  const stoppedCount = services.length - runningCount;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] flex items-center gap-3 bg-bg">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold tracking-tight m-0 text-text">{t('servicesTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('servicesDesc')}</p>
        </div>
        <button className="btn-ghost flex items-center gap-2" onClick={async () => { await startAll(); showToast(t('startAll') + ' ✓', 'ok'); }}>
          <Play size={12} /> {t('startAll')}
        </button>
        <button className="btn-danger flex items-center gap-2" onClick={async () => { await stopAll(); showToast(t('stopAll') + ' ✓', 'warn'); }}>
          <Square size={12} /> {t('stopAll')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-4 gap-3 mb-5">
          <MetricCard label={t('running')} value={runningCount} color="text-accent" />
          <MetricCard label={t('stopped')} value={stoppedCount} color="text-muted" />
          <MetricCard label={t('sites')} value={sites.length} color="text-info" />
          <MetricCard label={t('uptime')} value="2h 14m" color="text-warn" />
        </div>

        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4.5 py-3.5 border-b border-border flex items-center justify-between bg-surface">
            <span className="text-[13px] font-bold text-textDim tracking-wider uppercase">{t('serviceInstances')}</span>
            <button className="btn-primary">{t('addService')}</button>
          </div>
          <div className="flex flex-col">
            {services.map(s => <ServiceRow key={s.id} service={s} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageServices;
