import { NextRequest, NextResponse } from 'next/server';
import { PerformanceAnalyticsService } from '@/src/services/performanceAnalyticsService';
import { RBACService } from '@/src/services/rbacService';
import { authenticateRequest } from '@/lib/auth';

/**
 * PERFORMANCE ANALYTICS API ROUTES - Phase 4.2
 * Dashboards, benchmarks, SLOs, and performance insights
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const organizationId = searchParams.get('organizationId') as string;

  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // GET /api/analytics?action=performance&organizationId=...&days=7
    if (action === 'performance') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const days = parseInt(searchParams.get('days') || '7');
      const summary = await PerformanceAnalyticsService.getPerformanceSummary(organizationId, days);

      return NextResponse.json({ summary }, { status: 200 });
    }

    // GET /api/analytics?action=trend&organizationId=...&metricType=latency&period=7d
    if (action === 'trend') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const metricType = searchParams.get('metricType') as any || 'latency';
      const period = searchParams.get('period') as any || '7d';

      const trend = await PerformanceAnalyticsService.getPerformanceTrend({
        organizationId,
        metricType,
        period,
      });

      return NextResponse.json({ trend }, { status: 200 });
    }

    // GET /api/analytics?action=service-health&organizationId=...
    if (action === 'service-health') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const health = await PerformanceAnalyticsService.getAllServiceHealth(organizationId);

      return NextResponse.json({ health }, { status: 200 });
    }

    // GET /api/analytics?action=recommendations&organizationId=...
    if (action === 'recommendations') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const type = searchParams.get('type') || undefined;
      const recommendations = await PerformanceAnalyticsService.getOpenRecommendations(organizationId, {
        type: type || undefined,
      });

      return NextResponse.json({ recommendations, count: recommendations.length }, { status: 200 });
    }

    // GET /api/analytics?action=slos&organizationId=...
    if (action === 'slos') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const slos = await PerformanceAnalyticsService.getSLOs(organizationId);

      return NextResponse.json({ slos }, { status: 200 });
    }

    // GET /api/analytics?action=templates&organizationId=...
    if (action === 'templates') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const templates = await PerformanceAnalyticsService.getSystemTemplates(organizationId);

      return NextResponse.json({ templates }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Analytics GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, organizationId } = body;

  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // POST /api/analytics - Record performance snapshot
    if (action === 'record-snapshot') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const snapshot = await PerformanceAnalyticsService.recordPerformanceSnapshot({
        organizationId,
        workspaceId: body.workspaceId,
        snapshotPeriod: body.snapshotPeriod,
        totalRequests: body.totalRequests,
        successfulRequests: body.successfulRequests,
        failedRequests: body.failedRequests,
        timeoutRequests: body.timeoutRequests,
        p50LatencyMs: body.p50LatencyMs,
        p95LatencyMs: body.p95LatencyMs,
        p99LatencyMs: body.p99LatencyMs,
        avgLatencyMs: body.avgLatencyMs,
        statusCodeBreakdown: body.statusCodeBreakdown,
        errorRatePercent: body.errorRatePercent,
        timeoutRatePercent: body.timeoutRatePercent,
        avgMemoryMb: body.avgMemoryMb,
        avgCpuPercent: body.avgCpuPercent,
        peakMemoryMb: body.peakMemoryMb,
        peakCpuPercent: body.peakCpuPercent,
        dbQueryCount: body.dbQueryCount,
        avgDbLatencyMs: body.avgDbLatencyMs,
        llmInvocationCount: body.llmInvocationCount,
        llmTokensProcessed: body.llmTokensProcessed,
        llmAvgLatencyMs: body.llmAvgLatencyMs,
        llmCostUsd: body.llmCostUsd,
        cacheHitRatio: body.cacheHitRatio,
      });

      return NextResponse.json({ snapshot }, { status: 201 });
    }

    // POST /api/analytics - Create benchmark
    if (action === 'create-benchmark') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const benchmark = await PerformanceAnalyticsService.createOrUpdateBenchmark({
        organizationId,
        name: body.name,
        description: body.description,
        metricName: body.metricName,
        targetValue: body.targetValue,
        lowerBound: body.lowerBound,
        upperBound: body.upperBound,
        warningThreshold: body.warningThreshold,
        criticalThreshold: body.criticalThreshold,
        createdBy: userId,
      });

      return NextResponse.json({ benchmark }, { status: 201 });
    }

    // POST /api/analytics - Create widget template
    if (action === 'create-template') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const template = await PerformanceAnalyticsService.createWidgetTemplate({
        organizationId,
        name: body.name,
        slug: body.slug,
        description: body.description,
        widgetType: body.widgetType,
        config: body.config,
        category: body.category,
        isPublic: body.isPublic,
        isSystemTemplate: body.isSystemTemplate,
        tags: body.tags,
        createdBy: userId,
      });

      return NextResponse.json({ template }, { status: 201 });
    }

    // POST /api/analytics - Update service health
    if (action === 'update-health') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const health = await PerformanceAnalyticsService.updateServiceHealth({
        organizationId,
        serviceName: body.serviceName,
        status: body.status,
        errorRatePercent: body.errorRatePercent,
        avgLatencyMs: body.avgLatencyMs,
        requestsPerSecond: body.requestsPerSecond,
        uptimePercent24h: body.uptimePercent24h,
        uptimePercent7d: body.uptimePercent7d,
        uptimePercent30d: body.uptimePercent30d,
        dependencies: body.dependencies,
        dependencyStatus: body.dependencyStatus,
        activeIncidents: body.activeIncidents,
        region: body.region,
      });

      return NextResponse.json({ health }, { status: 200 });
    }

    // POST /api/analytics - Create recommendation
    if (action === 'create-recommendation') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const recommendation = await PerformanceAnalyticsService.createRecommendation({
        organizationId,
        workspaceId: body.workspaceId,
        title: body.title,
        description: body.description,
        recommendationType: body.recommendationType,
        estimatedImprovementPercent: body.estimatedImprovementPercent,
        affectedMetric: body.affectedMetric,
        implementationEffort: body.implementationEffort,
        estimatedTimeHours: body.estimatedTimeHours,
        implementationSteps: body.implementationSteps,
        analysis: body.analysis,
      });

      return NextResponse.json({ recommendation }, { status: 201 });
    }

    // POST /api/analytics - Implement recommendation
    if (action === 'implement-recommendation') {
      const recommendationId = body.recommendationId;
      if (!recommendationId) {
        return NextResponse.json({ error: 'recommendationId required' }, { status: 400 });
      }

      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }
      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const implemented = await PerformanceAnalyticsService.implementRecommendation(recommendationId);

      return NextResponse.json({ recommendation: implemented }, { status: 200 });
    }

    // POST /api/analytics - Create SLO
    if (action === 'create-slo') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const slo = await PerformanceAnalyticsService.defineSLO({
        organizationId,
        name: body.name,
        description: body.description,
        service: body.service,
        metricName: body.metricName,
        comparisonOperator: body.comparisonOperator,
        thresholdValue: body.thresholdValue,
        evaluationWindowDays: body.evaluationWindowDays,
        targetPercentage: body.targetPercentage,
      });

      return NextResponse.json({ slo }, { status: 201 });
    }

    // POST /api/analytics - Update SLO progress
    if (action === 'update-slo-progress') {
      const sloId = body.sloId;
      if (!sloId) {
        return NextResponse.json({ error: 'sloId required' }, { status: 400 });
      }

      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }
      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const updated = await PerformanceAnalyticsService.updateSLOProgress(sloId, {
        currentPercentage: body.currentPercentage,
        errorBudgetRemaining: body.errorBudgetRemaining,
        status: body.status,
      });

      return NextResponse.json({ slo: updated }, { status: 200 });
    }

    // POST /api/analytics - Record comparison
    if (action === 'record-comparison') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const comparison = await PerformanceAnalyticsService.recordPerformanceComparison({
        organizationId,
        metricName: body.metricName,
        currentValue: body.currentValue,
        previousPeriodValue: body.previousPeriodValue,
        weekAgoValue: body.weekAgoValue,
        monthAgoValue: body.monthAgoValue,
      });

      return NextResponse.json({ comparison }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Analytics POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
