/**
 * Report Execution Routes
 * 
 * POST /api/reports/[id]/execute - Execute report
 * GET /api/reports/[id]/executions - Get execution history
 * GET /api/reports/[id]/stats - Get statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import ScheduledReportService from '@/src/services/scheduledReportService';
import { rateLimiter } from '@/src/lib/rateLimiting';

/**
 * POST /api/reports/[id]/execute - Manually execute a report
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('reports:execute', clientId, 100, 3600);

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

        // Execute report
        const executionId = await ScheduledReportService.executeReport(
            params.id,
            'manual',
            session.userId
        );

        return NextResponse.json({
            success: true,
            executionId,
            message: 'Report started',
        });
    } catch (error: any) {
        console.error('Error executing report:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to execute report' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/reports/[id]/executions - Get execution history
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('reports:history', clientId, 200, 3600);

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

        // Get execution history
        const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

        const executions = await ScheduledReportService.getExecutionHistory(
            params.id,
            limit,
            offset
        );

        return NextResponse.json({
            success: true,
            executions,
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('Error getting execution history:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get execution history' },
            { status: 500 }
        );
    }
}
