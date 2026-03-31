export const createNodeSlice = (set, get) => ({
    nodeVersions: [],
    nodeInstallLogs: [],
    nodeInstallProgress: { pct: 0, downloaded: 0, total: 0 },
    activatingNode: null,

    normalizeNodeTag: (tag) => {
        const normalized = `${tag || ''}`.trim().replace(/^v/i, '');
        if (!normalized) return '';
        if (!/^\d+(?:\.\d+){1,2}$/.test(normalized)) return '';
        return normalized;
    },

    scanInstalledNode: async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
            const versions = await invoke('list_node_versions', { baseDir });
            const normalized = Array.isArray(versions) ? versions : [];
            normalized.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' }));
            set({ nodeVersions: normalized });
        } catch (e) {
            console.error('scanInstalledNode failed:', e);
        }
    },

    installNodeVersion: async (tag) => {
        const version = get().normalizeNodeTag(tag);
        if (!version) {
            get().showToast(get().t('nodeInvalidTag'), 'danger');
            return;
        }

        const existing = get().nodeVersions.find(v => v.version === version);
        if (existing?.installed) {
            get().showToast(get().t('nodeAlreadyInstalled', { version }), 'info');
            return;
        }

        const url = `https://nodejs.org/dist/v${version}/node-v${version}-win-x64.zip`;
        const devDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const destDir = `${devDir}/bin/node/node-v${version}`;

        set(s => ({
            nodeVersions: s.nodeVersions.some(v => v.version === version)
                ? s.nodeVersions.map(v => v.version === version ? { ...v, installing: true, progress: 0 } : v)
                : [{ version, installed: false, active: false, installing: true, progress: 0, path: destDir }, ...s.nodeVersions],
            nodeInstallLogs: [
                { t: new Date().toLocaleTimeString(), m: `Installing Node.js ${version}...`, l: 'info' },
                { t: new Date().toLocaleTimeString(), m: `Download URL: ${url}`, l: 'info' }
            ],
            nodeInstallProgress: { pct: 0, downloaded: 0, total: 0 }
        }));

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');

            const unlistenLogs = await listen('node-install-log', (event) => {
                const line = event.payload;
                set(s => ({ nodeInstallLogs: [...s.nodeInstallLogs, { t: new Date().toLocaleTimeString(), m: line, l: 'info' }] }));
            });

            const unlistenProgress = await listen('download-progress', (event) => {
                const { svcType, pct, downloaded, total } = event.payload || {};
                if (svcType === 'node') {
                    set({
                        nodeInstallProgress: {
                            pct: pct || 0,
                            downloaded: downloaded || 0,
                            total: total || 0
                        }
                    });
                }
            });

            const result = await invoke('install_binary', {
                svcType: 'node',
                version,
                url,
                destDir,
                expectedSizeMb: null
            });

            unlistenLogs();
            unlistenProgress();

            if (result === 'SUCCESS') {
                await get().scanInstalledNode();
                const activeNode = get().nodeVersions.find(v => v.active);
                if (!activeNode) {
                    await get().setActiveNode(version, { silent: true });
                }
                get().showToast(get().t('nodeInstalledToast', { version }), 'ok');
            }
        } catch (e) {
            console.error('installNodeVersion failed:', e);
            set(s => ({
                nodeVersions: s.nodeVersions.map(v => v.version === version ? { ...v, installing: false } : v),
                nodeInstallLogs: [...s.nodeInstallLogs, { t: new Date().toLocaleTimeString(), m: `Error: ${e}`, l: 'err' }]
            }));
            get().showToast(get().t('nodeInstallFailed', { error: `${e}` }), 'danger');
        }
    },

    setActiveNode: async (tag, options = {}) => {
        const version = get().normalizeNodeTag(tag);
        if (!version) {
            get().showToast(get().t('nodeInvalidTag'), 'danger');
            return;
        }

        set({ activatingNode: version });

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const baseDir = get().settings.devStackDir.replace(/[\\\/]+$/, '');
            await invoke('activate_node_version', { baseDir, version });
            await get().scanInstalledNode();
            if (!options.silent) {
                get().showToast(get().t('nodeActivatedToast', { version }), 'ok');
            }
        } catch (e) {
            console.error('setActiveNode failed:', e);
            get().showToast(get().t('nodeActivateFailed', { error: `${e}` }), 'danger');
        } finally {
            set({ activatingNode: null });
        }
    },

    uninstallNodeVersion: async (tag) => {
        const version = get().normalizeNodeTag(tag);
        if (!version) {
            get().showToast(get().t('nodeInvalidTag'), 'danger');
            return;
        }

        const baseDir = get().settings.devStackDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const targetDir = `${baseDir}/bin/node/node-v${version}`;
        const existing = get().nodeVersions.find(v => v.version === version);

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            if (existing?.active) {
                await invoke('deactivate_node_version', { baseDir: baseDir.replace(/\//g, '\\') });
            }
            await invoke('remove_dir', { path: targetDir.replace(/\//g, '\\') });
            await get().scanInstalledNode();
            get().showToast(get().t('nodeUninstalledToast', { version }), 'warn');
        } catch (e) {
            console.error('uninstallNodeVersion failed:', e);
            get().showToast(get().t('nodeUninstallFailed', { error: `${e}` }), 'danger');
        }
    },

    openNodeTerminal: async (prjPath = '') => {
        const activeNode = get().nodeVersions.find(v => v.active);
        if (!activeNode) {
            get().showToast(get().t('nodeNoActiveVersion'), 'warn');
            return;
        }

        const targetPath = (prjPath || get().settings.rootPath || get().settings.devStackDir || 'C:/devstack').replace(/\//g, '\\');
        const currentNodePath = `${get().settings.devStackDir.replace(/\//g, '\\')}\\bin\\node\\current`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('start_detached_process', {
                executable: 'cmd.exe',
                args: ['/C', 'start', 'cmd.exe', '/K', `set "PATH=${currentNodePath};%PATH%" && cd /d "${targetPath}" && title DevStack Node v${activeNode.version}`]
            });
        } catch (e) {
            console.error('openNodeTerminal failed:', e);
            get().showToast(get().t('nodeTerminalFailed', { error: `${e}` }), 'danger');
        }
    },
});
