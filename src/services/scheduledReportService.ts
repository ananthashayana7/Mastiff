/**
 * Scheduled Reports Service
 * 
 * Manages scheduled report creation, execution, and delivery
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '@/src/db';
import {
    scheduledReports,
    reportExecutions,
    reportRecipients,
    reportDistributionLog,
} from '@/src/db/scheduledReportSchema';
import { eq, and } from 'drizzle-orm';
import { TemplateService } from './templateService';
import { auditLogger } from './auditLogger';
import { connectorQueryCache } from './connectorQueryCache';
import cron from 'node-cron';
import cronParser from 'cron-parser';
import nodemailer from 'nodemailer';
import client from 'prom-client';

// Prometheus metrics
const executionsCounter = new client.Counter({ name: 'scheduled_report_executions_total', help: 'Total scheduled report executions' });
const executionFailures = new client.Counter({ name: 'scheduled_report_execution_failures_total', help: 'Scheduled report execution failures' });
const deliveriesSent = new client.Counter({ name: 'scheduled_report_deliveries_sent_total', help: 'Scheduled report deliveries sent' });
const deliveriesFailed = new client.Counter({ name: 'scheduled_report_deliveries_failed_total', help: 'Scheduled report deliveries failed' });

/**
 * Cron job types
 */
interface CronJob {
    id: string;
    reportId: string;
    schedule: string;
    job: cron.ScheduledTask | null;
}

/**
 * Scheduled Reports Service
 */
export class ScheduledReportService {
    private static cronJobs: Map<string, CronJob> = new Map();

    /**
     * Create a scheduled report
     */
    static async createScheduledReport(
        userId: string,
        reportConfig: {
            name: string;
            description?: string;
            templateId?: string;
            type: 'template' | 'query' | 'notebook';
            format?: 'pdf' | 'csv' | 'html' | 'email';
            schedule: string; // Cron expression
            timezone?: string;
            title: string;
            headerText?: string;
            footerText?: string;
            recipients?: any[];
            parameters?: any;
            filters?: any;
        }
    ): Promise<string> {
        try {
            const reportId = uuidv4();

            await db.insert(scheduledReports).values({
                id: reportId,
                userId,
                name: reportConfig.name,
                description: reportConfig.description,
                templateId: reportConfig.templateId,
                type: reportConfig.type,
                format: reportConfig.format || 'pdf',
                schedule: reportConfig.schedule,
                timezone: reportConfig.timezone || 'UTC',
                title: reportConfig.title,
                headerText: reportConfig.headerText,
                footerText: reportConfig.footerText,
                recipients: JSON.stringify(reportConfig.recipients || []),
                parameters: JSON.stringify(reportConfig.parameters || {}),
                filters: JSON.stringify(reportConfig.filters || {}),
                isActive: true,
                nextExecutedAt: this.calculateNextExecutionTime(reportConfig.schedule),
            });

            await auditLogger.log({
                userId,
                action: 'create_scheduled_report',
                resourceType: 'scheduled_report',
                resourceId: reportId,
                details: { name: reportConfig.name },
            });

            // Schedule the cron job
            this.scheduleReport(reportId, reportConfig.schedule);

            return reportId;
        } catch (error) {
            console.error('Failed to create scheduled report:', error);
            throw error;
        }
    }

    /**
     * Get a scheduled report
     */
    static async getScheduledReport(reportId: string): Promise<any> {
        const report = await db.query.scheduledReports.findFirst({
            where: eq(scheduledReports.id, reportId),
        });

        if (!report) {
            return null;
        }

        return this.deserializeReport(report);
    }

    /**
     * List scheduled reports for user
     */
    static async listScheduledReports(
        userId: string,
        filters?: {
            isActive?: boolean;
            type?: 'template' | 'query' | 'notebook';
        }
    ): Promise<any[]> {
        let query = db.query.scheduledReports.findMany({
            where: and(eq(scheduledReports.userId, userId)),
        });

        const reports = await query;

        return reports
            .filter(r => {
                if (filters?.isActive !== undefined && r.isActive !== filters.isActive) {
                    return false;
                }
                if (filters?.type !== undefined && r.type !== filters.type) {
                    return false;
                }
                return true;
            })
            .map(r => this.deserializeReport(r));
    }

    /**
     * Update a scheduled report
     */
    static async updateScheduledReport(
        reportId: string,
        userId: string,
        updates: Partial<typeof scheduledReports.$inferInsert>
    ): Promise<void> {
        const report = await db.query.scheduledReports.findFirst({
            where: eq(scheduledReports.id, reportId),
        });

        if (!report) {
            throw new Error('Report not found');
        }

        if (report.userId !== userId) {
            throw new Error('Unauthorized');
        }

        // If schedule changed, reschedule
        if (updates.schedule && updates.schedule !== report.schedule) {
            this.unscheduleReport(reportId);
            this.scheduleReport(reportId, updates.schedule);
            updates.nextExecutedAt = this.calculateNextExecutionTime(updates.schedule);
        }

        updates.updatedAt = new Date();

        await db.update(scheduledReports).set(updates).where(eq(scheduledReports.id, reportId));

        await auditLogger.log({
            userId,
            action: 'update_scheduled_report',
            resourceType: 'scheduled_report',
            resourceId: reportId,
            details: { changes: Object.keys(updates) },
        });

        // Invalidate cache
        connectorQueryCache.invalidateQueryPattern(`report:${reportId}`);
    }

    /**
     * Delete a scheduled report
     */
    static async deleteScheduledReport(reportId: string, userId: string): Promise<void> {
        const report = await db.query.scheduledReports.findFirst({
            where: eq(scheduledReports.id, reportId),
        });

        if (!report) {
            throw new Error('Report not found');
        }

        if (report.userId !== userId) {
            throw new Error('Unauthorized');
        }

        // Unschedule cron job
        this.unscheduleReport(reportId);

        await db.delete(scheduledReports).where(eq(scheduledReports.id, reportId));

        await auditLogger.log({
            userId,
            action: 'delete_scheduled_report',
            resourceType: 'scheduled_report',
            resourceId: reportId,
        });
    }

    /**
     * Execute a scheduled report
     */
    static async executeReport(
        reportId: string,
        triggeredBy: 'schedule' | 'manual' | 'api' = 'manual',
        userId?: string
    ): Promise<string> {
        const report = await db.query.scheduledReports.findFirst({
            where: eq(scheduledReports.id, reportId),
        });

        if (!report) {
            throw new Error('Report not found');
        }

        const executionId = uuidv4();
        const startTime = Date.now();

        try {
            await db.insert(reportExecutions).values({
                id: executionId,
                reportId,
                startedAt: new Date(),
                status: 'running',
                triggeredBy,
                triggeredByUserId: userId,
            });

            let output: any = null;
            let error: string | null = null;

            try {
                // Execute based on report type
                if (report.type === 'template' && report.templateId) {
                    output = await this.executeTemplateReport(report);
                } else if (report.type === 'query') {
                    output = await this.executeQueryReport(report);
                } else if (report.type === 'notebook') {
                    output = await this.executeNotebookReport(report);
                }
            } catch (err: any) {
                error = err.message || 'Execution failed';
                console.error('Report execution error:', err);
                executionFailures.inc();
            }

            const executionTimeMs = Date.now() - startTime;

            if (error) {
                await db.update(reportExecutions)
                    .set({
                        completedAt: new Date(),
                        executionTimeMs,
                        status: 'failed',
                        error,
                    })
                    .where(eq(reportExecutions.id, executionId));

                await db.update(scheduledReports)
                    .set({
                        failureCount: (report.failureCount || 0) + 1,
                    })
                    .where(eq(scheduledReports.id, reportId));
                executionFailures.inc();
            } else {
                // Delivery
                executionsCounter.inc();
                await this.deliverReport(executionId, report, output);

                await db.update(reportExecutions)
                    .set({
                        completedAt: new Date(),
                        executionTimeMs,
                        status: 'completed',
                        deliveryStatus: 'sent',
                        deliveredAt: new Date(),
                    })
                    .where(eq(reportExecutions.id, executionId));

                await db.update(scheduledReports)
                    .set({
                        executionCount: (report.executionCount || 0) + 1,
                        lastExecutedAt: new Date(),
                        nextExecutedAt: this.calculateNextExecutionTime(report.schedule),
                    })
                    .where(eq(scheduledReports.id, reportId));
                // successful execution
                // note: incremented above before delivery
            }

            return executionId;
        } catch (err: any) {
            console.error('Report execution failed:', err);

            await db.update(reportExecutions)
                .set({
                    completedAt: new Date(),
                    executionTimeMs: Date.now() - startTime,
                    status: 'failed',
                    error: err.message,
                })
                .where(eq(reportExecutions.id, executionId));

            throw err;
        }
    }

    /**
     * Execute template-based report
     */
    private static async executeTemplateReport(report: any): Promise<any> {
        if (!report.templateId) {
            throw new Error('Template ID required for template reports');
        }

        const template = await TemplateService.getTemplate(report.templateId);
        if (!template) {
            throw new Error('Template not found');
        }

        // Execute template with report parameters
        // This would call the template execution logic
        return {
            templateId: report.templateId,
            executedAt: new Date(),
        };
    }

    /**
     * Execute query-based report
     */
    private static async executeQueryReport(report: any): Promise<any> {
        // Execute query and format results
        return {
            type: 'query',
            executedAt: new Date(),
        };
    }

    /**
     * Execute notebook-based report
     */
    private static async executeNotebookReport(report: any): Promise<any> {
        // Execute notebook and capture output
        return {
            type: 'notebook',
            executedAt: new Date(),
        };
    }

    /**
     * Deliver report to recipients
     */
    private static async deliverReport(executionId: string, report: any, output: any): Promise<void> {
        const recipients = JSON.parse(report.recipients || '[]');

        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const fromEmail = process.env.FROM_EMAIL || smtpUser || 'no-reply@example.com';

        let transporter: nodemailer.Transporter | null = null;
        if (smtpHost && smtpPort && smtpUser && smtpPass) {
            transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: { user: smtpUser, pass: smtpPass },
            });
        }

        const successful: string[] = [];

        for (const recipient of recipients) {
            const email = recipient.email;
            const subject = `${report.title} - ${new Date().toLocaleDateString()}`;
            let sent = false;

            try {
                if (transporter) {
                    const body = `Please find the requested report "${report.title}" attached.\n\nSummary:\n${JSON.stringify(output, null, 2)}`;

                    const attachments: any[] = [];
                    attachments.push({ filename: `${report.id || 'report'}-${executionId}.json`, content: JSON.stringify(output || {}, null, 2) });

                    // Implement simple retry/backoff
                    const maxAttempts = parseInt(process.env.REPORT_SEND_RETRIES || '3');
                    const baseDelayMs = parseInt(process.env.REPORT_SEND_BASE_DELAY_MS || '1000');
                    let attempt = 0;
                    let lastErr: any = null;
                    while (attempt < maxAttempts) {
                        try {
                            attempt += 1;
                            await transporter.sendMail({ from: fromEmail, to: email, subject, text: body, attachments });
                            sent = true;
                            break;
                        } catch (sendErr) {
                            lastErr = sendErr;
                            const delay = baseDelayMs * Math.pow(2, attempt - 1);
                            console.warn(`[ScheduledReportService] send attempt ${attempt} failed for ${email}, retrying in ${delay}ms`);
                            await new Promise(res => setTimeout(res, delay));
                        }
                    }
                    if (!sent && lastErr) throw lastErr;
                } else {
                    console.warn('[ScheduledReportService] SMTP not configured; skipping send for', email);
                    sent = false;
                }

                await db.insert(reportDistributionLog).values({
                    id: uuidv4(),
                    executionId,
                    recipient: email,
                    subject,
                    sentAt: new Date(),
                    status: sent ? 'sent' : 'queued',
                    provider: transporter ? 'smtp' : 'inbox',
                });

                if (sent) {
                    successful.push(email);
                    deliveriesSent.inc();
                }
            } catch (error) {
                console.error(`Failed to deliver report to ${email}:`, error);
                await db.insert(reportDistributionLog).values({
                    id: uuidv4(),
                    executionId,
                    recipient: email,
                    subject,
                    sentAt: new Date(),
                    status: 'failed',
                    error: String(error),
                });
                deliveriesFailed.inc();
            }
        }

        await db.update(reportExecutions)
            .set({
                successfulRecipients: JSON.stringify(successful),
            })
            .where(eq(reportExecutions.id, executionId));
    }

    /**
     * Get execution history
     */
    static async getExecutionHistory(
        reportId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<any[]> {
        const executions = await db.query.reportExecutions.findMany({
            where: eq(reportExecutions.reportId, reportId),
            limit,
            offset,
        });

        return executions.map(e => ({
            ...e,
            successfulRecipients: e.successfulRecipients ? JSON.parse(String(e.successfulRecipients)) : [],
            failedRecipients: e.failedRecipients ? JSON.parse(String(e.failedRecipients)) : [],
        }));
    }

    /**
     * Schedule a report with cron
     */
    private static scheduleReport(reportId: string, cronExpression: string): void {
        try {
            const task = cron.schedule(cronExpression, async () => {
                try {
                    console.log(`[ScheduledReportService] Triggering scheduled report ${reportId}`);
                    await this.executeReport(reportId, 'schedule');
                } catch (err) {
                    console.error(`[ScheduledReportService] Error executing scheduled report ${reportId}:`, err);
                }
            }, { scheduled: true });

            this.cronJobs.set(reportId, {
                id: reportId,
                reportId,
                schedule: cronExpression,
                job: task,
            });

            const next = this.calculateNextExecutionTime(cronExpression);
            if (next) {
                db.update(scheduledReports).set({ nextExecutedAt: next }).where(eq(scheduledReports.id, reportId));
            }

            console.log(`[ScheduledReportService] Scheduled report ${reportId} with cron: ${cronExpression}`);
        } catch (err) {
            console.error(`[ScheduledReportService] Failed to schedule report ${reportId} cron=${cronExpression}:`, err);
        }
    }

    /**
     * Unschedule a report
     */
    private static unscheduleReport(reportId: string): void {
        const job = this.cronJobs.get(reportId);
        if (job && job.job) {
            try { job.job.stop(); } catch (e) { /* ignore */ }
        }
        this.cronJobs.delete(reportId);
        console.log(`[ScheduledReportService] Unscheduled report ${reportId}`);
    }

    /**
     * Calculate next execution time from cron expression
     */
    private static calculateNextExecutionTime(cronExpression: string): Date {
        try {
            const interval = cronParser.parseExpression(cronExpression, { utc: true });
            return interval.next().toDate();
        } catch (err) {
            console.error('Failed to parse cron expression for next execution time:', err);
            const nextTime = new Date();
            nextTime.setDate(nextTime.getDate() + 1);
            return nextTime;
        }
    }

    /**
     * Get execution stats
     */
    static async getExecutionStats(reportId: string): Promise<any> {
        const report = await db.query.scheduledReports.findFirst({
            where: eq(scheduledReports.id, reportId),
        });

        if (!report) {
            return null;
        }

        const totalExecutions = report.executionCount || 0;
        const failedExecutions = report.failureCount || 0;
        const successRate = totalExecutions > 0 ? ((totalExecutions - failedExecutions) / totalExecutions * 100) : 0;

        return {
            reportId,
            totalExecutions,
            successfulExecutions: totalExecutions - failedExecutions,
            failedExecutions,
            successRate: Math.round(successRate * 100) / 100,
            lastExecutedAt: report.lastExecutedAt,
            nextExecutedAt: report.nextExecutedAt,
        };
    }

    /**
     * Deserialize report from database
     */
    private static deserializeReport(report: any): any {
        return {
            ...report,
            recipients: report.recipients ? JSON.parse(String(report.recipients)) : [],
            parameters: report.parameters ? JSON.parse(String(report.parameters)) : {},
            filters: report.filters ? JSON.parse(String(report.filters)) : {},
        };
    }

    /**
     * Start all scheduled reports on server startup
     */
    static async initializeScheduledReports(): Promise<void> {
        console.log('[ScheduledReportService] Initializing scheduled reports from database...');

        const activeReports = await db.query.scheduledReports.findMany({
            where: eq(scheduledReports.isActive, true),
        });

        for (const report of activeReports) {
            this.scheduleReport(report.id, report.schedule);
        }

        console.log(`[ScheduledReportService] Initialized ${activeReports.length} scheduled reports`);
    }

    /**
     * Shutdown all scheduled reports
     */
    static shutdown(): void {
        console.log('[ScheduledReportService] Shutting down scheduled reports...');
        for (const job of this.cronJobs.values()) {
            if (job.job) {
                try { job.job.stop(); } catch (e) { /* ignore */ }
            }
        }

        this.cronJobs.clear();
        console.log('[ScheduledReportService] All scheduled reports stopped');
    }
}

export default ScheduledReportService;
