// In-app guide: first-run checklist (pure evaluation of facts the store collects),
// step-by-step recipes and a troubleshooting map. Texts are i18n keys.

export const VC_REDIST_URL = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';

/** i18n key of what is wrong with the DevStack folder, or null. */
export function installPathProblem(dir) {
    const d = (dir || '').replace(/\//g, '\\').toLowerCase();
    if (!d) return null;
    if (/\s/.test(d)) return 'guidePathSpaces';
    if (d.includes('\\appdata\\')) return 'guidePathAppData';
    if (/^[a-z]:\\program files( \(x86\))?\\/.test(d)) return 'guidePathProgramFiles';
    return null;
}

/**
 * Checklist rows from collected facts. `status`: 'ok' | 'warn' | 'fail'.
 * `optional` rows never fail (they warn); `fix` is `{ page }`, `{ action }` or `{ url }`.
 */
export function evaluateChecks(f) {
    const pathProblem = installPathProblem(f.devStackDir);
    const rows = [
        { id: 'admin', ok: f.elevated, fix: { action: 'relaunchAdmin' } },
        { id: 'installPath', ok: !pathProblem, optional: true, detailKey: pathProblem },
        { id: 'vcRuntime', ok: f.vcRuntime, fix: { url: VC_REDIST_URL } },
        { id: 'apache', ok: f.apacheActive, fix: { page: 'apache' } },
        { id: 'php', ok: f.phpActive, fix: { page: 'php' } },
        { id: 'mysql', ok: f.mysqlActive, fix: { page: 'database' } },
        { id: 'ports', ok: !(f.foreignPorts || []).length, params: { ports: (f.foreignPorts || []).join(', ') }, fix: { page: 'services' } },
        { id: 'running', ok: f.apacheRunning && f.mysqlRunning, fix: { action: 'startCore' } },
        { id: 'mkcertCa', ok: f.mkcertCa, optional: !f.httpsSites, fix: { action: 'installCa' } },
        { id: 'caBundle', ok: f.caBundle, fix: { action: 'refreshCa' } },
        { id: 'node', ok: f.node, optional: true, fix: { page: 'node' } },
        { id: 'mailpit', ok: f.mailpit, optional: true, fix: { page: 'mail' } },
        { id: 'sites', ok: f.managedSites > 0, optional: true, fix: { page: 'domains' } },
    ];
    return rows.map(r => ({ ...r, status: r.ok ? 'ok' : r.optional ? 'warn' : 'fail' }));
}

export const checklistDone = (rows) => rows.length > 0 && rows.every(r => r.status !== 'fail');

/** Recipes: numbered steps, each optionally linking to the page where it is done. */
export const RECIPES = [
    {
        id: 'team',
        steps: [
            { page: 'settings' },
            { page: 'domains' },
            { page: 'domains' },
            { page: 'sites' },
            { page: 'sites' },
            { page: 'database' },
            { page: 'services' },
            { page: 'domains' },
        ],
    },
    { id: 'vite', steps: [{ page: 'sites' }, {}, { page: 'sites' }, {}, {}] },
    { id: 'tunnel', steps: [{ page: 'tunnels' }, { page: 'tunnels' }, { page: 'tunnels' }, {}, { page: 'tunnels' }] },
    { id: 'database', steps: [{ page: 'database' }, {}, { page: 'database' }] },
];

/** Troubleshooting rows: symptom, cause and fix keys plus the page to open. */
export const TROUBLESHOOTING = [
    { id: 'php503', page: 'services' },
    { id: 'vite502', page: 'sites' },
    { id: 'curl60', page: 'php' },
    { id: 'noInput', page: 'sites' },
    { id: 'portBusy', page: 'services' },
    { id: 'notResolved', page: 'domains' },
    { id: 'certUntrusted', anchor: 'checklist' },
    { id: 'apacheTimeout', anchor: 'checklist' },
    { id: 'cors', page: 'sites' },
    { id: 'envFlaky', page: 'sites' },
    { id: 'tunnelWrongSite', page: 'tunnels' },
    { id: 'askHelp', page: 'logs' },
];
