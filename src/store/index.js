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
import { createNodeSlice } from './nodeSlice';

const mergePersistedVersions = (defaults, savedVersions = []) => {
    const merged = defaults.map(v => {
        const saved = savedVersions.find(s => s.version === v.version);
        return saved
            ? { ...v, installed: !!saved.installed, active: !!saved.installed && !!saved.active }
            : { ...v, installed: false, active: false };
    });

    const localOnly = savedVersions
        .filter(saved => !merged.some(v => v.version === saved.version))
        .map(saved => ({
            version: saved.version,
            installed: !!saved.installed,
            active: !!saved.installed && !!saved.active,
            installing: false,
        }));

    return [...merged, ...localOnly].sort((a, b) =>
        b.version.localeCompare(a.version, undefined, { numeric: true })
    );
};

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
            ...createNodeSlice(...a),
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
                apacheInstalledVersions: state.apacheVersions
                    .filter(v => v.installed || v.active)
                    .map(v => ({ version: v.version, installed: v.installed, active: v.active })),
                mysqlInstalledVersions: state.mysqlVersions
                    .filter(v => v.installed || v.active)
                    .map(v => ({ version: v.version, installed: v.installed, active: v.active })),
                locale: state.locale,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // Restore installed/active status back onto the fresh default list
                    if (state.phpInstalledVersions?.length) {
                        state.phpVersions = mergePersistedVersions(state.phpVersions, state.phpInstalledVersions);
                    }
                    if (state.apacheInstalledVersions?.length) {
                        state.apacheVersions = mergePersistedVersions(state.apacheVersions, state.apacheInstalledVersions);
                    }
                    if (state.mysqlInstalledVersions?.length) {
                        state.mysqlVersions = mergePersistedVersions(state.mysqlVersions, state.mysqlInstalledVersions);
                    }
                }
            },
        }
    )
);
