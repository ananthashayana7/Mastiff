import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/services/cacheService';
import { DockerSandboxExecutor } from '@/services/dockerSandboxExecutor';
import { db } from '@/src/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint
 * GET /api/health
 */
export async function GET(req: NextRequest) {
  const health: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  // Check database
  try {
    await db.execute(sql`select 1`);
    health.services.database = { status: 'healthy' };
  } catch (error) {
    health.services.database = { status: 'unhealthy', error: String(error) };
    health.status = 'degraded';
  }

  // Check cache
  try {
    const cacheHealthy = await CacheService.healthCheck();
    health.services.cache = { status: cacheHealthy ? 'healthy' : 'unhealthy' };
  } catch (error) {
    health.services.cache = { status: 'unhealthy', error: String(error) };
    health.status = 'degraded';
  }

  // Check Docker
  try {
    const sandbox = new DockerSandboxExecutor();
    const dockerHealthy = await sandbox.healthCheck();
    health.services.docker = { status: dockerHealthy ? 'healthy' : 'unhealthy' };
  } catch (error) {
    health.services.docker = { status: 'unhealthy', error: String(error) };
  }

  // System info
  health.system = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV,
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}

/**
 * Readiness check
 * GET /api/health/ready
 */
export async function ready(req: NextRequest) {
  try {
    // Quick check if service is ready to accept requests
    await Promise.all([
      db.execute(sql`select 1`),
      CacheService.healthCheck(),
    ]);

    return NextResponse.json({ ready: true });
  } catch (error) {
    return NextResponse.json({ ready: false }, { status: 503 });
  }
}

/**
 * Liveness check
 * GET /api/health/live
 */
export async function live(req: NextRequest) {
  // Just verify the service is running
  return NextResponse.json({ alive: true });
}
