import { pgTable, text, uuid, timestamp, boolean, jsonb, varchar, decimal, numeric, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * PERFORMANCE ANALYTICS SCHEMA - Phase 4.2
 *
 * Extends observability with:
 * - Performance analytics and dashboards
 * - Real-time performance monitoring
 * - Performance benchmarking and trends
 * - Service health monitoring
 * - Widget templates and custom dashboards
 * - Performance insights and recommendations
 */

/**
 * performance_snapshots
 * Time-based snapshots of performance metrics for trend analysis
 */
export const performanceSnapshots = pgTable(
  "performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    workspace_id: uuid("workspace_id"),
    
    // Snapshot Metadata
    snapshot_date: timestamp("snapshot_date").notNull(), // Daily/hourly snapshot
    snapshot_period: text("snapshot_period").notNull(), // '1h' | '1d' | '1w' | '1m'
    
    // Request Metrics
    total_requests: numeric("total_requests", { precision: 20, scale: 0 }).default(0),
    successful_requests: numeric("successful_requests", { precision: 20, scale: 0 }).default(0),
    failed_requests: numeric("failed_requests", { precision: 20, scale: 0 }).default(0),
    total_timeout_requests: numeric("total_timeout_requests", { precision: 20, scale: 0 }).default(0),
    
    // Response Time
    p50_latency_ms: numeric("p50_latency_ms", { precision: 10, scale: 2 }),
    p95_latency_ms: numeric("p95_latency_ms", { precision: 10, scale: 2 }),
    p99_latency_ms: numeric("p99_latency_ms", { precision: 10, scale: 2 }),
    avg_latency_ms: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
    
    // Status Codes
    status_code_breakdown: jsonb("status_code_breakdown"), // {200: 1000, 500: 50, 429: 10}
    
    // Error Rates
    error_rate_percent: numeric("error_rate_percent", { precision: 5, scale: 2 }),
    timeout_rate_percent: numeric("timeout_rate_percent", { precision: 5, scale: 2 }),
    
    // Resource Usage
    avg_memory_mb: numeric("avg_memory_mb", { precision: 10, scale: 2 }),
    avg_cpu_percent: numeric("avg_cpu_percent", { precision: 5, scale: 2 }),
    peak_memory_mb: numeric("peak_memory_mb", { precision: 10, scale: 2 }),
    peak_cpu_percent: numeric("peak_cpu_percent", { precision: 5, scale: 2 }),
    
    // Database
    db_query_count: numeric("db_query_count", { precision: 20, scale: 0 }),
    avg_db_query_latency_ms: numeric("avg_db_query_latency_ms", { precision: 10, scale: 2 }),
    database_error_count: numeric("database_error_count", { precision: 10, scale: 0 }),
    
    // LLM/Model
    llm_invocation_count: numeric("llm_invocation_count", { precision: 20, scale: 0 }),
    llm_tokens_processed: numeric("llm_tokens_processed", { precision: 20, scale: 0 }),
    llm_avg_latency_ms: numeric("llm_avg_latency_ms", { precision: 10, scale: 2 }),
    llm_cost_usd: numeric("llm_cost_usd", { precision: 10, scale: 4 }),
    
    // Cache
    cache_hit_count: numeric("cache_hit_count", { precision: 20, scale: 0 }),
    cache_miss_count: numeric("cache_miss_count", { precision: 20, scale: 0 }),
    cache_hit_ratio: numeric("cache_hit_ratio", { precision: 5, scale: 2 }),
    
    // Metadata
    tags: jsonb("tags"),
    metadata: jsonb("metadata"),
    
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("perf_snapshots_org_idx").on(table.organization_id),
    index("perf_snapshots_date_idx").on(table.snapshot_date),
    index("perf_snapshots_period_idx").on(table.snapshot_period),
  ]
);

/**
 * widget_templates
 * Reusable dashboard widget templates
 */
export const widgetTemplates = pgTable(
  "widget_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Template Metadata
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    widget_type: text("widget_type").notNull(), // 'line_chart' | 'bar_chart' | 'stat' | 'gauge' | 'table'
    
    // Template Configuration
    config: jsonb("config").notNull(),
    // {
    //   metrics: ['api.latency_ms', 'api.error_rate'],
    //   title: 'API Performance',
    //   yAxis: 'milliseconds',
    //   timeRange: '1h',
    //   aggregation: 'mean'
    // }
    
    // Display
    is_public: boolean("is_public").default(false),
    is_system_template: boolean("is_system_template").default(false),
    
    // Category
    category: text("category"), // 'system' | 'application' | 'business' | 'llm'
    tags: jsonb("tags"),
    
    // Metadata
    created_by: uuid("created_by"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("widget_templates_org_idx").on(table.organization_id),
    index("widget_templates_type_idx").on(table.widget_type),
    index("widget_templates_category_idx").on(table.category),
  ]
);

/**
 * service_health
 * Real-time health status of services
 */
export const serviceHealth = pgTable(
  "service_health",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Service Identity
    service_name: text("service_name").notNull(), // 'api' | 'chat' | 'executor' | 'byom'
    region: text("region"),
    
    // Health Status
    status: text("status").notNull(), // 'healthy' | 'degraded' | 'unhealthy'
    last_health_check: timestamp("last_health_check").notNull(),
    uptime_percent_24h: numeric("uptime_percent_24h", { precision: 5, scale: 2 }),
    uptime_percent_7d: numeric("uptime_percent_7d", { precision: 5, scale: 2 }),
    uptime_percent_30d: numeric("uptime_percent_30d", { precision: 5, scale: 2 }),
    
    // Current Metrics
    error_rate_percent: numeric("error_rate_percent", { precision: 5, scale: 2 }),
    avg_latency_ms: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
    requests_per_second: numeric("requests_per_second", { precision: 10, scale: 2 }),
    
    // Dependencies
    depends_on: jsonb("depends_on"), // ['database', 'cache', 'external_api']
    dependency_status: jsonb("dependency_status"), // {database: 'healthy', cache: 'degraded'}
    
    // Incidents
    active_incidents: numeric("active_incidents", { precision: 10, scale: 0 }).default(0),
    last_incident_at: timestamp("last_incident_at"),
    mttr_minutes: numeric("mttr_minutes", { precision: 10, scale: 2 }), // Mean time to recovery
    
    // Metadata
    metadata: jsonb("metadata"),
    
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("service_health_org_idx").on(table.organization_id),
    index("service_health_service_idx").on(table.service_name),
    index("service_health_status_idx").on(table.status),
  ]
);

/**
 * performance_recommendations
 * AI-generated performance optimization recommendations
 */
export const performanceRecommendations = pgTable(
  "performance_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id),
    workspace_id: uuid("workspace_id"),
    
    // Recommendation Details
    title: text("title").notNull(),
    description: text("description").notNull(),
    recommendation_type: text("recommendation_type").notNull(), // 'caching' | 'indexing' | 'scaling' | 'optimization'
    
    // Impact
    estimated_improvement_percent: numeric("estimated_improvement_percent", { precision: 5, scale: 2 }),
    affected_metric: text("affected_metric"), // 'latency' | 'error_rate' | 'cost'
    
    // Implementation
    implementation_effort: text("implementation_effort"), // 'low' | 'medium' | 'high'
    estimated_time_hours: numeric("estimated_time_hours", { precision: 10, scale: 1 }),
    implementation_steps: jsonb("implementation_steps"), // Array of steps
    
    // Status
    status: text("status").notNull().default("new"), // 'new' | 'acknowledged' | 'implemented' | 'dismissed'
    implemented_at: timestamp("implemented_at"),
    
    // Analysis
    analysis: jsonb("analysis"), // Detailed analysis data
    
    // Audit
    created_at: timestamp("created_at").notNull().defaultNow(),
    created_by: text("created_by"), // 'AI' | user_id
  },
  (table) => [
    index("perf_rec_org_idx").on(table.organization_id),
    index("perf_rec_type_idx").on(table.recommendation_type),
    index("perf_rec_status_idx").on(table.status),
  ]
);

/**
 * performance_benchmarks
 * Track performance against benchmarks over time
 */
export const performanceBenchmarks = pgTable(
  "performance_benchmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Benchmark Details
    name: text("name").notNull(),
    description: text("description"),
    metric_name: text("metric_name").notNull(), // 'api.latency_ms' | 'error_rate'
    
    // Targets
    target_value: numeric("target_value", { precision: 20, scale: 6 }).notNull(),
    lower_bound: numeric("lower_bound", { precision: 20, scale: 6 }),
    upper_bound: numeric("upper_bound", { precision: 20, scale: 6 }),
    
    // Thresholds
    warning_threshold: numeric("warning_threshold", { precision: 20, scale: 6 }),
    critical_threshold: numeric("critical_threshold", { precision: 20, scale: 6 }),
    
    // Current Status
    current_value: numeric("current_value", { precision: 20, scale: 6 }),
    status: text("status"), // 'on_track' | 'warning' | 'critical' | 'exceeded'
    last_updated: timestamp("last_updated"),
    
    // Tracking
    is_active: boolean("is_active").notNull().default(true),
    created_by: uuid("created_by"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("benchmarks_org_idx").on(table.organization_id),
    index("benchmarks_metric_idx").on(table.metric_name),
    index("benchmarks_status_idx").on(table.status),
  ]
);

/**
 * slo_definitions
 * Service Level Objectives (SLOs) for compliance and monitoring
 */
export const sloDefinitions = pgTable(
  "slo_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // SLO Details
    name: text("name").notNull(),
    description: text("description"),
    service: text("service"),
    
    // SLI (Service Level Indicator)
    metric_name: text("metric_name").notNull(),
    comparison_operator: text("comparison_operator"), // 'greater_than' | 'less_than'
    threshold_value: numeric("threshold_value", { precision: 20, scale: 6 }).notNull(),
    
    // Time Window
    evaluation_window_days: numeric("evaluation_window_days", { precision: 10, scale: 0 }),
    
    // Targets
    target_percentage: numeric("target_percentage", { precision: 5, scale: 2 }), // 99.9%
    error_budget_percent: numeric("error_budget_percent", { precision: 5, scale: 2 }), // 0.1%
    
    // Current Status
    current_percentage: numeric("current_percentage", { precision: 5, scale: 2 }),
    error_budget_remaining_percent: numeric("error_budget_remaining_percent", { precision: 5, scale: 2 }),
    status: text("status"), // 'on_track' | 'at_risk' | 'violated'
    
    // Tracking
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("slo_org_idx").on(table.organization_id),
    index("slo_service_idx").on(table.service),
    index("slo_status_idx").on(table.status),
  ]
);

/**
 * performance_compare_history
 * Historical performance data for trend analysis and comparison
 */
export const performanceCompareHistory = pgTable(
  "performance_compare_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Time Periods
    period_start: timestamp("period_start").notNull(),
    period_end: timestamp("period_end").notNull(),
    
    // Comparison Data
    metric_name: text("metric_name").notNull(),
    current_value: numeric("current_value", { precision: 20, scale: 6 }),
    previous_period_value: numeric("previous_period_value", { precision: 20, scale: 6 }),
    week_ago_value: numeric("week_ago_value", { precision: 20, scale: 6 }),
    month_ago_value: numeric("month_ago_value", { precision: 20, scale: 6 }),
    
    // Change Metrics
    percent_change_vs_previous: numeric("percent_change_vs_previous", { precision: 10, scale: 2 }),
    percent_change_vs_week_ago: numeric("percent_change_vs_week_ago", { precision: 10, scale: 2 }),
    percent_change_vs_month_ago: numeric("percent_change_vs_month_ago", { precision: 10, scale: 2 }),
    
    // Trend
    trend_direction: text("trend_direction"), // 'improving' | 'stable' | 'degrading'
    trend_severity: text("trend_severity"), // 'low' | 'medium' | 'high'
    
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("perf_compare_org_idx").on(table.organization_id),
    index("perf_compare_metric_idx").on(table.metric_name),
    index("perf_compare_period_idx").on(table.period_start, table.period_end),
  ]
);

// Relations
export const performanceSnapshotsRelations = relations(performanceSnapshots, ({ one }) => ({
  organization: one(tenantRegistry, {
    fields: [performanceSnapshots.organization_id],
    references: [organizationRegistry.organization_id],
  }),
}));

export const widgetTemplatesRelations = relations(widgetTemplates, ({ one }) => ({
  organization: one(tenantRegistry, {
    fields: [widgetTemplates.organization_id],
    references: [organizationRegistry.organization_id],
  }),
}));

export const serviceHealthRelations = relations(serviceHealth, ({ one }) => ({
  organization: one(tenantRegistry, {
    fields: [serviceHealth.organization_id],
    references: [organizationRegistry.organization_id],
  }),
}));

export const performanceRecommendationsRelations = relations(
  performanceRecommendations,
  ({ one }) => ({
    organization: one(tenantRegistry, {
      fields: [performanceRecommendations.organization_id],
      references: [organizationRegistry.organization_id],
    }),
  })
);

export const performanceBenchmarksRelations = relations(performanceBenchmarks, ({ one }) => ({
  organization: one(tenantRegistry, {
    fields: [performanceBenchmarks.organization_id],
    references: [organizationRegistry.organization_id],
  }),
}));

export const sloDefinitionsRelations = relations(sloDefinitions, ({ one }) => ({
  organization: one(tenantRegistry, {
    fields: [sloDefinitions.organization_id],
    references: [organizationRegistry.organization_id],
  }),
}));

export const performanceCompareHistoryRelations = relations(
  performanceCompareHistory,
  ({ one }) => ({
    organization: one(tenantRegistry, {
      fields: [performanceCompareHistory.organization_id],
      references: [organizationRegistry.organization_id],
    }),
  })
);

// Placeholder for imports
const tenantRegistry = pgTable("tenant_registry", {
  organization_id: uuid("organization_id"),
});
const organizationRegistry = pgTable("tenant_registry", {
  organization_id: uuid("organization_id"),
});
