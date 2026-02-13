/**
 * Scheduled Reports API Routes
 * 
 * POST /api/reports - Create scheduled report
 * GET /api/reports - List scheduled reports
 * GET /api/reports/[id] - Get specific report
 * PUT /api/reports/[id] - Update report
 * DELETE /api/reports/[id] - Delete report
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import ScheduledReportService from '@/src/services/scheduledReportService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Create report schema
 */
const createReportSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    templateId: z.string().uuid().optional(),
    type: z.enum(['template', 'query', 'notebook']),
    format: z.enum(['pdf', 'csv', 'html', 'email']).optional(),
    schedule: z.string().min(1), // Cron expression
    timezone: z.string().optional(),
    title: z.string().min(1).max(255),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    recipients: z.array(z.object({
        email: z.string().email(),
        name: z.string().optional(),
    })).optional(),
    parameters: z.record(z.any()).optional(),
    filters: z.record(z.any()).optional(),
});

/**
 * GET /api/reports - List scheduled reports
 */
export async function GET(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('reports:list', clientId, 200, 3600);

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

        // Get query parameters
        const type = request.nextUrl.searchParams.get('type');
        const isActive = request.nextUrl.searchParams.get('active');

        const reports = await ScheduledReportService.listScheduledReports(session.userId, {
            type: (type as any) || undefined,
            isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        });

        return NextResponse.json({
            success: true,
            reports,
        });
    } catch (error: any) {
        console.error('Error listing reports:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list reports' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/reports - Create scheduled report
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('reports:create', clientId, 50, 3600);

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

        // Parse and validate
        const body = await request.json();
        const reportConfig = validateInput(createReportSchema, body);

        // Create report
        const reportId = await ScheduledReportService.createScheduledReport(
            session.userId,
            reportConfig
        );

        return NextResponse.json({
            success: true,
            reportId,
            message: 'Report created',
        });
    } catch (error: any) {
        console.error('Error creating report:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create report' },
            { status: 500 }
        );
    }
}
