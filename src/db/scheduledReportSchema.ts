/**
 * Scheduled Reports Database Schema
 * 
 * Tables for managing scheduled report generation and delivery
 */

import {
    pgTable,
    uuid,
    varchar,
    text,
    boolean,
    integer,
    timestamp,
    jsonb,
    index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Scheduled Reports Table
 * 
 * Stores configuration for reports that run on a schedule
 */
export const scheduledReports = pgTable(
    'scheduled_reports',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').notNull(),
        name: varchar('name', { length: 255 }).notNull(),
        description: text('description'),
        
        // Report configuration
        templateId: uuid('template_id'),              // Template to execute
        type: varchar('type', { length: 50 }).notNull(), // 'template' | 'query' | 'notebook'
        format: varchar('format', { length: 50 }).default('pdf'), // 'pdf' | 'csv' | 'html' | 'email'
        
        // Schedule configuration
        schedule: varchar('schedule', { length: 100 }).notNull(), // Cron expression
        timezone: varchar('timezone', { length: 50 }).default('UTC'),
        isActive: boolean('is_active').default(true),
        
        // Report content
        title: varchar('title', { length: 255 }).notNull(),
        headerText: text('header_text'),
        footerText: text('footer_text'),
        includeCharts: boolean('include_charts').default(true),
        includeRawData: boolean('include_raw_data').default(false),
        
        // Recipient configuration
        recipients: jsonb('recipients'),              // [{email, name}, ...]
        recipientGroups: jsonb('recipient_groups'),  // ['group1', 'group2']
        ccRecipients: jsonb('cc_recipients'),
        bccRecipients: jsonb('bcc_recipients'),
        
        // Report parameters
        parameters: jsonb('parameters'),              // Template parameters
        filters: jsonb('filters'),                    // Data filters
        
        // Metadata
        lastExecutedAt: timestamp('last_executed_at'),
        nextExecutedAt: timestamp('next_executed_at'),
        executionCount: integer('execution_count').default(0),
        failureCount: integer('failure_count').default(0),
        
        // Tracking
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('scheduled_reports_user_id_idx').on(table.userId),
        templateIdIdx: index('scheduled_reports_template_id_idx').on(table.templateId),
        isActiveIdx: index('scheduled_reports_is_active_idx').on(table.isActive),
        nextExecutedIdx: index('scheduled_reports_next_executed_idx').on(table.nextExecutedAt),
    })
);

/**
 * Report Execution History
 * 
 * Tracks each execution of a scheduled report
 */
export const reportExecutions = pgTable(
    'report_executions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        reportId: uuid('report_id').notNull().references(() => scheduledReports.id, {
            onDelete: 'cascade',
        }),
        
        // Execution details
        startedAt: timestamp('started_at').notNull(),
        completedAt: timestamp('completed_at'),
        executionTimeMs: integer('execution_time_ms'),
        
        // Results
        status: varchar('status', { length: 50 }).notNull(), // 'pending' | 'running' | 'completed' | 'failed'
        error: text('error'),
        
        // Report file
        reportDataUrl: text('report_data_url'),       // URL to generated report
        reportSize: integer('report_size'),          // Bytes
        
        // Delivery tracking
        deliveryStatus: varchar('delivery_status', { length: 50 }), // 'pending' | 'sent' | 'failed'
        deliveredAt: timestamp('delivered_at'),
        deliveryError: text('delivery_error'),
        
        // Recipients actually delivered to
        successfulRecipients: jsonb('successful_recipients'), // [email, ...]
        failedRecipients: jsonb('failed_recipients'),       // [{email, reason}, ...]
        
        // Metadata
        triggeredBy: varchar('triggered_by', { length: 50 }), // 'schedule' | 'manual' | 'api'
        triggeredByUserId: uuid('triggered_by_user_id'),
    },
    (table) => ({
        reportIdIdx: index('report_executions_report_id_idx').on(table.reportId),
        statusIdx: index('report_executions_status_idx').on(table.status),
        deliveryStatusIdx: index('report_executions_delivery_status_idx').on(table.deliveryStatus),
        startedAtIdx: index('report_executions_started_at_idx').on(table.startedAt),
    })
);

/**
 * Report Recipients
 * 
 * Master list of report recipients for distribution groups
 */
export const reportRecipients = pgTable(
    'report_recipients',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').notNull(),
        
        // Recipient info
        email: varchar('email', { length: 255 }).notNull(),
        name: varchar('name', { length: 255 }),
        
        // Subscription
        groups: jsonb('groups'),                      // ['quarterly', 'executive']
        isActive: boolean('is_active').default(true),
        
        // Tracking
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('report_recipients_user_id_idx').on(table.userId),
        emailIdx: index('report_recipients_email_idx').on(table.email),
    })
);

/**
 * Email Templates
 * 
 * Customizable email templates for reports
 */
export const emailTemplates = pgTable(
    'email_templates',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id'),                      // NULL for system templates
        
        // Template info
        name: varchar('name', { length: 255 }).notNull(),
        description: text('description'),
        isSystemTemplate: boolean('is_system_template').default(false),
        
        // Template content
        subject: varchar('subject', { length: 500 }).notNull(),
        htmlBody: text('html_body').notNull(),
        plainTextBody: text('plain_text_body'),
        
        // Customization
        variables: jsonb('variables'),                // Supported variables
        
        // Metadata
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => ({
        userIdIdx: index('email_templates_user_id_idx').on(table.userId),
        isSystemIdx: index('email_templates_is_system_idx').on(table.isSystemTemplate),
    })
);

/**
 * Report Distribution Log
 * 
 * Detailed log of each email sent
 */
export const reportDistributionLog = pgTable(
    'report_distribution_log',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        executionId: uuid('execution_id').notNull().references(() => reportExecutions.id, {
            onDelete: 'cascade',
        }),
        
        // Email details
        recipient: varchar('recipient', { length: 255 }).notNull(),
        subject: varchar('subject', { length: 500 }),
        
        // Delivery info
        sentAt: timestamp('sent_at').notNull().defaultNow(),
        status: varchar('status', { length: 50 }).notNull(), // 'sent' | 'failed' | 'bounced'
        error: text('error'),
        externalMessageId: varchar('external_message_id'), // Provider reference
        
        // Metadata
        provider: varchar('provider', { length: 50 }), // 'sendgrid' | 'mailgun' | 'smtp'
    },
    (table) => ({
        executionIdIdx: index('report_distribution_log_execution_id_idx').on(table.executionId),
        recipientIdx: index('report_distribution_log_recipient_idx').on(table.recipient),
        statusIdx: index('report_distribution_log_status_idx').on(table.status),
        sentAtIdx: index('report_distribution_log_sent_at_idx').on(table.sentAt),
    })
);

/**
 * Relations
 */
export const scheduledReportsRelations = relations(scheduledReports, ({ many }) => ({
    executions: many(reportExecutions),
    recipients: many(reportRecipients),
}));

export const reportExecutionsRelations = relations(reportExecutions, ({ one, many }) => ({
    report: one(scheduledReports, {
        fields: [reportExecutions.reportId],
        references: [scheduledReports.id],
    }),
    distributionLog: many(reportDistributionLog),
}));

export const reportRecipientsRelations = relations(reportRecipients, ({ one }) => ({
    user: one({ schema: undefined, name: 'users' }), // Reference to users table
}));

export const reportDistributionLogRelations = relations(reportDistributionLog, ({ one }) => ({
    execution: one(reportExecutions, {
        fields: [reportDistributionLog.executionId],
        references: [reportExecutions.id],
    }),
}));
