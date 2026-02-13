/**
 * Cache Management API Routes
 * 
 * GET /api/cache/stats - Get cache statistics
 * POST /api/cache/invalidate - Invalidate specific cache
 * DELETE /api/cache/clear - Clear all cache
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { cacheService } from '@/src/services/cacheService';
import { connectorQueryCache } from '@/src/services/connectorQueryCache';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';

/**
 * Invalidation schema
 */
const invalidationSchema = z.object({
    type: z.enum(['connector', 'query', 'tag']),
    target: z.string(),
});

/**
 * GET /api/cache/stats - Get cache statistics
 */
export async function GET(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('cache:stats', clientId, 100, 3600);

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

        // Get cache statistics
        const stats = await cacheService.getStats();

        return NextResponse.json({
            success: true,
            stats: {
                ...stats,
                redis: {
                    url: process.env.UPSTASH_REDIS_REST_URL ? 'configured' : 'not_configured',
                },
            },
        });
    } catch (error: any) {
        console.error('Error getting cache stats:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get cache stats' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/cache/invalidate - Invalidate specific cache
 */
export async function POST(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('cache:invalidate', clientId, 50, 3600);

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
        const { type, target } = validateInput(invalidationSchema, body);

        // Invalidate based on type
        switch (type) {
            case 'connector':
                await connectorQueryCache.invalidateConnector(target);
                break;

            case 'query':
                await connectorQueryCache.invalidateQueryPattern(target);
                break;

            case 'tag':
                await cacheService.invalidateTag(target);
                break;

            default:
                return NextResponse.json(
                    { error: 'Invalid invalidation type' },
                    { status: 400 }
                );
        }

        return NextResponse.json({
            success: true,
            message: `${type} cache invalidated: ${target}`,
        });
    } catch (error: any) {
        console.error('Error invalidating cache:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to invalidate cache' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/cache/clear - Clear all cache
 */
export async function DELETE(request: NextRequest) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('cache:clear', clientId, 10, 3600); // Very rate-limited

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

        // Clear all cache
        await connectorQueryCache.clearAll();

        return NextResponse.json({
            success: true,
            message: 'All cache cleared',
        });
    } catch (error: any) {
        console.error('Error clearing cache:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to clear cache' },
            { status: 500 }
        );
    }
}
