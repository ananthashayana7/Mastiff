/**
 * Connector Detail API Routes
 * 
 * GET /api/connectors/[id] - Get connector
 * PUT /api/connectors/[id] - Update connector
 * DELETE /api/connectors/[id] - Delete connector
 * POST /api/connectors/[id]/test - Test connection
 * GET /api/connectors/[id]/sources - List data sources
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';
import { db } from '@/src/db';
import { connectors } from '@/src/db/connectorSchema';
import { encryptionService } from '@/src/services/encryptionService';
import { createConnector } from '@/src/services/connectors/connectorConfig';
import { eq, and } from 'drizzle-orm';

/**
 * Update connector schema
 */
const updateConnectorSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
    credentials: z.record(z.any()).optional(),
    isActive: z.boolean().optional(),
});

/**
 * GET /api/connectors/[id] - Get connector
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:get', clientId, 300, 3600);

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

        // Get connector
        const connector = await db.query.connectors.findFirst({
            where: and(
                eq(connectors.id, params.id),
                eq(connectors.userId, session.userId)
            ),
        });

        if (!connector) {
            return NextResponse.json(
                { error: 'Connector not found' },
                { status: 404 }
            );
        }

        // Decrypt credentials (don't send to frontend in full)
        return NextResponse.json({
            success: true,
            connector: {
                id: connector.id,
                name: connector.name,
                type: connector.type,
                description: connector.description,
                isActive: connector.isActive,
                lastTestedAt: connector.lastTestedAt,
                lastUsedAt: connector.lastUsedAt,
                createdAt: connector.createdAt,
            },
        });
    } catch (error: any) {
        console.error('Error fetching connector:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch connector' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/connectors/[id] - Update connector
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:update', clientId, 100, 3600);

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
        const validated = validateInput(updateConnectorSchema, body);

        // Check ownership
        const existing = await db.query.connectors.findFirst({
            where: and(
                eq(connectors.id, params.id),
                eq(connectors.userId, session.userId)
            ),
        });

        if (!existing) {
            return NextResponse.json(
                { error: 'Connector not found' },
                { status: 404 }
            );
        }

        // Build update data
        const updateData: any = {
            updatedAt: new Date(),
        };

        if (validated.name) updateData.name = validated.name;
        if (validated.description !== undefined) updateData.description = validated.description;
        if (validated.isActive !== undefined) updateData.isActive = validated.isActive;

        if (validated.credentials) {
            const encryptedCredentials = await encryptionService.encrypt(
                JSON.stringify(validated.credentials)
            );
            updateData.credentials = encryptedCredentials;
        }

        // Update connector
        await db.update(connectors)
            .set(updateData)
            .where(eq(connectors.id, params.id));

        return NextResponse.json({
            success: true,
            message: 'Connector updated',
        });
    } catch (error: any) {
        console.error('Error updating connector:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update connector' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/connectors/[id] - Delete connector
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:delete', clientId, 50, 3600);

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

        // Check ownership before delete
        const existing = await db.query.connectors.findFirst({
            where: and(
                eq(connectors.id, params.id),
                eq(connectors.userId, session.userId)
            ),
        });

        if (!existing) {
            return NextResponse.json(
                { error: 'Connector not found' },
                { status: 404 }
            );
        }

        // Delete connector
        await db.delete(connectors).where(eq(connectors.id, params.id));

        return NextResponse.json({
            success: true,
            message: 'Connector deleted',
        });
    } catch (error: any) {
        console.error('Error deleting connector:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete connector' },
            { status: 500 }
        );
    }
}
