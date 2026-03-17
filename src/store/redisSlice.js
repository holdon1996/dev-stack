
import { getRedisDir } from '../lib/paths';

export const createRedisSlice = (set, get) => ({
    redisVersions: [
        { version: '7.2.3', installed: false, active: true },
    ],

    startRedis: async () => {
        const active = get().redisVersions.find(v => v.active);
        if (!active) return false;

        const path = getRedisDir(get(), active.version).replace(/\//g, '\\');
        const exe = `${path}\\redis-server.exe`;
        const conf = `${path}\\redis.conf`;

        try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('start_detached_process', {
                executable: exe,
                args: [conf]
            });
            return true;
        } catch (e) {
            console.error('Failed to start Redis natively', e);
            return false;
        }
    }
});
