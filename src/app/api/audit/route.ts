import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '@/services/auditService';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Get audit logs for resource
 * GET /api/audit?resourceType=notebook&resourceId=123&limit=50
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const resourceType = searchParams.get('resourceType') || 'all';
    const resourceId = searchParams.get('resourceId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get audit logs
    let query = db.selectFrom('audit_logs').selectAll().where('userId', '=', user.id);

    if (resourceType !== 'all' && resourceId) {
      query = query
        .where('resourceType', '=', resourceType)
        .where('resourceId', '=', resourceId);
    }

    const logs = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const total = await db
      .selectFrom('audit_logs')
      .select(db.raw('count(*) as count'))
      .where('userId', '=', user.id)
      .executeTakeFirst();

    return NextResponse.json({
      logs,
      pagination: {
        limit,
        offset,
        total: total?.count || 0,
      },
    });
  } catch (error: any) {
    console.error('Audit fetch error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}

/**
 * Get audit statistics
 * GET /api/audit/stats
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Error rate
    const errorLogs = await db
      .selectFrom('audit_logs')
      .select(db.raw('count(*) as count'))
      .where('userId', '=', user.id)
      .where('status', '=', 'error')
      .executeTakeFirst();

    // Action breakdown
    const actionBreakdown = await db
      .selectFrom('audit_logs')
      .select(['action', db.raw('count(*) as count')])
      .where('userId', '=', user.id)
      .groupBy('action')
      .orderBy(db.raw('count(*)'), 'desc')
      .limit(10)
      .execute();

    // Recent activity
    const recentActivity = await db
      .selectFrom('audit_logs')
      .select(['action', 'createdAt'])
      .where('userId', '=', user.id)
      .orderBy('createdAt', 'desc')
      .limit(24)
      .execute();

    return NextResponse.json({
      errorRate: {
        errors: errorLogs?.count || 0,
        percentage: ((errorLogs?.count || 0) / 100) * 100, // Simplified
      },
      actionBreakdown,
      recentActivity,
    });
  } catch (error: any) {
    console.error('Stats fetch error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
