import { getBinDir, toWinPath } from '../lib/paths';

export const createRedisSlice = (set, get) => ({
    redisVersions: [
        { version: '7.2.3', installed: false, active: true },
    ],
    /** Folder of the detected redis-server.exe (for the terminal PATH); null when none. */
    redisDir: null,

    /** `{ exe, dir, conf }` of the Redis found under `bin/redis*`, or null. */
    resolveRedis: async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        const exe = await invoke('find_redis_server', { binDir: toWinPath(getBinDir(get())) }).catch(() => null);
        const dir = exe ? exe.replace(/[\\/][^\\/]+$/, '') : null;
        set({ redisDir: dir });
        if (!exe) return null;
        let conf = null;
        for (const name of ['redis.conf', 'redis.windows.conf']) {
            const path = `${dir}\\${name}`;
            if (await invoke('path_exists', { path })) { conf = path; break; }
        }
        return { exe, dir, conf };
    },

    startRedis: async () => {
        const redis = await get().resolveRedis();
        if (!redis) {
            get().showToast(get().t('redisNotFound', { dir: `${getBinDir(get())}/redis` }), 'warn', { action: { label: get().t('guideHowToFix'), guide: 'troubleshooting' } });
            return false;
        }
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const port = String(get().settings.portRedis || 6379);
            await invoke('start_detached_process', {
                executable: redis.exe,
                args: [...(redis.conf ? [redis.conf] : []), '--port', port],
            });
            return true;
        } catch (e) {
            console.error('Failed to start Redis natively', e);
            get().showToast(get().t('serviceStartFailed', { name: 'Redis', error: `${e}` }), 'danger');
            return false;
        }
    }
});
