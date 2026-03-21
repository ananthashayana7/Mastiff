# Performance Analytics - Phase 4.2

Complete performance tracking, optimization recommendations, and SLO management system for the Mastiff platform.

**Executive Summary**: Performance Analytics builds on Phase 4.1 Observability to provide strategic insights, automated optimization recommendations, SLO tracking, and performance benchmarking. This enables data-driven capacity planning and continuous performance improvement.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Service Layer](#service-layer)
4. [API Endpoints](#api-endpoints)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Implementation Guide](#implementation-guide)
8. [Roadmap](#roadmap)

---

## Architecture Overview

### Core Components

**Performance Analytics Stack**:

```
Frontend Dashboard
    ↓
API Routes (/api/analytics)
    ↓
PerformanceAnalyticsService
    ↓
Performance Database Schema
    ├── performance_snapshots (Time-series aggregates)
    ├── service_health (Real-time monitoring)
    ├── slo_definitions (SLO tracking)
    ├── performance_benchmarks (Target tracking)
    ├── performance_recommendations (AI suggestions)
    ├── widget_templates (Dashboard components)
    └── performance_compare_history (Trend analysis)
    ↓
Phase 4.1 Observability Layer
    ├── Metrics (Raw time-series)
    ├── Logs (Structured events)
    ├── Traces (Distributed tracing)
    └── Events (Business tracking)
```

### Key Features

| Feature | Purpose | Use Case |
|---------|---------|----------|
| **Performance Snapshots** | Aggregate metrics into hourly/daily periods | Trend analysis, capacity planning |
| **Service Health** | Real-time status with uptime tracking | Incident response, SLO monitoring |
| **SLO Management** | Error budget tracking with compliance | SLAs, contractual obligations |
| **Benchmarks** | Performance targets with thresholds | Goal setting, deviation detection |
| **Recommendations** | AI-generated optimization suggestions | Continuous improvement, cost reduction |
| **Widgets** | Reusable dashboard components | Custom dashboards, monitoring |
| **Comparisons** | Period-over-period trend analysis | Identifying improvements/degradation |

---

## Database Schema

### performance_snapshots

Aggregated performance metrics at hourly/daily granularity for trending and historical analysis.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  workspaceId?: string;            // Optional workspace scope
  snapshotPeriod: '1h' | '1d';    // Aggregation period
  snapshotTime: Date;              // When this snapshot was recorded
  
  // Request metrics
  totalRequests: number;           // Total request count
  successfulRequests: number;      // 2xx responses
  failedRequests: number;          // 4xx/5xx responses
  timeoutRequests: number;         // Timeout count
  
  // Latency metrics (milliseconds)
  p50LatencyMs: number;            // 50th percentile
  p95LatencyMs: number;            // 95th percentile
  p99LatencyMs: number;            // 99th percentile
  avgLatencyMs: number;            // Average latency
  
  // Status codes
  statusCodeBreakdown: {           // e.g., {"200": 950, "400": 30, "500": 20}
    [code: string]: number;
  };
  
  // Error metrics
  errorRatePercent: number;        // % of failed requests
  timeoutRatePercent: number;      // % of timeouts
  
  // Resource usage
  avgMemoryMb: number;             // Average memory consumption
  avgCpuPercent: number;           // Average CPU usage %
  peakMemoryMb: number;            // Peak memory in period
  peakCpuPercent: number;          // Peak CPU in period
  
  // Database metrics
  dbQueryCount: number;            // Total queries executed
  avgDbLatencyMs: number;          // Average query latency
  
  // LLM metrics
  llmInvocationCount: number;      // Total LLM calls
  llmTokensProcessed: number;      // Total tokens used
  llmAvgLatencyMs: number;         // Average LLM response time
  llmCostUsd: number;              // Cost in USD
  
  // Cache metrics
  cacheHitRatio: number;           // Cache hit ratio (0-100)
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

### service_health

Real-time service status monitoring with uptime tracking and dependency health.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  serviceName: string;             // e.g., "api", "scheduler", "worker"
  
  // Current status
  status: 'healthy' | 'degraded' | 'unhealthy';
  errorRatePercent: number;        // Current error rate
  avgLatencyMs: number;            // Current latency
  requestsPerSecond: number;       // Current RPS
  
  // Uptime tracking
  uptimePercent24h: number;        // 24h uptime %
  uptimePercent7d: number;         // 7d uptime %
  uptimePercent30d: number;        // 30d uptime %
  
  // Dependencies
  dependencies: string[];          // ["database", "cache", "auth"]
  dependencyStatus: {              // Status of each dependency
    [dep: string]: 'healthy' | 'degraded' | 'unhealthy';
  };
  
  // Incidents
  activeIncidents: number;         // Current incidents affecting service
  lastIncidentTime?: Date;         // When last incident occurred
  meanTimeToRecoveryMins: number;  // MTTR in minutes
  
  // Metadata
  region: string;                  // e.g., "us-east-1"
  lastHealthCheckAt: Date;         // When last checked
  createdAt: Date;
  updatedAt: Date;
}
```

### slo_definitions

Service Level Objective definitions with error budget tracking and compliance monitoring.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  
  // SLO definition
  name: string;                    // e.g., "API Availability"
  description?: string;            // Detailed description
  service: string;                 // Service name
  metricName: string;              // Metric being tracked
  comparisonOperator: 'greater_than' | 'less_than' | 'equals';
  thresholdValue: number;          // Target threshold (e.g., 99.9)
  
  // Evaluation
  evaluationWindowDays: number;    // Evaluation period (e.g., 30 days)
  targetPercentage: number;        // Target (e.g., 99.9 = 99.9%)
  
  // Error budget
  // Error budget % = 100 - targetPercentage
  // Example: 99.9% target = 0.1% error budget
  // Over 30 days: 0.1% × 43200 mins = 43.2 minutes of allowed downtime
  
  // Current tracking
  currentPercentage: number;       // Current performance %
  errorBudgetRemaining: number;    // % of budget remaining
  status: 'on_track' | 'at_risk' | 'violated';
  
  // Timeline
  createdAt: Date;
  updatedAt: Date;
}
```

### performance_benchmarks

Performance targets and thresholds for goal setting and deviation detection.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  
  // Definition
  name: string;                    // e.g., "API Response Time"
  description?: string;
  metricName: string;              // Metric being benchmarked
  
  // Target values
  targetValue: number;             // Ideal target (e.g., 200ms)
  lowerBound: number;              // Minimum acceptable
  upperBound: number;              // Maximum acceptable
  
  // Thresholds
  warningThreshold: number;        // When to warn (e.g., 300ms)
  criticalThreshold: number;       // When to alert (e.g., 500ms)
  
  // Current status
  currentValue: number;            // Latest measurement
  status: 'on_track' | 'warning' | 'critical' | 'exceeded';
  
  // Metadata
  createdBy: string;               // User ID
  createdAt: Date;
  updatedAt: Date;
}
```

### performance_recommendations

AI-generated optimization recommendations with implementation guidance.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  workspaceId?: string;            // Optional workspace scope
  
  // Recommendation details
  title: string;                   // e.g., "Add Database Query Indexing"
  description: string;             // Detailed explanation
  recommendationType: 'caching' | 'indexing' | 'scaling' | 'optimization' | 'architecture';
  
  // Impact analysis
  estimatedImprovementPercent: number; // Expected improvement (e.g., 35%)
  affectedMetric: string;          // Which metric improves (e.g., "db.latency_ms")
  
  // Implementation
  implementationEffort: 'low' | 'medium' | 'high';
  estimatedTimeHours: number;      // Time to implement
  implementationSteps: string[];   // Step-by-step guide
  
  // Analysis
  analysis: {
    currentPerformance: string;    // Current state
    rootCause: string;             // Why this is needed
    expectedOutcome: string;       // What improves
  };
  
  // Status
  status: 'new' | 'acknowledged' | 'implemented' | 'dismissed';
  implementedAt?: Date;
  dismissedAt?: Date;
  dismissalReason?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

### widget_templates

Reusable dashboard component templates for building custom monitoring dashboards.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID (null = system)
  
  // Template definition
  name: string;                    // e.g., "Request Latency Chart"
  slug: string;                    // URL-safe identifier
  description?: string;
  
  // Widget configuration
  widgetType: 'line_chart' | 'bar_chart' | 'stat' | 'gauge' | 'table';
  config: {
    metrics: string[];             // Which metrics to display
    timeRange?: '1h' | '1d' | '7d' | '30d';
    aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'p95' | 'p99';
    refreshInterval?: number;      // Seconds
    thresholds?: {                 // Optional thresholds
      warning: number;
      critical: number;
    };
  };
  
  // Organization
  category: 'system' | 'application' | 'business' | 'llm';
  isPublic: boolean;               // Shareable across org
  isSystemTemplate: boolean;       // Built-in template
  tags: string[];                  // For discovery
  
  // Metadata
  createdBy: string;               // User ID
  createdAt: Date;
  updatedAt: Date;
}
```

### performance_compare_history

Period-over-period performance comparison for trend analysis and change detection.

```typescript
{
  id: string;                      // UUID
  organizationId: string;          // Tenant ID
  
  // Metric details
  metricName: string;              // e.g., "request_latency_ms"
  
  // Comparison values
  currentValue: number;            // Current period value
  previousPeriodValue: number;     // Previous period (prior day/week)
  weekAgoValue: number;            // One week ago
  monthAgoValue: number;           // One month ago
  
  // Calculated trends
  percentChangeFromPrevious: number; // % change from previous
  percentChangeFromWeekAgo: number;  // % change from 1 week ago
  percentChangeFromMonthAgo: number; // % change from 1 month ago
  
  // Trend direction
  trend: 'improving' | 'stable' | 'degrading';
  trendSeverity: 'low' | 'medium' | 'high';
  
  // Metadata
  recordedAt: Date;
  createdAt: Date;
}
```

---

## Service Layer

### PerformanceAnalyticsService

Complete service implementation for all performance analytics operations.

#### recordPerformanceSnapshot()

Record aggregated performance metrics for a time period.

```typescript
async recordPerformanceSnapshot(params: {
  organizationId: string;
  workspaceId?: string;
  snapshotPeriod: '1h' | '1d';
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutRequests: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgLatencyMs: number;
  statusCodeBreakdown: Record<string, number>;
  errorRatePercent: number;
  timeoutRatePercent: number;
  avgMemoryMb: number;
  avgCpuPercent: number;
  peakMemoryMb: number;
  peakCpuPercent: number;
  dbQueryCount: number;
  avgDbLatencyMs: number;
  llmInvocationCount: number;
  llmTokensProcessed: number;
  llmAvgLatencyMs: number;
  llmCostUsd: number;
  cacheHitRatio: number;
}): Promise<PerformanceSnapshot>
```

**Example**:

```typescript
const snapshot = await PerformanceAnalyticsService.recordPerformanceSnapshot({
  organizationId: 'org-123',
  workspaceId: 'ws-456',
  snapshotPeriod: '1d',
  totalRequests: 1250000,
  successfulRequests: 1230000,
  failedRequests: 20000,
  timeoutRequests: 0,
  p50LatencyMs: 245,
  p95LatencyMs: 850,
  p99LatencyMs: 2500,
  avgLatencyMs: 450,
  statusCodeBreakdown: { '200': 1230000, '400': 15000, '500': 5000 },
  errorRatePercent: 1.6,
  timeoutRatePercent: 0.0,
  avgMemoryMb: 2048,
  avgCpuPercent: 45,
  peakMemoryMb: 4096,
  peakCpuPercent: 85,
  dbQueryCount: 45000000,
  avgDbLatencyMs: 12,
  llmInvocationCount: 500000,
  llmTokensProcessed: 78500000,
  llmAvgLatencyMs: 2300,
  llmCostUsd: 245.50,
  cacheHitRatio: 92.5,
});
```

#### getPerformanceTrend()

Query historical performance trends for analysis.

```typescript
async getPerformanceTrend(params: {
  organizationId: string;
  metricType: 'latency' | 'errors' | 'throughput' | 'resources' | 'cost';
  period: '1d' | '7d' | '30d';
}): Promise<PerformanceSnapshot[]>
```

**Use Cases**:
- Show latency trend over past 7 days
- Compare error rates across months
- Identify seasonal patterns
- Detect performance degradation

#### createOrUpdateBenchmark()

Define performance targets and thresholds.

```typescript
async createOrUpdateBenchmark(params: {
  organizationId: string;
  name: string;
  description?: string;
  metricName: string;
  targetValue: number;
  lowerBound: number;
  upperBound: number;
  warningThreshold: number;
  criticalThreshold: number;
  createdBy: string;
}): Promise<PerformanceBenchmark>
```

**Example**:

```typescript
const benchmark = await PerformanceAnalyticsService.createOrUpdateBenchmark({
  organizationId: 'org-123',
  name: 'API Response Time SLO',
  description: 'Maximum acceptable response time for API requests',
  metricName: 'api.latency_p99',
  targetValue: 500,         // 500ms target
  lowerBound: 100,          // 100ms minimum
  upperBound: 2000,         // 2000ms maximum
  warningThreshold: 800,    // Warn at 800ms
  criticalThreshold: 1500,  // Critical at 1500ms
  createdBy: 'user-1',
});
```

#### createWidgetTemplate()

Create reusable dashboard widget templates.

```typescript
async createWidgetTemplate(params: {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
  widgetType: 'line_chart' | 'bar_chart' | 'stat' | 'gauge' | 'table';
  config: WidgetConfig;
  category: 'system' | 'application' | 'business' | 'llm';
  isPublic: boolean;
  isSystemTemplate: boolean;
  tags: string[];
  createdBy: string;
}): Promise<WidgetTemplate>
```

#### getSystemTemplates()

Retrieve built-in and shareable dashboard templates.

```typescript
async getSystemTemplates(organizationId: string): Promise<WidgetTemplate[]>
```

**Built-in Templates** (system-provided):

```typescript
// Request Latency Chart
{
  slug: 'request-latency-chart',
  widgetType: 'line_chart',
  category: 'system',
  config: {
    metrics: ['request.latency_p50', 'request.latency_p95', 'request.latency_p99'],
    timeRange: '7d',
    aggregation: 'avg',
  }
}

// Error Rate Gauge
{
  slug: 'error-rate-gauge',
  widgetType: 'gauge',
  category: 'system',
  config: {
    metrics: ['request.error_rate'],
    thresholds: { warning: 1.0, critical: 5.0 },
  }
}

// LLM Cost Tracking
{
  slug: 'llm-cost-tracker',
  widgetType: 'stat',
  category: 'llm',
  config: {
    metrics: ['llm.cost_usd'],
    timeRange: '30d',
  }
}
```

#### updateServiceHealth()

Update real-time service status and monitoring information.

```typescript
async updateServiceHealth(params: {
  organizationId: string;
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  errorRatePercent: number;
  avgLatencyMs: number;
  requestsPerSecond: number;
  uptimePercent24h: number;
  uptimePercent7d: number;
  uptimePercent30d: number;
  dependencies: string[];
  dependencyStatus: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
  activeIncidents: number;
  region: string;
}): Promise<ServiceHealth>
```

**Example**:

```typescript
await PerformanceAnalyticsService.updateServiceHealth({
  organizationId: 'org-123',
  serviceName: 'api',
  status: 'healthy',
  errorRatePercent: 0.01,
  avgLatencyMs: 245,
  requestsPerSecond: 12500,
  uptimePercent24h: 99.99,
  uptimePercent7d: 99.95,
  uptimePercent30d: 99.90,
  dependencies: ['database', 'cache', 'auth-service'],
  dependencyStatus: {
    'database': 'healthy',
    'cache': 'healthy',
    'auth-service': 'healthy',
  },
  activeIncidents: 0,
  region: 'us-east-1',
});
```

#### getAllServiceHealth()

Query health status of all services.

```typescript
async getAllServiceHealth(organizationId: string): Promise<ServiceHealth[]>
```

#### createRecommendation()

Create AI-generated optimization recommendations.

```typescript
async createRecommendation(params: {
  organizationId: string;
  workspaceId?: string;
  title: string;
  description: string;
  recommendationType: 'caching' | 'indexing' | 'scaling' | 'optimization' | 'architecture';
  estimatedImprovementPercent: number;
  affectedMetric: string;
  implementationEffort: 'low' | 'medium' | 'high';
  estimatedTimeHours: number;
  implementationSteps: string[];
  analysis: {
    currentPerformance: string;
    rootCause: string;
    expectedOutcome: string;
  };
}): Promise<PerformanceRecommendation>
```

**Example**:

```typescript
const recommendation = await PerformanceAnalyticsService.createRecommendation({
  organizationId: 'org-123',
  title: 'Implement Redis Caching for User Sessions',
  description: 'Currently loading user sessions from database on every request',
  recommendationType: 'caching',
  estimatedImprovementPercent: 40,
  affectedMetric: 'request.latency_ms',
  implementationEffort: 'low',
  estimatedTimeHours: 4,
  implementationSteps: [
    'Set up Redis cluster in Kubernetes',
    'Install redis-client npm package',
    'Wrap SessionService with cache layer',
    '(Optional) Configure cache invalidation strategy',
  ],
  analysis: {
    currentPerformance: 'Session loading: 150ms average',
    rootCause: 'Database queries on each request',
    expectedOutcome: 'Session loading: 90ms average (40% improvement)',
  },
});
```

#### getOpenRecommendations()

Query active optimization recommendations.

```typescript
async getOpenRecommendations(organizationId: string, filters?: {
  type?: string;
  status?: 'new' | 'acknowledged' | 'implemented' | 'dismissed';
}): Promise<PerformanceRecommendation[]>
```

#### defineSLO()

Create Service Level Objectives with error budget tracking.

```typescript
async defineSLO(params: {
  organizationId: string;
  name: string;
  description?: string;
  service: string;
  metricName: string;
  comparisonOperator: 'greater_than' | 'less_than' | 'equals';
  thresholdValue: number;
  evaluationWindowDays: number;
  targetPercentage: number;
}): Promise<SLODefinition>
```

**Example**:

```typescript
const slo = await PerformanceAnalyticsService.defineSLO({
  organizationId: 'org-123',
  name: 'API Availability SLO',
  description: 'API must be available 99.9% of the time',
  service: 'api',
  metricName: 'api.success_rate',
  comparisonOperator: 'greater_than',
  thresholdValue: 99.9,
  evaluationWindowDays: 30,
  targetPercentage: 99.9,
  // Error budget: 0.1% × 30 days × 1440 mins/day = 43.2 minutes of downtime allowed
});
```

#### getSLOs()

Query all active SLOs for an organization.

```typescript
async getSLOs(organizationId: string): Promise<SLODefinition[]>
```

#### updateSLOProgress()

Track SLO compliance and error budget consumption.

```typescript
async updateSLOProgress(sloId: string, data: {
  currentPercentage: number;
  errorBudgetRemaining: number;
  status: 'on_track' | 'at_risk' | 'violated';
}): Promise<SLODefinition>
```

#### recordPerformanceComparison()

Record period-over-period performance comparisons.

```typescript
async recordPerformanceComparison(params: {
  organizationId: string;
  metricName: string;
  currentValue: number;
  previousPeriodValue: number;
  weekAgoValue: number;
  monthAgoValue: number;
}): Promise<PerformanceComparison>
```

#### getPerformanceSummary()

Get aggregated performance statistics for dashboards.

```typescript
async getPerformanceSummary(organizationId: string, days: number): Promise<{
  periodDays: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRatePercent: number;
  requestsPerDay: number;
  costUsd: number;
  sloCompliance: number;
  topRecommendations: PerformanceRecommendation[];
  serviceHealth: ServiceHealth[];
}>
```

---

## API Endpoints

Base URL: `/api/analytics`

### GET Endpoints

#### Get Performance Summary

```
GET /api/analytics?action=performance&organizationId={orgId}&days={days}
```

**Parameters**:
- `organizationId`: Tenant ID (required)
- `days`: Number of days to summarize (default: 7)

**Response**:

```json
{
  "summary": {
    "periodDays": 7,
    "avgLatencyMs": 245,
    "p95LatencyMs": 850,
    "errorRatePercent": 1.2,
    "requestsPerDay": 178571,
    "costUsd": 2450.50,
    "sloCompliance": 99.85,
    "topRecommendations": [...],
    "serviceHealth": [...]
  }
}
```

#### Get Performance Trend

```
GET /api/analytics?action=trend&organizationId={orgId}&metricType={type}&period={period}
```

**Parameters**:
- `organizationId`: Tenant ID (required)
- `metricType`: 'latency' | 'errors' | 'throughput' | 'resources' | 'cost' (default: latency)
- `period`: '1d' | '7d' | '30d' (default: 7d)

**Response**:

```json
{
  "trend": [
    {
      "timestamp": "2024-01-15T00:00:00Z",
      "value": 245,
      "p95": 850,
      "p99": 2500
    }
  ]
}
```

#### Get Service Health

```
GET /api/analytics?action=service-health&organizationId={orgId}
```

**Response**:

```json
{
  "health": [
    {
      "serviceName": "api",
      "status": "healthy",
      "errorRatePercent": 0.01,
      "avgLatencyMs": 245,
      "requestsPerSecond": 12500,
      "uptimePercent24h": 99.99,
      "uptimePercent7d": 99.95,
      "uptimePercent30d": 99.90
    }
  ]
}
```

#### Get Recommendations

```
GET /api/analytics?action=recommendations&organizationId={orgId}&type={type}
```

**Parameters**:
- `organizationId`: Tenant ID (required)
- `type`: Optional recommendation type filter

**Response**:

```json
{
  "recommendations": [...],
  "count": 12
}
```

#### Get SLOs

```
GET /api/analytics?action=slos&organizationId={orgId}
```

**Response**:

```json
{
  "slos": [
    {
      "id": "slo-1",
      "name": "API Availability SLO",
      "targetPercentage": 99.9,
      "currentPercentage": 99.85,
      "errorBudgetRemaining": 92.5,
      "status": "on_track"
    }
  ]
}
```

#### Get Widget Templates

```
GET /api/analytics?action=templates&organizationId={orgId}
```

**Response**:

```json
{
  "templates": [
    {
      "id": "tpl-1",
      "name": "Request Latency Chart",
      "slug": "request-latency-chart",
      "widgetType": "line_chart",
      "category": "system"
    }
  ]
}
```

### POST Endpoints

#### Record Performance Snapshot

```
POST /api/analytics
{
  "action": "record-snapshot",
  "organizationId": "org-123",
  "snapshotPeriod": "1d",
  "totalRequests": 1250000,
  "successfulRequests": 1230000,
  ...
}
```

#### Create Benchmark

```
POST /api/analytics
{
  "action": "create-benchmark",
  "organizationId": "org-123",
  "name": "API Response Time",
  "metricName": "api.latency_p99",
  "targetValue": 500,
  "warningThreshold": 800
}
```

#### Create Widget Template

```
POST /api/analytics
{
  "action": "create-template",
  "organizationId": "org-123",
  "name": "Error Rate Gauge",
  "slug": "error-rate-gauge",
  "widgetType": "gauge",
  "category": "system"
}
```

#### Update Service Health

```
POST /api/analytics
{
  "action": "update-health",
  "organizationId": "org-123",
  "serviceName": "api",
  "status": "healthy",
  "errorRatePercent": 0.01
}
```

#### Create Recommendation

```
POST /api/analytics
{
  "action": "create-recommendation",
  "organizationId": "org-123",
  "title": "Add Database Query Indexing",
  "recommendationType": "indexing",
  "estimatedImprovementPercent": 35,
  "implementationEffort": "low"
}
```

#### Create SLO

```
POST /api/analytics
{
  "action": "create-slo",
  "organizationId": "org-123",
  "name": "API Availability SLO",
  "service": "api",
  "metricName": "api.success_rate",
  "targetPercentage": 99.9,
  "evaluationWindowDays": 30
}
```

#### Update SLO Progress

```
POST /api/analytics
{
  "action": "update-slo-progress",
  "sloId": "slo-1",
  "currentPercentage": 99.85,
  "errorBudgetRemaining": 92.5,
  "status": "on_track"
}
```

---

## Usage Examples

### Complete Monitoring Setup

```typescript
// 1. Define SLOs
const slo = await PerformanceAnalyticsService.defineSLO({
  organizationId: 'org-123',
  name: 'API Availability',
  service: 'api',
  metricName: 'api.success_rate',
  targetPercentage: 99.9,
  evaluationWindowDays: 30,
});

// 2. Record daily performance snapshot
const snapshot = await PerformanceAnalyticsService.recordPerformanceSnapshot({
  organizationId: 'org-123',
  snapshotPeriod: '1d',
  totalRequests: 1250000,
  successfulRequests: 1230000,
  failedRequests: 20000,
  p50LatencyMs: 245,
  p95LatencyMs: 850,
  p99LatencyMs: 2500,
  avgLatencyMs: 450,
  // ... other metrics
});

// 3. Update service health
await PerformanceAnalyticsService.updateServiceHealth({
  organizationId: 'org-123',
  serviceName: 'api',
  status: snapshot.errorRatePercent < 2 ? 'healthy' : 'degraded',
  errorRatePercent: snapshot.errorRatePercent,
  avgLatencyMs: snapshot.avgLatencyMs,
  uptimePercent24h: 99.99,
  uptimePercent7d: 99.95,
  uptimePercent30d: 99.90,
  dependencies: ['database', 'cache'],
  dependencyStatus: {
    'database': 'healthy',
    'cache': 'healthy',
  },
  activeIncidents: 0,
  region: 'us-east-1',
});

// 4. Track SLO progress
const sloProgress = await PerformanceAnalyticsService.updateSLOProgress(slo.id, {
  currentPercentage: 99.85,
  errorBudgetRemaining: 92.5,
  status: 'on_track',
});

// 5. Record performance comparison
await PerformanceAnalyticsService.recordPerformanceComparison({
  organizationId: 'org-123',
  metricName: 'api.latency_p95',
  currentValue: 850,
  previousPeriodValue: 920,
  weekAgoValue: 1050,
  monthAgoValue: 1200,
});
```

### AI Recommendation Generation

```typescript
// Detect performance issues and generate recommendations
const snapshot = await PerformanceAnalyticsService.getPerformanceTrend({
  organizationId: 'org-123',
  metricType: 'latency',
  period: '7d',
});

if (snapshot.avgLatencyMs > 500) {
  const recommendation = await PerformanceAnalyticsService.createRecommendation({
    organizationId: 'org-123',
    title: 'Optimize Database Queries',
    recommendationType: 'optimization',
    estimatedImprovementPercent: 25,
    affectedMetric: 'request.latency_ms',
    implementationEffort: 'medium',
    estimatedTimeHours: 8,
    implementationSteps: [
      'Analyze slow query logs',
      'Add missing database indexes',
      'Denormalize frequently-joined tables',
      'Profile after changes',
    ],
    analysis: {
      currentPerformance: `Current P95: ${snapshot.p95LatencyMs}ms`,
      rootCause: 'Database queries consuming 60% of request time',
      expectedOutcome: `Expected P95: ${Math.round(snapshot.p95LatencyMs * 0.75)}ms`,
    },
  });
}
```

### Custom Dashboard

```typescript
// Create reusable dashboard widgets
const templates = [
  {
    name: 'Request Latency Overview',
    slug: 'latency-overview',
    widgetType: 'line_chart',
    category: 'system',
    config: {
      metrics: ['request.latency_p50', 'request.latency_p95', 'request.latency_p99'],
      timeRange: '7d',
      aggregation: 'avg',
    },
  },
  {
    name: 'Error Rate',
    slug: 'error-rate',
    widgetType: 'gauge',
    category: 'system',
    config: {
      metrics: ['request.error_rate'],
      thresholds: { warning: 1.0, critical: 5.0 },
    },
  },
  {
    name: 'Service Status',
    slug: 'service-status',
    widgetType: 'table',
    category: 'system',
    config: {
      metrics: ['service.status', 'service.uptime_7d', 'service.avgLatency'],
    },
  },
];

for (const template of templates) {
  await PerformanceAnalyticsService.createWidgetTemplate({
    organizationId: 'org-123',
    ...template,
    createdBy: 'admin-user',
  });
}
```

---

## Best Practices

### 1. Regular Snapshot Recording

Record performance snapshots at consistent intervals:

```typescript
// In a scheduled job (every hour or day)
setInterval(async () => {
  const metrics = await collectMetricsFromObservability();
  await PerformanceAnalyticsService.recordPerformanceSnapshot({
    organizationId,
    snapshotPeriod: '1h',
    ...metrics,
  });
}, 3600000); // Every hour
```

### 2. SLO-Driven Alerting

Alert when SLO compliance is at risk:

```typescript
// Check SLO status periodically
setInterval(async () => {
  const slos = await PerformanceAnalyticsService.getSLOs(organizationId);
  
  for (const slo of slos) {
    if (slo.status === 'at_risk') {
      await sendAlert(`SLO "${slo.name}" is at risk!`);
    } else if (slo.status === 'violated') {
      await escalateAlert(`SLO "${slo.name}" violated!`);
    }
  }
}, 300000); // Every 5 minutes
```

### 3. Budget-Based Decisions

Use error budget for deployment decisions:

```typescript
async canDeployService(organizationId: string, service: string): Promise<boolean> {
  const slos = await PerformanceAnalyticsService.getSLOs(organizationId);
  
  for (const slo of slos) {
    if (slo.service === service && slo.errorBudgetRemaining < 25) {
      // Less than 25% budget remaining - high risk
      return false;
    }
  }
  
  return true;
}
```

### 4. Automated Recommendations

Regularly generate and track recommendations:

```typescript
// Daily recommendation generation
setInterval(async () => {
  const summary = await PerformanceAnalyticsService.getPerformanceSummary(org, 1);
  
  if (summary.errorRatePercent > 2.0) {
    await PerformanceAnalyticsService.createRecommendation({
      organizationId: org,
      title: 'High Error Rate Detected',
      recommendationType: 'optimization',
      estimatedImprovementPercent: 50,
      implementationEffort: 'low',
      // ...
    });
  }
}, 86400000); // Daily
```

### 5. Trend Analysis

Detect degradation patterns:

```typescript
async detectDegradation(organizationId: string) {
  const comparison = await db.performanceCompareHistory
    .findMany({
      where: { organizationId },
      orderBy: { recordedAt: 'desc' },
      take: 7,
    });
  
  for (const comp of comparison) {
    if (comp.percentChangeFromWeekAgo > 20) {
      console.warn(`${comp.metricName} degraded 20%+ vs week ago`);
    }
  }
}
```

---

## Implementation Guide

### Step 1: Initialize Performance Analytics

```typescript
// Ensure schema exists
import { db } from '@/src/db';
import { performanceSnapshots, sloDefinitions } from '@/src/db/performanceSchema';

// Initialize with service methods available
const analyticsService = PerformanceAnalyticsService;
```

### Step 2: Record Baseline Metrics

```typescript
// Collect metrics from Phase 4.1 Observability
const metrics = await ObservabilityService.getPerformanceSummary(orgId, 1);

// Convert to snapshot
const snapshot = await analyticsService.recordPerformanceSnapshot({
  organizationId: orgId,
  snapshotPeriod: '1d',
  totalRequests: metrics.totalRequests,
  // ... map all metrics
});
```

### Step 3: Define SLOs

```typescript
// Create SLOs for critical services
await analyticsService.defineSLO({
  organizationId: orgId,
  name: 'API Availability',
  service: 'api',
  metricName: 'availability',
  targetPercentage: 99.9,
  evaluationWindowDays: 30,
});
```

### Step 4: Set Up Benchmarks

```typescript
// Define performance targets
await analyticsService.createOrUpdateBenchmark({
  organizationId: orgId,
  name: 'API Latency Target',
  metricName: 'latency_p95',
  targetValue: 500,
  warningThreshold: 800,
  criticalThreshold: 1500,
  createdBy: adminUserId,
});
```

### Step 5: Create Dashboard Templates

```typescript
// Build reusable dashboards
const templates = await analyticsService.getSystemTemplates(orgId);
// Customize as needed
```

---

## Roadmap

### Phase 4.2 Complete (Current)

✅ Performance Snapshots - Aggregated metrics
✅ Service Health - Real-time monitoring
✅ SLO Management - Error budget tracking
✅ Performance Benchmarks - Target tracking
✅ AI Recommendations - Automated suggestions
✅ Widget Templates - Reusable dashboards
✅ Performance Comparisons - Trend analysis

### Phase 4.3: Error Tracking & Advanced Alerting

- Sentry integration for error tracking
- Alert routing and escalation
- On-call scheduling
- Incident management

### Phase 4.4: Usage Analytics & Insights

- Funnel analysis
- Cohort tracking
- User retention metrics
- Feature adoption tracking

### Phase 4.5: Cost Analytics & Optimization

- Cost breakdown by service
- Cost forecasting
- Waste detection
- Reserved capacity optimization

---

## Support & Questions

For implementation questions or issues:

1. Review database schema definitions
2. Check service method documentation
3. Review API endpoint examples
4. See usage examples for common patterns
5. Consult best practices section for recommendations

Last Updated: January 2024
Phase: 4.2 - Performance Analytics
Status: Complete
