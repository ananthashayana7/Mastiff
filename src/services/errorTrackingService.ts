import { db } from '@/src/db';
import {
  errorGroups,
  errorEvents,
  errorStackTraces,
  errorSourceMaps,
  errorBreadcrumbs,
  errorContext,
  errorResolution,
  alertRules,
  notificationChannels,
  alertNotifications,
  escalationPolicies,
  onCallSchedules,
  onCallShifts,
} from '@/src/db/errorTrackingSchema';
import { ObservabilityService } from '@/src/services/observabilityService';
import crypto from 'crypto';

/**
 * ERROR TRACKING SERVICE - Phase 4.3
 * Comprehensive error capture, grouping, alerting, and on-call management
 */

export class ErrorTrackingService {
  /**
   * Generate error fingerprint for grouping
   * Combines error type and message to create consistent grouping
   */
  private static generateFingerprint(errorType: string, errorMessage: string, stackTrace?: string): string {
    const hashInput = `${errorType}::${errorMessage}${stackTrace ? '::' + stackTrace.split('\n')[0] : ''}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * ============================================================================
   * ERROR CAPTURE & RECORDING
   * ============================================================================
   */

  /**
   * Record a single error event
   */
  static async recordError(params: {
    organizationId: string;
    workspaceId?: string;
    errorType: string;
    errorMessage: string;
    stackTrace: string;
    context: {
      userId?: string;
      sessionId?: string;
      url?: string;
      userAgent?: string;
      ipAddress?: string;
      [key: string]: any;
    };
    breadcrumbs?: Array<{
      category: string;
      level: 'info' | 'warning' | 'error' | 'debug';
      message?: string;
      data?: any;
    }>;
    environment?: string;
    releaseVersion?: string;
    sourceMapId?: string;
  }) {
    const fingerprint = this.generateFingerprint(
      params.errorType,
      params.errorMessage,
      params.stackTrace
    );

    // Get or create error group
    let errorGroup = await db.query.errorGroups.findFirst({
      where: (table) =>
        table.organizationId === params.organizationId &&
        table.errorFingerprint === fingerprint,
    });

    if (!errorGroup) {
      const groupId = crypto.randomUUID();
      errorGroup = await db.insert(errorGroups).values({
        id: groupId,
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        errorFingerprint: fingerprint,
        errorType: params.errorType,
        errorMessage: params.errorMessage,
        status: 'active',
        severity: this.calculateSeverity(params.errorType),
        totalOccurrences: 1,
        uniqueUsersAffected: params.context.userId ? 1 : 0,
        firstOccurredAt: new Date(),
        lastOccurredAt: new Date(),
        lastSeenUserId: params.context.userId,
        tags: [],
        environment: params.environment,
        releaseVersion: params.releaseVersion,
      });
    } else {
      // Update existing group
      await db
        .update(errorGroups)
        .set({
          totalOccurrences: errorGroup.totalOccurrences + 1,
          lastOccurredAt: new Date(),
          lastSeenUserId: params.context.userId || errorGroup.lastSeenUserId,
        })
        .where((t) => t.id === errorGroup.id);
    }

    // Store stack trace
    let stackTraceId: string | null = null;
    const stackTraceHash = crypto.createHash('sha256').update(params.stackTrace).digest('hex');

    const existingStackTrace = await db.query.errorStackTraces.findFirst({
      where: (table) =>
        table.organizationId === params.organizationId &&
        table.stackTraceHash === stackTraceHash,
    });

    if (existingStackTrace) {
      stackTraceId = existingStackTrace.id;
    } else {
      stackTraceId = crypto.randomUUID();
      const frames = this.parseStackTrace(params.stackTrace);

      await db.insert(errorStackTraces).values({
        id: stackTraceId,
        organizationId: params.organizationId,
        stackTraceHash,
        rawStackTrace: params.stackTrace,
        processedStackTrace: frames,
        sourceMapApplied: !!params.sourceMapId,
        frames: frames,
        rootCauseFrame: 0,
      });
    }

    // Record error event
    const eventId = crypto.randomUUID();
    await db.insert(errorEvents).values({
      id: eventId,
      organizationId: params.organizationId,
      errorGroupId: errorGroup.id,
      timestamp: new Date(),
      userId: params.context.userId,
      sessionId: params.context.sessionId,
      message: params.errorMessage,
      errorType: params.errorType,
      context: params.context,
      environment: params.environment,
      releaseVersion: params.releaseVersion,
      stackTraceId,
      sourceMapApplied: !!params.sourceMapId,
    });

    // Store error context
    const contextId = crypto.randomUUID();
    const userAgent = params.context.userAgent ? this.parseUserAgent(params.context.userAgent) : {};

    await db.insert(errorContext).values({
      id: contextId,
      errorEventId: eventId,
      organizationId: params.organizationId,
      userId: params.context.userId,
      sessionId: params.context.sessionId,
      environment: params.environment,
      releaseVersion: params.releaseVersion,
      userAgent: params.context.userAgent,
      ...userAgent,
      requestUrl: params.context.url,
      userIpAddress: params.context.ipAddress,
    });

    // Store breadcrumbs
    if (params.breadcrumbs && params.breadcrumbs.length > 0) {
      for (const breadcrumb of params.breadcrumbs) {
        await db.insert(errorBreadcrumbs).values({
          id: crypto.randomUUID(),
          errorEventId: eventId,
          organizationId: params.organizationId,
          timestamp: new Date(),
          category: breadcrumb.category,
          message: breadcrumb.message,
          level: breadcrumb.level,
          data: breadcrumb.data,
        });
      }
    }

    // Record metric in observability
    await ObservabilityService.recordMetric({
      organizationId: params.organizationId,
      metricName: 'error.occurred',
      metricType: 'counter',
      value: 1,
      dimensions: {
        errorType: params.errorType,
        errorFingerprintId: errorGroup.id,
        environment: params.environment || 'unknown',
        severity: errorGroup.severity,
      },
    });

    return { errorGroupId: errorGroup.id, errorEventId: eventId, isNewGroup: !errorGroup.id };
  }

  /**
   * ============================================================================
   * ERROR GROUPING & ANALYSIS
   * ============================================================================
   */

  /**
   * Get error group with related events and statistics
   */
  static async getErrorGroup(errorGroupId: string) {
    const group = await db.query.errorGroups.findFirst({
      where: (table) => table.id === errorGroupId,
      with: {
        errorEvents: {
          limit: 10,
          orderBy: (t) => [t.timestamp],
        },
        errorResolution: true,
      },
    });

    if (!group) {
      throw new Error('Error group not found');
    }

    return group;
  }

  /**
   * Get recent errors for an organization
   */
  static async getRecentErrors(
    organizationId: string,
    filters?: {
      status?: string;
      severity?: string;
      environment?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    let query = db.select().from(errorGroups).where((t) => t.organizationId === organizationId);

    if (filters?.status) {
      query = query.where((t) => t.status === filters.status);
    }
    if (filters?.severity) {
      query = query.where((t) => t.severity === filters.severity);
    }
    if (filters?.environment) {
      query = query.where((t) => t.environment === filters.environment);
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const groups = await query.limit(limit).offset(offset).orderBy((t) => [t.lastOccurredAt]);

    return groups;
  }

  /**
   * ============================================================================
   * ERROR RESOLUTION
   * ============================================================================
   */

  /**
   * Start investigation on error group
   */
  static async startInvestigation(errorGroupId: string, assignedToUserId: string) {
    const resolution =
      (await db.query.errorResolution.findFirst({
        where: (table) => table.errorGroupId === errorGroupId,
      })) ||
      (await db.insert(errorResolution).values({
        id: crypto.randomUUID(),
        errorGroupId,
        organizationId: (await db.query.errorGroups.findFirst({
          where: (t) => t.id === errorGroupId,
        }))!.organizationId,
        status: 'investigating',
        assignedToUserId,
        investigationStartedAt: new Date(),
      }));

    return resolution;
  }

  /**
   * Mark error as resolved
   */
  static async markResolved(
    errorGroupId: string,
    data: {
      rootCauseAnalysis: string;
      fixDescription: string;
      fixCommitHash?: string;
      fixReleaseVersion?: string;
    }
  ) {
    const group = await db.query.errorGroups.findFirst({
      where: (t) => t.id === errorGroupId,
    });

    if (!group) {
      throw new Error('Error group not found');
    }

    const resolutionTimeMinutes = Math.round(
      (new Date().getTime() - (group.firstOccurredAt?.getTime() || 0)) / (1000 * 60)
    );

    const resolution = await db
      .update(errorResolution)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        rootCauseAnalysis: data.rootCauseAnalysis,
        fixDescription: data.fixDescription,
        fixCommitHash: data.fixCommitHash,
        fixReleaseVersion: data.fixReleaseVersion,
        resolutionTimeMinutes,
      })
      .where((t) => t.errorGroupId === errorGroupId);

    await db.update(errorGroups).set({
      status: 'resolved',
      resolvedAt: new Date(),
      resolutionNotes: data.fixDescription,
    });

    return resolution;
  }

  /**
   * ============================================================================
   * ALERTING
   * ============================================================================
   */

  /**
   * Create alert rule
   */
  static async createAlertRule(params: {
    organizationId: string;
    name: string;
    description?: string;
    ruleType: string;
    conditions: any;
    notificationChannelIds: string[];
    escalationPolicyId?: string;
    createIncident?: boolean;
    createdBy: string;
  }) {
    const ruleId = crypto.randomUUID();

    await db.insert(alertRules).values({
      id: ruleId,
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      ruleType: params.ruleType,
      conditions: params.conditions,
      notificationChannelIds: params.notificationChannelIds,
      escalationPolicyId: params.escalationPolicyId,
      createIncident: params.createIncident || false,
      createdBy: params.createdBy,
    });

    return ruleId;
  }

  /**
   * Evaluate alert rules for error group
   */
  static async evaluateAlertRules(errorGroupId: string) {
    const group = await db.query.errorGroups.findFirst({
      where: (t) => t.id === errorGroupId,
    });

    if (!group) {
      return;
    }

    // Get all active alert rules for organization
    const rules = await db.query.alertRules.findMany({
      where: (t) => t.organizationId === group.organizationId && t.isEnabled === true,
    });

    for (const rule of rules) {
      const shouldAlert = this.evaluateRule(rule, group);

      if (shouldAlert) {
        // Trigger alert notifications
        await this.triggerAlertRule(rule, group);
      }
    }
  }

  /**
   * Trigger alert rule (send notifications)
   */
  private static async triggerAlertRule(rule: any, errorGroup: any) {
    for (const channelId of rule.notificationChannelIds || []) {
      const notification = await db.insert(alertNotifications).values({
        id: crypto.randomUUID(),
        organizationId: errorGroup.organizationId,
        errorGroupId: errorGroup.id,
        alertRuleId: rule.id,
        notificationChannelId: channelId,
        status: 'pending',
        message: `Alert: ${rule.name} - ${errorGroup.errorMessage}`,
        escalationLevel: 1,
      });

      // Send notification through channel
      await this.sendNotification(channelId, notification);
    }
  }

  /**
   * ============================================================================
   * NOTIFICATION CHANNELS
   * ============================================================================
   */

  /**
   * Create notification channel
   */
  static async createNotificationChannel(params: {
    organizationId: string;
    name: string;
    type: string; // email, slack, pagerduty, webhook, sms, teams, discord
    config: any;
  }) {
    const channelId = crypto.randomUUID();

    await db.insert(notificationChannels).values({
      id: channelId,
      organizationId: params.organizationId,
      name: params.name,
      type: params.type,
      config: params.config,
    });

    return channelId;
  }

  /**
   * Send notification through channel
   */
  static async sendNotification(channelId: string, notification: any) {
    const channel = await db.query.notificationChannels.findFirst({
      where: (t) => t.id === channelId,
    });

    if (!channel || !channel.isEnabled) {
      return;
    }

    try {
      switch (channel.type) {
        case 'email':
          await this.sendEmailNotification(channel, notification);
          break;
        case 'slack':
          await this.sendSlackNotification(channel, notification);
          break;
        case 'pagerduty':
          await this.sendPagerDutyNotification(channel, notification);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, notification);
          break;
        case 'teams':
          await this.sendTeamsNotification(channel, notification);
          break;
        case 'discord':
          await this.sendDiscordNotification(channel, notification);
          break;
      }

      await db
        .update(alertNotifications)
        .set({ status: 'sent', sentAt: new Date() })
        .where((t) => t.id === notification.id);
    } catch (error) {
      console.error(`Failed to send notification: ${error}`);

      await db
        .update(alertNotifications)
        .set({
          status: 'failed',
          failureReason: error instanceof Error ? error.message : 'Unknown error',
        })
        .where((t) => t.id === notification.id);
    }
  }

  /**
   * ============================================================================
   * ON-CALL MANAGEMENT
   * ============================================================================
   */

  /**
   * Create on-call schedule
   */
  static async createOnCallSchedule(params: {
    organizationId: string;
    name: string;
    description?: string;
    timezone?: string;
    teamId?: string;
    scheduleType: string; // daily, weekly, custom
    rotationDetails: any;
  }) {
    const scheduleId = crypto.randomUUID();

    const schedule = await db.insert(onCallSchedules).values({
      id: scheduleId,
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      timezone: params.timezone || 'UTC',
      teamId: params.teamId,
      scheduleType: params.scheduleType,
      rotationDetails: params.rotationDetails,
    });

    return scheduleId;
  }

  /**
   * Get current on-call user for schedule
   */
  static async getCurrentOnCallUser(scheduleId: string) {
    const now = new Date();

    const shift = await db.query.onCallShifts.findFirst({
      where: (t) =>
        t.onCallScheduleId === scheduleId &&
        t.shiftStartAt <= now &&
        t.shiftEndAt > now &&
        t.isActive === true,
    });

    return shift?.userId || null;
  }

  /**
   * ============================================================================
   * ESCALATION
   * ============================================================================
   */

  /**
   * Create escalation policy
   */
  static async createEscalationPolicy(params: {
    organizationId: string;
    name: string;
    description?: string;
    levels: Array<{
      level: number;
      delayMinutes: number;
      notificationChannelIds: string[];
      onCallScheduleIds?: string[];
    }>;
    createdBy: string;
  }) {
    const policyId = crypto.randomUUID();

    await db.insert(escalationPolicies).values({
      id: policyId,
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      levels: params.levels,
      createdBy: params.createdBy,
    });

    return policyId;
  }

  /**
   * Escalate alert
   */
  static async escalateAlert(notificationId: string, escalationPolicyId: string) {
    const notification = await db.query.alertNotifications.findFirst({
      where: (t) => t.id === notificationId,
    });

    if (!notification) {
      return;
    }

    const policy = await db.query.escalationPolicies.findFirst({
      where: (t) => t.id === escalationPolicyId,
    });

    if (!policy) {
      return;
    }

    const levels = policy.levels as any[];
    const nextLevel = levels.find((l) => l.level === (notification.escalationLevel || 0) + 1);

    if (!nextLevel) {
      return; // No next level
    }

    // Send to next escalation level channels
    for (const channelId of nextLevel.notificationChannelIds) {
      const newNotification = await db.insert(alertNotifications).values({
        id: crypto.randomUUID(),
        organizationId: notification.organizationId,
        errorGroupId: notification.errorGroupId,
        alertRuleId: notification.alertRuleId,
        notificationChannelId: channelId,
        status: 'pending',
        message: `[ESCALATED] ${notification.message}`,
        escalationLevel: nextLevel.level,
      });

      await this.sendNotification(channelId, newNotification);
    }

    // Update original notification
    await db
      .update(alertNotifications)
      .set({ escalationLevel: nextLevel.level })
      .where((t) => t.id === notificationId);
  }

  /**
   * ============================================================================
   * HELPERS
   * ============================================================================
   */

  private static calculateSeverity(errorType: string): string {
    const criticalErrors = ['OutOfMemoryError', 'StackOverflowError', 'SystemStackOverflow'];
    const highSeverityErrors = ['TypeError', 'ReferenceError', 'SyntaxError', 'URIError'];

    if (criticalErrors.includes(errorType)) {
      return 'critical';
    }
    if (highSeverityErrors.includes(errorType)) {
      return 'high';
    }
    if (errorType.includes('Warning')) {
      return 'low';
    }

    return 'medium';
  }

  private static parseStackTrace(stackTrace: string): any[] {
    const lines = stackTrace.split('\n');
    const frames: any[] = [];

    for (const line of lines) {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        frames.push({
          function: match[1],
          file: match[2],
          line: parseInt(match[3]),
          column: parseInt(match[4]),
        });
      }
    }

    return frames;
  }

  private static parseUserAgent(userAgent: string) {
    // Simple user agent parsing
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';
    let osName = 'Unknown';
    let osVersion = 'Unknown';

    if (userAgent.includes('Chrome')) {
      browserName = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (userAgent.includes('Firefox')) {
      browserName = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    } else if (userAgent.includes('Safari')) {
      browserName = 'Safari';
      const match = userAgent.match(/Version\/(\d+\.\d+)/);
      if (match) browserVersion = match[1];
    }

    if (userAgent.includes('Windows')) {
      osName = 'Windows';
      if (userAgent.includes('Windows NT 10.0')) osVersion = '10';
    } else if (userAgent.includes('Mac')) {
      osName = 'macOS';
      const match = userAgent.match(/Mac OS X ([\d_]+)/);
      if (match) osVersion = match[1].replace(/_/g, '.');
    } else if (userAgent.includes('Linux')) {
      osName = 'Linux';
    } else if (userAgent.includes('iPad')) {
      osName = 'iPadOS';
    } else if (userAgent.includes('iPhone')) {
      osName = 'iOS';
    } else if (userAgent.includes('Android')) {
      osName = 'Android';
    }

    return { browserName, browserVersion, osName, osVersion };
  }

  private static evaluateRule(rule: any, group: any): boolean {
    const conditions = rule.conditions || {};

    // Error type match
    if (conditions.errorType && conditions.errorType !== group.errorType) {
      return false;
    }

    // Severity match
    if (conditions.severity && !conditions.severity.includes(group.severity)) {
      return false;
    }

    // Environment match
    if (conditions.environment && conditions.environment !== group.environment) {
      return false;
    }

    // High occurrence threshold
    if (conditions.threshold && group.totalOccurrences < conditions.threshold) {
      return false;
    }

    return true;
  }

  private static async sendEmailNotification(channel: any, notification: any) {
    // TODO: Implement actual email sending via SendGrid, AWS SES, etc.
    console.log(`[Email] Sending to: ${channel.config.recipients}`, notification.message);
  }

  private static async sendSlackNotification(channel: any, notification: any) {
    // TODO: Implement Slack webhook
    console.log(`[Slack] Sending to channel`, notification.message);
  }

  private static async sendPagerDutyNotification(channel: any, notification: any) {
    // TODO: Implement PagerDuty integration
    console.log(`[PagerDuty] Creating incident`, notification.message);
  }

  private static async sendWebhookNotification(channel: any, notification: any) {
    // TODO: Implement webhook POST
    console.log(`[Webhook] POSTing to: ${channel.config.url}`, notification.message);
  }

  private static async sendTeamsNotification(channel: any, notification: any) {
    // TODO: Implement Teams webhook
    console.log(`[Teams] Sending to Teams`, notification.message);
  }

  private static async sendDiscordNotification(channel: any, notification: any) {
    // TODO: Implement Discord webhook
    console.log(`[Discord] Sending to Discord`, notification.message);
  }
}
