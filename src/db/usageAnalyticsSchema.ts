import {
  pgTable,
  text,
  varchar,
  integer,
  decimal,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * USAGE ANALYTICS SCHEMA - Phase 4.4
 * Funnel analysis, cohort tracking, retention metrics, and user segmentation
 */

// ============================================================================
// USAGE EVENT TRACKING
// ============================================================================

export const usageEvents = pgTable(
  'usage_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    workspaceId: varchar('workspace_id', { length: 36 }),
    
    // User identification
    userId: varchar('user_id', { length: 36 }).notNull(),
    sessionId: varchar('session_id', { length: 36 }),
    
    // Event classification
    eventName: varchar('event_name', { length: 255 }).notNull(), // user_signup, notebook_created, chat_sent, etc
    eventCategory: varchar('event_category', { length: 100 }).notNull(), // engagement, feature_usage, ux_interaction
    
    // Event metadata
    eventData: jsonb('event_data'), // Custom event properties
    
    // Context
    properties: jsonb('properties'), // { deviceType, browser, os, region }
    context: jsonb('context'), // { url, referrer, timestamp }
    
    // Timing
    timestamp: timestamp('timestamp').notNull(),
    
    // Tracking
    isConversion: boolean('is_conversion').default(false), // Part of conversion funnel
    conversionFunnelId: varchar('conversion_funnel_id', { length: 36 }),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    userIdIdx: index().on(table.userId),
    eventNameIdx: index().on(table.eventName),
    eventCategoryIdx: index().on(table.eventCategory),
    timestampIdx: index().on(table.timestamp),
    compositeIdx: index().on(table.organizationId, table.userId, table.timestamp),
  })
);

// ============================================================================
// FUNNEL ANALYSIS
// ============================================================================

export const conversionFunnels = pgTable(
  'conversion_funnels',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Funnel definition
    name: varchar('name', { length: 255 }).notNull(), // "Signup Flow", "Checkout Flow"
    description: text('description'),
    
    // Funnel steps (ordered)
    steps: jsonb('steps').notNull(), // [ { step: 1, eventName: "page_view_signup" }, ... ]
    
    // Metrics
    totalUsers: integer('total_users').default(0),
    totalConversions: integer('total_conversions').default(0),
    conversionRate: decimal('conversion_rate', { precision: 5, scale: 2 }).default(0),
    
    // Step breakdown
    stepMetrics: jsonb('step_metrics'), // { step_1: { users: 1000 }, step_2: { users: 800 }, ... }
    dropoffRates: jsonb('dropoff_rates'), // { step_1_to_2: 20.0, step_2_to_3: 12.5 }
    
    // Time-based analysis
    avgTimeToConversionSeconds: integer('avg_time_to_conversion_seconds'),
    medianTimeToConversionSeconds: integer('median_time_to_conversion_seconds'),
    
    // Date range
    analysisStartDate: timestamp('analysis_start_date').notNull(),
    analysisEndDate: timestamp('analysis_end_date').notNull(),
    
    // Status
    isActive: boolean('is_active').default(true),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    activeIdx: index().on(table.isActive),
  })
);

export const funnelEvents = pgTable(
  'funnel_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    conversionFunnelId: varchar('conversion_funnel_id', { length: 36 }).notNull(),
    usageEventId: varchar('usage_event_id', { length: 36 }).notNull(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // User journey
    userId: varchar('user_id', { length: 36 }).notNull(),
    sessionId: varchar('session_id', { length: 36 }).notNull(),
    
    // Step tracking
    stepNumber: integer('step_number').notNull(),
    eventName: varchar('event_name', { length: 255 }).notNull(),
    
    // Timeline
    timestamp: timestamp('timestamp').notNull(),
    sessionEnteredAt: timestamp('session_entered_at'),
    
    // Conversion status
    completedFunnel: boolean('completed_funnel').default(false),
    abandonedAt: timestamp('abandoned_at'),
    completedAt: timestamp('completed_at'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    funnelIdIdx: index().on(table.conversionFunnelId),
    userIdIdx: index().on(table.userId),
    sessionIdIdx: index().on(table.sessionId),
    completedIdx: index().on(table.completedFunnel),
  })
);

// ============================================================================
// COHORT ANALYSIS
// ============================================================================

export const cohorts = pgTable(
  'cohorts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Cohort definition
    name: varchar('name', { length: 255 }).notNull(), // "Signup Jan 2024", "Premium Users"
    description: text('description'),
    cohortType: varchar('cohort_type', { length: 50 }).notNull(), // acquisition, behavioral, demographic
    
    // Criteria
    criteria: jsonb('criteria').notNull(),
    // {
    //   acquisitionDate?: { from: Date, to: Date },
    //   features?: string[],
    //   userProperties?: { property: value },
    //   minimumActivity?: { events: number, days: number }
    // }
    
    // Membership
    memberCount: integer('member_count').default(0),
    members: text('members').array(), // User IDs
    
    // Manual or automatic
    isAutomated: boolean('is_automated').default(false),
    
    // Size over time
    sizeHistory: jsonb('size_history'), // { "2024-01-01": 100, "2024-01-08": 105, ... }
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    typeIdx: index().on(table.cohortType),
  })
);

export const cohortAnalysis = pgTable(
  'cohort_analysis',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    cohortId: varchar('cohort_id', { length: 36 }).notNull().unique(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Time-based retention matrix
    // Rows: cohort groups (by week/month), Columns: N weeks/months after join
    retentionMatrix: jsonb('retention_matrix').notNull(),
    // {
    //   "week_0": { 0: 100.0, 1: 85.5, 2: 72.3, ... },
    //   "week_1": { 0: 98.0, 1: 83.2, 2: 71.5, ... }
    // }
    
    // Metrics
    avgRetention1Week: decimal('avg_retention_1_week', { precision: 5, scale: 2 }),
    avgRetention2Week: decimal('avg_retention_2_week', { precision: 5, scale: 2 }),
    avgRetention4Week: decimal('avg_retention_4_week', { precision: 5, scale: 2 }),
    
    // Churn analysis
    churnRate: decimal('churn_rate', { precision: 5, scale: 2 }), // % per period
    avgLifespanDays: integer('avg_lifespan_days'),
    
    // Feature adoption within cohort
    featureAdoption: jsonb('feature_adoption'), // { feature_1: 45.5, feature_2: 67.3 }
    
    // Engagement metrics
    avgEventsPerUser: decimal('avg_events_per_user', { precision: 10, scale: 2 }),
    activeUserPercentage: decimal('active_user_percentage', { precision: 5, scale: 2 }),
    
    // Value metrics
    avgLifetimeValue: decimal('avg_lifetime_value', { precision: 10, scale: 2 }),
    revenuePerUser: decimal('revenue_per_user', { precision: 10, scale: 2 }),
    
    analysisDate: timestamp('analysis_date').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    cohortIdIdx: index().on(table.cohortId),
    orgIdIdx: index().on(table.organizationId),
  })
);

// ============================================================================
// FEATURE ADOPTION & USAGE
// ============================================================================

export const featureAdoption = pgTable(
  'feature_adoption',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Feature identification
    featureName: varchar('feature_name', { length: 255 }).notNull(),
    featureCategory: varchar('feature_category', { length: 100 }), // AI, notebook, collaboration, etc
    releaseVersion: varchar('release_version', { length: 50 }),
    releaseDate: timestamp('release_date'),
    
    // Adoption metrics
    totalUsersExposed: integer('total_users_exposed').default(0),
    adoptingUsers: integer('adopting_users').default(0),
    adoptionRate: decimal('adoption_rate', { precision: 5, scale: 2 }).default(0),
    
    // Time to adoption
    avgDaysToFirstUse: decimal('avg_days_to_first_use', { precision: 8, scale: 2 }),
    medianDaysToFirstUse: integer('median_days_to_first_use'),
    
    // Usage intensity
    avgUsageFrequencyPerWeek: decimal('avg_usage_frequency_per_week', { precision: 8, scale: 2 }),
    powerUserPercentage: decimal('power_user_percentage', { precision: 5, scale: 2 }), // Heavy users
    dormantUserPercentage: decimal('dormant_user_percentage', { precision: 5, scale: 2 }), // No use
    
    // Churn of feature
    activeUsersLastWeek: integer('active_users_last_week'),
    churnedUsers: integer('churned_users'),
    
    // Satisfaction & impact
    userSentiment: jsonb('user_sentiment'), // { positive: 45, neutral: 30, negative: 25 }
    impactScore: decimal('impact_score', { precision: 5, scale: 2 }), // 0-100
    
    // Status
    isLaunched: boolean('is_launched').default(false),
    isBeta: boolean('is_beta').default(false),
    
    analysisDate: timestamp('analysis_date').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    featureIdx: index().on(table.featureName),
    versionIdx: index().on(table.releaseVersion),
  })
);

// ============================================================================
// USER SEGMENTATION
// ============================================================================

export const userSegments = pgTable(
  'user_segments',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Segment definition
    name: varchar('name', { length: 255 }).notNull(), // "Power Users", "Inactive", "Trial Users"
    description: text('description'),
    
    // Segmentation criteria
    criteria: jsonb('criteria').notNull(),
    // {
    //   eventsPerMonth: { min: 100 },
    //   activeLastDays: 7,
    //   accountAge: { min: 30, max: 90 },
    //   features: ["notebook", "chat"],
    //   pricingTier: "premium",
    //   region: "US"
    // }
    
    // Membership
    userCount: integer('user_count').default(0),
    userIds: text('user_ids').array(),
    
    // Metrics
    avgSessionsPerMonth: decimal('avg_sessions_per_month', { precision: 8, scale: 2 }),
    avgEventsPerSession: decimal('avg_events_per_session', { precision: 8, scale: 2 }),
    avgSessionDurationMinutes: decimal('avg_session_duration_minutes', { precision: 8, scale: 2 }),
    
    // Value metrics
    avgMonthlyCost: decimal('avg_monthly_cost', { precision: 10, scale: 2 }),
    churnRisk: decimal('churn_risk', { precision: 5, scale: 2 }), // 0-100 score
    
    // Status
    isActive: boolean('is_active').default(true),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    activeIdx: index().on(table.isActive),
  })
);

// ============================================================================
// USER JOURNEY & SESSIONS
// ============================================================================

export const userSessions = pgTable(
  'user_sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    
    // Session timing
    sessionStartedAt: timestamp('session_started_at').notNull(),
    sessionEndedAt: timestamp('session_ended_at'),
    durationSeconds: integer('duration_seconds'),
    
    // Session properties
    deviceType: varchar('device_type', { length: 50 }), // mobile, tablet, desktop
    osName: varchar('os_name', { length: 100 }),
    browserName: varchar('browser_name', { length: 100 }),
    
    // Location
    country: varchar('country', { length: 100 }),
    region: varchar('region', { length: 100 }),
    city: varchar('city', { length: 100 }),
    
    // Session activity
    eventCount: integer('event_count').default(0),
    pageViews: integer('page_views').default(0),
    interactions: jsonb('interactions'), // { clicks: 45, formSubmits: 5, scrolls: 200 }
    
    // Source information
    referrer: varchar('referrer', { length: 500 }),
    campaignId: varchar('campaign_id', { length: 100 }),
    source: varchar('source', { length: 50 }), // organic, paid, direct, referral
    medium: varchar('medium', { length: 50 }), // cpc, email, social, etc
    
    // Session goals
    goalCompleted: boolean('goal_completed').default(false),
    conversionValue: decimal('conversion_value', { precision: 10, scale: 2 }),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    userIdIdx: index().on(table.userId),
    startAtIdx: index().on(table.sessionStartedAt),
    sourceIdx: index().on(table.source),
  })
);

// ============================================================================
// BEHAVIOR TRACKING & HEATMAPS
// ============================================================================

export const userBehaviorPatterns = pgTable(
  'user_behavior_patterns',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    
    // Behavior classification
    patternType: varchar('pattern_type', { length: 50 }).notNull(),
    // power_user, casual_user, dormant_user, at_risk_user, new_user, churned_user
    
    // Pattern characteristics
    avgSessionsPerWeek: decimal('avg_sessions_per_week', { precision: 8, scale: 2 }),
    avgSessionDurationMinutes: decimal('avg_session_duration_minutes', { precision: 8, scale: 2 }),
    favoriteFeaturesUsed: text('favorite_features_used').array(),
    
    // Time preferences
    peakActivityHour: integer('peak_activity_hour'), // 0-23
    peakActivityDay: varchar('peak_activity_day', { length: 20 }), // monday, tuesday, etc
    
    // Goal alignment
    goalProgressPercentage: integer('goal_progress_percentage'),
    lastActiveAt: timestamp('last_active_at'),
    daysInactive: integer('days_inactive'),
    
    // Risk indicators
    engagementTrend: varchar('engagement_trend', { length: 20 }), // increasing, stable, decreasing
    churnProbability: decimal('churn_probability', { precision: 5, scale: 2 }), // 0-100
    
    analysisDate: timestamp('analysis_date').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    userIdIdx: index().on(table.userId),
    patternIdx: index().on(table.patternType),
  })
);

export const eventHeatmaps = pgTable(
  'event_heatmaps',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Heatmap definition
    eventName: varchar('event_name', { length: 255 }).notNull(),
    dimension: varchar('dimension', { length: 100 }).notNull(), // hour_of_day, day_of_week, user_segment, geo
    
    // Heatmap data
    heatmapData: jsonb('heatmap_data').notNull(),
    // {
    //   "monday": { "00": 45, "01": 23, "02": 12, ... },
    //   "tuesday": { "00": 52, "01": 28, "02": 15, ... },
    //   ...
    // }
    
    // Peak activity
    peakValue: integer('peak_value'),
    peakLabel: varchar('peak_label', { length: 100 }), // e.g., "friday_18" for friday at 6pm
    
    // Stats
    avgValue: decimal('avg_value', { precision: 10, scale: 2 }),
    totalEvents: integer('total_events'),
    
    analysisDate: timestamp('analysis_date').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    eventIdx: index().on(table.eventName),
    dimensionIdx: index().on(table.dimension),
    compositeIdx: index().on(table.organizationId, table.eventName, table.dimension),
  })
);

// ============================================================================
// GROWTH METRICS & TRENDS
// ============================================================================

export const growthMetrics = pgTable(
  'growth_metrics',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Time period
    periodDate: timestamp('period_date').notNull(), // Start of week/month
    periodType: varchar('period_type', { length: 20 }).notNull(), // daily, weekly, monthly
    
    // User metrics
    newUsers: integer('new_users').default(0),
    returningUsers: integer('returning_users').default(0),
    activeUsers: integer('active_users').default(0),
    totalUsers: integer('total_users').default(0),
    churnedUsers: integer('churned_users').default(0),
    
    // Growth rates
    weekOverWeekGrowth: decimal('week_over_week_growth', { precision: 8, scale: 2 }),
    monthOverMonthGrowth: decimal('month_over_month_growth', { precision: 8, scale: 2 }),
    
    // Engagement
    avgEventsPerUser: decimal('avg_events_per_user', { precision: 10, scale: 2 }),
    sessions: integer('sessions').default(0),
    avgSessionDurationMinutes: decimal('avg_session_duration_minutes', { precision: 8, scale: 2 }),
    
    // Viral metrics
    invitesSent: integer('invites_sent').default(0),
    invitesAccepted: integer('invites_accepted').default(0),
    referralConversions: integer('referral_conversions').default(0),
    
    // Retention
    dayOneRetention: decimal('day_one_retention', { precision: 5, scale: 2 }),
    day7Retention: decimal('day7_retention', { precision: 5, scale: 2 }),
    day30Retention: decimal('day30_retention', { precision: 5, scale: 2 }),
    
    // Revenue impact
    monthlyRecurringRevenue: decimal('monthly_recurring_revenue', { precision: 12, scale: 2 }),
    customerLifetimeValue: decimal('customer_lifetime_value', { precision: 12, scale: 2 }),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    periodIdx: index().on(table.periodDate),
  })
);

// ============================================================================
// RELATIONS
// ============================================================================

export const usageEventsRelations = relations(usageEvents, ({ many }) => ({
  funnelEvents: many(funnelEvents),
}));

export const conversionFunnelsRelations = relations(conversionFunnels, ({ many }) => ({
  funnelEvents: many(funnelEvents),
}));

export const funnelEventsRelations = relations(funnelEvents, ({ one }) => ({
  conversionFunnel: one(conversionFunnels, {
    fields: [funnelEvents.conversionFunnelId],
    references: [conversionFunnels.id],
  }),
  usageEvent: one(usageEvents, {
    fields: [funnelEvents.usageEventId],
    references: [usageEvents.id],
  }),
}));

export const cohortsRelations = relations(cohorts, ({ one }) => ({
  analysis: one(cohortAnalysis),
}));

export const cohortAnalysisRelations = relations(cohortAnalysis, ({ one }) => ({
  cohort: one(cohorts, {
    fields: [cohortAnalysis.cohortId],
    references: [cohorts.id],
  }),
}));
