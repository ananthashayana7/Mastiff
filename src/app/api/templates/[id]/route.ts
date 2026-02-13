/**
 * Template Detail Routes
 * 
 * GET /api/templates/[id] - Get template
 * PUT /api/templates/[id] - Update template
 * DELETE /api/templates/[id] - Delete template
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { TemplateService } from '@/src/services/templateService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Update template schema
 */
const updateTemplateSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    inputs: z.any().optional(),
    steps: z.array(z.any()).optional(),
    outputs: z.array(z.string()).optional(),
    tags: z.string().optional(),
    isPublic: z.boolean().optional(),
});

/**
 * GET /api/templates/[id] - Get template
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:get', clientId, 300, 3600);

        const template = await TemplateService.getTemplate(params.id);

        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        // Check access: public or owner
        const sessionToken = request.cookies.get('session')?.value;
        if (!template.isPublic && sessionToken) {
            const session = await sessionManager.getSession(sessionToken);
            if (!session || session.userId !== template.userId) {
                return NextResponse.json(
                    { error: 'Forbidden' },
                    { status: 403 }
                );
            }
        } else if (!template.isPublic && !sessionToken) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        return NextResponse.json({
            success: true,
            template,
        });
    } catch (error: any) {
        console.error('Error getting template:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get template' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/templates/[id] - Update template
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:update', clientId, 100, 3600);

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

        // Get template to verify ownership
        const template = await TemplateService.getTemplate(params.id);
        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        if (template.userId !== session.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Parse and validate body
        const body = await request.json();
        const validated = validateInput(updateTemplateSchema, body);

        // Update template
        await TemplateService.updateTemplate(params.id, session.userId, validated);

        return NextResponse.json({
            success: true,
            message: 'Template updated',
        });
    } catch (error: any) {
        console.error('Error updating template:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update template' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/templates/[id] - Delete template
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit (most restrictive for delete)
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:delete', clientId, 50, 3600);

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

        // Get template to verify ownership
        const template = await TemplateService.getTemplate(params.id);
        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        if (template.userId !== session.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Delete template
        await TemplateService.deleteTemplate(params.id, session.userId);

        return NextResponse.json({
            success: true,
            message: 'Template deleted',
        });
    } catch (error: any) {
        console.error('Error deleting template:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete template' },
            { status: 500 }
        );
    }
}
