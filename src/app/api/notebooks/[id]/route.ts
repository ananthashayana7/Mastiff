/**
 * Notebook Detail API Routes
 * 
 * GET /api/notebooks/[id] - Get notebook
 * PUT /api/notebooks/[id] - Update notebook
 * DELETE /api/notebooks/[id] - Delete notebook
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { NotebookService, NotebookCell } from '@/src/services/notebookService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Update notebook schema
 */
const updateNotebookSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    cells: z.array(z.object({
        id: z.string().optional(),
        cellType: z.enum(['code', 'markdown']),
        cellIndex: z.number(),
        source: z.string(),
        executionCount: z.number().optional(),
        outputs: z.any().optional(),
        status: z.string().optional(),
    })).optional(),
    tags: z.string().optional(),
    isPublic: z.boolean().optional(),
});

/**
 * GET /api/notebooks/[id] - Get notebook
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('notebook:get', clientId, 300, 3600); // 300 per hour

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

        // Get notebook
        const notebook = await NotebookService.getNotebook(params.id, session.userId);

        return NextResponse.json({
            success: true,
            notebook,
        });
    } catch (error: any) {
        console.error('Error fetching notebook:', error);
        const status = error.code === 'NOT_FOUND' ? 404 : 500;
        return NextResponse.json(
            { error: error.message || 'Failed to fetch notebook' },
            { status }
        );
    }
}

/**
 * PUT /api/notebooks/[id] - Update notebook
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('notebook:update', clientId, 100, 3600); // 100 per hour

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
        const validated = validateInput(updateNotebookSchema, body);

        // Update notebook
        await NotebookService.updateNotebook(params.id, session.userId, validated);

        return NextResponse.json({
            success: true,
            message: 'Notebook updated',
        });
    } catch (error: any) {
        console.error('Error updating notebook:', error);
        const status = error.code === 'NOT_FOUND' ? 404 : 500;
        return NextResponse.json(
            { error: error.message || 'Failed to update notebook' },
            { status }
        );
    }
}

/**
 * DELETE /api/notebooks/[id] - Delete notebook
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('notebook:delete', clientId, 50, 3600); // 50 per hour

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

        // Delete notebook
        await NotebookService.deleteNotebook(params.id, session.userId);

        return NextResponse.json({
            success: true,
            message: 'Notebook deleted',
        });
    } catch (error: any) {
        console.error('Error deleting notebook:', error);
        const status = error.code === 'NOT_FOUND' ? 404 : 500;
        return NextResponse.json(
            { error: error.message || 'Failed to delete notebook' },
            { status }
        );
    }
}
