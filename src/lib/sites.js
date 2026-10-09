/**
 * Site (virtual host) model: per-project config, domain checks, legacy vhost
 * import and Apache vhost generation. Everything here is pure so it can be
 * tested with `npm test`; the store does the file and process IO.
 */

export const SITE_TYPES = ['php', 'laravel', 'proxy'];
export const DEFAULT_VITE_PORT = 5173;

// Whole TLDs on the browser HSTS preload list: plain http:// never loads.
const HSTS_TLDS = ['dev', 'app', 'page', 'new', 'day', 'foo', 'zip', 'mov', 'phd', 'prof', 'esq', 'nexus', 'boo', 'dad', 'eat', 'ing', 'meme', 'rsvp', 'bank', 'insurance'];
const LOCAL_TLDS = ['test', 'localhost', 'local', 'invalid', 'example', 'internal', 'lan', 'home', 'corp', 'arpa'];

const NGINX_STYLE_REWRITE = [
    'AllowOverride None',
    'Require all granted',
    'Options -MultiViews -Indexes +FollowSymLinks',
    'RewriteEngine On',
    'RewriteCond %{HTTP:Authorization} .',
    'RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]',
    'RewriteCond %{REQUEST_FILENAME} !-d',
    'RewriteCond %{REQUEST_FILENAME} !-f',
    'RewriteRule ^ index.php [L]',
];

export const legacyDomain = (folder) => folder.toLowerCase().replace(/[^a-z0-9-]/g, '') + '.test';

export const tldOf = (host) => host.split('.').pop();

export const isValidHost = (host) =>
    typeof host === 'string'
    && host.length <= 253
    && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host);

export const requiresHttps = (host) => HSTS_TLDS.includes(tldOf(host));

/** `.localhost` resolves to 127.0.0.1 in browsers without a hosts entry. */
export const needsHostsEntry = (host) => tldOf(host) !== 'localhost';

/** Warnings shown next to a domain: `{ code, level }`, codes map to i18n keys. */
export function domainWarnings(host) {
    const tld = tldOf(host);
    if (tld === 'localhost') return [{ code: 'domainWarnLocalhost', level: 'info' }];
    if (tld === 'local') return [{ code: 'domainWarnMdns', level: 'warn' }];
    const warnings = [];
    if (requiresHttps(host)) warnings.push({ code: 'domainWarnHsts', level: 'info' });
    if (!LOCAL_TLDS.includes(tld)) warnings.push({ code: 'domainWarnPublic', level: 'warn' });
    return warnings;
}

export const siteHosts = (cfg) => [cfg.domain, ...(cfg.aliases || [])].filter(Boolean);

/** Hosts claimed by more than one project: `[{ host, keys }]`. */
export function findHostConflicts(entries) {
    const owners = new Map();
    for (const { key, cfg } of entries) {
        for (const host of new Set(siteHosts(cfg))) {
            owners.set(host, [...(owners.get(host) || []), key]);
        }
    }
    return [...owners].filter(([, keys]) => keys.length > 1).map(([host, keys]) => ({ host, keys }));
}

// Each FastCGI site gets its own block of ports for its php-cgi pool. A php-cgi on
// Windows serves one request at a time, so sites must never share processes:
// service A calling service B while holding the only shared process deadlocks.
export const FCGI_PORT_START = 9300;
export const FCGI_BLOCK_SIZE = 10;
export const FCGI_MAX_PROCESSES = FCGI_BLOCK_SIZE;
export const DEFAULT_FCGI_PROCESSES = 4;
// MinIO API/console.
const RESERVED_PORTS = [9000, 9001];

/** FastCGI is the default for PHP/Laravel sites; mod_php only when chosen explicitly. */
export const usesFcgi = (cfg) => cfg.type !== 'proxy' && cfg.phpMode !== 'module';

export const fcgiProcessCount = (cfg) =>
    Math.min(FCGI_MAX_PROCESSES, Math.max(1, parseInt(cfg.fcgiProcesses, 10) || DEFAULT_FCGI_PROCESSES));

export const fcgiPorts = (cfg) =>
    Array.from({ length: fcgiProcessCount(cfg) }, (_, i) => cfg.fcgiPortBase + i);

export const balancerName = (key) => `ds-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

/**
 * Port block start for every FastCGI site: `{ key: base }`. Existing bases are kept
 * when their block is still free of overlaps; new blocks skip reserved ports, other
 * sites' blocks and `busyPorts` (ports another program listens on).
 */
export function assignFcgiPorts(sites, busyPorts = []) {
    const taken = new Set(RESERVED_PORTS);
    const result = {};
    const blockOf = (base) => Array.from({ length: FCGI_BLOCK_SIZE }, (_, i) => base + i);
    const fits = (base) => base >= FCGI_PORT_START && (base - FCGI_PORT_START) % FCGI_BLOCK_SIZE === 0
        && blockOf(base).every(p => !taken.has(p));
    const fcgiSites = sites.filter(s => usesFcgi(s.cfg)).sort((a, b) => a.key.localeCompare(b.key));

    for (const { key, cfg } of fcgiSites) {
        if (Number.isInteger(cfg.fcgiPortBase) && fits(cfg.fcgiPortBase)) {
            result[key] = cfg.fcgiPortBase;
            blockOf(cfg.fcgiPortBase).forEach(p => taken.add(p));
        }
    }
    for (const { key } of fcgiSites.filter(s => result[s.key] === undefined)) {
        let base = FCGI_PORT_START;
        while (!fits(base) || blockOf(base).some(p => busyPorts.includes(p))) base += FCGI_BLOCK_SIZE;
        result[key] = base;
        blockOf(base).forEach(p => taken.add(p));
    }
    return result;
}

export const parseHostList = (text) =>
    [...new Set((text || '').toLowerCase().split(/[\s,]+/).map(h => h.trim()).filter(Boolean))];

/** Problems that block saving a config; empty when valid. Values are i18n keys. */
export function validateSiteConfig(cfg) {
    const errors = [];
    if (!SITE_TYPES.includes(cfg.type)) errors.push('siteErrType');
    if (!siteHosts(cfg).every(isValidHost)) errors.push('siteErrHost');
    if (cfg.type === 'proxy' && !(cfg.proxyPort >= 1 && cfg.proxyPort <= 65535)) errors.push('siteErrPort');
    // Control characters would let a value inject extra Apache directives.
    if (cfg.type !== 'proxy' && /(^|[\\/])\.\.([\\/]|$)|["*?<>|:\x00-\x1f]/.test(cfg.docRoot || '')) errors.push('siteErrDocRoot');
    if (usesFcgi(cfg) && cfg.fcgiProcesses !== undefined) {
        const n = Number(cfg.fcgiProcesses);
        if (!Number.isInteger(n) || n < 1 || n > FCGI_MAX_PROCESSES) errors.push('siteErrFcgiProcesses');
    }
    return errors;
}

/**
 * Settings recovered from a hand-written `<VirtualHost>` for `serverName`, so
 * existing sites keep their document root / proxy port when DevStack takes over.
 */
export function parseLegacyVhost(text, serverName, sitePath) {
    const blocks = (text || '').split(/<VirtualHost\b/i).slice(1).map(b => b.split(/<\/VirtualHost>/i)[0]);
    const block = blocks.find(b => new RegExp(`^\\s*ServerName\\s+${serverName.replace(/\./g, '\\.')}(:\\d+)?\\s*$`, 'im').test(b));
    if (!block) return null;

    const proxy = block.match(/^\s*ProxyPass\s+\/\s+http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\//im);
    if (proxy) return { type: 'proxy', proxyPort: parseInt(proxy[1], 10) };

    const root = block.match(/^\s*DocumentRoot\s+"?([^"\r\n]+)"?/im)?.[1]?.replace(/\\/g, '/').replace(/\/+$/, '');
    const base = sitePath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!root || !root.toLowerCase().startsWith(base.toLowerCase())) return null;
    const docRoot = root.slice(base.length).replace(/^\/+/, '');
    return {
        type: /(^|\/)public$/.test(docRoot) ? 'laravel' : 'php',
        docRoot,
        nginxRewrite: /AllowOverride\s+None/i.test(block),
    };
}

/** Site type from project files (`facts` are booleans plus package.json text). */
/**
 * Dev-server port the project itself declares: `--port N` in the `dev` script of
 * package.json, else `server.port` in vite.config. Null when it relies on Vite's default.
 */
export function declaredVitePort(facts) {
    let pkg = null;
    try { pkg = facts.packageJson ? JSON.parse(facts.packageJson) : null; } catch { /* invalid package.json */ }
    const script = pkg?.scripts?.dev || pkg?.scripts?.serve || '';
    const fromScript = script.match(/--port[=\s]+(\d{2,5})/);
    if (fromScript) return parseInt(fromScript[1], 10);
    return serverPortInViteConfig(facts.viteConfig || '');
}

/** `port` directly inside the `server: { ... }` object (not hmr.port, not preview.port). */
function serverPortInViteConfig(text) {
    for (const m of text.matchAll(/\bserver\s*:\s*\{/g)) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        for (; i < text.length && depth > 0; i++) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;
        }
        // Blank out nested objects so only top-level keys of `server` remain.
        let body = text.slice(start, i - 1);
        let prev;
        do { prev = body; body = body.replace(/\{[^{}]*\}/g, '{}'); } while (body !== prev);
        const port = body.match(/(?:^|[,{\s])port\s*:\s*(\d{2,5})/);
        if (port) return parseInt(port[1], 10);
    }
    return null;
}

export function detectFromFiles(facts, usedPorts = []) {
    if (facts.srcPublicIndex) return { type: 'laravel', docRoot: 'src/public' };
    if (facts.publicIndex && facts.artisan) return { type: 'laravel', docRoot: 'public' };
    let pkg = null;
    try { pkg = facts.packageJson ? JSON.parse(facts.packageJson) : null; } catch { /* invalid package.json */ }
    if (pkg && (pkg.dependencies?.vite || pkg.devDependencies?.vite)) {
        const declared = declaredVitePort(facts);
        if (declared) return { type: 'proxy', proxyPort: declared };
        let port = DEFAULT_VITE_PORT;
        while (usedPorts.includes(port)) port++;
        return { type: 'proxy', proxyPort: port };
    }
    return { type: 'php', docRoot: '' };
}

/** Ports hand-written (unmanaged) vhosts proxy to, so a new project does not reuse them. */
export const proxyPortsInVhosts = (text) =>
    [...(text || '').matchAll(/^\s*ProxyPass\s+\S+\s+https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/gim)].map(m => parseInt(m[1], 10));

export function defaultSiteConfig(folder) {
    return {
        type: 'php', docRoot: '', proxyPort: DEFAULT_VITE_PORT, nginxRewrite: true,
        domain: legacyDomain(folder), aliases: [], ssl: false, httpsRedirect: false,
        phpMode: 'fcgi', phpVersion: '', fcgiProcesses: DEFAULT_FCGI_PROCESSES,
        group: '', order: 0, processes: [], env: '',
    };
}

/** Name for a domain template: folder minus the prefix shared by the group. */
export function templateName(folder, folders = []) {
    const others = folders.filter(f => f !== folder);
    let prefix = '';
    if (others.length) {
        const all = [folder, ...others];
        while (prefix.length < folder.length && all.every(f => f.startsWith(folder.slice(0, prefix.length + 1)))) {
            prefix = folder.slice(0, prefix.length + 1);
        }
        prefix = prefix.replace(/[^-_.]*$/, ''); // cut back to a word boundary
    }
    return folder.slice(prefix.length).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

export const applyNameTemplate = (template, name) => template.replace(/\{name\}/g, name).toLowerCase();

/** `KEY=value` lines (comments with #) to an object. */
export function parseEnvText(text) {
    const env = {};
    for (const line of (text || '').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (match) env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
    return env;
}

/** Processes a site runs: the Vite dev server for proxy sites plus custom ones. */
export function siteProcesses(cfg) {
    const builtIn = cfg.type === 'proxy'
        ? [{ name: 'vite', command: `npm run dev -- --port ${cfg.proxyPort} --strictPort --host 127.0.0.1`, autoRestart: false, builtIn: true }]
        : [];
    return [...builtIn, ...(cfg.processes || [])];
}

export const docRootPath = (site) =>
    [site.path.replace(/\\/g, '/').replace(/\/+$/, ''), (site.cfg.docRoot || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')]
        .filter(Boolean).join('/');

const indent = (lines, n = 4) => lines.map(l => ' '.repeat(n) + l);

function siteBody(site, ssl) {
    const { cfg } = site;
    if (cfg.type === 'proxy') {
        const port = cfg.proxyPort;
        return [
            'ProxyPreserveHost On',
            ...(ssl ? ['RequestHeader set X-Forwarded-Proto "https"'] : []),
            'RewriteEngine On',
            'RewriteCond %{HTTP:Upgrade} websocket [NC]',
            `RewriteRule ^/?(.*) ws://127.0.0.1:${port}/$1 [P,L]`,
            `ProxyPass / http://127.0.0.1:${port}/`,
            `ProxyPassReverse / http://127.0.0.1:${port}/`,
        ];
    }
    const root = docRootPath(site);
    const dirRules = cfg.type === 'laravel' && cfg.nginxRewrite !== false
        ? NGINX_STYLE_REWRITE
        : ['Options Indexes FollowSymLinks', 'AllowOverride All', 'Require all granted'];
    return [
        `DocumentRoot "${root}"`,
        'DirectoryIndex index.php index.html',
        ...(site.fcgi
            ? [
                '<FilesMatch "\\.php$">',
                `    SetHandler "proxy:balancer://${balancerName(site.key)}/"`,
                '</FilesMatch>',
                // proxy_fcgi sends a mangled "/F:/..." path on Windows -> php-cgi "No input file specified".
                'ProxyFCGISetEnvIf "true" SCRIPT_FILENAME "%{DOCUMENT_ROOT}%{reqenv:SCRIPT_NAME}"',
            ]
            : []),
        `<Directory "${root}">`,
        ...indent(dirRules),
        '</Directory>',
    ];
}

function vhost(site, { port, ssl, certDir, logDir }) {
    const { cfg, key } = site;
    const aliases = (cfg.aliases || []).filter(Boolean);
    const body = !ssl && cfg.ssl && cfg.httpsRedirect
        ? ['RewriteEngine On', 'RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]']
        : siteBody(site, ssl);
    return [
        `<VirtualHost *:${ssl ? 443 : port}>`,
        ...indent([
            `ServerName ${cfg.domain}`,
            ...(aliases.length ? [`ServerAlias ${aliases.join(' ')}`] : []),
            ...(ssl ? ['SSLEngine on', `SSLCertificateFile "${certDir}/${key}.pem"`, `SSLCertificateKeyFile "${certDir}/${key}-key.pem"`] : []),
            ...(logDir ? [`ErrorLog "${logDir}/${key}-error.log"`, `CustomLog "${logDir}/${key}-access.log" common`] : []),
            ...body,
        ]),
        '</VirtualHost>',
    ].join('\r\n');
}

const loadModule = (name, file) => [`<IfModule !${name}>`, `    LoadModule ${name} modules/${file}`, '</IfModule>'];

/** Server-level balancer over a site's php-cgi pool, shared by its :80 and :443 vhosts. */
const fcgiBalancer = (site) => [
    `<Proxy "balancer://${balancerName(site.key)}">`,
    ...site.fcgi.ports.map(p => `    BalancerMember "fcgi://127.0.0.1:${p}" retry=5`),
    '    ProxySet lbmethod=bybusyness',
    '</Proxy>',
].join('\r\n');

/**
 * Body of the managed `# --- DEVSTACK SITES ---` block in httpd-vhosts.conf.
 * `sites` are `{ key, path, cfg, fcgi? }` where `fcgi = { ports }` is the site's
 * php-cgi pool. SSL modules / `Listen 443` and the FastCGI balancer modules are
 * emitted only when some site needs them.
 */
export function buildVhosts(sites, { port = 80, certDir, logDir } = {}) {
    const parts = ['# Generated by DevStack (Sites page). Changes inside this block are overwritten.'];
    const fcgiSites = sites.filter(s => s.fcgi);
    if (fcgiSites.length) {
        parts.push([
            '# FASTCGI POOLS (one php-cgi pool per site; see the Services page)',
            ...loadModule('proxy_module', 'mod_proxy.so'),
            ...loadModule('proxy_fcgi_module', 'mod_proxy_fcgi.so'),
            ...loadModule('slotmem_shm_module', 'mod_slotmem_shm.so'),
            ...loadModule('proxy_balancer_module', 'mod_proxy_balancer.so'),
            ...loadModule('lbmethod_bybusyness_module', 'mod_lbmethod_bybusyness.so'),
        ].join('\r\n'), ...fcgiSites.map(fcgiBalancer));
    }
    if (sites.some(s => s.cfg.ssl)) {
        parts.push([
            '# SSL CONFIG',
            '<IfModule !ssl_module>',
            '    LoadModule ssl_module modules/mod_ssl.so',
            '</IfModule>',
            '<IfModule !headers_module>',
            '    LoadModule headers_module modules/mod_headers.so',
            '</IfModule>',
            'Listen 443',
        ].join('\r\n'));
    }
    for (const site of sites) {
        parts.push(vhost(site, { port, ssl: false, certDir, logDir }));
        if (site.cfg.ssl) parts.push(vhost(site, { port, ssl: true, certDir, logDir }));
    }
    return parts.join('\r\n\r\n');
}

/** Hosts-file lines outside the DevStack block: `[{ ip, hosts, line }]`. */
export function parseHostsOutsideBlock(text) {
    const start = text.indexOf('# --- DEVSTACK HOSTS ---');
    const endMarker = '# --- END DEVSTACK HOSTS ---';
    const end = text.indexOf(endMarker);
    const outside = start >= 0 && end > start ? text.slice(0, start) + text.slice(end + endMarker.length) : text;
    return outside.split(/\r?\n/)
        .map(line => line.replace(/#.*$/, '').trim())
        .filter(Boolean)
        .map(line => {
            const [ip, ...hosts] = line.split(/\s+/);
            return { ip, hosts: hosts.map(h => h.toLowerCase()), line };
        })
        .filter(e => e.hosts.length && /^[0-9a-f:.]+$/i.test(e.ip));
}
