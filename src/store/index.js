import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createConfigSlice } from './configSlice';
import { createServiceSlice } from './serviceSlice';
import { createPhpSlice } from './phpSlice';
import { createMysqlSlice } from './mysqlSlice';
import { createApacheSlice } from './apacheSlice';
import { createTunnelSlice } from './tunnelSlice';
import { createUiSlice } from './uiSlice';
import { createRedisSlice } from './redisSlice';

export const useStore = create(
    persist(
        (...a) => ({
            ...createConfigSlice(...a),
            ...createServiceSlice(...a),
            ...createPhpSlice(...a),
            ...createMysqlSlice(...a),
            ...createApacheSlice(...a),
            ...createTunnelSlice(...a),
            ...createUiSlice(...a),
            ...createRedisSlice(...a),
        }),
        {
            name: 'devstack-storage-v3',
            partialize: (state) => ({
                settings: state.settings,
                sites: state.sites,
                databases: state.databases,
                // Only persist installed/active status, NOT version list (let scraper handle that)
                phpInstalledVersions: state.phpVersions
                    .filter(v => v.installed || v.active)
                    .map(v => ({ version: v.version, installed: v.installed, active: v.active })),
                apacheVersions: state.apacheVersions.map(v => ({ ...v, installing: false, progress: 0 })),
                mysqlVersions: state.mysqlVersions.map(v => ({ ...v, installing: false, progress: 0 })),
                locale: state.locale,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // Restore installed/active status back onto the fresh default list
                    if (state.phpInstalledVersions?.length) {
                        state.phpVersions = state.phpVersions.map(v => {
                            const saved = state.phpInstalledVersions.find(s => s.version === v.version);
                            return saved
                                ? { ...v, installed: !!saved.installed, active: !!saved.installed && !!saved.active }
                                : { ...v, installed: false, active: false };
                        });
                    }
                    if (state.apacheVersions) state.apacheVersions = state.apacheVersions.map(v => ({ ...v, installed: !!v.installed, active: !!v.installed && !!v.active, installing: false, progress: 0 }));
                    if (state.mysqlVersions) state.mysqlVersions = state.mysqlVersions.map(v => ({ ...v, installed: !!v.installed, active: !!v.installed && !!v.active, installing: false, progress: 0 }));
                }
            },
        }
    )
);
