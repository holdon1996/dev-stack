import React, { useState } from 'react';
import { useStore } from '../store';
import { Play, Pause, RotateCcw, Globe, Database, Cpu, Zap, Loader, Power, Mail, HardDrive, ExternalLink, Terminal, Plus, Download } from 'lucide-react';
import { ConfigStaleBadge } from './PageSites';

const openUrl = async (url) => {
  const { openUrl: open } = await import('@tauri-apps/plugin-opener');
  await open(url);
};

const StatCard = ({ title, value, color }) => (
  <div className="metric-card shine">
    <div className="text-[11px] text-muted font-bold tracking-wider uppercase mb-2">{title}</div>
    <div className={`text-[28px] font-extrabold ${color}`}>{value}</div>
  </div>
);

const ServiceRow = ({ service }) => {
  const {
    toggleService, updateServicePort, apacheVersions, phpVersions, mysqlVersions,
    setActiveApache, setActivePhp, setActiveMysql, checkPortConflict, showToast,
    portConflicts
  } = useStore();

  const [isEditingPort, setIsEditingPort] = useState(false);
  const [tempPort, setTempPort] = useState(service.port);

  const Icon = service.type === 'web' ? Globe : service.type === 'db' ? Database : service.type === 'php' ? Cpu : service.type === 'mail' ? Mail : service.type === 'storage' ? HardDrive : Zap;
  const t = useStore.getState().t;
  const owner = service.status !== 'running' && !service.useExternal ? service.portOwner : null;

  // Get relevant versions for the dropdown
  const getVersions = () => {
    if (service.type === 'web') return apacheVersions;
    if (service.type === 'php') return phpVersions;
    if (service.type === 'db') return mysqlVersions;
    return [];
  };

  const versions = getVersions();
  const activeVer = versions.find(v => v.active)?.version || '—';
  const isTransitioning = service.status === 'starting' || service.status === 'stopping' || service.status === 'restarting';

  const handleVersionChange = async (e) => {
    const ver = e.target.value;
    if (service.type === 'web') await setActiveApache(ver);
    if (service.type === 'php') await setActivePhp(ver);
    if (service.type === 'db') await setActiveMysql(ver);
  };

  // toggleService checks which program holds the port and explains it (2.3).
  const handleToggle = () => toggleService(service.id);

  return (
    <div className="flex items-center gap-4 bg-[#1a1c22]/50 border border-white/5 rounded-xl p-4 transition-all hover:bg-[#1a1c22] hover:border-white/10 group mb-3 shadow-sm">
      <div className="flex items-center gap-3 w-[250px]">
        <span className={`w-10 h-10 rounded-full flex items-center justify-center ${service.status === 'running' ? 'bg-accent/20 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'bg-surface'}`}>
          <Icon size={18} className={service.status === 'running' ? 'text-accent' : 'text-muted'} />
        </span>
        <div className="flex-1 overflow-hidden">
          <div className="text-[14px] font-bold tracking-tight">{service.name}</div>
          <div className={`text-[10px] font-mono truncate ${owner ? 'text-danger' : 'text-muted'}`} title={service.path || owner?.exe}>
            {service.path || (owner ? t('externalHoldsPort') : service.useExternal ? t('usingExternalService') : t('notRunning'))}
          </div>
          {service.type === 'mail' && (
            <button type="button" className="text-[10px] text-accent hover:underline flex items-center gap-1" onClick={() => openUrl(`http://127.0.0.1:${useStore.getState().settings.mailUiPort || 8025}`)}>
              <ExternalLink size={10} /> {t('openMailpitUi')}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 w-[120px]">
        {service.status === 'running' && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted font-bold tracking-widest">{useStore.getState().t('pid')}</span>
            <span className="text-[12px] font-mono text-white">{service.pid}</span>
          </div>
        )}
        {versions.length > 0 ? (
          <select
            className="bg-bg border border-border rounded text-[11px] font-bold px-1.5 py-0.5 outline-none text-accent w-full cursor-pointer hover:border-accent/50 transition-colors"
            value={activeVer}
            onChange={handleVersionChange}
            disabled={isTransitioning}
          >
            {versions.map(v => (
              <option key={v.version} value={v.version}>{v.version} {v.installed ? '' : useStore.getState().t('notInstalled')}</option>
            ))}
          </select>
        ) : (
          <span className="tag tag-version w-fit uppercase font-mono">{service.version}</span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center gap-1 group/port relative">
        <div className="relative">
          <span
            className={`tag tag-port cursor-pointer hover:bg-accent/20 hover:text-accent border border-transparent hover:border-accent/30 transition-all font-mono px-3 py-1 rounded-lg flex items-center gap-1
              ${isEditingPort ? 'opacity-0' : 'opacity-100'}`}
            onClick={() => { setTempPort(service.port); setIsEditingPort(true); }}
            title={useStore.getState().t('clickToChangePortTooltip')}
          >
            <span className="text-[10px] opacity-40">:</span>
            {service.port || '—'}
          </span>

          {isEditingPort && (
            <input
              className="absolute inset-0 w-20 mx-auto bg-bg border-2 border-accent rounded-lg text-[12px] font-mono px-2 py-0.5 outline-none text-center text-accent shadow-[0_0_15px_rgba(34,211,238,0.3)] z-10"
              value={tempPort}
              onChange={(e) => setTempPort(e.target.value)}
              onBlur={() => { updateServicePort(service.id, tempPort); setIsEditingPort(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setIsEditingPort(false);
              }}
              autoFocus
            />
          )}
        </div>
        <div className="text-[9px] text-muted font-bold tracking-widest uppercase opacity-0 group-hover/port:opacity-100 transition-opacity">{useStore.getState().t('changePort')}</div>
        {owner && (
          <div className="mt-1 max-w-[320px] bg-red-500/10 px-2 py-1.5 rounded border border-red-500/20 text-[10px] text-red-300 leading-snug">
            <div>{t('portOwnedBy', { port: service.port, name: owner.service ? t('windowsServiceLabel', { name: owner.service }) : owner.name, pid: owner.pid, exe: owner.exe || '?' })}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {owner.service && (
                <button type="button" className="bg-red-500 text-white px-1.5 rounded font-bold" onClick={() => useStore.getState().stopWindowsService(service)}>{t('stopWindowsService')}</button>
              )}
              <button type="button" className="bg-red-500/40 text-white px-1.5 rounded font-bold" onClick={() => useStore.getState().killPort(service.port)}>{t('kill')}</button>
              <button type="button" className="bg-white/10 px-1.5 rounded font-bold" onClick={() => { setTempPort(service.port); setIsEditingPort(true); }}>{t('changePort')}</button>
              <button type="button" className="bg-white/10 px-1.5 rounded font-bold" onClick={() => useStore.getState().useExternalService(service.id)}>{t('useRunningService')}</button>
            </div>
          </div>
        )}
        {service.portConflict && !owner && !service.useExternal && (
          <div className="flex items-center gap-2 mt-1 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 animate-in fade-in zoom-in duration-200">
            <span className="text-[8px] text-red-500 font-bold animate-pulse uppercase tracking-tighter">{useStore.getState().t('portBusy')}</span>
            <button
              className="text-[8px] bg-red-500 text-white px-1 rounded hover:brightness-110 active:scale-95 transition-all font-bold uppercase"
              onClick={(e) => { e.stopPropagation(); useStore.getState().killPort(service.port); }}
              title={useStore.getState().t('killProcessTooltip')}
            >
              {useStore.getState().t('kill')}
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end ml-auto min-w-[120px]">
        {service.type === 'php' ? (
          <div className="text-[10px] text-muted font-bold tracking-wider leading-tight text-right w-full whitespace-nowrap opacity-60 flex items-center justify-end whitespace-pre-wrap">{useStore.getState().t('linkedToApache')}</div>
        ) : (
          <button
            className={`px-6 py-2 rounded-lg font-bold text-[13px] transition-all active:scale-95 flex items-center gap-2
              ${service.status === 'running'
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : isTransitioning
                  ? 'bg-surface text-muted cursor-not-allowed'
                  : 'bg-accent text-bg hover:brightness-110 shadow-lg shadow-accent/20'
              }
            `}
            onClick={handleToggle}
            disabled={isTransitioning}
          >
            {isTransitioning ? (
              <Loader size={14} className="animate-spin" />
            ) : service.status === 'running' ? useStore.getState().t('stop') : useStore.getState().t('start')}
          </button>
        )}
      </div>

      {service.type === 'php' ? (
        <div className="w-[60px]"></div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            className={`p-2 transition-colors rounded-lg hover:bg-white/5 ${useStore.getState().settings.autoStartMap?.[service.id]
              ? 'text-accent bg-accent/10 shadow-[0_0_10px_rgba(0,229,160,0.15)]'
              : 'text-muted hover:text-white'
              }`}
            title={useStore.getState().settings.autoStartMap?.[service.id] ? useStore.getState().t('autoStartOn') : useStore.getState().t('autoStartOff')}
            onClick={() => useStore.getState().toggleAutoStartService(service.id)}
          >
            <Power size={14} />
          </button>
          <button
            className="p-2 text-muted hover:text-accent transition-colors rounded-lg hover:bg-white/5"
            title={useStore.getState().t('restartServiceTitle')}
            onClick={() => toggleService(service.id, 'restart')}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

const MinioPanel = () => {
  const { services, minioBuckets, listMinioBuckets, createMinioBucket, installMinio, minioCredentials, minioPaths, t } = useStore();
  const [bucket, setBucket] = useState('');
  const [installed, setInstalled] = useState(true);
  const svc = services.find(s => s.type === 'storage');
  const { user, password } = minioCredentials();
  const port = svc?.port || 9000;

  React.useEffect(() => {
    (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      setInstalled(await invoke('path_exists', { path: minioPaths().exe }));
    })();
    if (svc?.status === 'running') listMinioBuckets();
  }, [svc?.status]);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <HardDrive size={15} className="text-accent" />
        <span className="text-[13px] font-bold flex-1">MinIO (S3)</span>
        {!installed && (
          <button type="button" className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1" onClick={async () => { await installMinio(); setInstalled(true); }}>
            <Download size={12} /> {t('install')}
          </button>
        )}
        <button type="button" className="btn-ghost text-[11px] py-1 px-2 flex items-center gap-1" onClick={() => openUrl(`http://127.0.0.1:${port + 1}`)} disabled={svc?.status !== 'running'}>
          <ExternalLink size={11} /> {t('openConsole')}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 text-[12px] font-mono mb-3">
        <div><div className="text-[10px] text-muted font-sans font-bold uppercase">{t('endpoint')}</div>http://127.0.0.1:{port}</div>
        <div><div className="text-[10px] text-muted font-sans font-bold uppercase">{t('accessKey')}</div>{user}</div>
        <div><div className="text-[10px] text-muted font-sans font-bold uppercase">{t('secretKey')}</div>{password}</div>
      </div>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await createMinioBucket(bucket.trim())) setBucket(''); }}>
        <input aria-label={t('bucketName')} className="input-field flex-1 font-mono text-[12px]" placeholder="na-local" value={bucket} onChange={e => setBucket(e.target.value.toLowerCase())} disabled={svc?.status !== 'running'} />
        <button type="submit" className="btn-primary text-[12px] flex items-center gap-1" disabled={!bucket.trim() || svc?.status !== 'running'}><Plus size={12} /> {t('createBucket')}</button>
      </form>
      {minioBuckets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {minioBuckets.map(b => <span key={b} className="tag font-mono text-[11px]">{b}</span>)}
        </div>
      )}
    </div>
  );
};

const PageServices = () => {
  const { startAll, stopAll, showToast, t, startTime, services, systemStats, isElevated } = useStore();
  const { cpu, ram } = systemStats;
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  const uptimeStr = React.useMemo(() => {
    if (!startTime) return '0h 0m';
    const diff = Math.max(0, Math.floor((now - startTime) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return `${h}h ${m}m`;
  }, [now, startTime]);

  const runningCount = services.filter(s => s.status === 'running').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-extrabold m-0">{t('servicesTitle') || 'Services'}</h1>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${isElevated ? 'text-accent border-accent/30 bg-accent/10' : 'text-textDim border-white/10 bg-white/[0.03]'}`}>
              {isElevated ? t('adminBadge') : t('standardBadge')}
            </span>
          </div>
          <p className="text-[11px] text-muted font-bold mt-1 uppercase tracking-widest">{t('servicesDesc') || 'Manage Stack'}</p>
        </div>

        <div className="flex gap-2 items-center">
          <ConfigStaleBadge />
          <div className="flex items-center border border-border rounded-lg overflow-hidden" role="group" aria-label={t('openTerminal')}>
            <span className="px-2 text-muted"><Terminal size={13} /></span>
            {[['cmd', 'CMD'], ['powershell', 'PowerShell'], ['bash', 'Git Bash']].map(([shell, label]) => (
              <button key={shell} type="button" className="px-2 py-1.5 text-[11px] font-bold text-textDim hover:text-accent hover:bg-white/5" title={t('devstackTerminalHint')} onClick={() => useStore.getState().openTerminal(null, shell)}>
                {label}
              </button>
            ))}
          </div>
          <button className="btn-ghost flex items-center gap-2" onClick={async () => { await startAll(); showToast(t('startingAllServices'), 'ok'); }}>
            <Play size={14} /> {t('startAll') || 'Start All'}
          </button>
          <button className="btn-danger flex items-center gap-2" onClick={async () => { await stopAll(); showToast(t('stoppingAllServices'), 'warn'); }}>
            <Pause size={14} /> {t('stopAll') || 'Stop All'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title={t('cpuUsage')} value={`${cpu}%`} color="text-accent" />
          <StatCard title={t('usedRam')} value={`${ram} GB`} color="text-info" />
          <StatCard title={t('runningCount')} value={runningCount} color="text-accent" />
          <StatCard title={t('uptime')} value={uptimeStr} color="text-warn" />
        </div>

        <div className="flex justify-between items-center mb-4">
          <div className="text-[10px] font-bold text-muted uppercase tracking-[0.2em]">{t('servicesList')}</div>
        </div>
        <div className="flex flex-col">
          {services.map(s => <ServiceRow key={s.id} service={s} />)}
        </div>
        <MinioPanel />
      </div>
    </div>
  );
};

export default PageServices;
