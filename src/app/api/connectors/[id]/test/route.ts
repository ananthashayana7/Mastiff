/**
 * Connector Testing & Data Source API Routes
 * 
 * POST /api/connectors/[id]/test - Test connection
 * GET /api/connectors/[id]/sources - List data sources
 * POST /api/connectors/[id]/query - Execute query
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
 * Query schema
 */
const querySchema = z.object({
    query: z.string().min(1),
});

/**
 * POST /api/connectors/[id]/test - Test connector connection
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const pathname = request.nextUrl.pathname;
    const isTestRoute = pathname.includes('/test');
    const isQueryRoute = pathname.includes('/query');

    try {
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

        // Rate limit
        const clientId = request.ip || 'unknown';
        if (isTestRoute) {
            await rateLimiter.checkLimit('connector:test', clientId, 50, 3600);
        } else if (isQueryRoute) {
            await rateLimiter.checkLimit('connector:query', clientId, 100, 3600);
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

        // Test connection
        if (isTestRoute) {
            try {
                // Decrypt credentials
                const decryptedCreds = await encryptionService.decrypt(
                    connector.credentials as string
                );
                const credentials = JSON.parse(decryptedCreds);

                // Create connector instance
                const connectorInstance = await createConnector({
                    type: connector.type,
                    credentials,
                });

                // Try to connect
                await connectorInstance.connect();

                // Update last tested time
                await db.update(connectors)
                    .set({ lastTestedAt: new Date() })
                    .where(eq(connectors.id, params.id));

                // Disconnect
                await connectorInstance.disconnect();

                return NextResponse.json({
                    success: true,
                    message: 'Connection test successful',
                    status: 'connected',
                });
            } catch (error: any) {
                console.error('Connection test failed:', error);
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

        // Execute query
        if (isQueryRoute) {
            try {
                const body = await request.json();
                const { query: queryString } = validateInput(querySchema, body);

                // Decrypt credentials
                const decryptedCreds = await encryptionService.decrypt(
                    connector.credentials as string
                );
                const credentials = JSON.parse(decryptedCreds);

                // Create connector instance
                const connectorInstance = await createConnector({
                    type: connector.type,
                    credentials,
                });

                // Connect and execute
                await connectorInstance.connect();
                const result = await connectorInstance.executeQuery(queryString);

                // Update last used time
                await db.update(connectors)
                    .set({ lastUsedAt: new Date() })
                    .where(eq(connectors.id, params.id));

                // Disconnect
                await connectorInstance.disconnect();

                return NextResponse.json({
                    success: true,
                    result,
                });
            } catch (error: any) {
                console.error('Query execution failed:', error);
                return NextResponse.json(
                    {
                        success: false,
                        message: 'Query execution failed',
                        error: error.message,
                    },
                    { status: 400 }
                );
            }
        }

        return NextResponse.json(
            { error: 'Invalid endpoint' },
            { status: 400 }
        );
    } catch (error: any) {
        console.error('Error:', error);
        return NextResponse.json(
            { error: error.message || 'Request failed' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/connectors/[id]/sources - List available data sources
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('connector:sources', clientId, 200, 3600);

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

        try {
            // Decrypt credentials
            const decryptedCreds = await encryptionService.decrypt(
                connector.credentials as string
            );
            const credentials = JSON.parse(decryptedCreds);

            // Create connector instance
            const connectorInstance = await createConnector({
                type: connector.type,
                credentials,
            });

            // Connect and list sources
            await connectorInstance.connect();
            const sources = await connectorInstance.listSources();

            // Disconnect
            await connectorInstance.disconnect();

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
    } catch (error: any) {
        console.error('Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to list sources' },
            { status: 500 }
        );
    }
}
