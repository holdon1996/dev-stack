import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildVhosts, detectFromFiles, domainWarnings, findHostConflicts, fcgiPort, parseLegacyVhost,
    templateName, applyNameTemplate, validateSiteConfig, defaultSiteConfig, parseHostsOutsideBlock,
    parseEnvText, siteProcesses,
} from './sites.js';

const site = (key, path, cfg) => ({ key, path, cfg: { ...defaultSiteConfig(key), ...cfg } });

test('detects Laravel, Vite and plain PHP projects', () => {
    assert.deepEqual(detectFromFiles({ srcPublicIndex: true }), { type: 'laravel', docRoot: 'src/public' });
    assert.deepEqual(detectFromFiles({ publicIndex: true, artisan: true }), { type: 'laravel', docRoot: 'public' });
    const pkg = JSON.stringify({ devDependencies: { vite: '^5' } });
    assert.deepEqual(detectFromFiles({ packageJson: pkg }, [5173, 5174]), { type: 'proxy', proxyPort: 5175 });
    assert.deepEqual(detectFromFiles({ packageJson: '{}' }), { type: 'php', docRoot: '' });
});

test('imports settings from a hand-written vhost', () => {
    const conf = `
<VirtualHost *:80>
    ServerName repitteglobal-storepotal.test
    ProxyPass / http://127.0.0.1:5182/
</VirtualHost>
<VirtualHost *:80>
    DocumentRoot "F:/devstack/www/RepitteGlobal-BookingService/src/public"
    ServerName repitteglobal-bookingservice.test
    <Directory "F:/devstack/www/RepitteGlobal-BookingService/src/public">
        AllowOverride None
    </Directory>
</VirtualHost>`;
    assert.deepEqual(parseLegacyVhost(conf, 'repitteglobal-storepotal.test', 'F:/devstack/www/RepitteGlobal-StorePotal'),
        { type: 'proxy', proxyPort: 5182 });
    assert.deepEqual(parseLegacyVhost(conf, 'repitteglobal-bookingservice.test', 'F:\\devstack\\www\\RepitteGlobal-BookingService'),
        { type: 'laravel', docRoot: 'src/public', nginxRewrite: true });
    assert.equal(parseLegacyVhost(conf, 'missing.test', 'F:/x'), null);
});

test('generates Laravel, proxy and HTTPS vhosts', () => {
    const conf = buildVhosts([
        site('api', 'F:/www/api', { type: 'laravel', docRoot: 'src/public', domain: 'local-api.example.com', ssl: true, httpsRedirect: true }),
        site('admin', 'F:/www/admin', { type: 'proxy', proxyPort: 5181, domain: 'local-admin.example.com', aliases: ['admin.test'], ssl: true }),
        site('legacy', 'F:/www/legacy', { type: 'php', phpVersion: '7.4.33' }),
    ], { port: 80, certDir: 'F:/certs', logDir: 'F:/logs' });

    assert.equal(conf.match(/^Listen 443$/gm).length, 1);
    assert.match(conf, /<Directory "F:\/www\/api\/src\/public">\r\n {8}AllowOverride None/);
    assert.match(conf, /RewriteRule \^ index\.php \[L\]/);
    assert.match(conf, /RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=301,L\]/);
    assert.match(conf, /SSLCertificateFile "F:\/certs\/api\.pem"/);
    assert.match(conf, /ServerAlias admin\.test/);
    assert.match(conf, /RewriteRule \^\/\?\(\.\*\) ws:\/\/127\.0\.0\.1:5181\/\$1 \[P,L\]/);
    assert.match(conf, /RequestHeader set X-Forwarded-Proto "https"/);
    assert.match(conf, /SetHandler "proxy:fcgi:\/\/127\.0\.0\.1:9074\/"/);
    assert.match(conf, /ErrorLog "F:\/logs\/legacy-error\.log"/);
    // Proxy sites have no DocumentRoot.
    const adminHttp = conf.split('<VirtualHost').find(b => b.includes('local-admin') && b.startsWith(' *:80'));
    assert.ok(adminHttp && !adminHttp.includes('DocumentRoot'));
});

test('no SSL modules without HTTPS sites', () => {
    assert.ok(!buildVhosts([site('a', 'F:/a', {})]).includes('Listen 443'));
});

test('validates hosts, conflicts and domain warnings', () => {
    assert.deepEqual(validateSiteConfig({ ...defaultSiteConfig('a'), domain: 'Bad Host' }), ['siteErrHost']);
    assert.deepEqual(validateSiteConfig({ ...defaultSiteConfig('a'), docRoot: '../etc' }), ['siteErrDocRoot']);
    assert.deepEqual(validateSiteConfig({ ...defaultSiteConfig('a'), docRoot: 'public"\nInclude x' }), ['siteErrDocRoot']);
    assert.deepEqual(findHostConflicts([
        { key: 'a', cfg: { domain: 'x.test', aliases: [] } },
        { key: 'b', cfg: { domain: 'y.test', aliases: ['x.test'] } },
    ]), [{ host: 'x.test', keys: ['a', 'b'] }]);
    assert.deepEqual(domainWarnings('app.dev').map(w => w.code), ['domainWarnHsts', 'domainWarnPublic']);
    assert.deepEqual(domainWarnings('shop.local').map(w => w.code), ['domainWarnMdns']);
    assert.deepEqual(domainWarnings('shop.test'), []);
    assert.deepEqual(domainWarnings('local-store.repitte.global').map(w => w.code), ['domainWarnPublic']);
});

test('domain template strips the shared group prefix', () => {
    const folders = ['RepitteGlobal-AdminPortal', 'RepitteGlobal-StorePotal', 'RepitteGlobal-BookingService'];
    assert.equal(templateName('RepitteGlobal-AdminPortal', folders), 'adminportal');
    assert.equal(templateName('solo', []), 'solo');
    assert.equal(applyNameTemplate('local-{name}.repitte.global', 'store'), 'local-store.repitte.global');
});

test('misc helpers', () => {
    assert.equal(fcgiPort('8.3.30'), 9083);
    assert.deepEqual(parseEnvText('A=1\n# c\nB = "two"\nbad line'), { A: '1', B: 'two' });
    assert.match(siteProcesses({ type: 'proxy', proxyPort: 5181, processes: [] })[0].command, /--port 5181 --strictPort --host 127\.0\.0\.1/);
    const hosts = '127.0.0.1 localhost\r\n# --- DEVSTACK HOSTS ---\r\n127.0.0.1 a.test\r\n# --- END DEVSTACK HOSTS ---\r\n127.0.0.1 local-store.repitte.global # manual\r\n';
    assert.deepEqual(parseHostsOutsideBlock(hosts).map(e => e.hosts), [['localhost'], ['local-store.repitte.global']]);
});
