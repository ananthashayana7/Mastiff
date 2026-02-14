import { db } from '@/src/db';
import {
  performanceSnapshots,
  widgetTemplates,
  serviceHealth,
  performanceRecommendations,
  performanceBenchmarks,
  sloDefinitions,
  performanceCompareHistory,
} from '@/src/db/performanceSchema';
import { dashboardConfigs } from '@/src/db/observabilitySchema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

/**
 * PERFORMANCE ANALYTICS SERVICE - Phase 4.2
 * Performance monitoring, dashboards, benchmarks, SLOs, and recommendations
 */

export class PerformanceAnalyticsService {
  /**
   * Record a performance snapshot (hourly/daily aggregation)
   */
  static async recordPerformanceSnapshot(data: {
    organizationId: string;
    workspaceId?: string;
    snapshotPeriod: '1h' | '1d' | '1w' | '1m';
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    timeoutRequests?: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    avgLatencyMs: number;
    statusCodeBreakdown?: Record<string, number>;
    errorRatePercent?: number;
    timeoutRatePercent?: number;
    avgMemoryMb?: number;
    avgCpuPercent?: number;
    peakMemoryMb?: number;
    peakCpuPercent?: number;
    dbQueryCount?: number;
    avgDbLatencyMs?: number;
    llmInvocationCount?: number;
    llmTokensProcessed?: number;
    llmAvgLatencyMs?: number;
    llmCostUsd?: number;
    cacheHitRatio?: number;
  }) {
    const snapshot = await db
      .insert(performanceSnapshots)
      .values({
        organization_id: data.organizationId as any,
        workspace_id: data.workspaceId as any,
        snapshot_date: new Date(),
        snapshot_period: data.snapshotPeriod,
        total_requests: data.totalRequests.toString() as any,
        successful_requests: data.successfulRequests.toString() as any,
        failed_requests: data.failedRequests.toString() as any,
        total_timeout_requests: data.timeoutRequests?.toString() as any,
        p50_latency_ms: data.p50LatencyMs.toString() as any,
        p95_latency_ms: data.p95LatencyMs.toString() as any,
        p99_latency_ms: data.p99LatencyMs.toString() as any,
        avg_latency_ms: data.avgLatencyMs.toString() as any,
        status_code_breakdown: data.statusCodeBreakdown,
        error_rate_percent: (data.errorRatePercent || 0).toString() as any,
        timeout_rate_percent: (data.timeoutRatePercent || 0).toString() as any,
        avg_memory_mb: data.avgMemoryMb?.toString() as any,
        avg_cpu_percent: data.avgCpuPercent?.toString() as any,
        peak_memory_mb: data.peakMemoryMb?.toString() as any,
        peak_cpu_percent: data.peakCpuPercent?.toString() as any,
        db_query_count: data.dbQueryCount?.toString() as any,
        avg_db_query_latency_ms: data.avgDbLatencyMs?.toString() as any,
        llm_invocation_count: data.llmInvocationCount?.toString() as any,
        llm_tokens_processed: data.llmTokensProcessed?.toString() as any,
        llm_avg_latency_ms: data.llmAvgLatencyMs?.toString() as any,
        llm_cost_usd: data.llmCostUsd?.toString() as any,
        cache_hit_ratio: data.cacheHitRatio?.toString() as any,
      })
      .returning();

    return snapshot[0];
  }

  /**
   * Get performance snapshots for trending and analysis
   */
  static async getPerformanceTrend(data: {
    organizationId: string;
    metricType: 'latency' | 'error_rate' | 'throughput' | 'cost';
    period: '1d' | '7d' | '30d';
    limit?: number;
  }) {
    const days = data.period === '1d' ? 1 : data.period === '7d' ? 7 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let query = db
      .select()
      .from(performanceSnapshots)
      .where(
        and(
          eq(performanceSnapshots.organization_id, data.organizationId as any),
          gte(performanceSnapshots.snapshot_date, startDate)
        )
      );

    const snapshots = await query
      .orderBy(performanceSnapshots.snapshot_date)
      .limit(data.limit || 100);

    return snapshots;
  }

  /**
   * Create or update performance benchmark
   */
  static async createOrUpdateBenchmark(data: {
    organizationId: string;
    name: string;
    description?: string;
    metricName: string;
    targetValue: number;
    lowerBound?: number;
    upperBound?: number;
    warningThreshold?: number;
    criticalThreshold?: number;
    createdBy: string;
  }) {
    const existing = await db.query.performanceBenchmarks.findFirst({
      where: and(
        eq(performanceBenchmarks.organization_id, data.organizationId as any),
        eq(performanceBenchmarks.metric_name, data.metricName as any)
      ),
    });

    if (existing) {
      const updated = await db
        .update(performanceBenchmarks)
        .set({
          name: data.name,
          description: data.description,
          target_value: data.targetValue.toString() as any,
          lower_bound: data.lowerBound?.toString() as any,
          upper_bound: data.upperBound?.toString() as any,
          warning_threshold: data.warningThreshold?.toString() as any,
          critical_threshold: data.criticalThreshold?.toString() as any,
        })
        .where(eq(performanceBenchmarks.id, existing.id as any))
        .returning();

      return updated[0];
    }

    const benchmark = await db
      .insert(performanceBenchmarks)
      .values({
        organization_id: data.organizationId as any,
        name: data.name,
        description: data.description,
        metric_name: data.metricName,
        target_value: data.targetValue.toString() as any,
        lower_bound: data.lowerBound?.toString() as any,
        upper_bound: data.upperBound?.toString() as any,
        warning_threshold: data.warningThreshold?.toString() as any,
        critical_threshold: data.criticalThreshold?.toString() as any,
        created_by: data.createdBy as any,
      })
      .returning();

    return benchmark[0];
  }

  /**
   * Create widget template
   */
  static async createWidgetTemplate(data: {
    organizationId: string;
    name: string;
    slug: string;
    description?: string;
    widgetType: 'line_chart' | 'bar_chart' | 'stat' | 'gauge' | 'table';
    config: Record<string, any>;
    category?: string;
    isPublic?: boolean;
    isSystemTemplate?: boolean;
    tags?: Record<string, string>;
    createdBy: string;
  }) {
    const template = await db
      .insert(widgetTemplates)
      .values({
        organization_id: data.organizationId as any,
        name: data.name,
        slug: data.slug,
        description: data.description,
        widget_type: data.widgetType,
        config: data.config,
        category: data.category,
        is_public: data.isPublic || false,
        is_system_template: data.isSystemTemplate || false,
        tags: data.tags,
        created_by: data.createdBy as any,
      })
      .returning();

    return template[0];
  }

  /**
   * Get system dashboard templates
   */
  static async getSystemTemplates(organizationId: string) {
    const templates = await db
      .select()
      .from(widgetTemplates)
      .where(
        and(
          eq(widgetTemplates.organization_id, organizationId as any),
          eq(widgetTemplates.is_system_template, true)
        )
      );

    return templates;
  }

  /**
   * Create or update service health status
   */
  static async updateServiceHealth(data: {
    organizationId: string;
    serviceName: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    errorRatePercent: number;
    avgLatencyMs: number;
    requestsPerSecond: number;
    uptimePercent24h?: number;
    uptimePercent7d?: number;
    uptimePercent30d?: number;
    dependencies?: string[];
    dependencyStatus?: Record<string, string>;
    activeIncidents?: number;
    region?: string;
  }) {
    const existing = await db.query.serviceHealth.findFirst({
      where: and(
        eq(serviceHealth.organization_id, data.organizationId as any),
        eq(serviceHealth.service_name, data.serviceName as any)
      ),
    });

    const values = {
      status: data.status,
      last_health_check: new Date(),
      error_rate_percent: data.errorRatePercent.toString() as any,
      avg_latency_ms: data.avgLatencyMs.toString() as any,
      requests_per_second: data.requestsPerSecond.toString() as any,
      uptime_percent_24h: data.uptimePercent24h?.toString() as any,
      uptime_percent_7d: data.uptimePercent7d?.toString() as any,
      uptime_percent_30d: data.uptimePercent30d?.toString() as any,
      depends_on: data.dependencies,
      dependency_status: data.dependencyStatus,
      active_incidents: data.activeIncidents?.toString() as any,
    };

    if (existing) {
      const updated = await db
        .update(serviceHealth)
        .set(values)
        .where(eq(serviceHealth.id, existing.id as any))
        .returning();

      return updated[0];
    }

    const health = await db
      .insert(serviceHealth)
      .values({
        organization_id: data.organizationId as any,
        service_name: data.serviceName,
        region: data.region,
        ...values,
      })
      .returning();

    return health[0];
  }

  /**
   * Get all service health statuses
   */
  static async getAllServiceHealth(organizationId: string) {
    const health = await db
      .select()
      .from(serviceHealth)
      .where(eq(serviceHealth.organization_id, organizationId as any))
      .orderBy(serviceHealth.service_name);

    return health;
  }

  /**
   * Create performance recommendation
   */
  static async createRecommendation(data: {
    organizationId: string;
    workspaceId?: string;
    title: string;
    description: string;
    recommendationType: 'caching' | 'indexing' | 'scaling' | 'optimization';
    estimatedImprovementPercent: number;
    affectedMetric: string;
    implementationEffort: 'low' | 'medium' | 'high';
    estimatedTimeHours: number;
    implementationSteps: Array<string>;
    analysis?: Record<string, any>;
  }) {
    const recommendation = await db
      .insert(performanceRecommendations)
      .values({
        organization_id: data.organizationId as any,
        workspace_id: data.workspaceId as any,
        title: data.title,
        description: data.description,
        recommendation_type: data.recommendationType,
        estimated_improvement_percent: data.estimatedImprovementPercent.toString() as any,
        affected_metric: data.affectedMetric,
        implementation_effort: data.implementationEffort,
        estimated_time_hours: data.estimatedTimeHours.toString() as any,
        implementation_steps: data.implementationSteps,
        analysis: data.analysis,
        created_by: 'AI',
      })
      .returning();

    return recommendation[0];
  }

  /**
   * Get open recommendations
   */
  static async getOpenRecommendations(
    organizationId: string,
    filters?: { type?: string; limit?: number }
  ) {
    let query = db
      .select()
      .from(performanceRecommendations)
      .where(
        and(
          eq(performanceRecommendations.organization_id, organizationId as any),
          eq(performanceRecommendations.status, 'new')
        )
      );

    if (filters?.type) {
      query = query.where(
        eq(performanceRecommendations.recommendation_type, filters.type as any)
      );
    }

    const recommendations = await query
      .orderBy(desc(performanceRecommendations.created_at))
      .limit(filters?.limit || 50);

    return recommendations;
  }

  /**
   * Mark recommendation as implemented
   */
  static async implementRecommendation(recommendationId: string) {
    const updated = await db
      .update(performanceRecommendations)
      .set({
        status: 'implemented',
        implemented_at: new Date(),
      })
      .where(eq(performanceRecommendations.id, recommendationId as any))
      .returning();

    return updated[0];
  }

  /**
   * Define SLO (Service Level Objective)
   */
  static async defineSLO(data: {
    organizationId: string;
    name: string;
    description?: string;
    service: string;
    metricName: string;
    comparisonOperator: 'greater_than' | 'less_than';
    thresholdValue: number;
    evaluationWindowDays: number;
    targetPercentage: number;
  }) {
    const slo = await db
      .insert(sloDefinitions)
      .values({
        organization_id: data.organizationId as any,
        name: data.name,
        description: data.description,
        service: data.service,
        metric_name: data.metricName,
        comparison_operator: data.comparisonOperator,
        threshold_value: data.thresholdValue.toString() as any,
        evaluation_window_days: data.evaluationWindowDays.toString() as any,
        target_percentage: data.targetPercentage.toString() as any,
        error_budget_percent: (100 - data.targetPercentage).toString() as any,
      })
      .returning();

    return slo[0];
  }

  /**
   * Get SLOs for organization
   */
  static async getSLOs(organizationId: string) {
    const slos = await db
      .select()
      .from(sloDefinitions)
      .where(
        and(
          eq(sloDefinitions.organization_id, organizationId as any),
          eq(sloDefinitions.is_active, true)
        )
      );

    return slos;
  }

  /**
   * Update SLO progress
   */
  static async updateSLOProgress(sloId: string, data: {
    currentPercentage: number;
    errorBudgetRemaining: number;
    status: 'on_track' | 'at_risk' | 'violated';
  }) {
    const updated = await db
      .update(sloDefinitions)
      .set({
        current_percentage: data.currentPercentage.toString() as any,
        error_budget_remaining_percent: data.errorBudgetRemaining.toString() as any,
        status: data.status,
      })
      .where(eq(sloDefinitions.id, sloId as any))
      .returning();

    return updated[0];
  }

  /**
   * Record performance comparison for trend analysis
   */
  static async recordPerformanceComparison(data: {
    organizationId: string;
    metricName: string;
    currentValue: number;
    previousPeriodValue?: number;
    weekAgoValue?: number;
    monthAgoValue?: number;
  }) {
    const percentChangePrevious = data.previousPeriodValue
      ? ((data.currentValue - data.previousPeriodValue) / data.previousPeriodValue) * 100
      : undefined;

    const percentChangeWeek = data.weekAgoValue
      ? ((data.currentValue - data.weekAgoValue) / data.weekAgoValue) * 100
      : undefined;

    const percentChangeMonth = data.monthAgoValue
      ? ((data.currentValue - data.monthAgoValue) / data.monthAgoValue) * 100
      : undefined;

    // Determine trend
    let trend = 'stable';
    if (percentChangePrevious) {
      trend = percentChangePrevious < -5 ? 'improving' : percentChangePrevious > 5 ? 'degrading' : 'stable';
    }

    const comparison = await db
      .insert(performanceCompareHistory)
      .values({
        organization_id: data.organizationId as any,
        period_start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        period_end: new Date(),
        metric_name: data.metricName,
        current_value: data.currentValue.toString() as any,
        previous_period_value: data.previousPeriodValue?.toString() as any,
        week_ago_value: data.weekAgoValue?.toString() as any,
        month_ago_value: data.monthAgoValue?.toString() as any,
        percent_change_vs_previous: percentChangePrevious?.toString() as any,
        percent_change_vs_week_ago: percentChangeWeek?.toString() as any,
        percent_change_vs_month_ago: percentChangeMonth?.toString() as any,
        trend_direction: trend as any,
      })
      .returning();

    return comparison[0];
  }

  /**
   * Get dashboard with performance data
   */
  static async getDashboardWithData(dashboardId: string) {
    const dashboard = await db.query.dashboardConfigs.findFirst({
      where: eq(dashboardConfigs.id, dashboardId as any),
    });

    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    return dashboard;
  }

  /**
   * Get performance summary for organization
   */
  static async getPerformanceSummary(organizationId: string, days: number = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await db
      .select()
      .from(performanceSnapshots)
      .where(
        and(
          eq(performanceSnapshots.organization_id, organizationId as any),
          gte(performanceSnapshots.snapshot_date, startDate)
        )
      )
      .orderBy(performanceSnapshots.snapshot_date);

    if (snapshots.length === 0) {
      return { message: 'No performance data available' };
    }

    const latest = snapshots[snapshots.length - 1];
    const earliest = snapshots[0];

    // Calculate averages
    const avgLatency =
      snapshots.reduce((sum, s) => sum + parseFloat(s.avg_latency_ms?.toString() || '0'), 0) /
      snapshots.length;

    const avgErrorRate =
      snapshots.reduce((sum, s) => sum + parseFloat(s.error_rate_percent?.toString() || '0'), 0) /
      snapshots.length;

    return {
      period: { startDate, endDate: new Date() },
      latency: {
        current: parseFloat(latest.avg_latency_ms?.toString() || '0'),
        average: avgLatency,
        trend:
          parseFloat(latest.avg_latency_ms?.toString() || '0') < avgLatency
            ? 'improving'
            : 'degrading',
      },
      errorRate: {
        current: parseFloat(latest.error_rate_percent?.toString() || '0'),
        average: avgErrorRate,
      },
      throughput: {
        totalRequests: snapshots.reduce((sum, s) => sum + parseFloat(s.total_requests?.toString() || '0'), 0),
        avgPerDay:
          snapshots.reduce((sum, s) => sum + parseFloat(s.total_requests?.toString() || '0'), 0) /
          days,
      },
      costs: {
        totalCostUsd: snapshots.reduce((sum, s) => sum + parseFloat(s.llm_cost_usd?.toString() || '0'), 0),
        avgCostPerDay:
          snapshots.reduce((sum, s) => sum + parseFloat(s.llm_cost_usd?.toString() || '0'), 0) /
          days,
      },
    };
  }
}
