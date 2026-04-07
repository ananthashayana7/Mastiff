/**
 * Scheduled Report Detail Routes
 * 
 * GET /api/reports/[id] - Get report
 * PUT /api/reports/[id] - Update report
 * DELETE /api/reports/[id] - Delete report
 * POST /api/reports/[id]/execute - Execute report
 * GET /api/reports/[id]/executions - Execution history
 * GET /api/reports/[id]/stats - Get stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import ScheduledReportService from '@/src/services/scheduledReportService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Update report schema
 */
const updateReportSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    schedule: z.string().min(1).optional(),
    timezone: z.string().optional(),
    title: z.string().min(1).max(255).optional(),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    isActive: z.boolean().optional(),
    recipients: z.any().optional(),
    parameters: z.any().optional(),
    filters: z.any().optional(),
});

/**
 * GET /api/reports/[id] - Get report
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('reports:get', clientId, 300, 3600);

        // Validate session
        const sessionToken = request.cookies.get('session')?.value;
        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const session = await sessionManager.getSession(sessionToken);
        if (!session || !session.userId) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            );
        }

        const report = await ScheduledReportService.getScheduledReport(params.id);
        if (!report) {
            return NextResponse.json(
                { error: 'Report not found' },
                { status: 404 }
            );
        }

        // Check access
        if (report.userId !== session.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            success: true,
            report,
        });
    } catch (error: any) {
        console.error('Error getting report:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get report' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/reports/[id] - Update report
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('reports:update', clientId, 100, 3600);

        // Validate session
        const sessionToken = request.cookies.get('session')?.value;
        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const session = await sessionManager.getSession(sessionToken);
        if (!session || !session.userId) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            );
        }

        // Verify ownership
        const report = await ScheduledReportService.getScheduledReport(params.id);
        if (!report) {
            return NextResponse.json(
                { error: 'Report not found' },
                { status: 404 }
            );
        }

        if (report.userId !== session.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Parse and validate
        const body = await request.json();
        const updates = validateInput(updateReportSchema, body);

        // Update report
        await ScheduledReportService.updateScheduledReport(
            params.id,
            session.userId,
            updates
        );

        return NextResponse.json({
            success: true,
            message: 'Report updated',
        });
    } catch (error: any) {
        console.error('Error updating report:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update report' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/reports/[id] - Delete report
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('reports:delete', clientId, 50, 3600);

        // Validate session
        const sessionToken = request.cookies.get('session')?.value;
        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const session = await sessionManager.getSession(sessionToken);
        if (!session || !session.userId) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            );
        }

        // Verify ownership
        const report = await ScheduledReportService.getScheduledReport(params.id);
        if (!report) {
            return NextResponse.json(
                { error: 'Report not found' },
                { status: 404 }
            );
        }

        if (report.userId !== session.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Delete report
        await ScheduledReportService.deleteScheduledReport(params.id, session.userId);

        return NextResponse.json({
            success: true,
            message: 'Report deleted',
        });
    } catch (error: any) {
        console.error('Error deleting report:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete report' },
            { status: 500 }
        );
    }
}
