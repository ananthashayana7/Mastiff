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
  foreignKey,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * ERROR TRACKING SCHEMA - Phase 4.3
 * Comprehensive error capture, grouping, alerting, and on-call management
 */

// ============================================================================
// ERROR TRACKING TABLES
// ============================================================================

export const errorGroups = pgTable(
  'error_groups',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    workspaceId: varchar('workspace_id', { length: 36 }),
    
    // Error identification
    errorFingerprint: varchar('error_fingerprint', { length: 255 }).notNull(),
    errorType: varchar('error_type', { length: 100 }).notNull(), // RuntimeError, TypeError, etc.
    errorMessage: text('error_message').notNull(),
    
    // Status and lifecycle
    status: varchar('status', { length: 20 }).notNull(), // active, ignored, resolved, regression
    severity: varchar('severity', { length: 20 }).notNull(), // critical, high, medium, low
    
    // Statistics
    totalOccurrences: integer('total_occurrences').notNull().default(0),
    uniqueUsersAffected: integer('unique_users_affected').notNull().default(0),
    firstOccurredAt: timestamp('first_occurred_at'),
    lastOccurredAt: timestamp('last_occurred_at'),
    lastSeenUserId: varchar('last_seen_user_id', { length: 36 }),
    
    // Assignment and resolution
    assignedToUserId: varchar('assigned_to_user_id', { length: 36 }),
    resolvedAt: timestamp('resolved_at'),
    resolutionNotes: text('resolution_notes'),
    
    // Tagging
    tags: text('tags').array(),
    environment: varchar('environment', { length: 50 }), // production, staging, development
    releaseVersion: varchar('release_version', { length: 50 }),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    fingerprintIdx: index().on(table.errorFingerprint),
    statusIdx: index().on(table.status),
    severityIdx: index().on(table.severity),
    createdAtIdx: index().on(table.createdAt),
    compositeIdx: uniqueIndex().on(table.organizationId, table.errorFingerprint),
  })
);

export const errorEvents = pgTable(
  'error_events',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    errorGroupId: varchar('error_group_id', { length: 36 }).notNull(),
    
    // Event details
    timestamp: timestamp('timestamp').notNull(),
    userId: varchar('user_id', { length: 36 }),
    sessionId: varchar('session_id', { length: 36 }),
    
    // Error information
    message: text('message').notNull(),
    errorType: varchar('error_type', { length: 100 }).notNull(),
    
    // Context
    context: jsonb('context'), // { url, userAgent, ip, headers, etc }
    environment: varchar('environment', { length: 50 }),
    releaseVersion: varchar('release_version', { length: 50 }),
    
    // Stack trace reference
    stackTraceId: varchar('stack_trace_id', { length: 36 }),
    sourceMapApplied: boolean('source_map_applied').default(false),
    
    // Related metrics
    memoryMb: integer('memory_mb'),
    cpuPercent: decimal('cpu_percent', { precision: 5, scale: 2 }),
    networkLatencyMs: integer('network_latency_ms'),
    
    // Breadcrumbs (preceding events)
    breadcrumbIds: text('breadcrumb_ids').array(),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    groupIdIdx: index().on(table.errorGroupId),
    userIdIdx: index().on(table.userId),
    timestampIdx: index().on(table.timestamp),
  })
);

export const errorStackTraces = pgTable(
  'error_stack_traces',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Fingerprint for grouping
    stackTraceHash: varchar('stack_trace_hash', { length: 255 }).notNull(),
    
    // Raw and processed traces
    rawStackTrace: text('raw_stack_trace').notNull(),
    processedStackTrace: jsonb('processed_stack_trace'), // Parsed frames
    
    // Source mapping
    sourceMapApplied: boolean('source_map_applied').default(false),
    originalFilePath: varchar('original_file_path', { length: 500 }),
    minifiedFilePath: varchar('minified_file_path', { length: 500 }),
    
    // Stack frame details
    frames: jsonb('frames').notNull(), // [ { file, line, column, code, function } ]
    
    // Root cause analysis
    rootCauseFrame: integer('root_cause_frame'),
    rootCauseFile: varchar('root_cause_file', { length: 500 }),
    rootCauseLine: integer('root_cause_line'),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    hashIdx: index().on(table.stackTraceHash),
    uniqueHashIdx: uniqueIndex().on(table.organizationId, table.stackTraceHash),
  })
);

export const errorSourceMaps = pgTable(
  'error_source_maps',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Version identification
    releaseVersion: varchar('release_version', { length: 50 }).notNull(),
    environment: varchar('environment', { length: 50 }).notNull(),
    
    // Source map files
    sourceMapUrl: varchar('source_map_url', { length: 500 }).notNull(),
    sourceMapData: jsonb('source_map_data').notNull(),
    
    // Mapping information
    minifiedFileName: varchar('minified_file_name', { length: 500 }).notNull(),
    originalFileNames: text('original_file_names').array(),
    
    // Validation
    isValid: boolean('is_valid').default(true),
    validationErrors: text('validation_errors'),
    
    // Usage statistics
    timesApplied: integer('times_applied').default(0),
    lastAppliedAt: timestamp('last_applied_at'),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    versionIdx: index().on(table.releaseVersion),
    compositeIdx: uniqueIndex().on(table.organizationId, table.releaseVersion, table.minifiedFileName),
  })
);

export const errorBreadcrumbs = pgTable(
  'error_breadcrumbs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    errorEventId: varchar('error_event_id', { length: 36 }).notNull(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Breadcrumb information
    timestamp: timestamp('timestamp').notNull(),
    category: varchar('category', { length: 50 }).notNull(), // http, navigation, console, ui, database
    message: text('message'),
    level: varchar('level', { length: 20 }).notNull(), // info, warning, error, debug
    
    // Breadcrumb data
    data: jsonb('data'), // Category-specific data
    
    // Example: for http breadcrumbs
    // { method: 'POST', url: '/api/users', status: 500, duration: 250 }
    // for console breadcrumbs
    // { method: 'error', message: 'Something went wrong' }
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    eventIdIdx: index().on(table.errorEventId),
    orgIdIdx: index().on(table.organizationId),
    categoryIdx: index().on(table.category),
  })
);

export const errorContext = pgTable(
  'error_context',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    errorEventId: varchar('error_event_id', { length: 36 }).notNull().unique(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // User context
    userId: varchar('user_id', { length: 36 }),
    userEmail: varchar('user_email', { length: 255 }),
    userName: varchar('user_name', { length: 255 }),
    userIpAddress: varchar('user_ip_address', { length: 45 }),
    
    // Session context
    sessionId: varchar('session_id', { length: 36 }),
    sessionDurationMs: integer('session_duration_ms'),
    
    // Environment context
    environment: varchar('environment', { length: 50 }),
    releaseVersion: varchar('release_version', { length: 50 }),
    
    // Client context
    userAgent: text('user_agent'),
    browserName: varchar('browser_name', { length: 100 }),
    browserVersion: varchar('browser_version', { length: 50 }),
    osName: varchar('os_name', { length: 100 }),
    osVersion: varchar('os_version', { length: 50 }),
    
    // Device context
    deviceType: varchar('device_type', { length: 50 }), // mobile, tablet, desktop
    deviceManufacturer: varchar('device_manufacturer', { length: 100 }),
    
    // Network context
    connectionType: varchar('connection_type', { length: 50 }), // wifi, cellular, ethernet
    connectionSpeed: varchar('connection_speed', { length: 50 }), // 4g, 5g, slow-2g
    
    // Request context
    requestUrl: text('request_url'),
    requestMethod: varchar('request_method', { length: 10 }), // GET, POST, etc
    requestHeaders: jsonb('request_headers'),
    responseStatus: integer('response_status'),
    
    // Custom context
    customData: jsonb('custom_data'),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    eventIdIdx: index().on(table.errorEventId),
    orgIdIdx: index().on(table.organizationId),
    userIdIdx: index().on(table.userId),
  })
);

// ============================================================================
// ERROR RESOLUTION & WORKFLOW TABLES
// ============================================================================

export const errorResolution = pgTable(
  'error_resolution',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    errorGroupId: varchar('error_group_id', { length: 36 }).notNull().unique(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Resolution details
    status: varchar('status', { length: 20 }).notNull(), // investigating, acknowledged, in_progress, resolved
    resolutionType: varchar('resolution_type', { length: 50 }), // fix, workaround, wontfix, duplicate
    
    // Assignee
    assignedToUserId: varchar('assigned_to_user_id', { length: 36 }),
    assignedAt: timestamp('assigned_at'),
    
    // Timeline
    investigationStartedAt: timestamp('investigation_started_at'),
    resolvedAt: timestamp('resolved_at'),
    resolutionTimeMinutes: integer('resolution_time_minutes'),
    
    // Resolution information
    rootCauseAnalysis: text('root_cause_analysis'),
    fixDescription: text('fix_description'),
    fixCommitHash: varchar('fix_commit_hash', { length: 100 }),
    fixReleaseVersion: varchar('fix_release_version', { length: 50 }),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    groupIdIdx: index().on(table.errorGroupId),
    orgIdIdx: index().on(table.organizationId),
    statusIdx: index().on(table.status),
  })
);

// ============================================================================
// ALERTING TABLES
// ============================================================================

export const alertRules = pgTable(
  'alert_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Rule definition
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    
    // Rule type
    ruleType: varchar('rule_type', { length: 50 }).notNull(),
    // error_rate: threshold errors per minute
    // error_frequency: N errors within time window
    // error_spike: increase in errors > X%
    // new_error: first occurrence of unique error
    // high_severity: error severity >= threshold
    // user_impact: errors affecting >N users
    
    // Conditions
    conditions: jsonb('conditions').notNull(),
    // { errorType?: string, severity?: string[], environment?: string[] }
    // { threshold?: number, timeWindowMinutes?: number, increase?: number }
    
    // Actions
    notificationChannelIds: text('notification_channel_ids').array(),
    escalationPolicyId: varchar('escalation_policy_id', { length: 36 }),
    createIncident: boolean('create_incident').default(false),
    
    // Status
    isEnabled: boolean('is_enabled').default(true),
    
    // Metadata
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    ruleTypeIdx: index().on(table.ruleType),
    enabledIdx: index().on(table.isEnabled),
  })
);

export const notificationChannels = pgTable(
  'notification_channels',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Channel identification
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    // email, slack, pagerduty, webhook, sms, teams, discord
    
    // Configuration
    config: jsonb('config').notNull(),
    // email: { recipients: string[] }
    // slack: { webhookUrl: string, channel: string }
    // pagerduty: { integrationKey: string, serviceId: string }
    // webhook: { url: string, method: string, headers: object }
    
    // Status
    isEnabled: boolean('is_enabled').default(true),
    isVerified: boolean('is_verified').default(false),
    verificationCode: varchar('verification_code', { length: 100 }),
    
    // Usage
    lastNotificationAt: timestamp('last_notification_at'),
    failureCount: integer('failure_count').default(0),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    typeIdx: index().on(table.type),
    enabledIdx: index().on(table.isEnabled),
  })
);

export const alertNotifications = pgTable(
  'alert_notifications',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    errorGroupId: varchar('error_group_id', { length: 36 }).notNull(),
    alertRuleId: varchar('alert_rule_id', { length: 36 }).notNull(),
    notificationChannelId: varchar('notification_channel_id', { length: 36 }).notNull(),
    
    // Notification details
    status: varchar('status', { length: 20 }).notNull(), // pending, sent, failed, read
    message: text('message').notNull(),
    
    // Delivery information
    sentAt: timestamp('sent_at'),
    deliveredAt: timestamp('delivered_at'),
    readAt: timestamp('read_at'),
    failureReason: text('failure_reason'),
    
    // Escalation
    escalationLevel: integer('escalation_level').default(1),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    groupIdIdx: index().on(table.errorGroupId),
    ruleIdIdx: index().on(table.alertRuleId),
    statusIdx: index().on(table.status),
  })
);

// ============================================================================
// ON-CALL & ESCALATION TABLES
// ============================================================================

export const escalationPolicies = pgTable(
  'escalation_policies',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Policy definition
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    
    // Escalation levels
    levels: jsonb('levels').notNull(),
    // [
    //   {
    //     level: 1,
    //     delayMinutes: 5,
    //     notificationChannelIds: ['channel-1'],
    //     onCallScheduleIds: ['schedule-1']
    //   },
    //   {
    //     level: 2,
    //     delayMinutes: 10,
    //     notificationChannelIds: ['channel-2'],
    //     onCallScheduleIds: ['schedule-2']
    //   }
    // ]
    
    // Status
    isEnabled: boolean('is_enabled').default(true),
    
    // Metadata
    createdBy: varchar('created_by', { length: 36 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    enabledIdx: index().on(table.isEnabled),
  })
);

export const onCallSchedules = pgTable(
  'on_call_schedules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Schedule definition
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    timezone: varchar('timezone', { length: 50 }).default('UTC'),
    
    // Team
    teamId: varchar('team_id', { length: 36 }),
    
    // Schedule type
    scheduleType: varchar('schedule_type', { length: 50 }).notNull(),
    // daily, weekly, custom
    
    // Rotation
    rotationDetails: jsonb('rotation_details').notNull(),
    // {
    //   type: 'weekly',
    //   daysOfWeek: ['monday', 'tuesday'],
    //   rotationPeriodDays: 7,
    //   layers: [
    //     { userIds: ['user-1'], startDate: '2024-01-01' },
    //     { userIds: ['user-2'], startDate: '2024-01-08' }
    //   ]
    // }
    
    // Current coverage
    currentOnCallUserId: varchar('current_on_call_user_id', { length: 36 }),
    currentShiftStartAt: timestamp('current_shift_start_at'),
    currentShiftEndAt: timestamp('current_shift_end_at'),
    
    // Status
    isActive: boolean('is_active').default(true),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index().on(table.organizationId),
    teamIdIdx: index().on(table.teamId),
    activeIdx: index().on(table.isActive),
  })
);

export const onCallShifts = pgTable(
  'on_call_shifts',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    onCallScheduleId: varchar('on_call_schedule_id', { length: 36 }).notNull(),
    organizationId: varchar('organization_id', { length: 36 }).notNull(),
    
    // Shift assignment
    userId: varchar('user_id', { length: 36 }).notNull(),
    shiftStartAt: timestamp('shift_start_at').notNull(),
    shiftEndAt: timestamp('shift_end_at').notNull(),
    
    // Shift details
    notificationChannelId: varchar('notification_channel_id', { length: 36 }),
    isOverride: boolean('is_override').default(false),
    
    // Status
    isActive: boolean('is_active').default(true),
    
    // Metadata
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    scheduleIdIdx: index().on(table.onCallScheduleId),
    userIdIdx: index().on(table.userId),
    startAtIdx: index().on(table.shiftStartAt),
    endAtIdx: index().on(table.shiftEndAt),
  })
);

// ============================================================================
// RELATIONS
// ============================================================================

export const errorGroupsRelations = relations(errorGroups, ({ many, one }) => ({
  errorEvents: many(errorEvents),
  errorResolution: one(errorResolution),
  alertNotifications: many(alertNotifications),
}));

export const errorEventsRelations = relations(errorEvents, ({ one, many }) => ({
  errorGroup: one(errorGroups, {
    fields: [errorEvents.errorGroupId],
    references: [errorGroups.id],
  }),
  errorStackTrace: one(errorStackTraces, {
    fields: [errorEvents.stackTraceId],
    references: [errorStackTraces.id],
  }),
  errorContext: one(errorContext),
  breadcrumbs: many(errorBreadcrumbs),
}));

export const errorStackTracesRelations = relations(errorStackTraces, ({ many }) => ({
  errorEvents: many(errorEvents),
}));

export const errorBreadcrumbsRelations = relations(errorBreadcrumbs, ({ one }) => ({
  errorEvent: one(errorEvents, {
    fields: [errorBreadcrumbs.errorEventId],
    references: [errorEvents.id],
  }),
}));

export const errorContextRelations = relations(errorContext, ({ one }) => ({
  errorEvent: one(errorEvents, {
    fields: [errorContext.errorEventId],
    references: [errorEvents.id],
  }),
}));

export const errorResolutionRelations = relations(errorResolution, ({ one }) => ({
  errorGroup: one(errorGroups, {
    fields: [errorResolution.errorGroupId],
    references: [errorGroups.id],
  }),
}));

export const alertRulesRelations = relations(alertRules, ({ many }) => ({
  alertNotifications: many(alertNotifications),
}));

export const notificationChannelsRelations = relations(notificationChannels, ({ many }) => ({
  alertNotifications: many(alertNotifications),
  onCallShifts: many(onCallShifts),
}));

export const alertNotificationsRelations = relations(alertNotifications, ({ one }) => ({
  errorGroup: one(errorGroups, {
    fields: [alertNotifications.errorGroupId],
    references: [errorGroups.id],
  }),
  alertRule: one(alertRules, {
    fields: [alertNotifications.alertRuleId],
    references: [alertRules.id],
  }),
  notificationChannel: one(notificationChannels, {
    fields: [alertNotifications.notificationChannelId],
    references: [notificationChannels.id],
  }),
}));

export const escalationPoliciesRelations = relations(escalationPolicies, ({ many }) => ({
  alertRules: many(alertRules),
}));

export const onCallSchedulesRelations = relations(onCallSchedules, ({ many }) => ({
  shifts: many(onCallShifts),
}));

export const onCallShiftsRelations = relations(onCallShifts, ({ one }) => ({
  schedule: one(onCallSchedules, {
    fields: [onCallShifts.onCallScheduleId],
    references: [onCallSchedules.id],
  }),
  notificationChannel: one(notificationChannels, {
    fields: [onCallShifts.notificationChannelId],
    references: [notificationChannels.id],
  }),
}));
