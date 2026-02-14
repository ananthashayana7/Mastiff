import { NextRequest, NextResponse } from 'next/server';
import { ObservabilityService } from '@/src/services/observabilityService';
import { RBACService } from '@/src/services/rbacService';

/**
 * OBSERVABILITY API ROUTES - Phase 4.1
 * Metrics, logs, traces, events, anomalies, alerting
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const organizationId = searchParams.get('organizationId') as string;
  const userId = request.headers.get('x-user-id');

  try {
    // GET /api/observability?action=trace&traceId=...
    if (action === 'trace') {
      const traceId = searchParams.get('traceId');
      if (!traceId) {
        return NextResponse.json({ error: 'traceId required' }, { status: 400 });
      }

      const trace = await ObservabilityService.getTrace(traceId);
      if (!trace) {
        return NextResponse.json({ error: 'Trace not found' }, { status: 404 });
      }

      return NextResponse.json({ trace }, { status: 200 });
    }

    // GET /api/observability?action=logs&organizationId=...&startTime=...&endTime=...
    if (action === 'logs') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const startTime = new Date(searchParams.get('startTime') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const endTime = new Date(searchParams.get('endTime') || new Date().toISOString());
      const logLevel = searchParams.get('logLevel') || undefined;
      const service = searchParams.get('service') || undefined;
      const traceId = searchParams.get('traceId') || undefined;
      const limit = parseInt(searchParams.get('limit') || '100');

      const queryLogs = await ObservabilityService.queryLogs({
        organizationId,
        logLevel: logLevel || undefined,
        service: service || undefined,
        traceId: traceId || undefined,
        startTime,
        endTime,
        limit,
      });

      return NextResponse.json({ logs: queryLogs, count: queryLogs.length }, { status: 200 });
    }

    // GET /api/observability?action=metrics&organizationId=...&metricName=...
    if (action === 'metrics') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const metricName = searchParams.get('metricName') as string;
      if (!metricName) {
        return NextResponse.json({ error: 'metricName required' }, { status: 400 });
      }

      const startTime = new Date(searchParams.get('startTime') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const endTime = new Date(searchParams.get('endTime') || new Date().toISOString());
      const service = searchParams.get('service') || undefined;

      const queryMetrics = await ObservabilityService.queryMetrics({
        organizationId,
        metricName,
        startTime,
        endTime,
        filters: service ? { service } : undefined,
      });

      return NextResponse.json({ metrics: queryMetrics, count: queryMetrics.length }, { status: 200 });
    }

    // GET /api/observability?action=performance&organizationId=...
    if (action === 'performance') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const startTime = new Date(searchParams.get('startTime') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const endTime = new Date(searchParams.get('endTime') || new Date().toISOString());

      const summary = await ObservabilityService.getPerformanceSummary({
        organizationId,
        startTime,
        endTime,
      });

      return NextResponse.json({ summary }, { status: 200 });
    }

    // GET /api/observability?action=errors&organizationId=...
    if (action === 'errors') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const startTime = new Date(searchParams.get('startTime') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const endTime = new Date(searchParams.get('endTime') || new Date().toISOString());

      const errorSummary = await ObservabilityService.getErrorSummary({
        organizationId,
        startTime,
        endTime,
      });

      return NextResponse.json({ errorSummary }, { status: 200 });
    }

    // GET /api/observability?action=anomalies&organizationId=...
    if (action === 'anomalies') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_analytics');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const severity = searchParams.get('severity') || undefined;
      const anomaliesList = await ObservabilityService.getOpenAnomalies(organizationId, {
        severity: severity || undefined,
      });

      return NextResponse.json({ anomalies: anomaliesList, count: anomaliesList.length }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Observability GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, organizationId } = body;
  const userId = request.headers.get('x-user-id');

  try {
    // POST /api/observability - Record metric
    if (action === 'record-metric') {
      const metric = await ObservabilityService.recordMetric({
        organizationId: organizationId || body.organizationId,
        metricName: body.metricName,
        metricType: body.metricType,
        value: body.value,
        service: body.service,
        endpoint: body.endpoint,
        method: body.method,
        statusCode: body.statusCode,
        userId: body.userId,
        modelId: body.modelId,
        workspaceId: body.workspaceId,
        tags: body.tags,
        metadata: body.metadata,
      });

      return NextResponse.json({ metric }, { status: 201 });
    }

    // POST /api/observability - Record batch metrics
    if (action === 'record-metrics-batch') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const inserted = await ObservabilityService.recordMetricsBatch(
        organizationId,
        body.metrics || []
      );

      return NextResponse.json({ metrics: inserted, count: inserted.length }, { status: 201 });
    }

    // POST /api/observability - Record log
    if (action === 'record-log') {
      const log = await ObservabilityService.recordLog({
        organizationId: body.organizationId,
        logLevel: body.logLevel,
        message: body.message,
        service: body.service,
        endpoint: body.endpoint,
        requestId: body.requestId,
        traceId: body.traceId,
        userId: body.userId,
        workspaceId: body.workspaceId,
        errorCode: body.errorCode,
        errorType: body.errorType,
        errorStack: body.errorStack,
        errorMessage: body.errorMessage,
        durationMs: body.durationMs,
        method: body.method,
        url: body.url,
        statusCode: body.statusCode,
        ipAddress: body.ipAddress,
        context: body.context,
        tags: body.tags,
      });

      return NextResponse.json({ log }, { status: 201 });
    }

    // POST /api/observability - Start trace
    if (action === 'start-trace') {
      const result = await ObservabilityService.startTrace({
        organizationId: body.organizationId,
        userId: body.userId,
        workspaceId: body.workspaceId,
        service: body.service,
        endpoint: body.endpoint,
        method: body.method,
        url: body.url,
        userAgent: body.userAgent,
        clientIp: body.clientIp,
        sessionId: body.sessionId,
      });

      return NextResponse.json({ traceId: result.traceId, trace: result.trace }, { status: 201 });
    }

    // POST /api/observability - Record span
    if (action === 'record-span') {
      const result = await ObservabilityService.recordSpan({
        traceId: body.traceId,
        operationName: body.operationName,
        serviceName: body.serviceName,
        operationType: body.operationType,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        durationMs: body.durationMs,
        status: body.status,
        statusCode: body.statusCode,
        errorMessage: body.errorMessage,
        parentSpanId: body.parentSpanId,
        attributes: body.attributes,
        resourceAttributes: body.resourceAttributes,
      });

      return NextResponse.json({ spanId: result.spanId, span: result.span }, { status: 201 });
    }

    // POST /api/observability - Complete trace
    if (action === 'complete-trace') {
      const completed = await ObservabilityService.completeTrace({
        traceId: body.traceId,
        status: body.status,
        errorCode: body.errorCode,
        errorMessage: body.errorMessage,
        endTime: body.endTime ? new Date(body.endTime) : undefined,
      });

      return NextResponse.json({ trace: completed }, { status: 200 });
    }

    // POST /api/observability - Record event
    if (action === 'record-event') {
      const event = await ObservabilityService.recordEvent({
        organizationId: body.organizationId,
        eventType: body.eventType,
        eventCategory: body.eventCategory,
        actorId: body.actorId,
        actorType: body.actorType,
        targetId: body.targetId,
        targetType: body.targetType,
        userId: body.userId,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId,
        traceId: body.traceId,
        requestId: body.requestId,
        properties: body.properties,
        dimensions: body.dimensions,
        metrics: body.metrics,
        status: body.status,
        errorCode: body.errorCode,
        durationMs: body.durationMs,
      });

      return NextResponse.json({ event }, { status: 201 });
    }

    // POST /api/observability - Detect anomaly
    if (action === 'detect-anomaly') {
      const anomaly = await ObservabilityService.detectAnomaly({
        organizationId: body.organizationId,
        anomalyType: body.anomalyType,
        severity: body.severity,
        metricName: body.metricName,
        baselineValue: body.baselineValue,
        anomalousValue: body.anomalousValue,
        service: body.service,
        endpoint: body.endpoint,
        userId: body.userId,
        workspaceId: body.workspaceId,
        detectionRule: body.detectionRule,
        confidenceScore: body.confidenceScore,
        analysis: body.analysis,
        tags: body.tags,
      });

      return NextResponse.json({ anomaly }, { status: 201 });
    }

    // POST /api/observability - Create alerting rule
    if (action === 'create-alert-rule') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const rule = await ObservabilityService.createAlertingRule({
        organizationId,
        workspaceId: body.workspaceId,
        name: body.name,
        description: body.description,
        ruleType: body.ruleType,
        metricName: body.metricName,
        condition: body.condition,
        thresholdValue: body.thresholdValue,
        evaluationWindowSeconds: body.evaluationWindowSeconds,
        datapointsRequired: body.datapointsRequired,
        filters: body.filters,
        actions: body.actions,
        createdBy: userId,
      });

      return NextResponse.json({ rule }, { status: 201 });
    }

    // POST /api/observability - Save dashboard
    if (action === 'save-dashboard') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const dashboard = await ObservabilityService.saveDashboard({
        organizationId,
        workspaceId: body.workspaceId,
        createdBy: userId,
        name: body.name,
        slug: body.slug,
        description: body.description,
        dashboardType: body.dashboardType,
        layout: body.layout,
        widgets: body.widgets,
        refreshIntervalSeconds: body.refreshIntervalSeconds,
        isDefault: body.isDefault,
        isPublic: body.isPublic,
      });

      return NextResponse.json({ dashboard }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Observability POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
