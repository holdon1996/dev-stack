import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, envNames, parseManifest, planManifestImport } from './manifest.js';
import { defaultSiteConfig } from './sites.js';

const cfg = (key, extra) => ({ ...defaultSiteConfig(key), managed: true, fcgiPortBase: 9300, ...extra });

test('builds a manifest without machine-specific fields', () => {
    const siteConfigs = {
        'App-Api': cfg('App-Api', { type: 'laravel', docRoot: 'src/public', domain: 'local-api.app.test', ssl: true, order: 2, group: 'app' }),
        'App-Web': cfg('App-Web', { type: 'proxy', proxyPort: 5181, domain: 'local-web.app.test', order: 1, group: 'app',
            processes: [{ name: 'vite', command: 'npm run dev', builtIn: true }, { name: 'queue', command: 'php artisan queue:work', autoRestart: true }] }),
    };
    siteConfigs['App-Api'].env = 'DB_PASSWORD=secret';
    const m = buildManifest({ name: 'app', group: 'app', keys: ['App-Api', 'App-Web'], siteConfigs });
    assert.deepEqual(Object.keys(m.sites), ['App-Web', 'App-Api']);
    assert.equal(m.groupEnv, undefined);
    assert.equal(m.sites['App-Api'].env, undefined);
    assert.equal(m.sites['App-Api'].fcgiPortBase, undefined);
    assert.equal(m.sites['App-Api'].managed, undefined);
    assert.equal(m.sites['App-Api'].group, undefined);
    assert.deepEqual(m.sites['App-Web'].processes, [{ name: 'queue', command: 'php artisan queue:work', autoRestart: true }]);
});

test('round-trips and validates a manifest', () => {
    const siteConfigs = { Api: cfg('Api', { type: 'laravel', docRoot: 'src/public', domain: 'Local-Api.App.Test' }) };
    const text = JSON.stringify(buildManifest({ group: 'app', keys: ['Api'], siteConfigs }));
    const parsed = parseManifest(text);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.group, 'app');
    assert.equal(parsed.sites.Api.domain, 'local-api.app.test');
    assert.equal(parsed.sites.Api.group, 'app');
    assert.equal(parsed.sites.Api.fcgiProcesses, 4);
});

test('reports invalid manifests', () => {
    assert.deepEqual(parseManifest('{').errors, [{ key: '', codes: ['manifestErrJson'] }]);
    assert.deepEqual(parseManifest('{"sites": []}').errors, [{ key: '', codes: ['manifestErrNoSites'] }]);
    assert.deepEqual(parseManifest('{"devstack": 99, "sites": {}}').errors, [{ key: '', codes: ['manifestErrVersion'] }]);
    const bad = parseManifest(JSON.stringify({ sites: { Web: { type: 'proxy', proxyPort: 0, domain: 'bad host' } } }));
    assert.equal(bad.errors[0].key, 'Web');
    assert.ok(bad.errors[0].codes.includes('siteErrHost') && bad.errors[0].codes.includes('siteErrPort'));
});

test('keeps a process sub-folder but rejects paths leaving the project', () => {
    const procs = (cwd) => parseManifest(JSON.stringify({ sites: { Api: { type: 'laravel', domain: 'api.test', processes: [{ name: 'q', command: 'php artisan queue:work', cwd }] } } })).sites.Api.processes[0];
    assert.equal(procs('src').cwd, 'src');
    assert.equal(procs('..\\other').cwd, undefined);
    assert.equal(procs('src/../../x').cwd, undefined);
    assert.equal(procs('C:\\Windows').cwd, undefined);
    assert.equal(procs('/etc').cwd, undefined);
});

test('lists env variable names for the import confirmation', () => {
    assert.deepEqual(envNames('A=1\n# B=2\nNODE_OPTIONS = --x # note\nbad line\n'), ['A', 'NODE_OPTIONS']);
});

test('matches manifest sites to project folders', () => {
    const plan = planManifestImport({ 'repo-api': { a: 1 }, 'repo-missing': { b: 2 } }, ['Repo-Api', 'Other']);
    assert.deepEqual(plan, { configs: { 'Repo-Api': { a: 1 } }, missing: ['repo-missing'] });
});
