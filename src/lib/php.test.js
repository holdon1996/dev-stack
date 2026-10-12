import test from 'node:test';
import assert from 'node:assert/strict';
import { phpDownloadUrl } from './php.js';

test('phpDownloadUrl picks the compiler of each release line', () => {
    const base = 'https://downloads.php.net/~windows/releases/';
    assert.equal(phpDownloadUrl('7.4.33'), `${base}php-7.4.33-Win32-vc15-x64.zip`);
    assert.equal(phpDownloadUrl('8.3.29'), `${base}php-8.3.29-Win32-vs16-x64.zip`);
    assert.equal(phpDownloadUrl('8.4.10'), `${base}php-8.4.10-Win32-vs17-x64.zip`);
    assert.equal(phpDownloadUrl('8.5.4'), `${base}php-8.5.4-Win32-vs17-x64.zip`);
});
