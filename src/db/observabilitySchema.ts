import { pgTable, text, uuid, timestamp, boolean, jsonb, varchar, decimal, numeric, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const extraConfig = <T>(...config: T[]) =>
  Object.fromEntries(config.map((item, idx) => [`config_${idx}`, item])) as Record<string, T>;

/**
 * OBSERVABILITY SCHEMA - Phase 4.1
 *
 * Comprehensive monitoring and observability system with:
 * - Metrics collection (time-series) for performance monitoring
 * - Structured logging for debugging and auditing
 * - Distributed tracing for request flow analysis
 * - Event tracking for business and system events
 * - Anomaly detection for proactive alerting
 * - Real-time dashboards and analytics
 */

/**
 * metrics
 * Time-series metrics for system and application monitoring
 */
export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Metric Identity
    metric_name: text("metric_name").notNull(),
    metric_type: text("metric_type").notNull(), // 'counter' | 'gauge' | 'histogram' | 'summary'
    
    // Dimensions (labels for grouping)
    service: text("service"), // 'api' | 'chat' | 'executor' | 'byom'
    endpoint: text("endpoint"),
    method: text("method"), // 'GET' | 'POST'
    status_code: text("status_code"),
    user_id: uuid("user_id"),
    model_id: uuid("model_id"),
    workspace_id: uuid("workspace_id"),
    
    // Values
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    
    // Statistics (for aggregated metrics)
    min_value: numeric("min_value", { precision: 20, scale: 6 }),
    max_value: numeric("max_value", { precision: 20, scale: 6 }),
    mean_value: numeric("mean_value", { precision: 20, scale: 6 }),
    std_dev: numeric("std_dev", { precision: 20, scale: 6 }),
    percentile_50: numeric("percentile_50", { precision: 20, scale: 6 }),
    percentile_95: numeric("percentile_95", { precision: 20, scale: 6 }),
    percentile_99: numeric("percentile_99", { precision: 20, scale: 6 }),
    
    // Timestamps
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    recorded_at: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    
    // Metadata
    tags: jsonb("tags"),
    metadata: jsonb("metadata"),
  },
  (table) => extraConfig(
    index("metrics_org_idx").on(table.organization_id),
    index("metrics_name_idx").on(table.metric_name),
    index("metrics_service_idx").on(table.service),
    index("metrics_timestamp_idx").on(table.timestamp),
    index("metrics_user_idx").on(table.user_id),
    index("metrics_endpoint_idx").on(table.endpoint),
  )
);

/**
 * logs
 * Structured application logs with context and filtering
 */
export const logs = pgTable(
  "logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Log Identity
    log_level: text("log_level").notNull(), // 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
    logger_name: text("logger_name"),
    message: text("message").notNull(),
    
    // Context
    service: text("service"),
    endpoint: text("endpoint"),
    request_id: text("request_id"),
    trace_id: text("trace_id"),
    user_id: uuid("user_id"),
    workspace_id: uuid("workspace_id"),
    
    // Error Details
    error_code: text("error_code"),
    error_type: text("error_type"),
    error_stack: text("error_stack"),
    error_message: text("error_message"),
    
    // Performance
    duration_ms: numeric("duration_ms", { precision: 10, scale: 2 }),
    response_size_bytes: numeric("response_size_bytes", { precision: 20, scale: 0 }),
    
    // HTTP Context
    method: text("method"),
    url: text("url"),
    status_code: text("status_code"),
    user_agent: text("user_agent"),
    ip_address: text("ip_address"),
    
    // Structured Data
    context: jsonb("context"),
    tags: jsonb("tags"),
    metadata: jsonb("metadata"),
    
    // Timestamps
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => extraConfig(
    index("logs_org_idx").on(table.organization_id),
    index("logs_level_idx").on(table.log_level),
    index("logs_service_idx").on(table.service),
    index("logs_trace_id_idx").on(table.trace_id),
    index("logs_user_idx").on(table.user_id),
    index("logs_timestamp_idx").on(table.timestamp),
    index("logs_error_idx").on(table.error_code),
  )
);

/**
 * traces
 * Distributed trace headers for request tracking across services
 */
export const traces = pgTable(
  "traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Trace Identity
    trace_id: text("trace_id").notNull().unique(),
    parent_trace_id: text("parent_trace_id"),
    
    // Root Request
    root_service: text("root_service"),
    root_endpoint: text("root_endpoint"),
    root_method: text("root_method"),
    
    // Execution Summary
    total_duration_ms: numeric("total_duration_ms", { precision: 10, scale: 2 }),
    span_count: numeric("span_count", { precision: 10, scale: 0 }),
    error_span_count: numeric("error_span_count", { precision: 10, scale: 0 }),
    
    // Status
    status: text("status").notNull(), // 'success' | 'error' | 'timeout' | 'cancelled'
    error_code: text("error_code"),
    error_message: text("error_message"),
    
    // Context
    user_id: uuid("user_id"),
    workspace_id: uuid("workspace_id"),
    session_id: text("session_id"),
    
    // Request Details
    http_method: text("http_method"),
    http_url: text("http_url"),
    http_status: text("http_status"),
    user_agent: text("user_agent"),
    client_ip: text("client_ip"),
    
    // Sampling and Debugging
    is_sampled: boolean("is_sampled").default(false),
    is_debug: boolean("is_debug").default(false),
    sampling_priority: numeric("sampling_priority", { precision: 5, scale: 2 }),
    
    // Metadata
    tags: jsonb("tags"),
    baggage: jsonb("baggage"), // Cross-service context
    metadata: jsonb("metadata"),
    
    // Timestamps
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }),
  },
  (table) => extraConfig(
    index("traces_org_idx").on(table.organization_id),
    index("traces_id_idx").on(table.trace_id),
    index("traces_parent_idx").on(table.parent_trace_id),
    index("traces_user_idx").on(table.user_id),
    index("traces_status_idx").on(table.status),
    index("traces_start_time_idx").on(table.start_time),
  )
);

/**
 * trace_spans
 * Individual spans within a trace (service calls, database queries, external APIs)
 */
export const traceSpans = pgTable(
  "trace_spans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trace_id: text("trace_id").notNull(),
    
    // Span Identity
    span_id: text("span_id").notNull(),
    parent_span_id: text("parent_span_id"),
    
    // Operation
    operation_name: text("operation_name").notNull(), // 'http.request' | 'db.query' | 'cache.get'
    service_name: text("service_name"),
    operation_type: text("operation_type"), // 'internal' | 'http' | 'db' | 'cache' | 'external'
    
    // Timing
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }).notNull(),
    duration_ms: numeric("duration_ms", { precision: 10, scale: 2 }),
    
    // Status
    status: text("status").notNull(), // 'unset' | 'ok' | 'error'
    status_code: text("status_code"),
    error_message: text("error_message"),
    is_error: boolean("is_error").default(false),
    
    // Details
    attributes: jsonb("attributes"), // Operation-specific details
    events: jsonb("events"), // Span events
    links: jsonb("links"), // Links to other spans
    
    // Resource
    resource_attributes: jsonb("resource_attributes"), // {service.name, service.version}
    
    // Metrics
    metrics: jsonb("metrics"), // {latency_ms, bytes_transferred}
  },
  (table) => extraConfig(
    index("spans_trace_idx").on(table.trace_id),
    index("spans_span_idx").on(table.span_id),
    index("spans_operation_idx").on(table.operation_name),
    index("spans_service_idx").on(table.service_name),
    index("spans_start_time_idx").on(table.start_time),
    index("spans_error_idx").on(table.is_error),
  )
);

/**
 * events
 * Business and system events for analytics
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Event Identity
    event_type: text("event_type").notNull(), // 'user.login' | 'model.invoked' | 'workspace.created'
    event_category: text("event_category"), // 'user' | 'model' | 'workspace' | 'system'
    
    // Actor and Target
    actor_id: uuid("actor_id"),
    actor_type: text("actor_type"), // 'user' | 'service' | 'system'
    target_id: uuid("target_id"),
    target_type: text("target_type"), // 'user' | 'model' | 'workspace'
    
    // Context
    user_id: uuid("user_id"),
    workspace_id: uuid("workspace_id"),
    session_id: text("session_id"),
    request_id: text("request_id"),
    trace_id: text("trace_id"),
    
    // Properties
    properties: jsonb("properties"), // Event-specific data
    dimensions: jsonb("dimensions"), // Grouping dimensions
    metrics: jsonb("metrics"), // Associated metrics
    
    // Status
    status: text("status"), // 'initiated' | 'completed' | 'failed'
    error_code: text("error_code"),
    
    // Timestamps
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    duration_ms: numeric("duration_ms", { precision: 10, scale: 2 }),
  },
  (table) => extraConfig(
    index("events_org_idx").on(table.organization_id),
    index("events_type_idx").on(table.event_type),
    index("events_category_idx").on(table.event_category),
    index("events_user_idx").on(table.user_id),
    index("events_timestamp_idx").on(table.timestamp),
    index("events_actor_idx").on(table.actor_id),
  )
);

/**
 * anomalies
 * Detected anomalies for alerting
 */
export const anomalies = pgTable(
  "anomalies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    
    // Anomaly Details
    anomaly_type: text("anomaly_type").notNull(), // 'spike' | 'drop' | 'trend' | 'outlier'
    severity: text("severity").notNull(), // 'info' | 'warning' | 'critical'
    
    // Metric
    metric_name: text("metric_name"),
    baseline_value: numeric("baseline_value", { precision: 20, scale: 6 }),
    anomalous_value: numeric("anomalous_value", { precision: 20, scale: 6 }),
    deviation_percent: numeric("deviation_percent", { precision: 10, scale: 2 }),
    
    // Context
    service: text("service"),
    endpoint: text("endpoint"),
    user_id: uuid("user_id"),
    workspace_id: uuid("workspace_id"),
    
    // Detection
    detection_rule: text("detection_rule"),
    confidence_score: numeric("confidence_score", { precision: 5, scale: 2 }),
    
    // Status
    status: text("status").notNull().default("open"), // 'open' | 'acknowledged' | 'resolved'
    acknowledged_at: timestamp("acknowledged_at"),
    resolved_at: timestamp("resolved_at"),
    
    // Analysis
    analysis: jsonb("analysis"), // Root cause analysis
    tags: jsonb("tags"),
    
    // Timestamps
    detected_at: timestamp("detected_at").notNull().defaultNow(),
  },
  (table) => extraConfig(
    index("anomalies_org_idx").on(table.organization_id),
    index("anomalies_type_idx").on(table.anomaly_type),
    index("anomalies_severity_idx").on(table.severity),
    index("anomalies_status_idx").on(table.status),
    index("anomalies_detected_idx").on(table.detected_at),
  )
);

/**
 * alerting_rules
 * Define alerting rules for metrics and logs
 */
export const alertingRules = pgTable(
  "alerting_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    workspace_id: uuid("workspace_id"),
    
    // Rule Definition
    name: text("name").notNull(),
    description: text("description"),
    rule_type: text("rule_type").notNull(), // 'threshold' | 'rate' | 'cardinality' | 'absence'
    
    // Trigger
    metric_name: text("metric_name"),
    condition: text("condition"), // 'greater_than' | 'less_than' | 'equals'
    threshold_value: numeric("threshold_value", { precision: 20, scale: 6 }),
    evaluation_window_seconds: numeric("evaluation_window_seconds", { precision: 10, scale: 0 }).default("300"),
    datapoints_required: numeric("datapoints_required", { precision: 10, scale: 0 }).default("3"),
    
    // Filters
    filters: jsonb("filters"), // {service: 'api', endpoint: '/chat/*'}
    
    // Actions
    actions: jsonb("actions"), // [{type: 'email', recipients: ['admin@example.com']}]
    
    // Status
    is_enabled: boolean("is_enabled").notNull().default(true),
    
    // Metadata
    created_by: uuid("created_by"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => extraConfig(
    index("alert_rules_org_idx").on(table.organization_id),
    index("alert_rules_enabled_idx").on(table.is_enabled),
    index("alert_rules_metric_idx").on(table.metric_name),
  )
);

/**
 * dashboard_configs
 * Save and manage custom dashboards
 */
export const dashboardConfigs = pgTable(
  "dashboard_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id"),
    workspace_id: uuid("workspace_id"),
    created_by: uuid("created_by"),
    
    // Dashboard Metadata
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    dashboard_type: text("dashboard_type"), // 'system' | 'application' | 'business' | 'custom'
    
    // Layout and Widgets
    layout: jsonb("layout"), // Grid layout configuration
    widgets: jsonb("widgets"), // Array of widget configs with metrics, charts, tables
    
    // Settings
    refresh_interval_seconds: numeric("refresh_interval_seconds", { precision: 10, scale: 0 }).default("60"),
    time_range_default: text("time_range_default").default('1h'), // '1h' | '24h' | '7d'
    is_default: boolean("is_default").default(false),
    is_public: boolean("is_public").default(false),
    
    // Audit
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => extraConfig(
    index("dashboards_org_idx").on(table.organization_id),
    index("dashboards_creator_idx").on(table.created_by),
    index("dashboards_default_idx").on(table.is_default),
  )
);

// Relations
export const metricsRelations = relations(metrics, ({ one }) => ({
  // Related to organization if needed
}));

export const logsRelations = relations(logs, ({ one }) => ({
  trace: one(traces, {
    fields: [logs.trace_id],
    references: [traces.trace_id],
  }),
}));

export const tracesRelations = relations(traces, ({ many, one }) => ({
  spans: many(traceSpans),
  logs: many(logs),
}));

export const traceSpansRelations = relations(traceSpans, ({ one }) => ({
  trace: one(traces, {
    fields: [traceSpans.trace_id],
    references: [traces.trace_id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  trace: one(traces, {
    fields: [events.trace_id],
    references: [traces.trace_id],
  }),
}));

export const anomaliesRelations = relations(anomalies, ({ one }) => ({
  // Related to metric or trace
}));

export const alertingRulesRelations = relations(alertingRules, ({ one }) => ({
  organization: one(tenantRegistry, {
    fields: [alertingRules.organization_id],
    references: [organizationRegistry.organization_id],
  }),
}));

export const dashboardConfigsRelations = relations(dashboardConfigs, ({ one }) => ({
  organization: one(tenantRegistry, {
    fields: [dashboardConfigs.organization_id],
    references: [organizationRegistry.organization_id],
  }),
}));

// Import tenant registry for relations (placeholder - actual import in service)
const tenantRegistry = pgTable("tenant_registry", {
  organization_id: uuid("organization_id"),
});
const organizationRegistry = pgTable("tenant_registry", {
  organization_id: uuid("organization_id"),
});
