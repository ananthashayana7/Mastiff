/**
 * Template API Routes
 * 
 * POST /api/templates - Create template
 * GET /api/templates - List templates
 * GET /api/templates/[id] - Get template
 * PUT /api/templates/[id] - Update template
 * DELETE /api/templates/[id] - Delete template
 * POST /api/templates/[id]/execute - Execute template
 * POST /api/templates/[id]/favorite - Toggle favorite
 * GET /api/templates/[id]/history - Get execution history
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { TemplateService } from '@/src/services/templateService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Template creation schema
 */
const createTemplateSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    category: z.string().optional(),
    inputs: z.array(z.object({
        name: z.string(),
        type: z.enum(['string', 'number', 'date', 'select', 'multiselect']),
        required: z.boolean(),
        description: z.string().optional(),
        options: z.any().optional(),
        default: z.any().optional(),
    })).optional(),
    steps: z.array(z.object({
        id: z.string(),
        type: z.enum(['query', 'notebook', 'transformation', 'visualization']),
        connectorId: z.string().optional(),
        code: z.string().optional(),
        query: z.string().optional(),
        description: z.string().optional(),
        inputs: z.record(z.any()).optional(),
        outputs: z.array(z.string()).optional(),
    })),
    outputs: z.array(z.string()).optional(),
    tags: z.string().optional(),
    isPublic: z.boolean().optional(),
});

/**
 * GET /api/templates - List templates
 */
export async function GET(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:list', clientId, 200, 3600);

        // Check for specific template ID in query
        const templateId = request.nextUrl.searchParams.get('id');
        const category = request.nextUrl.searchParams.get('category');
        const isPublic = request.nextUrl.searchParams.get('public');
        
        // For category/public listing, allow anonymous access
        if (category || isPublic === 'true') {
            const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20'), 100);
            const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

            const templateList = await TemplateService.listTemplates({
                category: category || undefined,
                isPublic: isPublic === 'true' ? true : undefined,
                limit,
                offset,
            });

            return NextResponse.json({
                success: true,
                templates: templateList,
                limit,
                offset,
            });
        }

        // For personal templates, require auth
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

        const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

        const templateList = await TemplateService.listTemplates({
            userId: session.userId,
            limit,
            offset,
        });

        return NextResponse.json({
            success: true,
            templates: templateList,
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('Error listing templates:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list templates' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/templates - Create template
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:create', clientId, 50, 3600);

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
        const validated = validateInput(createTemplateSchema, body);

        // Create template
        const templateId = await TemplateService.createTemplate(session.userId, {
            ...validated,
            userId: session.userId,
            inputs: validated.inputs || [],
            steps: validated.steps,
        });

        return NextResponse.json({
            success: true,
            templateId,
            message: 'Template created',
        });
    } catch (error: any) {
        console.error('Error creating template:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create template' },
            { status: 500 }
        );
    }
}
