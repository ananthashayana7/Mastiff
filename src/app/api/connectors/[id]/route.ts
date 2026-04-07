/**
 * Connector Detail API Routes
 *
 * GET /api/connectors/[id] - Get connector
 * PUT /api/connectors/[id] - Update connector
 * DELETE /api/connectors/[id] - Delete connector
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/rateLimiting';
import { validateInput } from '@/lib/validation';
import { authenticateRequest } from '@/lib/auth';
import { validateCSRFRequest } from '../../csrf-token/route';
import { z } from 'zod';
import { db } from '@/db';
import { connectors } from '@/db/connectorSchema';
import { encryptionService } from '@/services/encryptionService';
import { eq, and } from 'drizzle-orm';

const updateConnectorSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    credentials: z.record(z.any()).optional(),
    isActive: z.boolean().optional(),
});

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:get', clientId, 300, 3600);

        const user = await authenticateRequest(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.id;

        const connector = await db
            .select({
                id: connectors.id,
                name: connectors.name,
                type: connectors.type,
                description: connectors.description,
                isActive: connectors.isActive,
                lastTestedAt: connectors.lastTestedAt,
                lastUsedAt: connectors.lastUsedAt,
                createdAt: connectors.createdAt,
                updatedAt: connectors.updatedAt,
                metadata: connectors.metadata,
            })
            .from(connectors)
            .where(and(eq(connectors.id, params.id), eq(connectors.userId, userId)))
            .limit(1);

        if (!connector[0]) {
            return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, connector: connector[0] });
    } catch (error: any) {
        console.error('Error fetching connector:', error);
        return NextResponse.json(
            { error: 'Failed to fetch connector' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const csrfValidation = await validateCSRFRequest(request);
        if (!csrfValidation.valid) {
            return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
        }

        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:update', clientId, 100, 3600);

        const user = await authenticateRequest(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.id;

        const body = await request.json();
        const validated = validateInput(updateConnectorSchema, body);

        const existing = await db
            .select({ id: connectors.id })
            .from(connectors)
            .where(and(eq(connectors.id, params.id), eq(connectors.userId, userId)))
            .limit(1);

        if (!existing[0]) {
            return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
        }

        const updateData: Record<string, any> = {
            updatedAt: new Date(),
        };

        if (validated.name !== undefined) updateData.name = validated.name;
        if (validated.description !== undefined) updateData.description = validated.description;
        if (validated.isActive !== undefined) updateData.isActive = validated.isActive;
        if (validated.credentials) {
            updateData.encryptedCredentials = encryptionService.encryptToString(
                JSON.stringify(validated.credentials)
            );
        }

        await db.update(connectors).set(updateData).where(eq(connectors.id, params.id));

        return NextResponse.json({ success: true, message: 'Connector updated' });
    } catch (error: any) {
        console.error('Error updating connector:', error);
        return NextResponse.json(
            { error: 'Failed to update connector' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const csrfValidation = await validateCSRFRequest(request);
        if (!csrfValidation.valid) {
            return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
        }

        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:delete', clientId, 50, 3600);

        const user = await authenticateRequest(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.id;

        const existing = await db
            .select({ id: connectors.id })
            .from(connectors)
            .where(and(eq(connectors.id, params.id), eq(connectors.userId, userId)))
            .limit(1);

        if (!existing[0]) {
            return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
        }

        await db.delete(connectors).where(eq(connectors.id, params.id));

        return NextResponse.json({ success: true, message: 'Connector deleted' });
    } catch (error: any) {
        console.error('Error deleting connector:', error);
        return NextResponse.json(
            { error: 'Failed to delete connector' },
            { status: 500 }
        );
    }
}
