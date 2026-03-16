import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { auditLog } from '@/db/auditSchema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit
 * Query params:
 * - view=logs|stats (default: logs)
 * - limit, offset, resourceType, resourceId
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view') || 'logs';

    if (view === 'stats') {
      const logs = await auditLog.getUserLogs(user.id, 500);
      const errors = logs.filter((log: any) => log.status === 'error' || log.status === 'failure').length;

      const counts = new Map<string, number>();
      logs.forEach((log: any) => {
        const key = log.action || 'unknown';
        counts.set(key, (counts.get(key) || 0) + 1);
      });

      const actionBreakdown = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count }));

      const recentActivity = logs
        .slice(0, 24)
        .map((log: any) => ({ action: log.action, createdAt: log.createdAt }));

      return NextResponse.json({
        errorRate: {
          errors,
          percentage: logs.length ? Math.round((errors / logs.length) * 10000) / 100 : 0,
        },
        actionBreakdown,
        recentActivity,
      });
    }

    const resourceType = searchParams.get('resourceType') || 'all';
    const resourceId = searchParams.get('resourceId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    let logs = await auditLog.getUserLogs(user.id, Math.min(limit + offset, 500));
    if (resourceType !== 'all' && resourceId) {
      logs = logs.filter((log: any) => log.resourceType === resourceType && log.resourceId === resourceId);
    }

    const paged = logs.slice(offset, offset + limit);

    return NextResponse.json({
      logs: paged,
      pagination: {
        limit,
        offset,
        total: logs.length,
      },
    });
  } catch (error: any) {
    console.error('Audit fetch error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch audit data' },
      { status: 500 }
    );
  }
}
