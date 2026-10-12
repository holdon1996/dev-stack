import { useEffect, useRef } from 'react';
import { useStore } from '../store';

/**
 * Adaptive polling hook for service status.
 * - 2s when any service is 'starting' or 'stopping'
 * - 10s when all services are stable (idle)
 * - Stops completely when the app is hidden
 * 
 * IMPORTANT: We deliberately do NOT include `services` in the dependency array.
 * Including it causes an infinite loop: poll → update services → re-run effect → poll...
 */
export function useServicePoll() {
    const checkServices = useStore(s => s.checkServicesRunning);
    const timerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        // A poll is in flight: the visibility handler must not start a second loop.
        let busy = false;
        const schedule = (ms) => {
            if (cancelled) return; // a newer effect owns timerRef now
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(runPoll, ms);
        };

        const runPoll = async () => {
            if (document.visibilityState !== 'visible') {
                schedule(5000);
                return;
            }

            busy = true;
            try {
                await checkServices();
                await useStore.getState().checkApacheConfigStale();
            } finally {
                busy = false;
            }

            // Read services AFTER the check to determine next interval
            const services = useStore.getState().services;
            const isTransitioning = services.some(s =>
                s.status === 'starting' || s.status === 'stopping'
            );
            schedule(isTransitioning ? 2000 : 10000);
        };

        // Initial delay before first poll to let the app render first
        schedule(1000);

        const handleVisibility = () => {
            // Check right away when the window comes back, unless a check is running.
            if (document.visibilityState === 'visible' && !busy) schedule(500);
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            cancelled = true;
            clearTimeout(timerRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [checkServices]); // NO `services` here — that causes infinite loop!
}
