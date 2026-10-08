import { getApacheDir, getCertDir, getLogDir, getPhpDir, toWinPath as win } from '../lib/paths';
import { getMkcertPath } from '../lib/ssl';
import {
    buildVhosts, defaultSiteConfig, detectFromFiles, fcgiPort, findHostConflicts, isValidHost, legacyDomain,
    needsHostsEntry, parseHostsOutsideBlock, parseLegacyVhost, requiresHttps, siteHosts, validateSiteConfig,
} from '../lib/sites';

const HOSTS_FILE = 'C:\\Windows\\System32\\drivers\\etc\\hosts';

/**
 * Per-project site configuration (type, document root, domains, HTTPS, PHP
 * version, group, processes) and everything DevStack generates from it:
 * the managed vhosts block, mkcert certificates and the hosts-file block.
 */
export const createSiteSlice = (set, get) => ({
    siteConfigs: {},
    hostsEntries: [],
    hostsOutside: [],
    hostsUnresolved: [],
    siteApplying: false,
    apacheConfigStale: false,

    _patchSiteConfig: (key, patch) => set(s => ({
        siteConfigs: { ...s.siteConfigs, [key]: { ...s.siteConfigs[key], ...patch } },
    })),

    _managedSites: () => {
        const { sites, siteConfigs } = get();
        return sites
            .filter(s => siteConfigs[s.key]?.managed)
            .map(s => ({ key: s.key, path: s.path, cfg: siteConfigs[s.key] }));
    },

    _activeApacheRoot: () => {
        const active = get().apacheVersions.find(v => v.active && v.installed);
        return active ? getApacheDir(get(), active.version) : null;
    },

    /**
     * Defaults for a project: imported from its old hand-written vhost if any, else
     * from its files. `reservedPorts` are proxy ports picked for unsaved projects.
     */
    detectSiteConfig: async (site, reservedPorts = []) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const base = win(site.path);
        let detected = null;

        const apacheRoot = get()._activeApacheRoot();
        if (apacheRoot) {
            const vhosts = await invoke('read_text_file', { path: win(`${apacheRoot}/conf/extra/httpd-vhosts.conf`) }).catch(() => '');
            detected = parseLegacyVhost(vhosts, legacyDomain(site.key), site.path);
        }

        if (!detected) {
            const exists = (rel) => invoke('path_exists', { path: `${base}\\${rel}` });
            const facts = {
                srcPublicIndex: await exists('src\\public\\index.php'),
                publicIndex: await exists('public\\index.php'),
                artisan: await exists('artisan'),
                packageJson: await invoke('read_text_file', { path: `${base}\\package.json` }).catch(() => null),
            };
            const usedPorts = [...reservedPorts, ...Object.entries(get().siteConfigs)
                .filter(([key, cfg]) => key !== site.key && cfg.managed && cfg.type === 'proxy')
                .map(([, cfg]) => cfg.proxyPort)];
            detected = detectFromFiles(facts, usedPorts);
            if (detected.type === 'proxy') {
                // Skip ports another program is already listening on.
                for (let i = 0; i < 50; i++) {
                    const [busy] = await invoke('check_ports_status', { ports: [detected.proxyPort] });
                    if (!busy) break;
                    do { detected.proxyPort++; } while (usedPorts.includes(detected.proxyPort));
                }
            }
        }
        return { ...defaultSiteConfig(site.key), ...get().siteConfigs[site.key], ...detected };
    },

    _validateConfigs: (configs) => {
        const { t, showToast } = get();
        for (const [key, cfg] of Object.entries(configs)) {
            const errors = validateSiteConfig(cfg);
            if (errors.length) {
                showToast(`${key}: ${t(errors[0])}`, 'danger');
                return false;
            }
        }
        const merged = { ...get().siteConfigs, ...configs };
        const conflicts = findHostConflicts(
            Object.entries(merged).filter(([, cfg]) => cfg.managed).map(([key, cfg]) => ({ key, cfg }))
        );
        if (conflicts.length) {
            const { host, keys } = conflicts[0];
            showToast(t('siteErrConflict', { host, projects: keys.join(', ') }), 'danger');
            return false;
        }
        const proxies = Object.entries(merged).filter(([, cfg]) => cfg.managed && cfg.type === 'proxy');
        const clash = proxies.find(([key, cfg]) => proxies.some(([other, o]) => other !== key && o.proxyPort === cfg.proxyPort));
        if (clash) {
            const owners = proxies.filter(([, cfg]) => cfg.proxyPort === clash[1].proxyPort).map(([key]) => key);
            showToast(t('siteErrPortConflict', { port: clash[1].proxyPort, projects: owners.join(', ') }), 'danger');
            return false;
        }
        return true;
    },

    /** Saves configs for several projects and applies them with one config write / hosts write. */
    saveSiteConfigs: async (configs) => {
        const next = Object.fromEntries(Object.entries(configs).map(([key, cfg]) => [key, {
            ...cfg,
            managed: true,
            ssl: cfg.ssl || siteHosts(cfg).some(requiresHttps),
        }]));
        if (!get()._validateConfigs(next)) return false;

        const previous = get().siteConfigs;
        set(s => ({ siteConfigs: { ...s.siteConfigs, ...next } }));
        get()._refreshSiteDomains();
        const ok = await get().applySites();
        if (!ok) {
            set({ siteConfigs: previous });
            get()._refreshSiteDomains();
        }
        return ok;
    },

    saveSiteConfig: (key, cfg) => get().saveSiteConfigs({ [key]: cfg }),

    /** "Create vhost" button: take the project over with detected defaults. */
    enableSite: async (site) => {
        const cfg = get().siteConfigs[site.key]?.managed ? get().siteConfigs[site.key] : await get().detectSiteConfig(site);
        const ok = await get().saveSiteConfig(site.key, cfg);
        if (ok) get().showToast(get().t('siteApplied', { domain: cfg.domain }), 'ok');
        return ok;
    },

    /** Drops DevStack's config for a deleted project and removes its vhost and hosts lines. */
    forgetSite: async (key) => {
        const wasManaged = get().siteConfigs[key]?.managed;
        set(s => {
            const { [key]: _removed, ...rest } = s.siteConfigs;
            return { siteConfigs: rest };
        });
        if (!wasManaged) return;
        // removeSite restarts Apache itself. The hosts lines must go even if the
        // vhost rewrite fails (no active Apache, httpd -t error).
        const applied = await get().applySites({ legacyHosts: [legacyDomain(key)], restart: false });
        if (!applied) await get().syncHosts({ legacy: [legacyDomain(key)] });
    },

    _refreshSiteDomains: () => set(s => ({
        sites: s.sites.map(site => {
            const cfg = s.siteConfigs[site.key];
            return cfg?.managed ? { ...site, domain: cfg.domain, ssl: !!cfg.ssl, managed: true } : { ...site, domain: legacyDomain(site.key), managed: false };
        }),
    })),

    /** Installs mkcert and its local CA (once; Windows shows a confirmation dialog). */
    ensureMkcertCa: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { settings, t, showToast } = get();
        const mkcertExe = getMkcertPath(settings);
        if (!(await invoke('path_exists', { path: mkcertExe }))) {
            showToast(t('mkcertDownloading'), 'info');
            const { installMkcert } = await import('../lib/ssl');
            await installMkcert(settings);
        }
        if (!settings.mkcertCaInstalled) {
            const { ask } = await import('@tauri-apps/plugin-dialog');
            const ok = await ask(t('mkcertCaPrompt'), { title: 'DevStack', kind: 'info', okLabel: t('continueLabel'), cancelLabel: t('cancel') });
            if (!ok) return false;
            await invoke('mkcert_install', { mkcertExe });
            get().updateSettings({ mkcertCaInstalled: true });
            await get().refreshCaBundle({ restart: false });
        }
        return true;
    },

    _ensureSiteCert: async (site, certDir) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const hosts = siteHosts(site.cfg);
        const signature = hosts.join(',');
        const exists = await invoke('path_exists', { path: win(`${certDir}/${site.key}.pem`) });
        if (exists && site.cfg.certHosts === signature) return;
        const info = await invoke('mkcert_generate', {
            mkcertExe: getMkcertPath(get().settings),
            certDir: win(certDir),
            name: site.key,
            hosts,
        });
        get()._patchSiteConfig(site.key, { certHosts: signature, certNotAfter: info.notAfter || '' });
    },

    regenerateCert: async (key) => {
        get()._patchSiteConfig(key, { certHosts: '' });
        const ok = await get().applySites();
        if (ok) get().showToast(get().t('certRegenerated'), 'ok');
    },

    /**
     * Regenerates the managed vhosts block from the site configs, verifies it with
     * `httpd -t` (rolled back on failure), syncs the hosts block and restarts Apache.
     */
    applySites: async ({ restart = true, legacyHosts = [] } = {}) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { t, showToast, addServiceLog } = get();
        const apacheRoot = get()._activeApacheRoot();
        if (!apacheRoot) {
            showToast(t('noActiveApache'), 'warn');
            return false;
        }
        const certDir = getCertDir(get());
        const logDir = getLogDir(get());

        set({ siteApplying: true });
        try {
            await invoke('create_dir', { path: win(logDir) });
            let managed = get()._managedSites();

            if (managed.some(s => s.cfg.ssl)) {
                if (!(await get().ensureMkcertCa())) return false;
                for (const site of managed.filter(s => s.cfg.ssl)) await get()._ensureSiteCert(site, certDir);
                const owner = await invoke('port_owner', { port: 443 });
                if (owner && !/^httpd/i.test(owner.name)) {
                    showToast(t('port443Busy', { name: owner.service || owner.name, pid: owner.pid }), 'danger');
                    return false;
                }
                managed = get()._managedSites();
            }

            const vhostsBody = buildVhosts(managed, { port: get().settings.port80 || 80, certDir, logDir });
            const legacyNames = managed.flatMap(s => [legacyDomain(s.key), ...siteHosts(s.cfg)]);
            const report = await invoke('apply_apache_sites', { apacheRoot, vhostsBody, legacyNames });
            if (report.removedManualSsl) {
                showToast(t('removedManualSsl'), 'info');
                addServiceLog('apache', t('removedManualSsl'), 'warn');
            }
            if (report.removedLegacyVhosts) {
                addServiceLog('apache', t('removedLegacyVhosts', { count: report.removedLegacyVhosts }), 'info');
            }

            await get().syncHosts({ legacy: legacyHosts });
            await get().ensureFcgiBackends();

            const apacheRunning = get().services.find(s => s.type === 'web')?.status === 'running';
            if (restart && apacheRunning) await get().restartApache();
            return true;
        } catch (e) {
            const message = typeof e === 'string' ? e : e?.message || String(e);
            addServiceLog('apache', message, 'err');
            showToast(message.split('\n')[0], 'danger');
            return false;
        } finally {
            set({ siteApplying: false });
        }
    },

    /**
     * Writes the DevStack hosts block (one write), flushes DNS and checks resolution.
     * `remove`: hosts taken over from hand-written lines; `legacy`: hosts whose exact
     * single-host lines older DevStack builds wrote.
     */
    syncHosts: async ({ remove = [], legacy = [] } = {}) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { t, showToast } = get();
        const managed = get()._managedSites();
        const entries = [
            ...managed.flatMap(s => siteHosts(s.cfg)).filter(needsHostsEntry).map(host => ({ ip: '127.0.0.1', host })),
            ...get().hostsEntries,
        ];
        try {
            await invoke('sync_hosts_domains', {
                entries,
                remove,
                legacy: [...managed.map(s => legacyDomain(s.key)), ...legacy],
            });
        } catch (e) {
            showToast(`${e}`, 'danger');
            return false;
        }
        const unresolved = await invoke('flush_dns_and_check', {
            domains: entries.filter(e => e.ip === '127.0.0.1').map(e => e.host),
        });
        set({ hostsUnresolved: unresolved });
        if (unresolved.length) showToast(t('hostsNotResolving', { hosts: unresolved.join(', ') }), 'warn');
        await get().loadHostsFile();
        return true;
    },

    loadHostsFile: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const text = await invoke('read_text_file', { path: HOSTS_FILE }).catch(() => '');
        set({ hostsOutside: parseHostsOutsideBlock(text) });
    },

    addHostEntry: async (ip, host) => {
        const entry = { ip: ip.trim(), host: host.trim().toLowerCase() };
        if (!isValidHost(entry.host) || !/^[0-9a-f:.]+$/i.test(entry.ip)) {
            get().showToast(get().t('hostEntryInvalid'), 'warn');
            return false;
        }
        if (get().hostsEntries.some(e => e.host === entry.host) || get()._managedSites().some(s => siteHosts(s.cfg).includes(entry.host))) {
            get().showToast(get().t('hostAlreadyManaged', { host: entry.host }), 'warn');
            return false;
        }
        const previous = get().hostsEntries;
        set({ hostsEntries: [...previous, entry] });
        const ok = await get().syncHosts();
        if (!ok) set({ hostsEntries: previous });
        return ok;
    },

    removeHostEntry: async (host) => {
        set(s => ({ hostsEntries: s.hostsEntries.filter(e => e.host !== host) }));
        return get().syncHosts();
    },

    /** Moves hand-written hosts lines into the DevStack block. */
    takeOverHostLines: async (lines) => {
        const projectHosts = get()._managedSites().flatMap(s => siteHosts(s.cfg));
        // Names like "localhost" stay where they are: the DevStack block holds dotted hosts only.
        const hosts = lines.flatMap(l => l.hosts.filter(isValidHost).map(host => ({ ip: l.ip, host })));
        if (!hosts.length) {
            get().showToast(get().t('hostEntryInvalid'), 'warn');
            return false;
        }
        const previous = get().hostsEntries;
        const adopted = hosts.filter(e => !projectHosts.includes(e.host) && !previous.some(x => x.host === e.host));
        set({ hostsEntries: [...previous, ...adopted] });
        const ok = await get().syncHosts({ remove: hosts.map(e => e.host) });
        if (!ok) set({ hostsEntries: previous });
        return ok;
    },

    /** Starts one shared php-cgi FastCGI backend per PHP version used by a project. */
    ensureFcgiBackends: async () => {
        const versions = [...new Set(get()._managedSites().map(s => s.cfg.phpVersion).filter(Boolean))];
        for (const version of versions) {
            const php = get().phpVersions.find(v => v.version === version && v.installed);
            if (!php) {
                get().showToast(get().t('phpVersionMissing', { version }), 'warn');
                continue;
            }
            const dir = win(getPhpDir(get(), php));
            const id = `php-fcgi-${version}`;
            if (get().procs[id]?.running) continue;
            await get().startProcess({
                id,
                command: `"${dir}\\php-cgi.exe" -b 127.0.0.1:${fcgiPort(version)}`,
                cwd: dir,
                pathPrefix: dir,
                env: { PHP_FCGI_MAX_REQUESTS: '0', PHPRC: dir },
                restart: true,
            });
        }
    },

    checkApacheConfigStale: async () => {
        const apacheRoot = get()._activeApacheRoot();
        if (!apacheRoot || get().services.find(s => s.type === 'web')?.status !== 'running') {
            if (get().apacheConfigStale) set({ apacheConfigStale: false });
            return;
        }
        const php = get().phpVersions.find(v => v.active && v.installed);
        const { invoke } = await import('@tauri-apps/api/core');
        const stale = await invoke('apache_config_stale', {
            apacheRoot,
            phpIni: php ? win(`${getPhpDir(get(), php)}/php.ini`) : null,
        }).catch(() => false);
        if (stale !== get().apacheConfigStale) set({ apacheConfigStale: stale });
    },
});
