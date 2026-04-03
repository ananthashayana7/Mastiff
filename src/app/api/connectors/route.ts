/**
 * Connector Management API Routes
 *
 * POST /api/connectors - Create connector
 * GET /api/connectors - List connectors
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/rateLimiting';
import { validateInput } from '@/lib/validation';
import { authenticateRequest } from '@/lib/auth';
import { z } from 'zod';
import { db } from '@/db';
import { connectors } from '@/db/connectorSchema';
import { encryptionService } from '@/services/encryptionService';
import { eq, desc } from 'drizzle-orm';

/**
 * Connector creation schema
 */
const createConnectorSchema = z.object({
    name: z.string().min(1).max(255),
    type: z.enum(['sheets', 'sharepoint', 'snowflake', 'bigquery', 'postgres', 'api']),
    description: z.string().optional(),
    credentials: z.record(z.any()),
    metadata: z.record(z.any()).optional(),
});

/**
 * POST /api/connectors - Create a new connector
 */
export async function POST(request: NextRequest) {
    try {
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:create', clientId, 50, 3600);

        const body = await request.json();
        const validated = validateInput(createConnectorSchema, body);

        const user = await authenticateRequest(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.id;

        const encryptedCredentials = encryptionService.encryptToString(
            JSON.stringify(validated.credentials)
        );

        const result = await db.insert(connectors).values({
            userId,
            name: validated.name,
            type: validated.type,
            description: validated.description,
            encryptedCredentials,
            metadata: validated.metadata || {},
            isActive: true,
        }).returning({ id: connectors.id });

        const connectorId = result[0]?.id;
        if (!connectorId) {
            return NextResponse.json({ error: 'Failed to create connector' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            connectorId,
            message: 'Connector created successfully',
        });
    } catch (error: any) {
        console.error('Error creating connector:', error);
        return NextResponse.json(
            { error: 'Failed to create connector' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/connectors - List connectors for current user
 */
export async function GET(request: NextRequest) {
    try {
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:list', clientId, 200, 3600);

        const user = await authenticateRequest(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.id;

        const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10), 100);
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

        const connectorList = await db
            .select({
                id: connectors.id,
                name: connectors.name,
                type: connectors.type,
                description: connectors.description,
                isActive: connectors.isActive,
                lastTestedAt: connectors.lastTestedAt,
                lastUsedAt: connectors.lastUsedAt,
                createdAt: connectors.createdAt,
            })
            .from(connectors)
            .where(eq(connectors.userId, userId))
            .orderBy(desc(connectors.createdAt))
            .limit(limit)
            .offset(offset);

        return NextResponse.json({
            success: true,
            connectors: connectorList,
            supportedTypes: ['sheets', 'sharepoint', 'snowflake', 'bigquery', 'postgres', 'api'],
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('Error listing connectors:', error);
        return NextResponse.json(
            { error: 'Failed to list connectors' },
            { status: 500 }
        );
    }
}
