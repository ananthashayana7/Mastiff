import { NextRequest, NextResponse } from 'next/server';
import { UsageAnalyticsService } from '@/src/services/usageAnalyticsService';
import { RBACService } from '@/src/services/rbacService';

/**
 * USAGE ANALYTICS API ROUTES - Phase 4.4
 * Funnel analysis, cohort tracking, feature adoption, and user behavior
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const organizationId = searchParams.get('organizationId') as string;
  const userId = request.headers.get('x-user-id');

  try {
    // GET /api/usage?action=dashboard&organizationId=...
    if (action === 'dashboard') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const dashboard = await UsageAnalyticsService.getUsageDashboard(organizationId);

      return NextResponse.json({ dashboard }, { status: 200 });
    }

    // GET /api/usage?action=funnel&funnelId=...
    if (action === 'funnel') {
      const funnelId = searchParams.get('funnelId') as string;
      if (!funnelId) {
        return NextResponse.json({ error: 'funnelId required' }, { status: 400 });
      }

      const report = await UsageAnalyticsService.getFunnelReport(funnelId);

      return NextResponse.json({ report }, { status: 200 });
    }

    // GET /api/usage?action=features&organizationId=...
    if (action === 'features') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const trends = await UsageAnalyticsService.getFeatureAdoptionTrends(organizationId);

      return NextResponse.json({ features: trends }, { status: 200 });
    }

    // GET /api/usage?action=segments&organizationId=...
    if (action === 'segments') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const segments = await UsageAnalyticsService.getUserSegments(organizationId);

      return NextResponse.json({ segments }, { status: 200 });
    }

    // GET /api/usage?action=growth&organizationId=...&periods=12
    if (action === 'growth') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const periods = parseInt(searchParams.get('periods') || '12');
      const trends = await UsageAnalyticsService.getGrowthTrends(organizationId, periods);

      return NextResponse.json({ growthTrends: trends }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Usage analytics GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, organizationId } = body;
  const userId = request.headers.get('x-user-id');

  try {
    // POST /api/usage - Record event
    if (action === 'record-event') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const eventId = await UsageAnalyticsService.recordEvent({
        organizationId,
        workspaceId: body.workspaceId,
        userId: body.userId,
        sessionId: body.sessionId,
        eventName: body.eventName,
        eventCategory: body.eventCategory,
        eventData: body.eventData,
        properties: body.properties,
        context: body.context,
      });

      return NextResponse.json({ eventId }, { status: 201 });
    }

    // POST /api/usage - Create funnel
    if (action === 'create-funnel') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(
        userId,
        organizationId,
        'manage_settings'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const funnelId = await UsageAnalyticsService.createConversionFunnel({
        organizationId,
        name: body.name,
        description: body.description,
        steps: body.steps,
        analysisStartDate: new Date(body.analysisStartDate),
        analysisEndDate: new Date(body.analysisEndDate),
      });

      return NextResponse.json({ funnelId }, { status: 201 });
    }

    // POST /api/usage - Analyze funnel
    if (action === 'analyze-funnel') {
      const funnelId = body.funnelId;
      if (!funnelId) {
        return NextResponse.json({ error: 'funnelId required' }, { status: 400 });
      }

      const analysis = await UsageAnalyticsService.analyzeFunnel(funnelId);

      return NextResponse.json({ analysis }, { status: 200 });
    }

    // POST /api/usage - Create cohort
    if (action === 'create-cohort') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(
        userId,
        organizationId,
        'manage_settings'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const cohortId = await UsageAnalyticsService.createCohort({
        organizationId,
        name: body.name,
        description: body.description,
        cohortType: body.cohortType,
        criteria: body.criteria,
        isAutomated: body.isAutomated,
      });

      return NextResponse.json({ cohortId }, { status: 201 });
    }

    // POST /api/usage - Analyze cohort
    if (action === 'analyze-cohort') {
      const cohortId = body.cohortId;
      if (!cohortId) {
        return NextResponse.json({ error: 'cohortId required' }, { status: 400 });
      }

      const analysis = await UsageAnalyticsService.analyzeCohort(cohortId);

      return NextResponse.json({ analysis }, { status: 200 });
    }

    // POST /api/usage - Track feature adoption
    if (action === 'track-feature') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const adoptionId = await UsageAnalyticsService.trackFeatureAdoption({
        organizationId,
        featureName: body.featureName,
        featureCategory: body.featureCategory,
        releaseVersion: body.releaseVersion,
        releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined,
      });

      return NextResponse.json({ adoptionId }, { status: 201 });
    }

    // POST /api/usage - Create user segment
    if (action === 'create-segment') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(
        userId,
        organizationId,
        'manage_settings'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const segmentId = await UsageAnalyticsService.createUserSegment({
        organizationId,
        name: body.name,
        description: body.description,
        criteria: body.criteria,
      });

      return NextResponse.json({ segmentId }, { status: 201 });
    }

    // POST /api/usage - Start session
    if (action === 'start-session') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const sessionId = await UsageAnalyticsService.startSession({
        organizationId,
        userId: body.userId,
        deviceType: body.deviceType,
        osName: body.osName,
        browserName: body.browserName,
        country: body.country,
        region: body.region,
        referrer: body.referrer,
        campaignId: body.campaignId,
        source: body.source,
        medium: body.medium,
      });

      return NextResponse.json({ sessionId }, { status: 201 });
    }

    // POST /api/usage - End session
    if (action === 'end-session') {
      const sessionId = body.sessionId;
      if (!sessionId) {
        return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
      }

      const durationSeconds = await UsageAnalyticsService.endSession(
        sessionId,
        body.goalCompleted
      );

      return NextResponse.json({ durationSeconds }, { status: 200 });
    }

    // POST /api/usage - Detect behavior patterns
    if (action === 'detect-patterns') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const userId_param = body.userId;
      if (!userId_param) {
        return NextResponse.json({ error: 'userId required' }, { status: 400 });
      }

      const patterns = await UsageAnalyticsService.detectBehaviorPatterns(
        userId_param,
        organizationId
      );

      return NextResponse.json({ patterns }, { status: 200 });
    }

    // POST /api/usage - Build heatmap
    if (action === 'build-heatmap') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const eventName = body.eventName;
      const dimension = body.dimension;

      if (!eventName || !dimension) {
        return NextResponse.json({ error: 'eventName and dimension required' }, { status: 400 });
      }

      const heatmapId = await UsageAnalyticsService.buildEventHeatmap(
        organizationId,
        eventName,
        dimension
      );

      return NextResponse.json({ heatmapId }, { status: 201 });
    }

    // POST /api/usage - Record growth metrics
    if (action === 'record-growth') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const metricsId = await UsageAnalyticsService.recordGrowthMetrics({
        organizationId,
        periodDate: new Date(body.periodDate),
        periodType: body.periodType,
        newUsers: body.newUsers,
        returningUsers: body.returningUsers,
        activeUsers: body.activeUsers,
        totalUsers: body.totalUsers,
        churnedUsers: body.churnedUsers,
        sessions: body.sessions,
        avgEventsPerUser: body.avgEventsPerUser,
        avgSessionDurationMinutes: body.avgSessionDurationMinutes,
        dayOneRetention: body.dayOneRetention,
        day7Retention: body.day7Retention,
        day30Retention: body.day30Retention,
        monthlyRecurringRevenue: body.monthlyRecurringRevenue,
      });

      return NextResponse.json({ metricsId }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Usage analytics POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
