import ScheduledReportService from '@/src/services/scheduledReportService';
import { TemplateService } from '@/src/services/templateService';

let initialized = false;

function isDatabaseConnectionError(error: any): boolean {
    const msg = String(error?.message || error?.code || error || '').toLowerCase();
    return (
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        msg.includes('etimedout') ||
        msg.includes('connection') ||
        msg.includes('cannot read properties of undefined') ||
        error?.code === 'ECONNREFUSED'
    );
}

export function startServerInit() {
    if (initialized) return;
    initialized = true;

    (async () => {
        try {
            console.log('[serverInit] Starting background initialization');

            // Initialize scheduled reports
            try {
                await ScheduledReportService.initializeScheduledReports();
                console.log('[serverInit] Scheduled reports initialized');
            } catch (e: any) {
                if (isDatabaseConnectionError(e)) {
                    console.warn('[serverInit] Database not available — skipping scheduled report initialization. Reports will initialize when the database becomes available.');
                } else {
                    console.error('[serverInit] Failed to initialize scheduled reports', e);
                }
            }

            // Seed system templates if SYSTEM_USER_ID is provided
            const systemUserId = process.env.SYSTEM_USER_ID;
            if (systemUserId) {
                try {
                    await TemplateService.seedSystemTemplates(systemUserId);
                    console.log('[serverInit] System templates seeded');
                } catch (e: any) {
                    if (isDatabaseConnectionError(e)) {
                        console.warn('[serverInit] Database not available — skipping template seeding.');
                    } else {
                        console.error('[serverInit] Failed to seed system templates', e);
                    }
                }
            } else {
                console.warn('[serverInit] SYSTEM_USER_ID not set; skipping template seeding');
            }

            console.log('[serverInit] Initialization complete');
        } catch (err) {
            console.error('[serverInit] Unexpected initialization error', err);
        }
    })();
}

export default startServerInit;
