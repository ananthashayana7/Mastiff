import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  numeric,
  boolean,
  json,
  decimal,
  index,
  foreignKey,
  integer,
  date,
} from 'drizzle-orm/pg-core';

const extraConfig = <T>(...config: T[]) =>
  Object.fromEntries(config.map((item, idx) => [`config_${idx}`, item])) as Record<string, T>;

/**
 * Cost Analytics Schema
 * 
 * Tracks infrastructure costs, consumption metrics, optimization opportunities,
 * and provides cost visibility per service, feature, user, workspace
 * 
 * Core Tables:
 * - serviceUsage: Raw consumption metrics (compute, storage, API calls)
 * - costBreakdown: Aggregated costs per service/dimension
 * - resourceAllocation: Budget allocation and forecasting
 * - costAnomalies: Unusual spending patterns and alerts
 * - usageAccounting: Per-user/workspace/feature cost attribution
 * - unitEconomics: Revenue vs cost analysis
 * - reservedCapacityOptimization: Reserved instance recommendations
 * - costOptimizationOpportunities: Suggested cost savings
 * - monthlyBillingRecord: Monthly invoice data
 * - costAlerts: Real-time spending alerts
 * - costProjections: Forecasted costs based on trends
 * - wastageAnalysis: Underutilized resources
 */

// Core service consumption metrics
export const serviceUsageTable = pgTable(
  'service_usage',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),
    workspaceId: varchar('workspace_id', { length: 255 }),

    // Service identification
    serviceName: varchar('service_name', { length: 255 }).notNull(), // compute, storage, api, llm, etc
    resourceType: varchar('resource_type', { length: 255 }).notNull(), // instance-type, storage-gb, api-calls, etc
    resourceId: varchar('resource_id', { length: 255 }), // specific resource identifier

    // Usage metrics
    unitQuantity: numeric('unit_quantity', { precision: 20, scale: 4 }).notNull(), // e.g. 100.5 for CPU hours
    unitType: varchar('unit_type', { length: 100 }).notNull(), // cpu-hours, storage-gb, api-calls, gpu-hours
    usagePeriodStart: timestamp('usage_period_start').notNull(),
    usagePeriodEnd: timestamp('usage_period_end').notNull(),

    // Billing information
    unitCost: numeric('unit_cost', { precision: 20, scale: 6 }).notNull(), // cost per unit
    totalCost: numeric('total_cost', { precision: 20, scale: 2 }).notNull(), // total for period
    commitmentDiscount: numeric('commitment_discount', { precision: 5, scale: 2 }).default('0'), // % discount
    marketplaceOverride: numeric('marketplace_override', { precision: 20, scale: 6 }),

    // Metadata
    metadata: json('metadata').$type<{
      region?: string;
      tier?: string;
      tags?: Record<string, string>;
      costModel?: string;
    }>(),

    timestamp: timestamp('timestamp').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_service_usage_org').on(t.organizationId),
    index('idx_service_usage_service').on(t.serviceName),
    index('idx_service_usage_period').on(t.usagePeriodStart, t.usagePeriodEnd),
  )
);

// Aggregated cost breakdown by dimensions
export const costBreakdownTable = pgTable(
  'cost_breakdown',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Time period
    periodDate: timestamp('period_date').notNull(), // YYYY-MM-DD 00:00:00
    periodType: varchar('period_type', { length: 50 }).notNull(), // daily, weekly, monthly, hourly
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),

    // Cost breakdown dimensions
    serviceName: varchar('service_name', { length: 255 }).notNull(),
    workspaceId: varchar('workspace_id', { length: 255 }),
    userId: varchar('user_id', { length: 255 }),
    region: varchar('region', { length: 100 }),

    // Costs
    computeCost: numeric('compute_cost', { precision: 20, scale: 2 }).default('0'),
    storageCost: numeric('storage_cost', { precision: 20, scale: 2 }).default('0'),
    networkCost: numeric('network_cost', { precision: 20, scale: 2 }).default('0'),
    databaseCost: numeric('database_cost', { precision: 20, scale: 2 }).default('0'),
    llmServicesCost: numeric('llm_services_cost', { precision: 20, scale: 2 }).default('0'),
    otherCosts: numeric('other_costs', { precision: 20, scale: 2 }).default('0'),
    totalCost: numeric('total_cost', { precision: 20, scale: 2 }).notNull(),

    // Efficiency metrics
    costUtilizationRatio: numeric('cost_utilization_ratio', { precision: 5, scale: 2 }), // efficiency %
    wastedCost: numeric('wasted_cost', { precision: 20, scale: 2 }),
    reservedInstanceSavings: numeric('reserved_instance_savings', { precision: 20, scale: 2 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_cost_breakdown_org').on(t.organizationId),
    index('idx_cost_breakdown_period').on(t.periodDate, t.periodType),
    index('idx_cost_breakdown_service').on(t.serviceName),
  )
);

// Budget allocation and forecasting
export const resourceAllocationTable = pgTable(
  'resource_allocation',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Allocation target
    allocationName: varchar('allocation_name', { length: 255 }).notNull(),
    allocationLevel: varchar('allocation_level', { length: 50 }).notNull(), // organization, workspace, project, team
    targetId: varchar('target_id', { length: 255 }).notNull(), // org/workspace/project/team ID

    // Budget
    monthlyBudgetLimit: numeric('monthly_budget_limit', { precision: 20, scale: 2 }).notNull(),
    currentMonthSpending: numeric('current_month_spending', { precision: 20, scale: 2 }).notNull(),
    percentageOfBudget: numeric('percentage_of_budget', { precision: 5, scale: 2 }).notNull(), // 0-100%
    budgetStatus: varchar('budget_status', { length: 50 }).notNull(), // on_track, warning, exceeded

    // Forecasting
    projectedMonthlySpend: numeric('projected_monthly_spend', { precision: 20, scale: 2 }).notNull(),
    projectedExceedanceAmount: numeric('projected_exceedance_amount', { precision: 20, scale: 2 }),
    forecast30Days: numeric('forecast_30_days', { precision: 20, scale: 2 }),
    forecast90Days: numeric('forecast_90_days', { precision: 20, scale: 2 }),

    // Thresholds
    warningThresholdPercent: numeric('warning_threshold_percent', { precision: 5, scale: 2 }).default('75'),
    criticalThresholdPercent: numeric('critical_threshold_percent', { precision: 5, scale: 2 }).default('90'),

    // Alerts
    emailAlertsEnabled: boolean('email_alerts_enabled').default(true),
    alertEmails: varchar('alert_emails', { length: 1000 }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_resource_allocation_org').on(t.organizationId),
    index('idx_resource_allocation_level').on(t.allocationLevel, t.targetId),
  )
);

// Anomaly detection in spending
export const costAnomaliesTable = pgTable(
  'cost_anomalies',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Anomaly detection
    anomalyType: varchar('anomaly_type', { length: 100 }).notNull(),
    // spike, trend_change, resource_waste, inefficiency_pattern
    severity: varchar('severity', { length: 50 }).notNull(), // low, medium, high, critical

    // What changed
    currentValue: numeric('current_value', { precision: 20, scale: 2 }).notNull(),
    expectedValue: numeric('expected_value', { precision: 20, scale: 2 }).notNull(),
    deviationAmount: numeric('deviation_amount', { precision: 20, scale: 2 }).notNull(),
    deviationPercent: numeric('deviation_percent', { precision: 8, scale: 2 }).notNull(),

    // Context
    serviceName: varchar('service_name', { length: 255 }),
    resourceType: varchar('resource_type', { length: 255 }),
    workspaceId: varchar('workspace_id', { length: 255 }),

    // Metadata
    anomalyMetadata: json('anomaly_metadata').$type<{
      baselineValue?: number;
      sigma?: number; // standard deviations
      detectionMethod?: string;
      relatedResources?: string[];
    }>(),

    // Detection and notification
    detectedAt: timestamp('detected_at').notNull(),
    notificationSent: boolean('notification_sent').default(false),
    acknowledged: boolean('acknowledged').default(false),
    acknowledgedBy: varchar('acknowledged_by', { length: 255 }),
    acknowledgedAt: timestamp('acknowledged_at'),

    // Resolution
    isResolved: boolean('is_resolved').default(false),
    resolutionNotes: text('resolution_notes'),
    resolvedAt: timestamp('resolved_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_cost_anomalies_org').on(t.organizationId),
    index('idx_cost_anomalies_severity').on(t.severity),
  )
);

// Per-user/workspace/feature cost attribution
export const usageAccountingTable = pgTable(
  'usage_accounting',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Attribution dimensions
    accountingLevel: varchar('accounting_level', { length: 50 }).notNull(), // user, workspace, feature, project
    attributedEntityId: varchar('attributed_entity_id', { length: 255 }).notNull(),
    attributedEntityName: varchar('attributed_entity_name', { length: 255 }),

    // Costs
    computeCost: numeric('compute_cost', { precision: 20, scale: 2 }).default('0'),
    storageCost: numeric('storage_cost', { precision: 20, scale: 2 }).default('0'),
    networkCost: numeric('network_cost', { precision: 20, scale: 2 }).default('0'),
    llmCost: numeric('llm_cost', { precision: 20, scale: 2 }).default('0'),
    totalCost: numeric('total_cost', { precision: 20, scale: 2 }).notNull(),

    // Usage
    usageUnits: numeric('usage_units', { precision: 20, scale: 2 }),
    unitType: varchar('unit_type', { length: 100 }),
    costPerUnit: numeric('cost_per_unit', { precision: 20, scale: 6 }),

    // Period
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: varchar('period_type', { length: 50 }).notNull(), // daily, weekly, monthly

    // Associated data
    relatedServiceUsageIds: varchar('related_service_usage_ids', { length: 2000 }), // comma-separated

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_usage_accounting_org').on(t.organizationId),
    index('idx_usage_accounting_entity').on(t.accountingLevel, t.attributedEntityId),
  )
);

// Unit economics (revenue vs cost)
export const unitEconomicsTable = pgTable(
  'unit_economics',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Reporting period
    periodDate: timestamp('period_date').notNull(),
    periodType: varchar('period_type', { length: 50 }).notNull(),

    // User/account metrics
    totalActiveUsers: integer('total_active_users').notNull(),
    newUsersThisPeriod: integer('new_users_this_period').notNull(),
    churnedUsersThisPeriod: integer('churned_users_this_period').notNull(),

    // Revenue
    totalRevenue: numeric('total_revenue', { precision: 20, scale: 2 }).notNull(),
    averageRevenuePerUser: numeric('average_revenue_per_user', { precision: 20, scale: 2 }).notNull(),
    monthlyRecurringRevenue: numeric('monthly_recurring_revenue', { precision: 20, scale: 2 }).notNull(),

    // Costs
    totalCostOfGoodsSold: numeric('total_cost_of_goods_sold', { precision: 20, scale: 2 }).notNull(),
    averageCostPerUser: numeric('average_cost_per_user', { precision: 20, scale: 2 }).notNull(),
    computeCostPercentage: numeric('compute_cost_percentage', { precision: 5, scale: 2 }),
    storageCostPercentage: numeric('storage_cost_percentage', { precision: 5, scale: 2 }),
    llmCostPercentage: numeric('llm_cost_percentage', { precision: 5, scale: 2 }),

    // Economics
    grossMargin: numeric('gross_margin', { precision: 5, scale: 2 }).notNull(), // %
    customerLifetimeValue: numeric('customer_lifetime_value', { precision: 20, scale: 2 }).notNull(),
    paybackPeriodDays: integer('payback_period_days').notNull(),

    // CAC (Customer Acquisition Cost)
    totalAcquisitionSpend: numeric('total_acquisition_spend', { precision: 20, scale: 2 }).notNull(),
    customerAcquisitionCost: numeric('customer_acquisition_cost', { precision: 20, scale: 2 }).notNull(),
    ltv_cac_ratio: numeric('ltv_cac_ratio', { precision: 8, scale: 2 }).notNull(), // should be > 3

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_unit_economics_org').on(t.organizationId),
    index('idx_unit_economics_period').on(t.periodDate),
  )
);

// Reserved capacity optimization recommendations
export const reservedCapacityOptimizationTable = pgTable(
  'reserved_capacity_optimization',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Recommendation
    recommendationType: varchar('recommendation_type', { length: 100 }).notNull(),
    // reserved_instances, reserved_capacity, spot_instances, compute_opt
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    region: varchar('region', { length: 100 }),

    // Current usage pattern
    currentOnDemandCost: numeric('current_on_demand_cost', { precision: 20, scale: 2 }).notNull(),
    currentUtilization: numeric('current_utilization', { precision: 5, scale: 2 }), // %
    averageHourlyUsage: numeric('average_hourly_usage', { precision: 20, scale: 4 }),
    peakHourlyUsage: numeric('peak_hourly_usage', { precision: 20, scale: 4 }),

    // Recommendation
    recommendedCapacity: numeric('recommended_capacity', { precision: 20, scale: 4 }).notNull(),
    reservedCapacityCost: numeric('reserved_capacity_cost', { precision: 20, scale: 2 }).notNull(),
    annualCostSavings: numeric('annual_cost_savings', { precision: 20, scale: 2 }).notNull(),
    paybackMonths: integer('payback_months').notNull(),
    utilizationImprovement: numeric('utilization_improvement', { precision: 5, scale: 2 }), // %

    // Metadata
    analysisDate: timestamp('analysis_date').notNull(),
    commitmentTerm: varchar('commitment_term', { length: 50 }), // 1yr, 3yr
    recommendation: json('recommendation').$type<{
      reasons?: string[];
      riskFactors?: string[];
    }>(),

    // Tracking
    implemented: boolean('implemented').default(false),
    implementedAt: timestamp('implemented_at'),
    implementedBy: varchar('implemented_by', { length: 255 }),

    dismissed: boolean('dismissed').default(false),
    dismissalReason: text('dismissal_reason'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_reserved_cap_org').on(t.organizationId),
    index('idx_reserved_cap_type').on(t.recommendationType),
  )
);

// Cost optimization opportunities
export const costOptimizationOpportunitiesTable = pgTable(
  'cost_optimization_opportunities',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Opportunity identification
    opportunityType: varchar('opportunity_type', { length: 100 }).notNull(),
    // unused_resources, inefficient_configs, data_transfer, storage_tiering, etc
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),

    // Impact
    estimatedMonthlySavings: numeric('estimated_monthly_savings', { precision: 20, scale: 2 }).notNull(),
    estimatedAnnualSavings: numeric('estimated_annual_savings', { precision: 20, scale: 2 }).notNull(),
    implementationEffort: varchar('implementation_effort', { length: 50 }), // low, medium, high

    // Details
    affectedResources: json('affected_resources').$type<{
      resourceIds?: string[];
      serviceNames?: string[];
      impactedUsers?: number;
    }>(),

    implementationSteps: json('implementation_steps').$type<string[]>(),
    riskFactors: json('risk_factors').$type<string[]>(),

    // Tracking
    priority: integer('priority').notNull(), // 1-10
    status: varchar('status', { length: 50 }).notNull(), // open, in_progress, implemented, dismissed
    statusNotes: text('status_notes'),
    implementedAt: timestamp('implemented_at'),
    actualSavings: numeric('actual_savings', { precision: 20, scale: 2 }),

    dismissalReason: text('dismissal_reason'),
    dismissedAt: timestamp('dismissed_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_cost_opp_org').on(t.organizationId),
    index('idx_cost_opp_status').on(t.status),
    index('idx_cost_opp_priority').on(t.priority),
  )
);

// Monthly billing records
export const monthlyBillingRecordTable = pgTable(
  'monthly_billing_record',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Billing period
    billingMonth: date('billing_month').notNull(), // YYYY-MM-01
    billingStartDate: timestamp('billing_start_date').notNull(),
    billingEndDate: timestamp('billing_end_date').notNull(),

    // Invoice data
    invoiceNumber: varchar('invoice_number', { length: 100 }),
    invoiceStatus: varchar('invoice_status', { length: 50 }), // draft, issued, paid, overdue

    // Cost breakdown
    computeCharges: numeric('compute_charges', { precision: 20, scale: 2 }).default('0'),
    storageCharges: numeric('storage_charges', { precision: 20, scale: 2 }).default('0'),
    networkCharges: numeric('network_charges', { precision: 20, scale: 2 }).default('0'),
    databaseCharges: numeric('database_charges', { precision: 20, scale: 2 }).default('0'),
    llmServiceCharges: numeric('llm_service_charges', { precision: 20, scale: 2 }).default('0'),
    otherCharges: numeric('other_charges', { precision: 20, scale: 2 }).default('0'),
    subtotal: numeric('subtotal', { precision: 20, scale: 2 }).notNull(),

    // Adjustments
    credits: numeric('credits', { precision: 20, scale: 2 }).default('0'),
    discounts: numeric('discounts', { precision: 20, scale: 2 }).default('0'),
    tax: numeric('tax', { precision: 20, scale: 2 }).default('0'),
    totalAmount: numeric('total_amount', { precision: 20, scale: 2 }).notNull(),

    // Metadata
    billingInfo: json('billing_info').$type<{
      address?: string;
      taxId?: string;
      paymentMethod?: string;
    }>(),

    issuedAt: timestamp('issued_at'),
    dueDate: timestamp('due_date'),
    paidAt: timestamp('paid_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_billing_record_org').on(t.organizationId),
    index('idx_billing_record_month').on(t.billingMonth),
  )
);

// Real-time spending alerts
export const costAlertsTable = pgTable(
  'cost_alerts',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Alert definition
    alertType: varchar('alert_type', { length: 100 }).notNull(),
    // budget_exceeded, spending_spike, forecast_overage, anomaly
    alertName: varchar('alert_name', { length: 255 }).notNull(),
    alertCondition: text('alert_condition').notNull(),
    severity: varchar('severity', { length: 50 }).notNull(), // info, warning, critical

    // Alert details
    currentValue: numeric('current_value', { precision: 20, scale: 2 }).notNull(),
    thresholdValue: numeric('threshold_value', { precision: 20, scale: 2 }).notNull(),
    exceedanceAmount: numeric('exceedance_amount', { precision: 20, scale: 2 }),
    exceedancePercent: numeric('exceedance_percent', { precision: 8, scale: 2 }),

    // Context
    workspaceId: varchar('workspace_id', { length: 255 }),
    serviceName: varchar('service_name', { length: 255 }),

    // Notification
    alertTriggeredAt: timestamp('alert_triggered_at').notNull(),
    notificationChannels: json('notification_channels').$type<string[]>(),
    notificationSent: boolean('notification_sent').default(false),
    notificationSentAt: timestamp('notification_sent_at'),

    // Remediation
    isResolved: boolean('is_resolved').default(false),
    resolvedAt: timestamp('resolved_at'),
    remediationAction: text('remediation_action'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_cost_alerts_org').on(t.organizationId),
    index('idx_cost_alerts_severity').on(t.severity),
    index('idx_cost_alerts_triggered').on(t.alertTriggeredAt),
  )
);

// Cost forecasting and projections
export const costProjectionsTable = pgTable(
  'cost_projections',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Forecast details
    forecastType: varchar('forecast_type', { length: 50 }).notNull(), // trend, seasonal, ml_based
    modelVersion: varchar('model_version', { length: 50 }),
    basedOnHistoryMonths: integer('based_on_history_months').notNull(),

    // Forecast period
    forecastStartDate: timestamp('forecast_start_date').notNull(),
    forecastEndDate: timestamp('forecast_end_date').notNull(),

    // Costs per time period
    totalProjectedCost: numeric('total_projected_cost', { precision: 20, scale: 2 }).notNull(),
    forecastedCosts: json('forecasted_costs').$type<{
      [date: string]: number;
    }>(),

    // By service
    computeProjection: numeric('compute_projection', { precision: 20, scale: 2 }),
    storageProjection: numeric('storage_projection', { precision: 20, scale: 2 }),
    networkProjection: numeric('network_projection', { precision: 20, scale: 2 }),
    llmProjection: numeric('llm_projection', { precision: 20, scale: 2 }),

    // Confidence and factors
    confidenceLevel: numeric('confidence_level', { precision: 5, scale: 2 }), // 0-100%
    growthAssumptions: json('growth_assumptions').$type<{
      userGrowthRate?: number;
      featureAdoptionRate?: number;
      seasonalFactors?: Record<string, number>;
    }>(),

    // Actual vs predicted
    actualCostToDate: numeric('actual_cost_to_date', { precision: 20, scale: 2 }),
    variance: numeric('variance', { precision: 20, scale: 2 }),
    variancePercent: numeric('variance_percent', { precision: 8, scale: 2 }),
    modelAccuracyScore: numeric('model_accuracy_score', { precision: 5, scale: 2 }), // 0-100%

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_cost_projections_org').on(t.organizationId),
    index('idx_cost_projections_period').on(t.forecastStartDate, t.forecastEndDate),
  )
);

// Resource wastage analysis
export const wastageAnalysisTable = pgTable(
  'wastage_analysis',
  {
    id: serial('id').primaryKey(),
    organizationId: varchar('organization_id', { length: 255 }).notNull(),

    // Wastage type
    wastageType: varchar('wastage_type', { length: 100 }).notNull(),
    // idle_instances, overprovisioned, unused_storage, data_transfer, etc
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    resourceId: varchar('resource_id', { length: 255 }).notNull(),

    // Metrics
    currentCostMonthly: numeric('current_cost_monthly', { precision: 20, scale: 2 }).notNull(),
    estimatedUtilization: numeric('estimated_utilization', { precision: 5, scale: 2 }).notNull(), // %
    wastedCostMonthly: numeric('wasted_cost_monthly', { precision: 20, scale: 2 }).notNull(),
    wastedCostAnnually: numeric('wasted_cost_annually', { precision: 20, scale: 2 }).notNull(),

    // Details
    description: text('description').notNull(),
    evidence: json('evidence').$type<{
      metrics?: Record<string, any>;
      samples?: Record<string, any>[];
    }>(),

    // Recommendations
    recommendedAction: text('recommended_action'),
    potentialSavings: numeric('potential_savings', { precision: 20, scale: 2 }),

    // Tracking
    severity: varchar('severity', { length: 50 }).notNull(), // low, medium, high
    detectedAt: timestamp('detected_at').notNull(),
    addressed: boolean('addressed').default(false),
    addressedAt: timestamp('addressed_at'),
    addressedAction: text('addressed_action'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => extraConfig(
    index('idx_wastage_org').on(t.organizationId),
    index('idx_wastage_type').on(t.wastageType),
    index('idx_wastage_severity').on(t.severity),
  )
);

/**
 * Type Exports for database operations
 */
export type ServiceUsage = typeof serviceUsageTable.$inferSelect;
export type NewServiceUsage = typeof serviceUsageTable.$inferInsert;

export type CostBreakdown = typeof costBreakdownTable.$inferSelect;
export type NewCostBreakdown = typeof costBreakdownTable.$inferInsert;

export type ResourceAllocation = typeof resourceAllocationTable.$inferSelect;
export type NewResourceAllocation = typeof resourceAllocationTable.$inferInsert;

export type CostAnomaly = typeof costAnomaliesTable.$inferSelect;
export type NewCostAnomaly = typeof costAnomaliesTable.$inferInsert;

export type UsageAccounting = typeof usageAccountingTable.$inferSelect;
export type NewUsageAccounting = typeof usageAccountingTable.$inferInsert;

export type UnitEconomics = typeof unitEconomicsTable.$inferSelect;
export type NewUnitEconomics = typeof unitEconomicsTable.$inferInsert;

export type ReservedCapacityOptimization = typeof reservedCapacityOptimizationTable.$inferSelect;
export type NewReservedCapacityOptimization = typeof reservedCapacityOptimizationTable.$inferInsert;

export type CostOptimizationOpportunity = typeof costOptimizationOpportunitiesTable.$inferSelect;
export type NewCostOptimizationOpportunity = typeof costOptimizationOpportunitiesTable.$inferInsert;

export type MonthlyBillingRecord = typeof monthlyBillingRecordTable.$inferSelect;
export type NewMonthlyBillingRecord = typeof monthlyBillingRecordTable.$inferInsert;

export type CostAlert = typeof costAlertsTable.$inferSelect;
export type NewCostAlert = typeof costAlertsTable.$inferInsert;

export type CostProjection = typeof costProjectionsTable.$inferSelect;
export type NewCostProjection = typeof costProjectionsTable.$inferInsert;

export type WastageAnalysis = typeof wastageAnalysisTable.$inferSelect;
export type NewWastageAnalysis = typeof wastageAnalysisTable.$inferInsert;
