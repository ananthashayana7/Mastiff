import { db } from '@/src/db';
import {
  usageEvents,
  conversionFunnels,
  funnelEvents,
  cohorts,
  cohortAnalysis,
  featureAdoption,
  userSegments,
  userSessions,
  userBehaviorPatterns,
  eventHeatmaps,
  growthMetrics,
} from '@/src/db/usageAnalyticsSchema';
import crypto from 'crypto';

/**
 * USAGE ANALYTICS SERVICE - Phase 4.4
 * Funnel analysis, cohort tracking, feature adoption, and user segmentation
 */

export class UsageAnalyticsService {
  /**
   * ============================================================================
   * EVENT TRACKING
   * ============================================================================
   */

  /**
   * Record a usage event
   */
  static async recordEvent(params: {
    organizationId: string;
    workspaceId?: string;
    userId: string;
    sessionId: string;
    eventName: string;
    eventCategory: string;
    eventData?: any;
    properties?: any;
    context?: any;
  }) {
    const eventId = crypto.randomUUID();

    await db.insert(usageEvents).values({
      id: eventId,
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      sessionId: params.sessionId,
      eventName: params.eventName,
      eventCategory: params.eventCategory,
      eventData: params.eventData,
      properties: params.properties,
      context: params.context,
      timestamp: new Date(),
    });

    return eventId;
  }

  /**
   * ============================================================================
   * FUNNEL ANALYSIS
   * ============================================================================
   */

  /**
   * Create or update conversion funnel definition
   */
  static async createConversionFunnel(params: {
    organizationId: string;
    name: string;
    description?: string;
    steps: Array<{ step: number; eventName: string }>;
    analysisStartDate: Date;
    analysisEndDate: Date;
  }) {
    const funnelId = crypto.randomUUID();

    const funnel = await db.insert(conversionFunnels).values({
      id: funnelId,
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      steps: params.steps,
      analysisStartDate: params.analysisStartDate,
      analysisEndDate: params.analysisEndDate,
    });

    return funnelId;
  }

  /**
   * Analyze funnel completion rates and dropoff
   */
  static async analyzeFunnel(funnelId: string) {
    const funnel = await db.query.conversionFunnels.findFirst({
      where: (table) => table.id === funnelId,
      with: {
        funnelEvents: true,
      },
    });

    if (!funnel) {
      throw new Error('Funnel not found');
    }

    // Calculate metrics
    const steps = (funnel.steps as any[]) || [];
    const totalFunnelEntries = new Set(funnel.funnelEvents?.map((e: any) => e.sessionId)).size;
    const completions = funnel.funnelEvents?.filter((e: any) => e.completedFunnel).length || 0;
    const conversionRate =
      totalFunnelEntries > 0 ? (completions / totalFunnelEntries) * 100 : 0;

    // Step-by-step breakdown
    const stepMetrics: Record<string, any> = {};
    const dropoffRates: Record<string, number> = {};

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNumber = step.step;
      const usersAtStep = new Set(
        funnel.funnelEvents
          ?.filter((e: any) => e.stepNumber >= stepNumber)
          .map((e: any) => e.userId)
      ).size;
      stepMetrics[`step_${step.step}`] = { users: usersAtStep, eventName: step.eventName };

      if (i < steps.length - 1) {
        const nextStep = steps[i + 1];
        const usersAtNextStep = new Set(
          funnel.funnelEvents
            ?.filter((e: any) => e.stepNumber >= nextStep.step)
            .map((e: any) => e.userId)
        ).size;
        const dropoff = ((usersAtStep - usersAtNextStep) / usersAtStep) * 100;
        dropoffRates[`step_${step.step}_to_${nextStep.step}`] = dropoff;
      }
    }

    // Time calculation
    const conversionTimes = (funnel.funnelEvents as any[])
      ?.filter((e) => e.completedFunnel)
      .map((e) =>
        e.completedAt && e.sessionEnteredAt
          ? (e.completedAt.getTime() - e.sessionEnteredAt.getTime()) / 1000
          : null
      )
      .filter((t) => t !== null) as number[];

    const avgTimeToConversion =
      conversionTimes.length > 0
        ? Math.round(conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length)
        : undefined;

    // Update funnel
    await db
      .update(conversionFunnels)
      .set({
        totalUsers: totalFunnelEntries,
        totalConversions: completions,
        conversionRate: conversionRate.toString() as any,
        stepMetrics,
        dropoffRates,
        avgTimeToConversionSeconds: avgTimeToConversion,
      })
      .where((t) => t.id === funnelId);

    return {
      totalUsers: totalFunnelEntries,
      totalConversions: completions,
      conversionRate,
      stepMetrics,
      dropoffRates,
      avgTimeToConversion,
    };
  }

  /**
   * ============================================================================
   * COHORT ANALYSIS
   * ============================================================================
   */

  /**
   * Create a user cohort
   */
  static async createCohort(params: {
    organizationId: string;
    name: string;
    description?: string;
    cohortType: string; // acquisition, behavioral, demographic
    criteria: any;
    isAutomated?: boolean;
  }) {
    const cohortId = crypto.randomUUID();

    const cohort = await db.insert(cohorts).values({
      id: cohortId,
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      cohortType: params.cohortType,
      criteria: params.criteria,
      isAutomated: params.isAutomated || false,
    });

    return cohortId;
  }

  /**
   * Analyze cohort retention and engagement
   */
  static async analyzeCohort(cohortId: string) {
    const cohort = await db.query.cohorts.findFirst({
      where: (table) => table.id === cohortId,
      with: {
        analysis: true,
      },
    });

    if (!cohort) {
      throw new Error('Cohort not found');
    }

    // Build retention matrix
    // For each week/month in cohort, calculate retention at N weeks/months
    const retentionMatrix: Record<string, Record<number, number>> = {};

    // Placeholder for retention calculation
    // In production, this would query user activity data
    const avgRetention1Week = 85.5;
    const avgRetention2Week = 72.3;
    const avgRetention4Week = 58.9;
    const churnRate = 15.0;
    const avgLifespanDays = 45;

    // Update or create analysis
    const analysisRecord =
      cohort.analysis ||
      (await db.insert(cohortAnalysis).values({
        id: crypto.randomUUID(),
        cohortId,
        organizationId: cohort.organizationId,
        retentionMatrix,
        analysisDate: new Date(),
      }));

    await db
      .update(cohortAnalysis)
      .set({
        retentionMatrix,
        avgRetention1Week: avgRetention1Week.toString() as any,
        avgRetention2Week: avgRetention2Week.toString() as any,
        avgRetention4Week: avgRetention4Week.toString() as any,
        churnRate: churnRate.toString() as any,
        avgLifespanDays,
      })
      .where((t) => t.cohortId === cohortId);

    return {
      retentionMatrix,
      avgRetention1Week,
      avgRetention2Week,
      avgRetention4Week,
      churnRate,
      avgLifespanDays,
    };
  }

  /**
   * ============================================================================
   * FEATURE ADOPTION
   * ============================================================================
   */

  /**
   * Track feature adoption metrics
   */
  static async trackFeatureAdoption(params: {
    organizationId: string;
    featureName: string;
    featureCategory?: string;
    releaseVersion?: string;
    releaseDate?: Date;
  }) {
    const adoptionId = crypto.randomUUID();
    const analysisDate = new Date();

    // Placeholder metrics - in production would query actual usage
    const totalUsersExposed = 1000;
    const adoptingUsers = 450;
    const adoptionRate = (adoptingUsers / totalUsersExposed) * 100;

    await db.insert(featureAdoption).values({
      id: adoptionId,
      organizationId: params.organizationId,
      featureName: params.featureName,
      featureCategory: params.featureCategory,
      releaseVersion: params.releaseVersion,
      releaseDate: params.releaseDate,
      totalUsersExposed,
      adoptingUsers,
      adoptionRate: adoptionRate.toString() as any,
      avgDaysToFirstUse: '2.5' as any,
      medianDaysToFirstUse: 2,
      avgUsageFrequencyPerWeek: '3.2' as any,
      powerUserPercentage: '25.0' as any,
      dormantUserPercentage: '30.0' as any,
      activeUsersLastWeek: 320,
      churnedUsers: 50,
      impactScore: '78.5' as any,
      analysisDate,
    });

    return adoptionId;
  }

  /**
   * Get feature adoption trends
   */
  static async getFeatureAdoptionTrends(organizationId: string) {
    const features = await db.query.featureAdoption.findMany({
      where: (table) => table.organizationId === organizationId,
      orderBy: (table: any) => [table.analysisDate],
      limit: 100,
    });

    return features;
  }

  /**
   * ============================================================================
   * USER SEGMENTATION
   * ============================================================================
   */

  /**
   * Create user segment
   */
  static async createUserSegment(params: {
    organizationId: string;
    name: string;
    description?: string;
    criteria: any;
  }) {
    const segmentId = crypto.randomUUID();

    const segment = await db.insert(userSegments).values({
      id: segmentId,
      organizationId: params.organizationId,
      name: params.name,
      description: params.description,
      criteria: params.criteria,
    });

    return segmentId;
  }

  /**
   * Get user segments with metrics
   */
  static async getUserSegments(organizationId: string) {
    const segments = await db.query.userSegments.findMany({
      where: (table) => table.organizationId === organizationId && table.isActive === true,
    });

    return segments;
  }

  /**
   * ============================================================================
   * SESSION TRACKING
   * ============================================================================
   */

  /**
   * Start a user session
   */
  static async startSession(params: {
    organizationId: string;
    userId: string;
    deviceType?: string;
    osName?: string;
    browserName?: string;
    country?: string;
    region?: string;
    referrer?: string;
    campaignId?: string;
    source?: string;
    medium?: string;
  }) {
    const sessionId = crypto.randomUUID();

    const session = await db.insert(userSessions).values({
      id: sessionId,
      organizationId: params.organizationId,
      userId: params.userId,
      sessionStartedAt: new Date(),
      deviceType: params.deviceType,
      osName: params.osName,
      browserName: params.browserName,
      country: params.country,
      region: params.region,
      referrer: params.referrer,
      campaignId: params.campaignId,
      source: params.source,
      medium: params.medium,
    });

    return sessionId;
  }

  /**
   * End a session
   */
  static async endSession(sessionId: string, goalCompleted?: boolean) {
    const session = await db.query.userSessions.findFirst({
      where: (table) => table.id === sessionId,
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const durationSeconds = Math.round(
      (new Date().getTime() - (session.sessionStartedAt?.getTime() || 0)) / 1000
    );

    await db
      .update(userSessions)
      .set({
        sessionEndedAt: new Date(),
        durationSeconds,
        goalCompleted: goalCompleted || false,
      })
      .where((t) => t.id === sessionId);

    return durationSeconds;
  }

  /**
   * ============================================================================
   * BEHAVIOR ANALYSIS
   * ============================================================================
   */

  /**
   * Detect user behavior patterns
   */
  static async detectBehaviorPatterns(userId: string, organizationId: string) {
    const sessions = await db.query.userSessions.findMany({
      where: (table) => table.userId === userId && table.organizationId === organizationId,
      orderBy: (table: any) => [table.sessionStartedAt],
      limit: 100,
    });

    if (sessions.length === 0) {
      return null;
    }

    // Analyze patterns
    const lastSevenDaysSessions = sessions.filter(
      (s) =>
        s.sessionStartedAt &&
        new Date().getTime() - s.sessionStartedAt.getTime() < 7 * 24 * 60 * 60 * 1000
    );
    const sessionsPerWeek = lastSevenDaysSessions.length;
    const avgSessionDuration =
      sessions.length > 0
        ? sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / sessions.length / 60
        : 0;

    // Determine pattern type
    let patternType = 'casual_user';
    if (sessionsPerWeek >= 5) patternType = 'power_user';
    else if (sessionsPerWeek === 0) patternType = 'dormant_user';
    else if (avgSessionDuration < 2) patternType = 'at_risk_user';

    // Peak activity time
    const hourCounts: Record<number, number> = {};
    sessions.forEach((s) => {
      if (s.sessionStartedAt) {
        const hour = s.sessionStartedAt.getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    });
    const peakActivityHour =
      Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 0;

    const recordId = crypto.randomUUID();
    await db.insert(userBehaviorPatterns).values({
      id: recordId,
      organizationId,
      userId,
      patternType,
      avgSessionsPerWeek: sessionsPerWeek.toString() as any,
      avgSessionDurationMinutes: avgSessionDuration.toString() as any,
      peakActivityHour: parseInt(peakActivityHour),
      lastActiveAt: sessions[sessions.length - 1]?.sessionStartedAt,
      daysInactive: Math.floor(
        (new Date().getTime() -
          (sessions[sessions.length - 1]?.sessionStartedAt?.getTime() || 0)) /
          (1000 * 60 * 60 * 24)
      ),
      engagementTrend: sessionsPerWeek > 3 ? 'increasing' : 'decreasing',
      churnProbability: sessionsPerWeek === 0 ? 95 : sessionsPerWeek < 2 ? 60 : 10,
      analysisDate: new Date(),
    });

    return {
      patternType,
      sessionsPerWeek,
      avgSessionDuration,
      peakActivityHour,
    };
  }

  /**
   * ============================================================================
   * HEATMAP ANALYSIS
   * ============================================================================
   */

  /**
   * Build event heatmap by dimension
   */
  static async buildEventHeatmap(
    organizationId: string,
    eventName: string,
    dimension: string
  ) {
    // Dimension: hour_of_day, day_of_week, user_segment, geo, etc

    const events = await db.query.usageEvents.findMany({
      where: (table) =>
        table.organizationId === organizationId && table.eventName === eventName,
      limit: 10000,
    });

    // Build heatmap data based on dimension
    const heatmapData: Record<string, Record<string, number>> = {};

    // Placeholder logic - in production would build actual heatmap
    const peakValue = 500;
    const peakLabel = 'friday_18';
    const avgValue = 150;

    const heatmapId = crypto.randomUUID();
    await db.insert(eventHeatmaps).values({
      id: heatmapId,
      organizationId,
      eventName,
      dimension,
      heatmapData,
      peakValue,
      peakLabel,
      avgValue: avgValue.toString() as any,
      totalEvents: events.length,
      analysisDate: new Date(),
    });

    return heatmapId;
  }

  /**
   * ============================================================================
   * GROWTH METRICS
   * ============================================================================
   */

  /**
   * Calculate and track growth metrics
   */
  static async recordGrowthMetrics(params: {
    organizationId: string;
    periodDate: Date;
    periodType: string;
    newUsers: number;
    returningUsers: number;
    activeUsers: number;
    totalUsers: number;
    churnedUsers: number;
    sessions: number;
    avgEventsPerUser: number;
    avgSessionDurationMinutes: number;
    dayOneRetention?: number;
    day7Retention?: number;
    day30Retention?: number;
    monthlyRecurringRevenue?: number;
  }) {
    const metricsId = crypto.randomUUID();

    // Calculate growth rates
    const weekOverWeekGrowth =
      params.activeUsers > 0 ? ((params.newUsers / params.activeUsers) * 100).toFixed(2) : '0';
    const monthOverMonthGrowth = '12.5'; // Placeholder

    const metrics = await db.insert(growthMetrics).values({
      id: metricsId,
      organizationId: params.organizationId,
      periodDate: params.periodDate,
      periodType: params.periodType,
      newUsers: params.newUsers,
      returningUsers: params.returningUsers,
      activeUsers: params.activeUsers,
      totalUsers: params.totalUsers,
      churnedUsers: params.churnedUsers,
      weekOverWeekGrowth: weekOverWeekGrowth as any,
      monthOverMonthGrowth: monthOverMonthGrowth as any,
      sessions: params.sessions,
      avgEventsPerUser: params.avgEventsPerUser.toString() as any,
      avgSessionDurationMinutes: params.avgSessionDurationMinutes.toString() as any,
      dayOneRetention: params.dayOneRetention?.toString() as any,
      day7Retention: params.day7Retention?.toString() as any,
      day30Retention: params.day30Retention?.toString() as any,
      monthlyRecurringRevenue: params.monthlyRecurringRevenue?.toString() as any,
    });

    return metricsId;
  }

  /**
   * Get growth trends
   */
  static async getGrowthTrends(organizationId: string, periods: number = 12) {
    const metrics = await db.query.growthMetrics.findMany({
      where: (table) => table.organizationId === organizationId,
      orderBy: (table: any) => [table.periodDate],
      limit: periods,
    });

    return metrics;
  }

  /**
   * ============================================================================
   * REPORTING & DASHBOARDS
   * ============================================================================
   */

  /**
   * Generate comprehensive usage dashboard
   */
  static async getUsageDashboard(organizationId: string) {
    // Get latest metrics
    const latestGrowth = await db.query.growthMetrics.findFirst({
      where: (table) => table.organizationId === organizationId,
      orderBy: (table: any) => [table.periodDate],
    });

    const topFeatures = await db.query.featureAdoption.findMany({
      where: (table) => table.organizationId === organizationId,
      orderBy: (table: any) => [table.adoptingUsers],
      limit: 5,
    });

    const segments = await db.query.userSegments.findMany({
      where: (table) => table.organizationId === organizationId,
      limit: 10,
    });

    const growthTrends = await this.getGrowthTrends(organizationId, 12);

    return {
      currentMetrics: latestGrowth,
      topFeatures,
      userSegments: segments,
      growthTrends,
    };
  }

  /**
   * Generate funnel report
   */
  static async getFunnelReport(funnelId: string) {
    const funnel = await db.query.conversionFunnels.findFirst({
      where: (table) => table.id === funnelId,
      with: {
        funnelEvents: true,
      },
    });

    if (!funnel) {
      throw new Error('Funnel not found');
    }

    const analysis = await this.analyzeFunnel(funnelId);

    return {
      name: funnel.name,
      steps: funnel.steps,
      analysis,
    };
  }
}
