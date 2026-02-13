/**
 * Notebook Cell Execution API Routes
 * 
 * POST /api/notebooks/[id]/execute - Execute cell
 * GET /api/notebooks/[id]/history - Get execution history
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { NotebookService } from '@/src/services/notebookService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Cell execution schema
 */
const executeCellSchema = z.object({
    cellId: z.string(),
    code: z.string().min(1),
    variables: z.record(z.any()).optional(),
});

/**
 * POST /api/notebooks/[id]/execute - Execute cell
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit - stricter for execution
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('cell:execute', clientId, 50, 3600); // 50 per hour

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

        // Parse and validate body
        const body = await request.json();
        const validated = validateInput(executeCellSchema, body);

        // Get notebook to verify ownership
        await NotebookService.getNotebook(params.id, session.userId);

        // Execute cell
        const result = await NotebookService.executeCell(
            params.id,
            validated.cellId,
            session.userId,
            validated.code,
            validated.variables
        );

        return NextResponse.json({
            success: true,
            result,
        });
    } catch (error: any) {
        console.error('Error executing cell:', error);
        const status = error.code === 'NOT_FOUND' ? 404 : 
                      error.code === 'EXECUTION_ERROR' ? 400 : 500;
        return NextResponse.json(
            { error: error.message || 'Failed to execute cell' },
            { status }
        );
    }
}

/**
 * GET /api/notebooks/[id]/history - Get cell execution history
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('cell:history', clientId, 200, 3600); // 200 per hour

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

        // Get notebook to verify ownership
        await NotebookService.getNotebook(params.id, session.userId);

        // Get execution history
        const cellId = request.nextUrl.searchParams.get('cellId');
        const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20'), 100);

        if (!cellId) {
            return NextResponse.json(
                { error: 'Missing cellId parameter' },
                { status: 400 }
            );
        }

        const history = await NotebookService.getCellHistory(cellId, limit);

        return NextResponse.json({
            success: true,
            history,
            cellId,
            limit,
        });
    } catch (error: any) {
        console.error('Error fetching history:', error);
        const status = error.code === 'NOT_FOUND' ? 404 : 500;
        return NextResponse.json(
            { error: error.message || 'Failed to fetch history' },
            { status }
        );
    }
}
