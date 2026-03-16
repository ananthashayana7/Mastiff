/**
 * Audit Log Schema & Utilities
 * 
 * Tables and functions for comprehensive audit logging
 */

import { pgTable, uuid, text, varchar, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Audit Log Entry
 * Records all significant actions for compliance and security
 */
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'), // May be null for system actions
    action: varchar('action', { length: 100 }).notNull(), // e.g., 'user.login', 'file.upload', 'setting.change'
    resourceType: varchar('resource_type', { length: 100 }).notNull(), // e.g., 'user', 'file', 'session'
    resourceId: varchar('resource_id', { length: 255 }), // ID of affected resource
    status: varchar('status', { length: 50 }).notNull(), // 'success', 'failure', 'warning'
    statusCode: integer('status_code'), // HTTP status code if applicable
    description: text('description'), // Human-readable description
    details: jsonb('details'), // Additional context (request params, result data, etc.)
    ipAddress: varchar('ip_address', { length: 45 }), // IPv4 or IPv6
    userAgent: text('user_agent'), // Browser/client info
    error: text('error'), // Error message if failed
    duration: integer('duration'), // Request duration in ms
    createdAt: timestamp('created_at').defaultNow(),
});

// Keep audit logs for 2 years by default (can be archived/purged after)
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    // Can reference user but not required
}));

/**
 * Login History
 * Tracks successful and failed login attempts
 */
export const loginHistory = pgTable('login_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    email: varchar('email', { length: 255 }), // Email used for login (in case of account changes)
    success: boolean('success').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    failureReason: varchar('failure_reason', { length: 255 }), // e.g., 'invalid_password', 'user_not_found'
    twoFactorUsed: boolean('two_factor_used').default(false),
    createdAt: timestamp('created_at').defaultNow(),
});

export const auditLog = {
    /**
     * Log an action
     */
    async log(data: {
        userId?: string;
        action: string;
        resourceType: string;
        resourceId?: string;
        status: 'success' | 'failure' | 'warning';
        statusCode?: number;
        description?: string;
        details?: Record<string, any>;
        ipAddress?: string;
        userAgent?: string;
        error?: string;
        duration?: number;
    }): Promise<void> {
        try {
            const { db } = await import('@/db/index');

            await db.insert(auditLogs).values({
                ...data,
                details: data.details ?? null,
            });
        } catch (err) {
            console.error('Failed to log audit entry:', err);
            // Don't throw - logging failures shouldn't break the application
        }
    },

    /**
     * Log login attempt
     */
    async logLogin(data: {
        userId: string;
        email: string;
        success: boolean;
        ipAddress?: string;
        userAgent?: string;
        failureReason?: string;
        twoFactorUsed?: boolean;
    }): Promise<void> {
        try {
            const { db } = await import('@/db/index');

            await db.insert(loginHistory).values(data);
        } catch (err) {
            console.error('Failed to log login attempt:', err);
        }
    },

    /**
     * Get audit logs for user
     */
    async getUserLogs(userId: string, limit = 100): Promise<any[]> {
        try {
            const { db } = await import('@/db/index');
            const { eq, desc } = await import('drizzle-orm');

            const logs = await db
                .select()
                .from(auditLogs)
                .where(eq(auditLogs.userId, userId))
                .orderBy(desc(auditLogs.createdAt))
                .limit(limit);

            return logs;
        } catch (err) {
            console.error('Failed to get audit logs:', err);
            return [];
        }
    },

    /**
     * Get login history for user
     */
    async getUserLoginHistory(userId: string, limit = 50): Promise<any[]> {
        try {
            const { db } = await import('@/db/index');
            const { eq, desc } = await import('drizzle-orm');

            const history = await db
                .select()
                .from(loginHistory)
                .where(eq(loginHistory.userId, userId))
                .orderBy(desc(loginHistory.createdAt))
                .limit(limit);

            return history;
        } catch (err) {
            console.error('Failed to get login history:', err);
            return [];
        }
    },

    /**
     * Count failed login attempts in last N minutes
     */
    async countFailedLogins(userId: string, minutesBack = 15): Promise<number> {
        try {
            const { db } = await import('@/db/index');
            const { eq, and, gt } = await import('drizzle-orm');

            const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000);

            const count = await db
                .select()
                .from(loginHistory)
                .where(
                    and(
                        eq(loginHistory.userId, userId),
                        eq(loginHistory.success, false),
                        gt(loginHistory.createdAt, cutoffTime)
                    )
                );

            return count.length;
        } catch (err) {
            console.error('Failed to count failed logins:', err);
            return 0;
        }
    },
};
