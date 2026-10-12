import test from 'node:test';
import assert from 'node:assert/strict';
import { installedVersionFolders, versionFromFolder } from './paths.js';

test('versionFromFolder accepts only exact install folder names', () => {
    assert.equal(versionFromFolder('php-8.3.30', 'php'), '8.3.30');
    assert.equal(versionFromFolder('MySQL-8.0.45', 'mysql'), '8.0.45');
    assert.equal(versionFromFolder('php-8.3.30.tmp_extract', 'php'), null);
    assert.equal(versionFromFolder('php-8.3.tmp_extract', 'php'), null);
    assert.equal(versionFromFolder('php-8.3.30.old', 'php'), null);
    assert.equal(versionFromFolder('php-8.3', 'php'), null);
    assert.equal(versionFromFolder('mysql-8.0.45', 'php'), null);
});

test('installedVersionFolders skips folders without the executable', async () => {
    const files = new Set(['/bin/php/php-8.3.30/php.exe', '/bin/php/php-8.2.30.tmp_extract/php.exe']);
    const invoke = async (cmd, { path }) => (cmd === 'list_subdirs'
        ? ['php-8.3.30', 'php-8.2.30.tmp_extract', 'php-7.4.33']
        : files.has(path));
    assert.deepEqual(await installedVersionFolders(invoke, '/bin/php', 'php', 'php.exe'), ['8.3.30']);
});
