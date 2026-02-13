/**
 * Database Health Check API
 * 
 * Endpoints for monitoring database health and status
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { users, sessions, messages, files } from '@/db/schema';
import { getDatabaseStats } from '@/lib/dbSeed';

/**
 * GET /api/health/database
 * Check database connectivity and basic health
 */
export async function GET(request: NextRequest) {
    const checks = {
        connection: { status: 'pending' as const, latency: 0 },
        tables: { status: 'pending' as const, count: 0 },
        stats: { status: 'pending' as const, data: null as any },
    };

    try {
        // Test connection with timing
        const startTime = Date.now();
        const result = await db.select().from(users).limit(1);
        const latency = Date.now() - startTime;

        checks.connection = {
            status: 'ok',
            latency,
        };

        // Count records in main tables
        const [userCount, sessionCount, messageCount, fileCount] = await Promise.all([
            db.select().from(users).then((r) => r.length),
            db.select().from(sessions).then((r) => r.length),
            db.select().from(messages).then((r) => r.length),
            db.select().from(files).then((r) => r.length),
        ]);

        checks.tables = {
            status: 'ok',
            count: userCount + sessionCount + messageCount + fileCount,
        };

        // Get detailed stats
        const stats = await getDatabaseStats();
        checks.stats = {
            status: 'ok',
            data: stats,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        checks.connection.status = 'error';
        checks.tables.status = 'error';
        checks.stats.status = 'error';

        return NextResponse.json(
            {
                status: 'unhealthy',
                checks,
                error: message,
            },
            { status: 503 }
        );
    }

    const allHealthy = ['ok', 'ok', 'ok'].every((s, i) => {
        const checkArray = Object.values(checks);
        return checkArray[i]?.status === 'ok';
    });

    return NextResponse.json(
        {
            status: allHealthy ? 'healthy' : 'degraded',
            checks,
        },
        {
            status: allHealthy ? 200 : 503,
        }
    );
}
