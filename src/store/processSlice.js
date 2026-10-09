import { getBinDir, getDevDir, getMysqlDir, getPhpDir, toWinPath as win } from '../lib/paths';
import { parseEnvText, siteProcesses } from '../lib/sites';

const MC_URL = 'https://dl.min.io/client/mc/release/windows-amd64/mc.exe';
const stripAnsi = (line) => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
const COMPOSER_RE = /\bcomposer(\.phar)?\s+(install|update|require)\b/i;
let procListeners = null;

/**
 * Long-running project processes (Vite, queue workers, php-cgi backends) run by
 * the Rust process manager, project groups, and the DevStack environment
 * (PATH + CA variables) shared by processes and the DevStack terminal.
 */
export const createProcessSlice = (set, get) => ({
    procs: {},
    procLogs: {},
    groupEnvs: {},
    minioBuckets: [],

    initProcesses: async () => {
        if (procListeners) return;
        const { listen } = await import('@tauri-apps/api/event');
        const { invoke } = await import('@tauri-apps/api/core');
        procListeners = [
            await listen('proc-log', ({ payload }) => set(s => ({
                procLogs: {
                    ...s.procLogs,
                    [payload.id]: [...(s.procLogs[payload.id] || []), {
                        t: new Date().toLocaleTimeString(),
                        m: stripAnsi(payload.line),
                        l: payload.stream === 'stderr' ? 'warn' : 'info',
                    }].slice(-400),
                },
            }))),
            await listen('proc-state', ({ payload }) => set(s => ({
                procs: { ...s.procs, [payload.id]: { running: payload.running, pid: payload.pid, command: payload.command, code: payload.code } },
            }))),
        ];
        const running = await invoke('proc_list').catch(() => []);
        set({ procs: Object.fromEntries(running.map(p => [p.id, p])) });
    },

    /** PATH entries for DevStack tools, DevStack first so they win over separate installs. */
    devstackPathPrefix: (phpVersion) => {
        const st = get();
        const devDir = getDevDir(st);
        const php = phpVersion
            ? st.phpVersions.find(v => v.version === phpVersion && v.installed)
            : st.phpVersions.find(v => v.active && v.installed);
        const mysql = st.mysqlVersions.find(v => v.active && v.installed);
        return [
            php && getPhpDir(st, php),
            mysql && `${getMysqlDir(st, mysql.version)}/bin`,
            st.redisDir,
            `${getBinDir(st)}/tools`,
            `${getBinDir(st)}/tunnels`,
            `${devDir}/bin/node/current`,
        ].filter(Boolean).map(win).join(';');
    },

    /** CA variables so Node and curl trust the Windows roots (incl. the mkcert CA). */
    devstackCaEnv: () => {
        const bundle = win(`${getBinDir(get())}/php/ca-bundle.pem`);
        return { NODE_EXTRA_CA_CERTS: bundle, CURL_CA_BUNDLE: bundle, SSL_CERT_FILE: bundle };
    },

    /** Environment for a project: DevStack CA vars + group env + project env. */
    siteEnv: (site) => {
        const cfg = get().siteConfigs[site.key] || {};
        return {
            ...get().devstackCaEnv(),
            ...parseEnvText(get().groupEnvs[cfg.group]),
            ...parseEnvText(cfg.env),
        };
    },

    setGroupEnv: (group, text) => set(s => ({ groupEnvs: { ...s.groupEnvs, [group]: text } })),

    startProcess: async ({ id, command, cwd, env = {}, restart = false, pathPrefix = '' }) => {
        const { t, showToast } = get();
        if (COMPOSER_RE.test(command)) {
            const busy = Object.entries(get().procs).find(([pid, p]) => pid !== id && p.running && COMPOSER_RE.test(p.command || ''));
            if (busy) {
                showToast(t('composerParallelWarn', { id: busy[0] }), 'warn');
                return false;
            }
        }
        const { invoke } = await import('@tauri-apps/api/core');
        try {
            set(s => ({ procLogs: { ...s.procLogs, [id]: [{ t: new Date().toLocaleTimeString(), m: `$ ${command}`, l: 'info' }] } }));
            await invoke('proc_start', { id, command, cwd: win(cwd), pathPrefix, env, restart });
            set(s => ({ procs: { ...s.procs, [id]: { running: true, command } } }));
            return true;
        } catch (e) {
            showToast(`${e}`, 'danger');
            return false;
        }
    },

    stopProcess: async (id) => {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('proc_stop', { id });
        set(s => ({ procs: { ...s.procs, [id]: { ...s.procs[id], running: false } } }));
    },

    siteProcessId: (site, proc) => `${site.key}:${proc.name}`,

    startSiteProcess: (site, proc) => {
        const cfg = get().siteConfigs[site.key] || {};
        return get().startProcess({
            id: get().siteProcessId(site, proc),
            command: proc.command,
            cwd: proc.cwd ? `${site.path}/${proc.cwd}` : site.path,
            env: get().siteEnv(site),
            pathPrefix: get().devstackPathPrefix(cfg.phpVersion),
            restart: !!proc.autoRestart,
        });
    },

    stopSiteProcess: (site, proc) => get().stopProcess(get().siteProcessId(site, proc)),

    groupNames: () => [...new Set(Object.values(get().siteConfigs).filter(c => c.managed && c.group).map(c => c.group))].sort(),

    _groupSites: (group) => get().sites
        .filter(s => get().siteConfigs[s.key]?.managed && get().siteConfigs[s.key].group === group)
        .sort((a, b) => (get().siteConfigs[a.key].order || 0) - (get().siteConfigs[b.key].order || 0)),

    /** Starts Apache (if needed) then each project's processes in group order. */
    startGroup: async (group) => {
        const web = get().services.find(s => s.type === 'web');
        if (web && web.status !== 'running') await get().toggleService(web.id, 'start');
        for (const site of get()._groupSites(group)) {
            for (const proc of siteProcesses(get().siteConfigs[site.key])) {
                if (!get().procs[get().siteProcessId(site, proc)]?.running) await get().startSiteProcess(site, proc);
            }
            await new Promise(r => setTimeout(r, 800));
        }
        get().showToast(get().t('groupStarted', { group }), 'ok');
    },

    stopGroup: async (group) => {
        for (const site of [...get()._groupSites(group)].reverse()) {
            for (const proc of siteProcesses(get().siteConfigs[site.key])) await get().stopSiteProcess(site, proc);
        }
        get().showToast(get().t('groupStopped', { group }), 'warn');
    },

    restartGroup: async (group) => {
        await get().stopGroup(group);
        await get().startGroup(group);
    },

    // --- MinIO -------------------------------------------------------------------

    minioPaths: () => {
        const bin = `${getBinDir(get())}/minio`;
        return { exe: win(`${bin}/minio.exe`), mc: win(`${bin}/mc.exe`), data: win(`${getDevDir(get())}/data/minio`) };
    },

    minioCredentials: () => ({
        user: get().settings.minioUser || 'minioadmin',
        password: get().settings.minioPassword || 'minioadmin',
    }),

    startMinio: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { exe, data } = get().minioPaths();
        if (!(await invoke('path_exists', { path: exe }))) {
            get().showToast(get().t('minioNotInstalled'), 'warn');
            return false;
        }
        await invoke('create_dir', { path: data });
        const { user, password } = get().minioCredentials();
        const port = get().services.find(s => s.type === 'storage')?.port || 9000;
        return get().startProcess({
            id: 'minio',
            command: `"${exe}" server "${data}" --address 127.0.0.1:${port} --console-address 127.0.0.1:${port + 1}`,
            cwd: win(getDevDir(get())),
            env: { MINIO_ROOT_USER: user, MINIO_ROOT_PASSWORD: password },
        });
    },

    installMinio: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { exe, mc } = get().minioPaths();
        get().showToast(get().t('minioDownloading'), 'info');
        try {
            await invoke('download_file_with_progress', { svcType: 'storage', label: 'minio.exe', url: 'https://dl.min.io/server/minio/release/windows-amd64/minio.exe', destPath: exe });
            await invoke('download_file_with_progress', { svcType: 'storage', label: 'mc.exe', url: MC_URL, destPath: mc });
            get().showToast(get().t('minioInstalled'), 'ok');
            return true;
        } catch (e) {
            get().showToast(`${e}`, 'danger');
            return false;
        }
    },

    _mc: async (args) => {
        const { invoke } = await import('@tauri-apps/api/core');
        const { mc } = get().minioPaths();
        if (!(await invoke('path_exists', { path: mc }))) {
            await invoke('download_file_with_progress', { svcType: 'storage', label: 'mc.exe', url: MC_URL, destPath: mc });
        }
        const { user, password } = get().minioCredentials();
        const port = get().services.find(s => s.type === 'storage')?.port || 9000;
        return invoke('run_program', {
            exe: mc,
            args: ['--no-color', ...args],
            env: { MC_HOST_devstack: `http://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}` },
        });
    },

    listMinioBuckets: async () => {
        try {
            const out = await get()._mc(['ls', 'devstack']);
            set({ minioBuckets: out.split(/\r?\n/).map(l => l.trim().split(/\s+/).pop()?.replace(/\/$/, '')).filter(Boolean) });
        } catch (e) {
            set({ minioBuckets: [] });
            get().showToast(`${e}`.split('\n')[0], 'warn');
        }
    },

    createMinioBucket: async (name) => {
        if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) {
            get().showToast(get().t('minioBucketInvalid'), 'warn');
            return false;
        }
        try {
            await get()._mc(['mb', '--ignore-existing', `devstack/${name}`]);
            get().showToast(get().t('minioBucketCreated', { name }), 'ok');
            await get().listMinioBuckets();
            return true;
        } catch (e) {
            get().showToast(`${e}`.split('\n')[0], 'danger');
            return false;
        }
    },
});
