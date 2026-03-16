/**
 * Connector Testing & Data Source API Routes
 *
 * POST /api/connectors/[id]/test - Test connection
 * GET /api/connectors/[id]/sources - List data sources
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '@/lib/rateLimiting';
import { getUserIdFromRequest } from '@/lib/requestAuth';
import { db } from '@/db';
import { connectors } from '@/db/connectorSchema';
import { encryptionService } from '@/services/encryptionService';
import { createConnector } from '@/services/connectors/connectorConfig';
import { eq, and } from 'drizzle-orm';

async function getOwnedConnector(request: NextRequest, connectorId: string) {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    const found = await db
        .select()
        .from(connectors)
        .where(and(eq(connectors.id, connectorId), eq(connectors.userId, userId)))
        .limit(1);

    if (!found[0]) {
        return { error: NextResponse.json({ error: 'Connector not found' }, { status: 404 }) };
    }

    return { connector: found[0], userId };
}

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:test', clientId, 50, 3600);

        const owned = await getOwnedConnector(request, params.id);
        if (owned.error) return owned.error;

        const connectorRow = owned.connector!;

        const decryptedCreds = encryptionService.decryptFromString(
            connectorRow.encryptedCredentials as string
        );
        const credentials = JSON.parse(decryptedCreds);

        const connectorInstance = await createConnector({
            id: connectorRow.id,
            name: connectorRow.name,
            type: connectorRow.type,
            credentials,
            metadata: (connectorRow.metadata as Record<string, any>) || {},
        });

        const success = await connectorInstance.testConnection();
        await connectorInstance.disconnect().catch(() => undefined);

        await db
            .update(connectors)
            .set({
                lastTestedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(connectors.id, params.id));

        if (!success) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'Connection test failed',
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Connection test successful',
            status: 'connected',
        });
    } catch (error: any) {
        console.error('Connector test failed:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Connection test failed',
                error: error.message,
            },
            { status: 400 }
        );
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:sources', clientId, 200, 3600);

        const owned = await getOwnedConnector(request, params.id);
        if (owned.error) return owned.error;

        const connectorRow = owned.connector!;

        const decryptedCreds = encryptionService.decryptFromString(
            connectorRow.encryptedCredentials as string
        );
        const credentials = JSON.parse(decryptedCreds);

        const connectorInstance = await createConnector({
            id: connectorRow.id,
            name: connectorRow.name,
            type: connectorRow.type,
            credentials,
            metadata: (connectorRow.metadata as Record<string, any>) || {},
        });

        await connectorInstance.connect();
        const sources = await connectorInstance.listSources();
        await connectorInstance.disconnect().catch(() => undefined);

        await db
            .update(connectors)
            .set({
                lastUsedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(connectors.id, params.id));

        return NextResponse.json({
            success: true,
            sources,
        });
    } catch (error: any) {
        console.error('Failed to list sources:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Failed to list data sources',
                error: error.message,
            },
            { status: 400 }
        );
    }
}
