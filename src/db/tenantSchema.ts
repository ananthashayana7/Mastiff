import { pgTable, text, uuid, timestamp, boolean, jsonb, varchar, decimal, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * TENANT SCHEMA - Multi-tenant Isolation and Management
 *
 * Supports complete logical isolation of organizations with:
 * - Separate data storage per tenant
 * - Tenant-aware queries
 * - Data residency
 * - Feature flags per tenant
 * - Billing and resource quotas
 * - Compliance requirements
 * - Tenant suspension/termination
 */

/**
 * tenant_registry
 * Global registry of all tenants with configuration and compliance metadata
 */
export const tenantRegistry = pgTable(
  "tenant_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull().unique(),

    // Organization Identity
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    logo_url: text("logo_url"),
    website: text("website"),

    // Tier and Billing
    tier: text("tier").notNull().default("free"), // 'free' | 'pro' | 'enterprise' | 'custom'
    billing_cycle: text("billing_cycle").notNull().default("monthly"), // 'monthly' | 'yearly'
    billing_email: text("billing_email").notNull(),
    stripe_customer_id: text("stripe_customer_id").unique(),
    billing_status: text("billing_status").notNull().default("active"), // 'active' | 'suspended' | 'cancelled'

    // Data Residency and Compliance
    data_region: text("data_region").notNull().default("us-east-1"), // AWS region
    compliance_requirements: jsonb("compliance_requirements"), // {hipaa: true, gdpr: true, sox: true, pci: false}
    hipaa_enabled: boolean("hipaa_enabled").default(false),
    gdpr_enabled: boolean("gdpr_enabled").default(false),
    sox_enabled: boolean("sox_enabled").default(false),
    pci_enabled: boolean("pci_enabled").default(false),

    // Feature Flags
    features: jsonb("features"), // {customAgents: true, byom: true, samlSSO: true}
    feature_flags: jsonb("feature_flags"), // {maxModels: 50, maxWorkspaces: 10}

    // Resource Quotas
    max_users: decimal("max_users", { precision: 10, scale: 0 }),
    max_workspaces: decimal("max_workspaces", { precision: 10, scale: 0 }),
    max_models: decimal("max_models", { precision: 10, scale: 0 }),
    max_daily_tokens: decimal("max_daily_tokens", { precision: 20, scale: 0 }),
    max_storage_gb: decimal("max_storage_gb", { precision: 10, scale: 2 }),
    max_agents: decimal("max_agents", { precision: 10, scale: 0 }),

    // Status
    is_active: boolean("is_active").notNull().default(true),
    is_suspended: boolean("is_suspended").notNull().default(false),
    suspension_reason: text("suspension_reason"),
    suspension_date: timestamp("suspension_date"),

    // API Access
    has_api_access: boolean("has_api_access").notNull().default(false),
    api_rate_limit: decimal("api_rate_limit", { precision: 10, scale: 0 }).default("1000"), // requests per minute

    // Support and Contacts
    support_tier: text("support_tier").default("community"), // 'community' | 'standard' | 'premium' | 'enterprise'
    primary_contact_email: text("primary_contact_email"),
    technical_contact_email: text("technical_contact_email"),

    // Metadata
    metadata: jsonb("metadata"),
    custom_config: jsonb("custom_config"),

    // Audit
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
    onboarded_at: timestamp("onboarded_at"),
  },
  (table) => ({
    slugIdx: index("tenant_slug_idx").on(table.slug),
    organizationIdIdx: index("tenant_org_id_idx").on(table.organization_id),
    tierIdx: index("tenant_tier_idx").on(table.tier),
    regionIdx: index("tenant_region_idx").on(table.data_region),
  })
);

/**
 * tenant_databases
 * Track database connections and schema isolation per tenant
 */
export const tenantDatabases = pgTable(
  "tenant_databases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull(),

    // Database Configuration
    database_name: text("database_name").notNull(),
    schema_name: text("schema_name").notNull().unique(),
    connection_string: text("connection_string").notNull(), // Encrypted
    encryption_key: text("encryption_key"), // For tenant data encryption
    is_primary: boolean("is_primary").notNull().default(false),

    // Replication
    read_replica_count: decimal("read_replica_count", { precision: 5, scale: 0 }),
    is_replicated: boolean("is_replicated").default(false),

    // Connection Pool
    max_connections: decimal("max_connections", { precision: 10, scale: 0 }).default("100"),
    current_connections: decimal("current_connections", { precision: 10, scale: 0 }).default("0"),

    // Status
    is_active: boolean("is_active").notNull().default(true),
    last_health_check: timestamp("last_health_check"),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("tenant_db_org_idx").on(table.organization_id),
    schemaNameIdx: index("tenant_db_schema_idx").on(table.schema_name),
  })
);

/**
 * tenant_isolation_policies
 * Define row-level security policies for tenant data
 */
export const tenantIsolationPolicies = pgTable(
  "tenant_isolation_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull(),

    // Policy Definition
    policy_name: text("policy_name").notNull(),
    table_name: text("table_name").notNull(),
    policy_type: text("policy_type").notNull(), // 'organization' | 'workspace' | 'user'

    // RLS Configuration
    rls_expression: text("rls_expression").notNull(), // PostgreSQL RLS policy
    is_enabled: boolean("is_enabled").notNull().default(true),

    // Enforcement
    enforce_on_write: boolean("enforce_on_write").notNull().default(true),
    enforce_on_read: boolean("enforce_on_read").notNull().default(true),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("isolation_policy_org_idx").on(table.organization_id),
    tableNameIdx: index("isolation_policy_table_idx").on(table.table_name),
  })
);

/**
 * tenant_resources
 * Track resource usage per tenant for billing and quota enforcement
 */
export const tenantResources = pgTable(
  "tenant_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull(),
    period_start: timestamp("period_start").notNull(),
    period_end: timestamp("period_end").notNull(),

    // Compute Usage
    total_api_calls: decimal("total_api_calls", { precision: 20, scale: 0 }).default("0"),
    total_tokens_processed: decimal("total_tokens_processed", { precision: 20, scale: 0 }).default("0"),
    total_compute_seconds: decimal("total_compute_seconds", { precision: 20, scale: 2 }).default("0"),

    // Storage Usage
    database_size_gb: decimal("database_size_gb", { precision: 15, scale: 2 }).default("0"),
    file_storage_gb: decimal("file_storage_gb", { precision: 15, scale: 2 }).default("0"),
    backup_storage_gb: decimal("backup_storage_gb", { precision: 15, scale: 2 }).default("0"),

    // Peak Metrics
    peak_concurrent_connections: decimal("peak_concurrent_connections", { precision: 10, scale: 0 }),
    peak_daily_api_calls: decimal("peak_daily_api_calls", { precision: 20, scale: 0 }),
    peak_daily_tokens: decimal("peak_daily_tokens", { precision: 20, scale: 0 }),

    // Cost Calculation
    estimated_cost_usd: decimal("estimated_cost_usd", { precision: 10, scale: 2 }).default("0"),
    actual_cost_usd: decimal("actual_cost_usd", { precision: 10, scale: 2 }).default("0"),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("tenant_resources_org_idx").on(table.organization_id),
    periodIdx: index("tenant_resources_period_idx").on(table.period_start, table.period_end),
  })
);

/**
 * tenant_compliance_logs
 * Comprehensive audit trail for compliance and security
 */
export const tenantComplianceLogs = pgTable(
  "tenant_compliance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull(),

    // Event Information
    event_type: text("event_type").notNull(), // 'data_access' | 'data_export' | 'user_provision' | 'permission_change' | 'settings_change'
    resource_type: text("resource_type"), // 'user' | 'workspace' | 'document' | 'model'
    resource_id: uuid("resource_id"),

    // Who and What
    actor_id: uuid("actor_id"),
    actor_type: text("actor_type"), // 'user' | 'service' | 'admin'
    action: text("action").notNull(), // 'read' | 'write' | 'delete' | 'export'

    // Details
    details: jsonb("details"), // Additional context
    affected_record_count: decimal("affected_record_count", { precision: 20, scale: 0 }),

    // Data Access Compliance
    data_classification: text("data_classification"), // 'public' | 'internal' | 'confidential' | 'restricted'
    is_pii_accessed: boolean("is_pii_accessed").default(false),
    is_phi_accessed: boolean("is_phi_accessed").default(false),

    // Network and Security
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    request_id: text("request_id"),

    // Result
    status: text("status").notNull(), // 'success' | 'failure' | 'denied'
    reason: text("reason"),

    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("compliance_log_org_idx").on(table.organization_id),
    eventTypeIdx: index("compliance_log_type_idx").on(table.event_type),
    timestampIdx: index("compliance_log_timestamp_idx").on(table.timestamp),
    piiIdx: index("compliance_log_pii_idx").on(table.is_pii_accessed),
  })
);

/**
 * tenant_data_export
 * Track data exports for compliance (GDPR right to data portability)
 */
export const tenantDataExport = pgTable(
  "tenant_data_export",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull(),
    user_id: uuid("user_id").notNull(),

    // Export Details
    export_type: text("export_type").notNull(), // 'user_data' | 'workspace_data' | 'full_export'
    scope: text("scope"), // 'self' | 'workspace' | 'organization'
    format: text("format").notNull().default("json"), // 'json' | 'csv' | 'parquet'

    // Processing
    status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'ready' | 'expired'
    progress_percent: decimal("progress_percent", { precision: 5, scale: 2 }).default("0"),
    download_url: text("download_url"),

    // Size and Timing
    data_size_bytes: decimal("data_size_bytes", { precision: 20, scale: 0 }),
    processing_time_seconds: decimal("processing_time_seconds", { precision: 10, scale: 2 }),
    expires_at: timestamp("expires_at"),

    // Audit
    requested_by: uuid("requested_by"),
    requested_at: timestamp("requested_at").notNull().defaultNow(),
    completed_at: timestamp("completed_at"),
  },
  (table) => ({
    organizationIdIdx: index("data_export_org_idx").on(table.organization_id),
    userIdIdx: index("data_export_user_idx").on(table.user_id),
    statusIdx: index("data_export_status_idx").on(table.status),
  })
);

/**
 * tenant_suspension_history
 * Track tenant suspension/termination history
 */
export const tenantSuspensionHistory = pgTable(
  "tenant_suspension_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull(),

    // Suspension Details
    suspension_type: text("suspension_type").notNull(), // 'automatic' | 'manual' | 'compliance' | 'payment_failure'
    reason_category: text("reason_category"), // 'payment' | 'abuse' | 'compliance' | 'user_request'
    reason_details: text("reason_details"),

    // Timeline
    suspended_at: timestamp("suspended_at").notNull(),
    scheduled_deletion_at: timestamp("scheduled_deletion_at"),
    resolved_at: timestamp("resolved_at"),

    // Resolution
    was_resolved: boolean("was_resolved").default(false),
    resolution_action: text("resolution_action"), // 'reactivated' | 'deleted' | 'migrated'

    // Data Handling
    data_backup_created: boolean("data_backup_created").default(true),
    backup_retention_days: decimal("backup_retention_days", { precision: 5, scale: 0 }).default("30"),

    // Audit
    suspended_by: uuid("suspended_by"),
    resolved_by: uuid("resolved_by"),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("suspension_org_idx").on(table.organization_id),
    suspensionTypeIdx: index("suspension_type_idx").on(table.suspension_type),
  })
);

/**
 * tenant_migrations
 * Track tenant migrations between regions or databases
 */
export const tenantMigrations = pgTable(
  "tenant_migrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id").notNull(),

    // Migration Details
    migration_type: text("migration_type").notNull(), // 'region_change' | 'database_upgrade' | 'consolidation'
    source_region: text("source_region"),
    target_region: text("target_region").notNull(),
    source_database: text("source_database"),
    target_database: text("target_database"),

    // Execution
    scheduled_start: timestamp("scheduled_start"),
    actual_start: timestamp("actual_start"),
    completed_at: timestamp("completed_at"),
    status: text("status").notNull().default("planned"), // 'planned' | 'in_progress' | 'completed' | 'failed' | 'rolled_back'

    // Progress
    total_records: decimal("total_records", { precision: 20, scale: 0 }),
    migrated_records: decimal("migrated_records", { precision: 20, scale: 0 }).default("0"),
    duration_seconds: decimal("duration_seconds", { precision: 10, scale: 2 }),

    // Validation
    pre_migration_validations: jsonb("pre_migration_validations"),
    post_migration_validations: jsonb("post_migration_validations"),
    validation_status: text("validation_status"), // 'passed' | 'failed' | 'pending'

    // Rollback
    can_rollback: boolean("can_rollback").default(true),
    rollback_completed: boolean("rollback_completed").default(false),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    organizationIdIdx: index("migration_org_idx").on(table.organization_id),
    statusIdx: index("migration_status_idx").on(table.status),
  })
);

// Relations
export const tenantRegistryRelations = relations(tenantRegistry, ({ many }) => ({
  databases: many(tenantDatabases),
  policies: many(tenantIsolationPolicies),
  resources: many(tenantResources),
  complianceLogs: many(tenantComplianceLogs),
  dataExports: many(tenantDataExport),
  suspensions: many(tenantSuspensionHistory),
  migrations: many(tenantMigrations),
}));

export const tenantDatabasesRelations = relations(tenantDatabases, ({ one }) => ({
  tenant: one(tenantRegistry, {
    fields: [tenantDatabases.organization_id],
    references: [tenantRegistry.organization_id],
  }),
}));

export const tenantIsolationPoliciesRelations = relations(tenantIsolationPolicies, ({ one }) => ({
  tenant: one(tenantRegistry, {
    fields: [tenantIsolationPolicies.organization_id],
    references: [tenantRegistry.organization_id],
  }),
}));

export const tenantResourcesRelations = relations(tenantResources, ({ one }) => ({
  tenant: one(tenantRegistry, {
    fields: [tenantResources.organization_id],
    references: [tenantRegistry.organization_id],
  }),
}));

export const tenantComplianceLogsRelations = relations(tenantComplianceLogs, ({ one }) => ({
  tenant: one(tenantRegistry, {
    fields: [tenantComplianceLogs.organization_id],
    references: [tenantRegistry.organization_id],
  }),
}));

export const tenantDataExportRelations = relations(tenantDataExport, ({ one }) => ({
  tenant: one(tenantRegistry, {
    fields: [tenantDataExport.organization_id],
    references: [tenantRegistry.organization_id],
  }),
}));

export const tenantSuspensionHistoryRelations = relations(tenantSuspensionHistory, ({ one }) => ({
  tenant: one(tenantRegistry, {
    fields: [tenantSuspensionHistory.organization_id],
    references: [tenantRegistry.organization_id],
  }),
}));

export const tenantMigrationsRelations = relations(tenantMigrations, ({ one }) => ({
  tenant: one(tenantRegistry, {
    fields: [tenantMigrations.organization_id],
    references: [tenantRegistry.organization_id],
  }),
}));
