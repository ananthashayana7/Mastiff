/**
 * Audit Logs API
 * 
 * Endpoints for accessing audit logs (admin and user-specific)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

/**
 * GET /api/audit-logs
 * Get audit logs for current user
 */
export async function GET(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { auditLog } = await import('@/db/auditSchema');

        // Get user's audit logs
        const logs = await auditLog.getUserLogs(user.id, 100);

        return NextResponse.json({
            logs: logs.map((log) => ({
                id: log.id,
                action: log.action,
                resourceType: log.resourceType,
                resourceId: log.resourceId,
                status: log.status,
                description: log.description,
                details: log.details,
                ipAddress: log.ipAddress,
                createdAt: log.createdAt,
            })),
            total: logs.length,
        });
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        return NextResponse.json(
            { error: 'Failed to fetch audit logs' },
            { status: 500 }
        );
    }
}
