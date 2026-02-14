import { db } from '@/src/db';
import {
  metrics,
  logs,
  traces,
  traceSpans,
  events,
  anomalies,
  alertingRules,
  dashboardConfigs,
} from '@/src/db/observabilitySchema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

/**
 * OBSERVABILITY SERVICE - Phase 4.1
 * Comprehensive metrics, logging, tracing, events, and anomaly detection
 */

export class ObservabilityService {
  /**
   * Record a metric value (gauge, counter, histogram)
   */
  static async recordMetric(data: {
    organizationId: string;
    metricName: string;
    metricType: 'counter' | 'gauge' | 'histogram' | 'summary';
    value: number;
    service?: string;
    endpoint?: string;
    method?: string;
    statusCode?: string;
    userId?: string;
    modelId?: string;
    workspaceId?: string;
    tags?: Record<string, string>;
    metadata?: Record<string, any>;
  }) {
    const metric = await db
      .insert(metrics)
      .values({
        organization_id: data.organizationId as any,
        metric_name: data.metricName,
        metric_type: data.metricType,
        value: data.value.toString() as any,
        service: data.service,
        endpoint: data.endpoint,
        method: data.method,
        status_code: data.statusCode,
        user_id: data.userId as any,
        model_id: data.modelId as any,
        workspace_id: data.workspaceId as any,
        tags: data.tags,
        metadata: data.metadata,
        timestamp: new Date(),
      })
      .returning();

    return metric[0];
  }

  /**
   * Record batch metrics (efficient bulk insert)
   */
  static async recordMetricsBatch(
    organizationId: string,
    metricList: Array<{
      metricName: string;
      metricType: 'counter' | 'gauge' | 'histogram' | 'summary';
      value: number;
      service?: string;
      endpoint?: string;
      tags?: Record<string, string>;
    }>
  ) {
    const records = metricList.map((m) => ({
      organization_id: organizationId as any,
      metric_name: m.metricName,
      metric_type: m.metricType,
      value: m.value.toString() as any,
      service: m.service,
      endpoint: m.endpoint,
      tags: m.tags,
      timestamp: new Date(),
    }));

    const inserted = await db.insert(metrics).values(records).returning();
    return inserted;
  }

  /**
   * Query metrics with aggregation
   */
  static async queryMetrics(data: {
    organizationId: string;
    metricName: string;
    aggregation?: 'mean' | 'min' | 'max' | 'sum' | 'count';
    interval?: '1m' | '5m' | '15m' | '1h' | '1d';
    startTime: Date;
    endTime: Date;
    filters?: Record<string, string>;
  }) {
    let query = db
      .select()
      .from(metrics)
      .where(
        and(
          eq(metrics.organization_id, data.organizationId as any),
          eq(metrics.metric_name, data.metricName),
          gte(metrics.timestamp, data.startTime),
          lte(metrics.timestamp, data.endTime)
        )
      );

    if (data.filters?.service) {
      query = query.where(eq(metrics.service, data.filters.service as any));
    }

    const results = await query.orderBy(metrics.timestamp);
    return results;
  }

  /**
   * Record a log entry
   */
  static async recordLog(data: {
    organizationId?: string;
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
    message: string;
    service?: string;
    endpoint?: string;
    requestId?: string;
    traceId?: string;
    userId?: string;
    workspaceId?: string;
    errorCode?: string;
    errorType?: string;
    errorStack?: string;
    errorMessage?: string;
    durationMs?: number;
    method?: string;
    url?: string;
    statusCode?: string;
    ipAddress?: string;
    context?: Record<string, any>;
    tags?: Record<string, string>;
  }) {
    const log = await db
      .insert(logs)
      .values({
        organization_id: data.organizationId as any,
        log_level: data.logLevel,
        message: data.message,
        service: data.service,
        endpoint: data.endpoint,
        request_id: data.requestId,
        trace_id: data.traceId,
        user_id: data.userId as any,
        workspace_id: data.workspaceId as any,
        error_code: data.errorCode,
        error_type: data.errorType,
        error_stack: data.errorStack,
        error_message: data.errorMessage,
        duration_ms: data.durationMs?.toString() as any,
        method: data.method,
        url: data.url,
        status_code: data.statusCode,
        ip_address: data.ipAddress,
        context: data.context,
        tags: data.tags,
      })
      .returning();

    return log[0];
  }

  /**
   * Start a new trace (distributed tracing)
   */
  static async startTrace(data: {
    organizationId?: string;
    userId?: string;
    workspaceId?: string;
    service: string;
    endpoint: string;
    method?: string;
    url?: string;
    userAgent?: string;
    clientIp?: string;
    sessionId?: string;
    isSampled?: boolean;
  }) {
    const traceId = `trace-${uuid()}`;
    const startTime = new Date();

    const trace = await db
      .insert(traces)
      .values({
        organization_id: data.organizationId as any,
        trace_id: traceId,
        root_service: data.service,
        root_endpoint: data.endpoint,
        root_method: data.method,
        http_method: data.method,
        http_url: data.url,
        user_id: data.userId as any,
        workspace_id: data.workspaceId as any,
        session_id: data.sessionId,
        user_agent: data.userAgent,
        client_ip: data.clientIp,
        is_sampled: data.isSampled || false,
        start_time: startTime,
        status: 'success',
      })
      .returning();

    return {
      traceId,
      trace: trace[0],
    };
  }

  /**
   * Record a span within a trace
   */
  static async recordSpan(data: {
    traceId: string;
    operationName: string;
    serviceName: string;
    operationType: 'internal' | 'http' | 'db' | 'cache' | 'external';
    startTime: Date;
    endTime: Date;
    durationMs: number;
    status: 'unset' | 'ok' | 'error';
    statusCode?: string;
    errorMessage?: string;
    parentSpanId?: string;
    attributes?: Record<string, any>;
    resourceAttributes?: Record<string, string>;
  }) {
    const spanId = `span-${uuid()}`;

    const span = await db
      .insert(traceSpans)
      .values({
        trace_id: data.traceId,
        span_id: spanId,
        parent_span_id: data.parentSpanId,
        operation_name: data.operationName,
        service_name: data.serviceName,
        operation_type: data.operationType,
        start_time: data.startTime,
        end_time: data.endTime,
        duration_ms: data.durationMs.toString() as any,
        status: data.status,
        status_code: data.statusCode,
        error_message: data.errorMessage,
        is_error: data.status === 'error',
        attributes: data.attributes,
        resource_attributes: data.resourceAttributes,
      })
      .returning();

    return {
      spanId,
      span: span[0],
    };
  }

  /**
   * Complete a trace with final status
   */
  static async completeTrace(data: {
    traceId: string;
    status: 'success' | 'error' | 'timeout' | 'cancelled';
    errorCode?: string;
    errorMessage?: string;
    endTime?: Date;
  }) {
    const trace = await db.query.traces.findFirst({
      where: eq(traces.trace_id, data.traceId as any),
    });

    if (!trace) {
      throw new Error(`Trace not found: ${data.traceId}`);
    }

    const endTime = data.endTime || new Date();
    const startTime = trace.start_time;
    const durationMs =
      endTime.getTime() - (startTime?.getTime() || Date.now());

    const updated = await db
      .update(traces)
      .set({
        status: data.status,
        error_code: data.errorCode,
        error_message: data.errorMessage,
        end_time: endTime,
        total_duration_ms: (durationMs / 1000).toString() as any,
      })
      .where(eq(traces.trace_id, data.traceId as any))
      .returning();

    return updated[0];
  }

  /**
   * Record a business or system event
   */
  static async recordEvent(data: {
    organizationId?: string;
    eventType: string; // 'user.login' | 'model.invoked'
    eventCategory: string; // 'user' | 'model' | 'workspace'
    actorId?: string;
    actorType?: string;
    targetId?: string;
    targetType?: string;
    userId?: string;
    workspaceId?: string;
    sessionId?: string;
    traceId?: string;
    requestId?: string;
    properties?: Record<string, any>;
    dimensions?: Record<string, string>;
    metrics?: Record<string, number>;
    status?: string;
    errorCode?: string;
    durationMs?: number;
  }) {
    const event = await db
      .insert(events)
      .values({
        organization_id: data.organizationId as any,
        event_type: data.eventType,
        event_category: data.eventCategory,
        actor_id: data.actorId as any,
        actor_type: data.actorType,
        target_id: data.targetId as any,
        target_type: data.targetType,
        user_id: data.userId as any,
        workspace_id: data.workspaceId as any,
        session_id: data.sessionId,
        request_id: data.requestId,
        trace_id: data.traceId,
        properties: data.properties,
        dimensions: data.dimensions,
        metrics: data.metrics,
        status: data.status,
        error_code: data.errorCode,
        duration_ms: data.durationMs?.toString() as any,
      })
      .returning();

    return event[0];
  }

  /**
   * Detect anomalies in metrics
   */
  static async detectAnomaly(data: {
    organizationId?: string;
    anomalyType: 'spike' | 'drop' | 'trend' | 'outlier';
    severity: 'info' | 'warning' | 'critical';
    metricName: string;
    baselineValue: number;
    anomalousValue: number;
    service?: string;
    endpoint?: string;
    userId?: string;
    workspaceId?: string;
    detectionRule: string;
    confidenceScore: number;
    analysis?: Record<string, any>;
    tags?: Record<string, string>;
  }) {
    const deviationPercent =
      ((data.anomalousValue - data.baselineValue) / data.baselineValue) * 100;

    const anomaly = await db
      .insert(anomalies)
      .values({
        organization_id: data.organizationId as any,
        anomaly_type: data.anomalyType,
        severity: data.severity,
        metric_name: data.metricName,
        baseline_value: data.baselineValue.toString() as any,
        anomalous_value: data.anomalousValue.toString() as any,
        deviation_percent: deviationPercent.toString() as any,
        service: data.service,
        endpoint: data.endpoint,
        user_id: data.userId as any,
        workspace_id: data.workspaceId as any,
        detection_rule: data.detectionRule,
        confidence_score: data.confidenceScore.toString() as any,
        analysis: data.analysis,
        tags: data.tags,
        status: 'open',
      })
      .returning();

    return anomaly[0];
  }

  /**
   * Get open anomalies
   */
  static async getOpenAnomalies(organizationId: string, filters?: {
    severity?: string;
    service?: string;
    limit?: number;
  }) {
    let query = db
      .select()
      .from(anomalies)
      .where(
        and(
          eq(anomalies.organization_id, organizationId as any),
          eq(anomalies.status, 'open')
        )
      );

    if (filters?.severity) {
      query = query.where(eq(anomalies.severity, filters.severity as any));
    }

    const results = await query
      .orderBy(desc(anomalies.detected_at))
      .limit(filters?.limit || 50);

    return results;
  }

  /**
   * Create or update alerting rule
   */
  static async createAlertingRule(data: {
    organizationId: string;
    workspaceId?: string;
    name: string;
    description?: string;
    ruleType: 'threshold' | 'rate' | 'cardinality' | 'absence';
    metricName: string;
    condition: 'greater_than' | 'less_than' | 'equals';
    thresholdValue: number;
    evaluationWindowSeconds?: number;
    datapointsRequired?: number;
    filters?: Record<string, string>;
    actions?: Array<{
      type: 'email' | 'webhook' | 'pagerduty' | 'slack';
      recipients?: string[];
      webhookUrl?: string;
    }>;
    createdBy: string;
  }) {
    const rule = await db
      .insert(alertingRules)
      .values({
        organization_id: data.organizationId as any,
        workspace_id: data.workspaceId as any,
        name: data.name,
        description: data.description,
        rule_type: data.ruleType,
        metric_name: data.metricName,
        condition: data.condition,
        threshold_value: data.thresholdValue.toString() as any,
        evaluation_window_seconds: data.evaluationWindowSeconds?.toString() as any,
        datapoints_required: data.datapointsRequired?.toString() as any,
        filters: data.filters,
        actions: data.actions || [],
        created_by: data.createdBy as any,
      })
      .returning();

    return rule[0];
  }

  /**
   * Save dashboard configuration
   */
  static async saveDashboard(data: {
    organizationId: string;
    workspaceId?: string;
    createdBy: string;
    name: string;
    slug: string;
    description?: string;
    dashboardType: 'system' | 'application' | 'business' | 'custom';
    layout: Record<string, any>;
    widgets: Array<{
      id: string;
      type: 'line_chart' | 'bar_chart' | 'table' | 'stat' | 'gauge';
      metricName?: string;
      title: string;
      config: Record<string, any>;
    }>;
    refreshIntervalSeconds?: number;
    isDefault?: boolean;
    isPublic?: boolean;
  }) {
    const dashboard = await db
      .insert(dashboardConfigs)
      .values({
        organization_id: data.organizationId as any,
        workspace_id: data.workspaceId as any,
        created_by: data.createdBy as any,
        name: data.name,
        slug: data.slug,
        description: data.description,
        dashboard_type: data.dashboardType,
        layout: data.layout,
        widgets: data.widgets,
        refresh_interval_seconds: data.refreshIntervalSeconds?.toString() as any,
        is_default: data.isDefault || false,
        is_public: data.isPublic || false,
      })
      .returning();

    return dashboard[0];
  }

  /**
   * Get trace with all spans
   */
  static async getTrace(traceId: string) {
    const trace = await db.query.traces.findFirst({
      where: eq(traces.trace_id, traceId as any),
      with: {
        spans: true,
        logs: true,
      },
    });

    return trace;
  }

  /**
   * Query logs with filtering
   */
  static async queryLogs(data: {
    organizationId?: string;
    logLevel?: string;
    service?: string;
    traceId?: string;
    userId?: string;
    startTime: Date;
    endTime: Date;
    limit?: number;
    offset?: number;
  }) {
    let query = db.select().from(logs);

    if (data.organizationId) {
      query = query.where(eq(logs.organization_id, data.organizationId as any));
    }
    if (data.logLevel) {
      query = query.where(eq(logs.log_level, data.logLevel as any));
    }
    if (data.service) {
      query = query.where(eq(logs.service, data.service as any));
    }
    if (data.traceId) {
      query = query.where(eq(logs.trace_id, data.traceId as any));
    }
    if (data.userId) {
      query = query.where(eq(logs.user_id, data.userId as any));
    }

    const results = await query
      .where(
        and(
          gte(logs.timestamp, data.startTime),
          lte(logs.timestamp, data.endTime)
        )
      )
      .orderBy(desc(logs.timestamp))
      .limit(data.limit || 100)
      .offset(data.offset || 0);

    return results;
  }

  /**
   * Get performance summary
   */
  static async getPerformanceSummary(data: {
    organizationId: string;
    startTime: Date;
    endTime: Date;
    service?: string;
  }) {
    // Query completed traces in time range
    const completedTraces = await db
      .select()
      .from(traces)
      .where(
        and(
          eq(traces.organization_id, data.organizationId as any),
          gte(traces.end_time, data.startTime),
          lte(traces.end_time, data.endTime)
        )
      );

    const successCount =
      completedTraces.filter((t) => t.status === 'success').length || 0;
    const errorCount =
      completedTraces.filter((t) => t.status === 'error').length || 0;
    const totalCount = completedTraces.length || 0;

    const avgDuration =
      totalCount > 0
        ? completedTraces.reduce(
            (sum, t) =>
              sum +
              (parseFloat(t.total_duration_ms?.toString() || '0') || 0),
            0
          ) / totalCount
        : 0;

    return {
      totalRequests: totalCount,
      successCount,
      errorCount,
      successRate: totalCount > 0 ? (successCount / totalCount) * 100 : 0,
      errorRate: totalCount > 0 ? (errorCount / totalCount) * 100 : 0,
      avgDurationMs: avgDuration,
      timeRange: {
        start: data.startTime,
        end: data.endTime,
      },
    };
  }

  /**
   * Get error summary
   */
  static async getErrorSummary(data: {
    organizationId: string;
    startTime: Date;
    endTime: Date;
    limit?: number;
  }) {
    // Find most common errors
    const errorLogs = await db
      .select()
      .from(logs)
      .where(
        and(
          eq(logs.organization_id, data.organizationId as any),
          eq(logs.log_level, 'ERROR'),
          gte(logs.timestamp, data.startTime),
          lte(logs.timestamp, data.endTime)
        )
      )
      .orderBy(desc(logs.timestamp))
      .limit(data.limit || 100);

    // Group by error code
    const errorCounts: Record<string, number> = {};
    errorLogs.forEach((log) => {
      const code = log.error_code || 'UNKNOWN';
      errorCounts[code] = (errorCounts[code] || 0) + 1;
    });

    return {
      totalErrors: errorLogs.length,
      errorBreakdown: errorCounts,
      recentErrors: errorLogs.slice(0, 10),
    };
  }
}
