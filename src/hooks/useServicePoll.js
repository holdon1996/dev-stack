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
        const runPoll = async () => {
            if (document.visibilityState !== 'visible') {
                timerRef.current = setTimeout(runPoll, 5000);
                return;
            }

            await checkServices();

            // Read services AFTER the check to determine next interval
            const services = useStore.getState().services;
            const isTransitioning = services.some(s =>
                s.status === 'starting' || s.status === 'stopping'
            );
            const nextInterval = isTransitioning ? 2000 : 10000;
            timerRef.current = setTimeout(runPoll, nextInterval);
        };

        // Initial delay before first poll to let the app render first
        timerRef.current = setTimeout(runPoll, 1000);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                // Clear any existing timer and do an immediate check
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(runPoll, 500);
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [checkServices]); // NO `services` here — that causes infinite loop!
}
