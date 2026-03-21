# Observability Infrastructure - Phase 4.1

## Overview

Phase 4.1 provides comprehensive observability into Mastiff's operation through:

- **Metrics**: Time-series data collection for performance monitoring
- **Structured Logs**: Rich context logging with trace correlation
- **Distributed Tracing**: End-to-end request tracking across services
- **Events**: Business and system event tracking
- **Anomaly Detection**: Automatic detection of unusual patterns
- **Alerting**: Rule-based alerting with multiple notification channels
- **Dashboards**: Real-time visualization of system health and performance

### Key Features

- **1-second granularity metrics** for real-time monitoring
- **Trace correlation** linking logs, metrics, and spans
- **Multi-dimensional filtering** for root cause analysis
- **Sampling** for high-volume services (avoid storage overhead)
- **Anomaly detection** with configurable thresholds
- **Custom dashboards** with drag-and-drop widgets
- **Multi-tenant isolation** with RBAC enforcement
- **Long-term retention** (30-90 days configurable)

### Architecture

```
┌──────────────────────────────────────────────────┐
│         Application Services                     │
│  (chat, executor, byom, llm services)            │
└────────────────┬─────────────────────────────────┘
                 │ Instrumentation (OpenTelemetry)
                 ▼
┌──────────────────────────────────────────────────┐
│      Observability Collector                     │
│  • Record metrics                                │
│  • Log structured data                           │
│  • Propagate trace context                       │
└────────────────┬─────────────────────────────────┘
                 │
       ┌─────────┴──────────┬────────────┐
       ▼                    ▼            ▼
   ┌────────┐          ┌────────┐    ┌────────┐
   │Metrics │          │Logs    │    │Traces  │
   │Database│          │Database│    │Database│
   └────────┘          └────────┘    └────────┘
       │                    │            │
       └─────────────────┬──────────────┘
                         ▼
              ┌──────────────────────┐
              │  Query & Analytics   │
              │  Anomaly Detection   │
              │  Alerting Engine     │
              └──────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Dashboards          │
              │  Alerts & Notifications
              └──────────────────────┘
```

## Database Schema

### metrics
Time-series metrics for system and application monitoring.

```sql
CREATE TABLE metrics (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Metric Identity
    metric_name TEXT NOT NULL, -- 'api.latency_ms', 'tokens.processed'
    metric_type TEXT NOT NULL, -- 'counter' | 'gauge' | 'histogram'
    
    -- Dimensions (for filtering/grouping)
    service TEXT, -- 'api' | 'chat' | 'executor' | 'byom'
    endpoint TEXT, -- '/api/chat'
    method TEXT, -- 'GET' | 'POST'
    status_code TEXT, -- '200' | '500'
    user_id UUID,
    model_id UUID,
    workspace_id UUID,
    
    -- Value
    value NUMERIC NOT NULL,
    
    -- Aggregated Statistics
    min_value NUMERIC,
    max_value NUMERIC,
    mean_value NUMERIC,
    percentile_50 NUMERIC,
    percentile_95 NUMERIC,
    percentile_99 NUMERIC,
    
    -- Timestamps
    timestamp TIMESTAMP,
    recorded_at TIMESTAMP DEFAULT NOW()
);
```

**Common Metrics**:
- `api.request.latency_ms`: Request processing time
- `api.request.size_bytes`: Request body size
- `api.response.size_bytes`: Response size
- `tokens.input`: Input tokens processed
- `tokens.output`: Output tokens generated
- `tokens.total_cost_usd`: Cost of API call
- `llm.inference.latency_ms`: LLM model inference time
- `database.query.latency_ms`: Database query time
- `cache.hit_ratio`: Cache hit rate
- `error.count`: Error count by type
- `concurrent.users`: Concurrent active users

### logs
Structured application logs with full context.

```sql
CREATE TABLE logs (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Log Level & Identity
    log_level TEXT NOT NULL, -- 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
    message TEXT NOT NULL,
    logger_name TEXT,
    
    -- Context
    service TEXT,
    endpoint TEXT,
    request_id TEXT,
    trace_id TEXT, -- Link to parent trace
    user_id UUID,
    workspace_id UUID,
    
    -- Error Details
    error_code TEXT,
    error_type TEXT,
    error_stack TEXT,
    
    -- Performance
    duration_ms NUMERIC,
    response_size_bytes NUMERIC,
    
    -- HTTP
    method TEXT,
    url TEXT,
    status_code TEXT,
    user_agent TEXT,
    ip_address TEXT,
    
    -- Metadata
    context JSONB,
    tags JSONB,
    
    timestamp TIMESTAMP DEFAULT NOW()
);
```

### traces
Distributed trace headers for request flow tracking.

```sql
CREATE TABLE traces (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Trace Identity
    trace_id TEXT UNIQUE NOT NULL,
    parent_trace_id TEXT,
    
    -- Root Request
    root_service TEXT,
    root_endpoint TEXT,
    
    -- Summary
    total_duration_ms NUMERIC,
    span_count NUMERIC,
    error_span_count NUMERIC,
    
    -- Status
    status TEXT, -- 'success' | 'error' | 'timeout'
    error_code TEXT,
    
    -- Context
    user_id UUID,
    workspace_id UUID,
    session_id TEXT,
    
    -- Sampling
    is_sampled BOOLEAN,
    sampling_priority NUMERIC,
    
    -- Timing
    start_time TIMESTAMP,
    end_time TIMESTAMP
);
```

### trace_spans
Individual operations within a trace.

```sql
CREATE TABLE trace_spans (
    id UUID PRIMARY KEY,
    trace_id TEXT,
    
    -- Span Identity
    span_id TEXT,
    parent_span_id TEXT,
    
    -- Operation
    operation_name TEXT, -- 'http.request', 'db.query', 'llm.invoke'
    service_name TEXT,
    operation_type TEXT, -- 'internal' | 'http' | 'db' | 'cache' | 'external'
    
    -- Timing
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration_ms NUMERIC,
    
    -- Status
    status TEXT, -- 'ok' | 'error'
    is_error BOOLEAN,
    error_message TEXT,
    
    -- Details
    attributes JSONB, -- Operation-specific data
    metrics JSONB -- {latency_ms, bytes_transferred}
);
```

### events
Business and system events.

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Event Identity
    event_type TEXT NOT NULL, -- 'user.login', 'model.invoked', 'workspace.created'
    event_category TEXT, -- 'user' | 'model' | 'workspace'
    
    -- Actor and Target
    actor_id UUID,
    target_id UUID,
    user_id UUID,
    
    -- Context
    workspace_id UUID,
    session_id TEXT,
    trace_id TEXT,
    
    -- Data
    properties JSONB,
    metrics JSONB,
    
    -- Status
    status TEXT, -- 'completed' | 'failed'
    
    timestamp TIMESTAMP DEFAULT NOW()
);
```

### anomalies
Detected unusual patterns for alerting.

```sql
CREATE TABLE anomalies (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Anomaly Details
    anomaly_type TEXT, -- 'spike' | 'drop' | 'outlier'
    severity TEXT NOT NULL, -- 'warning' | 'critical'
    
    -- Metric
    metric_name TEXT,
    baseline_value NUMERIC,
    anomalous_value NUMERIC,
    deviation_percent NUMERIC,
    
    -- Detection
    detection_rule TEXT,
    confidence_score NUMERIC,
    
    -- Status
    status TEXT DEFAULT 'open', -- 'open' | 'acknowledged' | 'resolved'
    
    detected_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Recording Metrics

#### Record Single Metric
```http
POST /api/observability
Content-Type: application/json

{
    "action": "record-metric",
    "organizationId": "org-123",
    "metricName": "api.request.latency_ms",
    "metricType": "histogram",
    "value": 245.5,
    "service": "api",
    "endpoint": "/api/chat",
    "method": "POST",
    "statusCode": "200",
    "userId": "user-456",
    "tags": {
        "model": "gpt-4",
        "region": "us-east-1"
    }
}
```

**Response** (201):
```json
{
    "metric": {
        "id": "metric-1",
        "metric_name": "api.request.latency_ms",
        "value": 245.5,
        "timestamp": "2024-01-15T10:00:00Z"
    }
}
```

#### Record Batch Metrics
```http
POST /api/observability
Content-Type: application/json

{
    "action": "record-metrics-batch",
    "organizationId": "org-123",
    "metrics": [
        {
            "metricName": "api.request.latency_ms",
            "metricType": "histogram",
            "value": 245.5,
            "service": "api",
            "endpoint": "/api/chat"
        },
        {
            "metricName": "tokens.processed",
            "metricType": "counter",
            "value": 1250,
            "service": "executor"
        }
    ]
}
```

### Tracing

#### Start Trace
```http
POST /api/observability
Content-Type: application/json

{
    "action": "start-trace",
    "organizationId": "org-123",
    "service": "api",
    "endpoint": "/api/chat",
    "method": "POST",
    "url": "https://api.example.com/api/chat",
    "userId": "user-456",
    "sessionId": "sess-789"
}
```

**Response** (201):
```json
{
    "traceId": "trace-abc123",
    "trace": {
        "id": "trace-1",
        "trace_id": "trace-abc123",
        "status": "success",
        "start_time": "2024-01-15T10:00:00Z"
    }
}
```

#### Record Span
```http
POST /api/observability
Content-Type: application/json

{
    "action": "record-span",
    "traceId": "trace-abc123",
    "operationName": "http.request",
    "serviceName": "llm-service",
    "operationType": "external",
    "startTime": "2024-01-15T10:00:00Z",
    "endTime": "2024-01-15T10:00:01.500Z",
    "durationMs": 1500,
    "status": "ok",
    "statusCode": "200",
    "attributes": {
        "http.method": "POST",
        "http.url": "https://api.openai.com/v1/chat/completions",
        "http.request_body_size": 256,
        "http.response_body_size": 1024
    }
}
```

**Response** (201):
```json
{
    "spanId": "span-xyz789",
    "span": {
        "id": "span-1",
        "span_id": "span-xyz789",
        "operation_name": "http.request",
        "duration_ms": 1500
    }
}
```

#### Complete Trace
```http
POST /api/observability
Content-Type: application/json

{
    "action": "complete-trace",
    "traceId": "trace-abc123",
    "status": "success",
    "endTime": "2024-01-15T10:00:02Z"
}
```

### Querying Data

#### Query Metrics
```http
GET /api/observability?action=metrics&organizationId=org-123&metricName=api.request.latency_ms&startTime=2024-01-14T10:00:00Z&endTime=2024-01-15T10:00:00Z&service=api
Authorization: Bearer token
```

**Response**:
```json
{
    "metrics": [
        {
            "id": "metric-1",
            "metric_name": "api.request.latency_ms",
            "value": 245.5,
            "service": "api",
            "endpoint": "/api/chat",
            "timestamp": "2024-01-15T10:00:00Z"
        }
    ],
    "count": 1
}
```

#### Query Logs
```http
GET /api/observability?action=logs&organizationId=org-123&startTime=2024-01-14T10:00:00Z&endTime=2024-01-15T10:00:00Z&logLevel=ERROR&limit=100
Authorization: Bearer token
```

**Response**:
```json
{
    "logs": [
        {
            "id": "log-1",
            "log_level": "ERROR",
            "message": "Failed to invoke LLM",
            "service": "executor",
            "error_code": "MODEL_TIMEOUT",
            "error_message": "Request exceeded timeout",
            "trace_id": "trace-abc123",
            "timestamp": "2024-01-15T10:00:00Z"
        }
    ],
    "count": 1
}
```

#### Get Trace with Spans
```http
GET /api/observability?action=trace&traceId=trace-abc123
Authorization: Bearer token
```

**Response**:
```json
{
    "trace": {
        "id": "trace-1",
        "trace_id": "trace-abc123",
        "status": "success",
        "total_duration_ms": 2000,
        "span_count": 5,
        "error_span_count": 0,
        "spans": [
            {
                "id": "span-1",
                "span_id": "span-001",
                "operation_name": "http.request",
                "service_name": "api",
                "duration_ms": 500,
                "status": "ok"
            },
            {
                "id": "span-2",
                "span_id": "span-002",
                "operation_name": "db.query",
                "service_name": "executor",
                "parent_span_id": "span-001",
                "duration_ms": 150,
                "status": "ok"
            }
        ]
    }
}
```

#### Get Performance Summary
```http
GET /api/observability?action=performance&organizationId=org-123&startTime=2024-01-14T10:00:00Z&endTime=2024-01-15T10:00:00Z
Authorization: Bearer token
```

**Response**:
```json
{
    "summary": {
        "totalRequests": 15230,
        "successCount": 14998,
        "errorCount": 232,
        "successRate": 98.48,
        "errorRate": 1.52,
        "avgDurationMs": 345.2,
        "timeRange": {
            "start": "2024-01-14T10:00:00Z",
            "end": "2024-01-15T10:00:00Z"
        }
    }
}
```

#### Get Error Summary
```http
GET /api/observability?action=errors&organizationId=org-123&startTime=2024-01-14T10:00:00Z&endTime=2024-01-15T10:00:00Z
Authorization: Bearer token
```

**Response**:
```json
{
    "errorSummary": {
        "totalErrors": 232,
        "errorBreakdown": {
            "MODEL_TIMEOUT": 120,
            "RATE_LIMIT": 89,
            "DATABASE_ERROR": 23
        },
        "recentErrors": [
            {
                "id": "log-1",
                "message": "Model timeout",
                "error_code": "MODEL_TIMEOUT",
                "timestamp": "2024-01-15T09:59:00Z"
            }
        ]
    }
}
```

#### Get Open Anomalies
```http
GET /api/observability?action=anomalies&organizationId=org-123&severity=critical
Authorization: Bearer token
```

**Response**:
```json
{
    "anomalies": [
        {
            "id": "anom-1",
            "anomaly_type": "spike",
            "severity": "critical",
            "metric_name": "api.error_rate",
            "baseline_value": 1.5,
            "anomalous_value": 15.2,
            "deviation_percent": 913,
            "confidence_score": 0.98,
            "detected_at": "2024-01-15T09:55:00Z",
            "status": "open"
        }
    ],
    "count": 1
}
```

### Events

#### Record Event
```http
POST /api/observability
Content-Type: application/json

{
    "action": "record-event",
    "organizationId": "org-123",
    "eventType": "model.invoked",
    "eventCategory": "model",
    "userId": "user-456",
    "workspaceId": "ws-789",
    "traceId": "trace-abc123",
    "properties": {
        "modelId": "model-1",
        "modelName": "gpt-4",
        "tokensProcessed": 1250
    },
    "metrics": {
        "latencyMs": 1500,
        "costUsd": 0.05
    },
    "status": "completed"
}
```

### Anomaly Detection

#### Detect Anomaly
```http
POST /api/observability
Content-Type: application/json

{
    "action": "detect-anomaly",
    "organizationId": "org-123",
    "anomalyType": "spike",
    "severity": "critical",
    "metricName": "api.error_rate",
    "baselineValue": 1.5,
    "anomalousValue": 15.2,
    "service": "api",
    "detectionRule": "error_rate > baseline * 10",
    "confidenceScore": 0.98,
    "analysis": {
        "potentialCauses": ["database_failure", "downstream_api_outage"],
        "affectedServices": ["chat", "executor"]
    }
}
```

### Alerting

#### Create Alerting Rule
```http
POST /api/observability
Authorization: Bearer token
Content-Type: application/json

{
    "action": "create-alert-rule",
    "organizationId": "org-123",
    "name": "High Error Rate Alert",
    "description": "Alert when error rate exceeds 5%",
    "ruleType": "threshold",
    "metricName": "api.error_rate",
    "condition": "greater_than",
    "thresholdValue": 5.0,
    "evaluationWindowSeconds": 300,
    "datapointsRequired": 3,
    "filters": {
        "service": "api"
    },
    "actions": [
        {
            "type": "email",
            "recipients": ["ops@example.com", "alert@example.com"]
        },
        {
            "type": "slack",
            "webhookUrl": "https://hooks.slack.com/services/..."
        }
    ]
}
```

### Dashboards

#### Save Dashboard
```http
POST /api/observability
Authorization: Bearer token
Content-Type: application/json

{
    "action": "save-dashboard",
    "organizationId": "org-123",
    "name": "API Performance",
    "slug": "api-performance",
    "dashboardType": "system",
    "refreshIntervalSeconds": 60,
    "widgets": [
        {
            "id": "widget-1",
            "type": "line_chart",
            "title": "Request Latency",
            "metricName": "api.request.latency_ms",
            "config": {
                "yAxis": "milliseconds",
                "timeRange": "1h"
            }
        },
        {
            "id": "widget-2",
            "type": "stat",
            "title": "Success Rate",
            "metricName": "api.success_rate",
            "config": {
                "format": "percentage",
                "thresholds": {"good": 98, "warning": 95}
            }
        }
    ]
}
```

## Service Usage

### Instrumentation Example

```typescript
import { ObservabilityService } from '@/src/services/observabilityService';

// Start tracing a request
const { traceId } = await ObservabilityService.startTrace({
  organizationId: 'org-123',
  service: 'api',
  endpoint: '/api/chat',
  method: 'POST',
  userId: 'user-456',
});

try {
  // Record span for LLM invocation
  const { spanId } = await ObservabilityService.recordSpan({
    traceId,
    operationName: 'llm.invoke',
    serviceName: 'executor',
    operationType: 'external',
    startTime: new Date(),
    endTime: new Date(Date.now() + 1500),
    durationMs: 1500,
    status: 'ok',
    attributes: {
      modelId: 'model-1',
      tokensProcessed: 1250,
    },
  });

  // Record metrics
  await ObservabilityService.recordMetric({
    organizationId: 'org-123',
    metricName: 'tokens.processed',
    metricType: 'counter',
    value: 1250,
    service: 'executor',
  });

  // Record event
  await ObservabilityService.recordEvent({
    organizationId: 'org-123',
    eventType: 'model.invoked',
    eventCategory: 'model',
    userId: 'user-456',
    traceId,
    properties: { modelId: 'model-1' },
    status: 'completed',
  });

  // Complete trace
  await ObservabilityService.completeTrace({
    traceId,
    status: 'success',
  });
} catch (error) {
  // Log error with context
  await ObservabilityService.recordLog({
    organizationId: 'org-123',
    logLevel: 'ERROR',
    message: 'LLM invocation failed',
    service: 'executor',
    traceId,
    errorCode: 'LLM_ERROR',
    errorMessage: error.message,
  });

  // Mark trace as failed
  await ObservabilityService.completeTrace({
    traceId,
    status: 'error',
    errorCode: 'LLM_ERROR',
    errorMessage: error.message,
  });
}
```

## Monitoring Best Practices

### Key Metrics to Monitor

1. **Request Metrics**:
   - Latency (p50, p95, p99)
   - Error rate
   - Request volume
   - Response size

2. **LLM Metrics**:
   - Tokens processed
   - Cost per request
   - Model inference latency
   - Cache hit rate

3. **Resource Metrics**:
   - Database query latency
   - Memory usage
   - CPU utilization
   - Connection pool usage

4. **Business Metrics**:
   - User activity
   - Workspace utilization
   - Model usage distribution
   - Cost by user/workspace

### Alert Thresholds

```
High Error Rate: > 5% for 5 minutes
Slow Responses: p95 latency > 2000ms for 10 minutes
Database Issues: query latency > 1000ms for 2 minutes
Model Failures: error rate > 10% for 2 minutes
Quota Exceeded: token usage > 80% of limit
```

## Roadmap

### Phase 4.2: Performance Analytics & Dashboards
- [ ] Pre-built dashboards (System, Application, Business)
- [ ] Dashboard templates library
- [ ] Custom chart types (heatmap, Sankey, waterfall)
- [ ] Real-time updates with WebSockets

### Phase 4.3: Error Tracking & Alerting
- [ ] Error grouping and deduplication
- [ ] Root cause analysis suggestions
- [ ] Integration with Sentry
- [ ] Advanced alerting (escalation, routing)

### Phase 4.4: Usage Analytics & Insights
- [ ] User funnel analysis
- [ ] Feature adoption metrics
- [ ] Cohort analysis
- [ ] Retention and churn tracking

### Phase 4.5: Cost Analytics & Optimization
- [ ] Cost breakdown by service/user/workspaceacerby model/feature
- [ ] Cost trend analysis and forecasting
- [ ] Reserved capacity recommendations
- [ ] Waste detection and recommendations
