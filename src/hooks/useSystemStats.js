import { useEffect, useRef } from 'react';
import { useStore } from '../store';

/**
 * System stats monitoring hook (CPU/RAM).
 * Runs at a fixed 5s interval when the app is visible.
 * Increased from 2s to 5s to reduce sysinfo overhead.
 */
export function useSystemStats() {
    const updateStats = useStore(s => s.updateSystemStats);
    const timerRef = useRef(null);

    useEffect(() => {
        const runUpdate = async () => {
            if (document.visibilityState === 'visible' && updateStats) {
                await updateStats();
            }
            timerRef.current = setTimeout(runUpdate, 5000);
        };

        // Delay first run to not compete with initial app load
        timerRef.current = setTimeout(runUpdate, 2000);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [updateStats]);
}
