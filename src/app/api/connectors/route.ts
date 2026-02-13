/**
 * Connector Management API Routes
 * 
 * POST /api/connectors - Create connector
 * GET /api/connectors - List connectors
 * GET /api/connectors/[id] - Get connector
 * PUT /api/connectors/[id] - Update connector
 * DELETE /api/connectors/[id] - Delete connector
 * POST /api/connectors/[id]/test - Test connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';
import { db } from '@/src/db';
import { connectors } from '@/src/db/connectorSchema';
import { encryptionService } from '@/src/services/encryptionService';
import { eq, and } from 'drizzle-orm';
import { createConnector } from '@/src/services/connectors/connectorConfig';

/**
 * Connector creation schema
 */
const createConnectorSchema = z.object({
    name: z.string().min(1).max(255),
    type: z.enum(['sheets', 'snowflake', 'bigquery', 'postgres', 'api']),
    description: z.string().optional(),
    credentials: z.record(z.any()),
    metadata: z.record(z.any()).optional(),
});

/**
 * POST /api/connectors - Create a new connector
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:create', clientId, 50, 3600); // 50 per hour

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
        const validated = validateInput(createConnectorSchema, body);

        // Encrypt credentials before storing
        const encryptedCredentials = await encryptionService.encrypt(
            JSON.stringify(validated.credentials)
        );

        // Insert connector
        const result = await db.insert(connectors).values({
            userId: session.userId,
            name: validated.name,
            type: validated.type,
            description: validated.description,
            credentials: encryptedCredentials,
            metadata: JSON.stringify(validated.metadata || {}),
            isActive: true,
        }).returning({ id: connectors.id });

        const connectorId = result[0]?.id;
        if (!connectorId) {
            return NextResponse.json(
                { error: 'Failed to create connector' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            connectorId,
            message: 'Connector created successfully',
        });
    } catch (error: any) {
        console.error('Error creating connector:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create connector' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/connectors - List connectors for current user
 */
export async function GET(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:list', clientId, 200, 3600); // 200 per hour

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

        // List connectors (don't include encrypted credentials in list)
        const connectorList = await db.query.connectors.findMany({
            where: eq(connectors.userId, session.userId),
            limit,
            offset,
        });

        return NextResponse.json({
            success: true,
            connectors: connectorList.map(c => ({
                id: c.id,
                name: c.name,
                type: c.type,
                description: c.description,
                isActive: c.isActive,
                lastTestedAt: c.lastTestedAt,
                lastUsedAt: c.lastUsedAt,
                createdAt: c.createdAt,
            })),
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('Error listing connectors:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list connectors' },
            { status: 500 }
        );
    }
}
