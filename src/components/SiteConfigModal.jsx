import React, { useEffect, useState } from 'react';
import { X, Wand2, Play, Square, Plus, Trash2, RefreshCw, Loader, ScrollText } from 'lucide-react';
import { useStore } from '../store';
import { FCGI_MAX_PROCESSES, SITE_TYPES, domainWarnings, fcgiPorts, parseHostList, requiresHttps, siteProcesses } from '../lib/sites';

const Field = ({ label, htmlFor, hint, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="text-[12px] font-semibold text-textDim">{label}</label>
    {children}
    {hint && <span className="text-[10px] text-muted">{hint}</span>}
  </div>
);

const Section = ({ title, children }) => (
  <section className="border-t border-border pt-4 mt-4 first:border-0 first:pt-0 first:mt-0">
    <h3 className="text-[11px] font-bold text-muted tracking-[0.08em] uppercase mb-3">{title}</h3>
    {children}
  </section>
);

export const ProcessLog = ({ id }) => {
  const lines = useStore(s => s.procLogs[id] || []);
  const ref = React.useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);
  return (
    <div ref={ref} className="mt-2 max-h-[180px] overflow-y-auto bg-[#0a0b0d] rounded-lg p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
      {lines.length === 0
        ? <span className="text-muted italic">—</span>
        : lines.map((l, i) => <div key={i} className={l.l === 'warn' ? 'text-warn' : 'text-textDim'}><span className="text-muted mr-2">[{l.t}]</span>{l.m}</div>)}
    </div>
  );
};

export const SiteProcessList = ({ site, cfg }) => {
  const { procs, startSiteProcess, stopSiteProcess, siteProcessId, t } = useStore();
  const [openLog, setOpenLog] = useState(null);
  const list = siteProcesses(cfg);
  if (!list.length) return <div className="text-[11px] text-muted italic">{t('noProcesses')}</div>;
  return (
    <div className="flex flex-col gap-2">
      {list.map(proc => {
        const id = siteProcessId(site, proc);
        const running = procs[id]?.running;
        return (
          <div key={proc.name} className="bg-[#111318] border border-border rounded-lg p-2.5">
            <div className="flex items-center gap-2">
              <span className={`status-dot ${running ? 'dot-running' : 'dot-stopped'}`} />
              <span className="text-[12px] font-bold">{proc.name}</span>
              <code className="text-[11px] text-muted font-mono truncate flex-1" title={proc.command}>{proc.command}</code>
              <button type="button" className="btn-ghost p-1.5" title={t('showLog')} onClick={() => setOpenLog(openLog === id ? null : id)}>
                <ScrollText size={13} />
              </button>
              {running ? (
                <button type="button" className="btn-danger p-1.5 border-none" title={t('stop')} onClick={() => stopSiteProcess(site, proc)}><Square size={12} /></button>
              ) : (
                <button type="button" className="btn-ghost p-1.5 text-accent" title={t('start')} onClick={() => startSiteProcess(site, proc)}><Play size={12} /></button>
              )}
            </div>
            {openLog === id && <ProcessLog id={id} />}
          </div>
        );
      })}
    </div>
  );
};

const SiteConfigModal = ({ site, onClose }) => {
  const {
    siteConfigs, detectSiteConfig, saveSiteConfig, regenerateCert, phpVersions, groupNames,
    groupEnvs, setGroupEnv, siteApplying, t,
  } = useStore();
  const saved = siteConfigs[site.key];
  const [draft, setDraft] = useState(null);
  const [aliasText, setAliasText] = useState('');
  const [sslTouched, setSslTouched] = useState(!!saved?.managed);

  useEffect(() => {
    (async () => {
      const cfg = saved?.managed ? saved : await detectSiteConfig(site);
      setDraft(cfg);
      setAliasText((cfg.aliases || []).join(' '));
    })();
  }, [site.key]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!draft) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <Loader className="animate-spin text-accent" />
      </div>
    );
  }

  const update = (patch) => setDraft(d => ({ ...d, ...patch }));
  const setDomain = (domain) => {
    const value = domain.trim().toLowerCase();
    update({ domain: value, ...(sslTouched ? {} : { ssl: !value.endsWith('.test') }) });
  };
  const hosts = [draft.domain, ...parseHostList(aliasText)].filter(Boolean);
  const warnings = hosts.flatMap(h => domainWarnings(h).map(w => ({ ...w, host: h })));
  const forcedHttps = hosts.some(requiresHttps);
  const custom = draft.processes || [];
  const setProcess = (i, patch) => update({ processes: custom.map((p, j) => j === i ? { ...p, ...patch } : p) });

  const redetect = async () => {
    const detected = await detectSiteConfig({ ...site });
    update({ type: detected.type, docRoot: detected.docRoot, proxyPort: detected.proxyPort });
  };

  const save = async () => {
    const ok = await saveSiteConfig(site.key, {
      ...draft,
      aliases: parseHostList(aliasText).filter(a => a !== draft.domain),
      proxyPort: parseInt(draft.proxyPort, 10),
      fcgiProcesses: parseInt(draft.fcgiProcesses, 10),
      order: parseInt(draft.order, 10) || 0,
      processes: custom.filter(p => p.name.trim() && p.command.trim()).map(p => ({ ...p, name: p.name.trim() })),
    });
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="site-config-title" className="bg-surface border border-border rounded-xl w-full max-w-[780px] max-h-[88vh] flex flex-col shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="site-config-title" className="text-[15px] font-extrabold m-0">{t('siteConfigTitle', { name: site.key })}</h2>
            <p className="text-[11px] text-muted font-mono m-0 mt-0.5 truncate">{site.path}</p>
          </div>
          <button type="button" className="btn-ghost p-1.5" onClick={onClose} aria-label={t('close')}><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <Section title={t('siteSectionType')}>
            <div className="grid grid-cols-[160px_1fr_auto] gap-3 items-end">
              <Field label={t('siteType')} htmlFor="site-type">
                <select id="site-type" className="select-field" value={draft.type} onChange={e => update({ type: e.target.value })}>
                  {SITE_TYPES.map(type => <option key={type} value={type}>{t(`siteType_${type}`)}</option>)}
                </select>
              </Field>
              {draft.type === 'proxy' ? (
                <Field label={t('proxyPort')} htmlFor="site-port" hint={t('proxyPortHint')}>
                  <input id="site-port" type="number" min="1" max="65535" className="input-field" value={draft.proxyPort} onChange={e => update({ proxyPort: e.target.value })} />
                </Field>
              ) : (
                <Field label={t('siteDocRoot')} htmlFor="site-docroot" hint={t('documentRootHint')}>
                  <input id="site-docroot" className="input-field font-mono" placeholder="public" value={draft.docRoot} onChange={e => update({ docRoot: e.target.value })} spellCheck={false} />
                </Field>
              )}
              <button type="button" className="btn-ghost flex items-center gap-1.5 border border-border text-[12px] py-2" onClick={redetect}>
                <Wand2 size={13} /> {t('detectAgain')}
              </button>
            </div>
            {draft.type === 'laravel' && (
              <label className="flex items-start gap-2 mt-3 text-[12px] cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={draft.nginxRewrite !== false} onChange={e => update({ nginxRewrite: e.target.checked })} />
                <span>{t('nginxRewrite')}<span className="block text-[10px] text-muted">{t('nginxRewriteHint')}</span></span>
              </label>
            )}
          </Section>

          <Section title={t('siteSectionDomain')}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('primaryDomain')} htmlFor="site-domain">
                <input id="site-domain" className="input-field font-mono" value={draft.domain} onChange={e => setDomain(e.target.value)} spellCheck={false} />
              </Field>
              <Field label={t('aliases')} htmlFor="site-aliases" hint={t('aliasesHint')}>
                <input id="site-aliases" className="input-field font-mono" value={aliasText} onChange={e => setAliasText(e.target.value)} spellCheck={false} />
              </Field>
            </div>
            {warnings.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {warnings.map((w, i) => (
                  <li key={i} className={`text-[11px] ${w.level === 'warn' ? 'text-warn' : 'text-info'}`}>
                    <span className="font-mono">{w.host}</span>: {t(w.code)}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={draft.ssl || forcedHttps} disabled={forcedHttps} onChange={e => { setSslTouched(true); update({ ssl: e.target.checked }); }} />
                {t('enableHttps')}
              </label>
              <label className={`flex items-center gap-2 text-[12px] cursor-pointer ${draft.ssl || forcedHttps ? '' : 'opacity-40'}`}>
                <input type="checkbox" disabled={!(draft.ssl || forcedHttps)} checked={!!draft.httpsRedirect} onChange={e => update({ httpsRedirect: e.target.checked })} />
                {t('httpsRedirect')}
              </label>
            </div>
            {saved?.ssl && saved.certNotAfter && (
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
                <span>{t('certExpires', { date: saved.certNotAfter })}</span>
                <button type="button" className="btn-ghost text-[11px] py-0.5 px-2 border border-border flex items-center gap-1" onClick={() => regenerateCert(site.key)} disabled={siteApplying}>
                  <RefreshCw size={11} /> {t('regenerateCert')}
                </button>
              </div>
            )}
          </Section>

          {draft.type !== 'proxy' && (
            <Section title={t('siteSectionPhp')}>
              <div className="grid grid-cols-[1fr_150px] gap-3">
                <Field label={t('sitePhpVersion')} htmlFor="site-php" hint={t('sitePhpVersionHint')}>
                  <select
                    id="site-php"
                    className="select-field"
                    value={draft.phpMode === 'module' ? 'module' : (draft.phpVersion || '')}
                    onChange={e => update(e.target.value === 'module' ? { phpMode: 'module', phpVersion: '' } : { phpMode: 'fcgi', phpVersion: e.target.value })}
                  >
                    <option value="">{t('phpActiveFastcgi', { version: phpVersions.find(v => v.active && v.installed)?.version || '?' })}</option>
                    {phpVersions.filter(v => v.installed).map(v => <option key={v.version} value={v.version}>{t('phpFastcgiOption', { version: v.version })}</option>)}
                    <option value="module">{t('phpGlobalModule')}</option>
                  </select>
                </Field>
                {draft.phpMode !== 'module' && (
                  <Field label={t('fcgiProcesses')} htmlFor="site-fcgi-n" hint={t('fcgiProcessesHint', { max: FCGI_MAX_PROCESSES })}>
                    <input id="site-fcgi-n" type="number" min="1" max={FCGI_MAX_PROCESSES} className="input-field" value={draft.fcgiProcesses ?? 4} onChange={e => update({ fcgiProcesses: e.target.value })} />
                  </Field>
                )}
              </div>
              {draft.phpMode !== 'module' && Number.isInteger(saved?.fcgiPortBase) && (
                <div className="text-[11px] text-muted font-mono mt-2">{t('fcgiPortsLabel', { ports: fcgiPorts(saved).join(', ') })}</div>
              )}
            </Section>
          )}

          <Section title={t('siteSectionGroup')}>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label={t('groupName')} htmlFor="site-group" hint={t('groupNameHint')}>
                <input id="site-group" list="site-groups" className="input-field" value={draft.group || ''} onChange={e => update({ group: e.target.value.trim() })} />
                <datalist id="site-groups">{groupNames().map(g => <option key={g} value={g} />)}</datalist>
              </Field>
              <Field label={t('startOrder')} htmlFor="site-order">
                <input id="site-order" type="number" className="input-field" value={draft.order || 0} onChange={e => update({ order: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label={t('siteEnv')} htmlFor="site-env" hint={t('envHint')}>
                <textarea id="site-env" rows={3} className="input-field font-mono text-[11px]" value={draft.env || ''} onChange={e => update({ env: e.target.value })} spellCheck={false} />
              </Field>
              {draft.group && (
                <Field label={t('groupEnv', { group: draft.group })} htmlFor="group-env" hint={t('groupEnvHint')}>
                  <textarea id="group-env" rows={3} className="input-field font-mono text-[11px]" value={groupEnvs[draft.group] || ''} onChange={e => setGroupEnv(draft.group, e.target.value)} spellCheck={false} />
                </Field>
              )}
            </div>
          </Section>

          <Section title={t('siteSectionProcesses')}>
            {saved?.managed && <SiteProcessList site={site} cfg={saved} />}
            <div className="flex flex-col gap-2 mt-3">
              {custom.map((proc, i) => (
                <div key={i} className="grid grid-cols-[140px_1fr_auto_auto] gap-2 items-center">
                  <input aria-label={t('processName')} className="input-field text-[12px]" placeholder="queue" value={proc.name} onChange={e => setProcess(i, { name: e.target.value })} />
                  <input aria-label={t('processCommand')} className="input-field font-mono text-[11px]" placeholder="php artisan queue:work" value={proc.command} onChange={e => setProcess(i, { command: e.target.value })} spellCheck={false} />
                  <label className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                    <input type="checkbox" checked={!!proc.autoRestart} onChange={e => setProcess(i, { autoRestart: e.target.checked })} /> {t('autoRestart')}
                  </label>
                  <button type="button" className="btn-danger p-1.5 border-none" aria-label={t('remove')} onClick={() => update({ processes: custom.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost text-[11px] py-1 px-2 border border-border flex items-center gap-1" onClick={() => update({ processes: [...custom, { name: '', command: '', autoRestart: false }] })}>
                  <Plus size={11} /> {t('addProcess')}
                </button>
                {draft.type === 'laravel' && [
                  { name: 'queue', command: `php artisan queue:work`, autoRestart: true, cwd: draft.docRoot.replace(/\/?public$/, '') },
                  { name: 'schedule', command: 'php artisan schedule:work', autoRestart: true, cwd: draft.docRoot.replace(/\/?public$/, '') },
                ].filter(p => !custom.some(c => c.name === p.name)).map(p => (
                  <button key={p.name} type="button" className="btn-ghost text-[11px] py-1 px-2 border border-border flex items-center gap-1" onClick={() => update({ processes: [...custom, p] })}>
                    <Plus size={11} /> {p.command}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-muted">{t('processesHint')}</span>
            </div>
          </Section>
        </div>

        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="btn-primary flex items-center gap-2" onClick={save} disabled={siteApplying}>
            {siteApplying && <Loader size={13} className="animate-spin" />} {t('saveAndApply')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SiteConfigModal;
