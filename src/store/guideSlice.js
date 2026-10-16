import { evaluateChecks } from '../lib/guide';
import { getMailpitExe } from '../lib/paths';

export const createGuideSlice = (set, get) => ({
    guideChecks: [],
    guideChecking: false,
    /** The first-run banner on Services was hidden by the user (persisted). */
    guideDismissed: false,
    /** Section of the Guide page to scroll to when it opens. */
    guideAnchor: '',

    openGuide: (anchor = '') => {
        set({ guideAnchor: anchor });
        get().setActivePage('guide');
    },

    dismissGuideBanner: () => set({ guideDismissed: true }),

    /** Collects live facts (no side effects) and evaluates the first-run checklist. */
    runGuideChecks: async () => {
        if (get().guideChecking) return get().guideChecks;
        set({ guideChecking: true });
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const st = get();
            const running = (type) => st.services.find(s => s.type === type)?.status === 'running';
            const managed = Object.values(st.siteConfigs).filter(c => c.managed);
            const httpsSites = managed.filter(c => c.ssl).length;

            // A port counts as blocked only when someone other than DevStack holds it.
            const ports = [];
            if (!running('web')) ports.push(parseInt(st.settings.port80) || 80, ...(httpsSites ? [443] : []));
            if (!running('db')) ports.push(parseInt(st.settings.portMySQL) || 3306);
            const foreignPorts = [];
            for (const port of ports) {
                const owner = await invoke('port_owner', { port }).catch(() => null);
                if (owner && !st._isDevstackExe(owner.exe)) foreignPorts.push(`${port} (${owner.service || owner.name})`);
            }

            const facts = {
                elevated: !!st.isElevated,
                devStackDir: st.settings.devStackDir,
                vcRuntime: await invoke('vc_runtime_installed').catch(() => true),
                apacheActive: st.apacheVersions.some(v => v.active && v.installed),
                phpActive: st.phpVersions.some(v => v.active && v.installed),
                mysqlActive: st.mysqlVersions.some(v => v.active && v.installed),
                foreignPorts,
                apacheRunning: running('web'),
                mysqlRunning: running('db'),
                mkcertCa: !!st.settings.mkcertCaInstalled,
                httpsSites,
                caBundle: await invoke('path_exists', { path: st.caBundlePath().replace(/\//g, '\\') }).catch(() => false),
                node: (st.nodeVersions || []).length > 0,
                mailpit: await invoke('path_exists', { path: getMailpitExe(st) }).catch(() => false),
                managedSites: managed.length,
            };
            const checks = evaluateChecks(facts);
            set({ guideChecks: checks });
            return checks;
        } finally {
            set({ guideChecking: false });
        }
    },

    /**
     * New machine in one click: installs whichever of Apache, PHP and MySQL is missing, one
     * after another (each install activates itself when it is the first), then starts Apache
     * and MySQL. Stops at the first failure and points to that page.
     */
    installRecommendedStack: async () => {
        const { t, showToast } = get();
        const newest = (list) => [...list].filter(v => v.downloadUrl)
            .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0]?.version;
        // PHP 8.4: current and widely supported by Laravel / Symfony; else the newest 8.x.
        const php = get().phpVersions.filter(v => v.downloadUrl && v.threadSafe !== false);
        const steps = [
            !get().apacheVersions.some(v => v.installed)
                && { name: 'Apache', page: 'apache', version: newest(get().apacheVersions), install: (v) => get().installApacheVersion(v), list: () => get().apacheVersions },
            !get().phpVersions.some(v => v.installed)
                && { name: 'PHP', page: 'php', version: newest(php.filter(v => v.version.startsWith('8.4.'))) || newest(php.filter(v => v.version.startsWith('8.'))), install: (v) => get().installPhpVersion(v), list: () => get().phpVersions },
            !get().mysqlVersions.some(v => v.installed)
                && { name: 'MySQL', page: 'database', version: newest(get().mysqlVersions), install: (v) => get().installMysqlVersion(v), list: () => get().mysqlVersions },
        ].filter(Boolean);

        for (const [i, step] of steps.entries()) {
            const label = `${step.name} ${step.version || ''}`.trim();
            const toPage = { action: { label: t('guideOpenPage'), page: step.page }, key: 'stack' };
            if (!step.version) {
                showToast(t('stackInstallFailed', { name: label }), 'danger', toPage);
                return false;
            }
            showToast(t('stackInstalling', { name: label, step: i + 1, total: steps.length }), 'info', { key: 'stack' });
            await step.install(step.version);
            if (!step.list().some(v => v.version === step.version && v.installed)) {
                showToast(t('stackInstallFailed', { name: label }), 'danger', toPage);
                return false;
            }
        }
        for (const type of ['web', 'db']) {
            const svc = get().services.find(s => s.type === type);
            if (svc && svc.status !== 'running') await get().toggleService(svc.id);
        }
        showToast(t('stackReady'), 'ok', { key: 'stack' });
        return true;
    },

    /** Runs the "Fix" button of a checklist row, then re-checks. */
    runGuideFix: async (fix) => {
        if (!fix) return;
        if (fix.page) {
            get().setActivePage(fix.page);
            return;
        }
        if (fix.url) {
            const { openUrl } = await import('@tauri-apps/plugin-opener');
            await openUrl(fix.url);
            return;
        }
        const { invoke } = await import('@tauri-apps/api/core');
        switch (fix.action) {
            case 'relaunchAdmin':
                await invoke('relaunch_as_admin').catch(e => get().showToast(`${e}`, 'danger'));
                break;
            case 'startCore':
                for (const type of ['web', 'db']) {
                    const svc = get().services.find(s => s.type === type);
                    if (svc && svc.status !== 'running') await get().toggleService(svc.id);
                }
                break;
            case 'installStack':
                await get().installRecommendedStack();
                break;
            case 'installCa':
                await get().ensureMkcertCa();
                break;
            case 'refreshCa':
                await get().refreshCaBundle({ restart: false });
                break;
            default:
                break;
        }
        await get().runGuideChecks();
    },
});
