// `devstack.json`: a project's shared site settings, committed next to its repos so
// every teammate configures the same domains, ports, HTTPS and processes in one step.
// Machine-specific values (FastCGI port blocks, PHP install paths) are never exported.
import { defaultSiteConfig, validateSiteConfig } from './sites.js';

export const MANIFEST_FILE = 'devstack.json';
export const MANIFEST_VERSION = 1;

// Per-site fields shared through the manifest, in the order they are written.
const SHARED_FIELDS = [
    'type', 'docRoot', 'proxyPort', 'nginxRewrite', 'domain', 'aliases', 'ssl', 'httpsRedirect',
    'phpMode', 'phpVersion', 'fcgiProcesses', 'order', 'processes', 'env',
];

const pick = (cfg) => Object.fromEntries(SHARED_FIELDS.filter(f => cfg[f] !== undefined).map(f => [f, cfg[f]]));

/**
 * Manifest object for `keys` (project folder names), sorted by start order.
 * Environment variables (site `env`, group env) are left out: they often hold
 * passwords and API keys, and the file is meant to be committed.
 */
export function buildManifest({ name, group, keys, siteConfigs }) {
    const sites = {};
    for (const key of [...keys].sort((a, b) => (siteConfigs[a]?.order || 0) - (siteConfigs[b]?.order || 0) || a.localeCompare(b))) {
        const { env: _env, ...shared } = pick(siteConfigs[key] || {});
        // Built-in processes (Vite for proxy sites) are derived, not stored.
        shared.processes = (shared.processes || []).filter(p => !p.builtIn);
        sites[key] = shared;
    }
    return {
        devstack: MANIFEST_VERSION,
        name: name || group || '',
        group: group || '',
        sites,
    };
}

/** Variable names set by a `KEY=value` env text (for the import confirmation). */
export const envNames = (text) => (text || '').split(/\r?\n/)
    .map(line => line.replace(/#.*$/, '').trim())
    .filter(line => line.includes('='))
    .map(line => line.slice(0, line.indexOf('=')).trim())
    .filter(Boolean);

/**
 * Parses and validates a manifest. Returns `{ name, group, groupEnv, sites, errors }`;
 * `sites` maps folder names to full configs (defaults filled in) and `errors` lists
 * `{ key, codes }` (codes are i18n keys) or `{ key: '', codes: ['manifestErrJson'] }`.
 */
export function parseManifest(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        return { sites: {}, errors: [{ key: '', codes: ['manifestErrJson'] }] };
    }
    if (!data || typeof data !== 'object' || !data.sites || typeof data.sites !== 'object' || Array.isArray(data.sites)) {
        return { sites: {}, errors: [{ key: '', codes: ['manifestErrNoSites'] }] };
    }
    if (Number(data.devstack) > MANIFEST_VERSION) {
        return { sites: {}, errors: [{ key: '', codes: ['manifestErrVersion'] }] };
    }
    const group = typeof data.group === 'string' ? data.group.trim() : '';
    const sites = {};
    const errors = [];
    for (const [key, raw] of Object.entries(data.sites)) {
        const cfg = {
            ...defaultSiteConfig(key),
            ...pick(raw && typeof raw === 'object' ? raw : {}),
            group,
        };
        cfg.aliases = Array.isArray(cfg.aliases) ? cfg.aliases.map(a => String(a).toLowerCase().trim()).filter(Boolean) : [];
        cfg.domain = String(cfg.domain || '').toLowerCase().trim();
        if (cfg.proxyPort !== undefined) cfg.proxyPort = parseInt(cfg.proxyPort, 10);
        cfg.env = typeof cfg.env === 'string' ? cfg.env : '';
        cfg.processes = (Array.isArray(cfg.processes) ? cfg.processes : [])
            .filter(p => p && typeof p.name === 'string' && typeof p.command === 'string' && p.command.trim())
            .map(p => ({
                name: p.name,
                command: p.command,
                autoRestart: !!p.autoRestart,
                // A sub-folder of the project only: no ".." and no absolute path.
                ...(typeof p.cwd === 'string' && p.cwd && !/(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-z]:/i.test(p.cwd) ? { cwd: p.cwd } : {}),
            }));
        const codes = validateSiteConfig(cfg);
        if (codes.length) errors.push({ key, codes });
        sites[key] = cfg;
    }
    return {
        name: typeof data.name === 'string' ? data.name : group,
        group,
        groupEnv: typeof data.groupEnv === 'string' ? data.groupEnv : '',
        sites,
        errors,
    };
}

/**
 * Matches manifest sites to project folders under www (case-insensitive).
 * Returns `{ configs: { siteKey: cfg }, missing: [manifestKey] }`.
 */
export function planManifestImport(manifestSites, projectKeys) {
    const byLower = new Map(projectKeys.map(k => [k.toLowerCase(), k]));
    const configs = {};
    const missing = [];
    for (const [key, cfg] of Object.entries(manifestSites)) {
        const local = byLower.get(key.toLowerCase());
        if (local) configs[local] = cfg;
        else missing.push(key);
    }
    return { configs, missing };
}
