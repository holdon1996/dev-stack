import React, { useEffect, useMemo, useState } from 'react';
import { Globe2, RefreshCw, FileText, Plus, Trash2, Settings2, Link, Download, Wand2, Check, Lock, Loader } from 'lucide-react';
import { useStore } from '../store';
import { applyNameTemplate, domainWarnings, isValidHost, parseHostList, siteHosts, templateName } from '../lib/sites';
import SiteConfigModal from './SiteConfigModal';
import { ConfigStaleBadge } from './PageSites';

const Card = ({ title, desc, children, actions }) => (
  <section className="bg-surface border border-border rounded-xl p-5">
    <div className="flex items-start gap-3 mb-4">
      <div className="flex-1">
        <h2 className="text-[13px] font-bold m-0">{title}</h2>
        {desc && <p className="text-[11px] text-muted m-0 mt-1">{desc}</p>}
      </div>
      {actions}
    </div>
    {children}
  </section>
);

/** One project: domain + aliases edited in place; saving takes the project over if needed. */
const ProjectDomainRow = ({ site, onSettings }) => {
  const { siteConfigs, hostsUnresolved, saveSiteDomain, enableSite, siteApplying, t } = useStore();
  const cfg = siteConfigs[site.key];
  const managed = !!cfg?.managed;
  const savedDomain = managed ? cfg.domain : site.domain;
  const savedAliases = managed ? (cfg.aliases || []).join(' ') : '';
  const [domain, setDomain] = useState(savedDomain);
  const [aliases, setAliases] = useState(savedAliases);
  const [saving, setSaving] = useState(false);
  // Follow the store (e.g. changes from the settings dialog), but never while saving:
  // a failed apply rolls the store back and must not wipe what the user typed.
  useEffect(() => {
    if (!saving) { setDomain(savedDomain); setAliases(savedAliases); }
  }, [savedDomain, savedAliases]);

  const value = domain.trim().toLowerCase();
  const aliasList = parseHostList(aliases).filter(a => a !== value);
  const dirty = value !== savedDomain || aliasList.join(' ') !== savedAliases;
  const domainValid = isValidHost(value);
  const aliasesValid = aliasList.every(isValidHost);
  const warnings = [...new Set([value, ...aliasList].flatMap(h => domainWarnings(h)).map(w => w.code))];
  const unresolved = managed ? siteHosts(cfg).filter(h => hostsUnresolved.includes(h)) : [];
  const busy = saving || siteApplying;

  const save = async () => {
    if (busy || !dirty || !domainValid || !aliasesValid) return;
    setSaving(true);
    const ok = await saveSiteDomain(site, { domain: value, aliases: aliasList });
    setSaving(false);
    if (ok) { setDomain(value); setAliases(aliasList.join(' ')); }
  };
  const reset = () => { setDomain(savedDomain); setAliases(savedAliases); };

  return (
    <form
      className="py-2.5 grid grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-start"
      onSubmit={(e) => { e.preventDefault(); save(); }}
    >
      <div className="min-w-0 pt-1.5">
        <div className="text-[12px] font-bold truncate" title={site.key}>{site.key}</div>
        {managed
          ? <div className="text-[10px] text-accent flex items-center gap-1">{cfg.ssl && <Lock size={9} />}{t(cfg.ssl ? 'schemeHttps' : 'schemeHttp')}</div>
          : <div className="text-[10px] text-muted" title={t('notManagedHint')}>{t('notManagedBadge')}</div>}
      </div>
      <div className="min-w-0">
        <input
          aria-label={t('primaryDomainFor', { name: site.key })}
          aria-invalid={!domainValid}
          className={`input-field py-1.5 text-[12px] font-mono w-full ${managed ? 'text-info' : 'text-textDim'} ${!domainValid ? 'border-danger' : ''}`}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') reset(); }}
          disabled={saving}
          spellCheck={false}
        />
        {unresolved.length > 0 && <div className="text-[10px] text-danger mt-1">{t('notResolving')}: {unresolved.join(', ')}</div>}
        {warnings.map(code => <div key={code} className="text-[10px] text-warn mt-1">{t(code)}</div>)}
      </div>
      <div className="min-w-0">
        <input
          aria-label={t('aliasesFor', { name: site.key })}
          aria-invalid={!aliasesValid}
          className={`input-field py-1.5 text-[12px] font-mono w-full ${!aliasesValid ? 'border-danger' : ''}`}
          placeholder={t('aliasesPlaceholder')}
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') reset(); }}
          disabled={saving}
          spellCheck={false}
        />
        {(!domainValid || !aliasesValid) && <div className="text-[10px] text-danger mt-1">{t('siteErrHost')}</div>}
      </div>
      <div className="flex gap-1.5 pt-0.5">
        {dirty ? (
          <button type="submit" className="btn-primary py-1 px-2.5 text-[11px] flex items-center gap-1" disabled={busy || !domainValid || !aliasesValid} title={t('saveDomainHint')}>
            {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />} {t('save')}
          </button>
        ) : !managed && (
          <button type="button" className="btn-ghost p-1.5 text-accent" title={t('createVhostSync')} onClick={() => enableSite(site)} disabled={busy}><Link size={13} /></button>
        )}
        <button type="button" className="btn-ghost p-1.5" title={t('siteSettings')} onClick={onSettings}><Settings2 size={13} /></button>
      </div>
    </form>
  );
};

const DomainTemplate = ({ sites }) => {
  const { siteConfigs, groupNames, detectSiteConfig, saveSiteConfigs, siteApplying, t } = useStore();
  const [template, setTemplate] = useState('local-{name}.example.com');
  const [group, setGroup] = useState('');
  const [selected, setSelected] = useState([]);
  const [names, setNames] = useState({});

  const candidates = group ? sites.filter(s => siteConfigs[s.key]?.group === group) : sites;
  const chosen = candidates.filter(s => selected.includes(s.key));
  const folders = chosen.map(s => s.key);
  const nameOf = (key) => names[key] ?? templateName(key, folders);
  const domainOf = (key) => applyNameTemplate(template, nameOf(key));

  const apply = async () => {
    const configs = {};
    for (const site of chosen) {
      // Proxy ports picked for earlier projects in this batch are not saved yet.
      const reserved = Object.values(configs).filter(c => c.type === 'proxy').map(c => c.proxyPort);
      const base = siteConfigs[site.key]?.managed ? siteConfigs[site.key] : await detectSiteConfig(site, reserved);
      const domain = domainOf(site.key);
      configs[site.key] = { ...base, domain, ssl: base.ssl || !domain.endsWith('.test') };
    }
    if (await saveSiteConfigs(configs)) setNames({});
  };

  return (
    <Card title={t('domainTemplateTitle')} desc={t('domainTemplateDesc')}>
      <div className="grid grid-cols-[1fr_200px] gap-3 mb-3">
        <input aria-label={t('domainTemplate')} className="input-field font-mono" value={template} onChange={e => setTemplate(e.target.value)} spellCheck={false} />
        <select aria-label={t('groupName')} className="select-field" value={group} onChange={e => { setGroup(e.target.value); setSelected([]); }}>
          <option value="">{t('allProjects')}</option>
          {groupNames().map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto">
        {candidates.map(site => {
          const on = selected.includes(site.key);
          const domain = domainOf(site.key);
          return (
            <div key={site.key} className="grid grid-cols-[24px_1fr_160px_1fr] gap-2 items-center text-[12px]">
              <input type="checkbox" aria-label={site.key} checked={on} onChange={() => setSelected(on ? selected.filter(k => k !== site.key) : [...selected, site.key])} />
              <span className="truncate" title={site.key}>{site.key}</span>
              <input
                aria-label={t('templateNameFor', { name: site.key })}
                className="input-field py-1 text-[12px] font-mono"
                disabled={!on}
                value={on ? nameOf(site.key) : ''}
                onChange={e => setNames({ ...names, [site.key]: e.target.value.toLowerCase() })}
              />
              <span className={`font-mono truncate ${on && !isValidHost(domain) ? 'text-danger' : 'text-textDim'}`}>{on ? domain : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end mt-3">
        <button type="button" className="btn-primary flex items-center gap-2" disabled={!chosen.length || siteApplying || chosen.some(s => !isValidHost(domainOf(s.key)))} onClick={apply}>
          <Wand2 size={13} /> {t('applyTemplate', { count: chosen.length })}
        </button>
      </div>
    </Card>
  );
};

const PageDomains = () => {
  const {
    sites, siteConfigs, hostsEntries, hostsOutside, hostsUnresolved, loadHostsFile, addHostEntry,
    removeHostEntry, takeOverHostLines, enableSite, syncHosts, siteApplying, t,
  } = useStore();
  const [editing, setEditing] = useState(null);
  const [ip, setIp] = useState('127.0.0.1');
  const [host, setHost] = useState('');
  const [picked, setPicked] = useState([]);

  useEffect(() => { loadHostsFile(); }, []);

  const hostOwner = useMemo(() => {
    const map = {};
    for (const site of sites) {
      const cfg = siteConfigs[site.key];
      if (cfg?.managed) siteHosts(cfg).forEach(h => { map[h] = site.key; });
    }
    return map;
  }, [sites, siteConfigs]);

  const openHostsFile = () => useStore.getState().openConfigFile('hosts');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1a1c22] bg-bg flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[18px] font-extrabold m-0 flex items-center gap-2"><Globe2 size={20} className="text-accent" /> {t('domainsTitle')}</h1>
          <p className="text-[12px] text-muted m-0 mt-1 font-mono">{t('domainsDesc')}</p>
        </div>
        <ConfigStaleBadge />
        <button type="button" className="btn-ghost flex items-center gap-2 border border-border text-[12px] py-1.5 px-3" onClick={() => syncHosts()} disabled={siteApplying}>
          <RefreshCw size={13} /> {t('resyncHosts')}
        </button>
        <button type="button" className="btn-ghost flex items-center gap-2 border border-border text-[12px] py-1.5 px-3" onClick={openHostsFile}>
          <FileText size={13} /> {t('openHostsFile')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        <Card title={t('projectDomains')} desc={t('projectDomainsDesc')}>
          {sites.some(site => !siteConfigs[site.key]?.managed) && (
            <p className="text-[11px] text-muted m-0 mb-3"><span className="font-bold">{t('notManagedBadge')}</span>: {t('notManagedHint')}</p>
          )}
          <div className="grid grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 text-[10px] font-bold text-muted uppercase tracking-wider pb-1">
            <span>{t('project')}</span><span>{t('primaryDomain')}</span><span>{t('aliases')}</span><span />
          </div>
          <div className="flex flex-col divide-y divide-border">
            {sites.map(site => <ProjectDomainRow key={site.key} site={site} onSettings={() => setEditing(site)} />)}
          </div>
        </Card>

        <DomainTemplate sites={sites} />

        <Card title={t('standaloneHosts')} desc={t('standaloneHostsDesc')}>
          <div className="flex flex-col gap-1.5 mb-3">
            {hostsEntries.length === 0 && <span className="text-[11px] text-muted italic">{t('noStandaloneHosts')}</span>}
            {hostsEntries.map(e => (
              <div key={e.host} className="flex items-center gap-3 text-[12px] font-mono">
                <span className="w-[140px] text-textDim">{e.ip}</span>
                <span className="flex-1">{e.host}</span>
                <button type="button" className="btn-danger p-1 border-none" aria-label={t('remove')} onClick={() => removeHostEntry(e.host)}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <form className="grid grid-cols-[160px_1fr_auto] gap-2" onSubmit={async (e) => { e.preventDefault(); if (await addHostEntry(ip, host)) setHost(''); }}>
            <input aria-label="IP" className="input-field font-mono" value={ip} onChange={e => setIp(e.target.value)} />
            <input aria-label={t('domain')} className="input-field font-mono" placeholder="api.staging.local" value={host} onChange={e => setHost(e.target.value)} spellCheck={false} />
            <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={!host.trim()}><Plus size={13} /> {t('add')}</button>
          </form>
        </Card>

        <Card
          title={t('existingHostsLines')}
          desc={t('existingHostsLinesDesc')}
          actions={
            <button type="button" className="btn-primary flex items-center gap-1.5 text-[12px]" disabled={!picked.length || siteApplying}
              onClick={async () => { await takeOverHostLines(hostsOutside.filter(l => picked.includes(l.line))); setPicked([]); }}>
              <Download size={13} /> {t('takeOver', { count: picked.length })}
            </button>
          }
        >
          <div className="flex flex-col gap-1">
            {hostsOutside.map(line => {
              const owners = [...new Set(line.hosts.map(h => hostOwner[h]).filter(Boolean))];
              const on = picked.includes(line.line);
              return (
                <label key={line.line} className="grid grid-cols-[24px_140px_1fr_auto] gap-2 items-center text-[12px] font-mono cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter(l => l !== line.line) : [...picked, line.line])} />
                  <span className="text-textDim">{line.ip}</span>
                  <span className="truncate">{line.hosts.join(' ')}</span>
                  {owners.length > 0 && <span className="text-[10px] font-sans text-warn">{t('matchesProject', { project: owners.join(', ') })}</span>}
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      {editing && <SiteConfigModal site={editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

export default PageDomains;
