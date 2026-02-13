/**
 * Login History API
 * 
 * Endpoints for accessing user login history
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

/**
 * GET /api/login-history
 * Get login history for current user
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

        // Get user's login history
        const history = await auditLog.getUserLoginHistory(user.id, 50);

        return NextResponse.json({
            history: history.map((entry) => ({
                id: entry.id,
                success: entry.success,
                email: entry.email,
                ipAddress: entry.ipAddress,
                userAgent: entry.userAgent,
                failureReason: entry.failureReason,
                twoFactorUsed: entry.twoFactorUsed,
                createdAt: entry.createdAt,
            })),
            total: history.length,
        });
    } catch (err) {
        console.error('Error fetching login history:', err);
        return NextResponse.json(
            { error: 'Failed to fetch login history' },
            { status: 500 }
        );
    }
}
