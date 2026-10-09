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
