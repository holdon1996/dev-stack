import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistDone, evaluateChecks, installPathProblem } from './guide.js';

test('flags DevStack folders that break tools', () => {
    assert.equal(installPathProblem('C:/devstack'), null);
    assert.equal(installPathProblem('F:\\devstack'), null);
    assert.equal(installPathProblem('C:/My Tools/devstack'), 'guidePathSpaces');
    assert.equal(installPathProblem('C:/Users/me/AppData/Local/DevStack'), 'guidePathAppData');
    assert.equal(installPathProblem('C:\\Program Files\\DevStack'), 'guidePathSpaces');
});

const good = {
    elevated: true, devStackDir: 'C:/devstack', vcRuntime: true, apacheActive: true, phpActive: true, mysqlActive: true,
    foreignPorts: [], apacheRunning: true, mysqlRunning: true, mkcertCa: true, httpsSites: 1, caBundle: true,
    node: true, mailpit: true, managedSites: 3,
};

test('a ready machine passes every check', () => {
    const rows = evaluateChecks(good);
    assert.ok(rows.every(r => r.status === 'ok'));
    assert.ok(checklistDone(rows));
});

test('required checks fail, optional ones only warn', () => {
    const rows = evaluateChecks({ ...good, vcRuntime: false, node: false, mkcertCa: false, httpsSites: 0, foreignPorts: [80] });
    const status = Object.fromEntries(rows.map(r => [r.id, r.status]));
    assert.equal(status.vcRuntime, 'fail');
    assert.equal(status.ports, 'fail');
    assert.equal(status.node, 'warn');
    assert.equal(status.mkcertCa, 'warn');
    assert.equal(rows.find(r => r.id === 'ports').params.ports, '80');
    assert.ok(!checklistDone(rows));
    assert.equal(evaluateChecks({ ...good, mkcertCa: false }).find(r => r.id === 'mkcertCa').status, 'fail');
});
