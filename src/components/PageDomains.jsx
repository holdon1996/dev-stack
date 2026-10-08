import React, { useEffect, useMemo, useState } from 'react';
import { Globe2, RefreshCw, FileText, Plus, Trash2, Settings2, Link, Download, Wand2 } from 'lucide-react';
import { useStore } from '../store';
import { applyNameTemplate, domainWarnings, isValidHost, siteHosts, templateName } from '../lib/sites';
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
          <div className="flex flex-col divide-y divide-border">
            {sites.map(site => {
              const cfg = siteConfigs[site.key];
              const managed = !!cfg?.managed;
              const hosts = managed ? siteHosts(cfg) : [site.domain];
              const warnings = managed ? hosts.flatMap(h => domainWarnings(h)) : [];
              return (
                <div key={site.key} className="py-2.5 grid grid-cols-[200px_1fr_auto] gap-3 items-center">
                  <span className="text-[12px] font-bold truncate" title={site.key}>{site.key}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {hosts.map(h => (
                        <span key={h} className={`text-[12px] font-mono ${!managed ? 'text-muted' : hostsUnresolved.includes(h) ? 'text-danger' : 'text-info'}`}>
                          {managed && cfg.ssl ? 'https://' : 'http://'}{h}
                          {hostsUnresolved.includes(h) && <span className="text-[10px] ml-1">({t('notResolving')})</span>}
                        </span>
                      ))}
                    </div>
                    {[...new Set(warnings.map(w => w.code))].map(code => (
                      <div key={code} className="text-[10px] text-warn">{t(code)}</div>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {!managed && (
                      <button type="button" className="btn-ghost p-1.5 text-accent" title={t('createVhostSync')} onClick={() => enableSite(site)} disabled={siteApplying}><Link size={13} /></button>
                    )}
                    <button type="button" className="btn-ghost p-1.5" title={t('siteSettings')} onClick={() => setEditing(site)}><Settings2 size={13} /></button>
                  </div>
                </div>
              );
            })}
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
