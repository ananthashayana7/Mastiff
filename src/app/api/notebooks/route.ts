/**
 * Notebook API Routes
 * 
 * POST /api/notebooks - Create notebook
 * GET /api/notebooks - List notebooks  
 * GET /api/notebooks/[id] - Get notebook
 * PUT /api/notebooks/[id] - Update notebook
 * DELETE /api/notebooks/[id] - Delete notebook
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { NotebookService } from '@/src/services/notebookService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Notebook creation schema
 */
const createNotebookSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().optional(),
    cells: z.array(z.object({
        cellType: z.enum(['code', 'markdown']),
        cellIndex: z.number(),
        source: z.string(),
    })).optional(),
    tags: z.string().optional(),
    isPublic: z.boolean().optional(),
});

/**
 * POST /api/notebooks - Create a new notebook
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('notebook:create', clientId, 100, 3600); // 100 per hour

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
        const validated = validateInput(createNotebookSchema, body);

        // Create notebook
        const notebookId = await NotebookService.createNotebook(
            session.userId,
            session.id,
            {
                ...validated,
                cells: validated.cells || [],
            }
        );

        return NextResponse.json({
            success: true,
            notebookId,
        });
    } catch (error: any) {
        console.error('Error creating notebook:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create notebook' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/notebooks - List notebooks for current user
 */
export async function GET(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('notebook:list', clientId, 200, 3600); // 200 per hour

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

        // Get pagination params
        const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

        // List notebooks
        const notebooks = await NotebookService.listNotebooks(session.userId, limit, offset);

        return NextResponse.json({
            success: true,
            notebooks,
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('Error listing notebooks:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list notebooks' },
            { status: 500 }
        );
    }
}
