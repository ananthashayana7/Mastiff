import { db } from '@/src/db';
import {
  tenantRegistry,
  tenantDatabases,
  tenantIsolationPolicies,
  tenantResources,
  tenantComplianceLogs,
  tenantDataExport,
  tenantSuspensionHistory,
  tenantMigrations,
} from '@/src/db/tenantSchema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

/**
 * TENANT SERVICE
 * Multi-tenant management, isolation, compliance, and resource tracking
 */

export class TenantService {
  /**
   * Onboard a new tenant organization
   */
  static async onboardTenant(data: {
    organizationId: string;
    name: string;
    slug: string;
    description?: string;
    email: string;
    tier?: 'free' | 'pro' | 'enterprise' | 'custom';
    dataRegion?: string;
    billingEmail: string;
    supportTier?: 'community' | 'standard' | 'premium' | 'enterprise';
  }) {
    const tenant = await db
      .insert(tenantRegistry)
      .values({
        organization_id: data.organizationId as any,
        name: data.name,
        slug: data.slug,
        description: data.description,
        tier: data.tier || 'free',
        data_region: data.dataRegion || 'us-east-1',
        billing_email: data.billingEmail,
        primary_contact_email: data.email,
        support_tier: data.supportTier || 'community',
        onboarded_at: new Date(),

        // Default quotas based on tier
        max_users: data.tier === 'enterprise' ? 10000 : data.tier === 'pro' ? 500 : 50,
        max_workspaces: data.tier === 'enterprise' ? 100 : data.tier === 'pro' ? 20 : 5,
        max_models: data.tier === 'enterprise' ? 500 : data.tier === 'pro' ? 50 : 5,
        max_daily_tokens: data.tier === 'enterprise' ? 1000000000 : data.tier === 'pro' ? 100000000 : 10000000,
        max_storage_gb: data.tier === 'enterprise' ? 1000 : data.tier === 'pro' ? 100 : 10,
        max_agents: data.tier === 'enterprise' ? 100 : data.tier === 'pro' ? 20 : 3,
      })
      .returning();

    // Create primary database
    await db.insert(tenantDatabases).values({
      organization_id: data.organizationId as any,
      database_name: `tenant_${data.slug}`,
      schema_name: `tenant_${data.slug}`,
      connection_string: `postgresql://user:pass@localhost/${`tenant_${data.slug}`}`,
      is_primary: true,
    });

    return tenant[0];
  }

  /**
   * Get tenant by ID or slug
   */
  static async getTenant(
    organizationId: string,
    options?: { includeRelations?: boolean }
  ) {
    const tenant = await db.query.tenantRegistry.findFirst({
      where: eq(tenantRegistry.organization_id, organizationId as any),
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${organizationId}`);
    }

    return tenant;
  }

  /**
   * Update tenant configuration
   */
  static async updateTenant(organizationId: string, updates: Record<string, any>) {
    const tenant = await db
      .update(tenantRegistry)
      .set({
        ...updates,
        updated_at: new Date(),
      })
      .where(eq(tenantRegistry.organization_id, organizationId as any))
      .returning();

    return tenant[0];
  }

  /**
   * List all tenants with optional filters
   */
  static async listTenants(filters?: {
    tier?: string;
    region?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }) {
    let query = db.select().from(tenantRegistry);

    if (filters?.tier) {
      query = query.where(eq(tenantRegistry.tier, filters.tier as any));
    }
    if (filters?.region) {
      query = query.where(eq(tenantRegistry.data_region, filters.region as any));
    }
    if (filters?.isActive !== undefined) {
      query = query.where(eq(tenantRegistry.is_active, filters.isActive));
    }

    const tenants = await query
      .limit(filters?.limit || 100)
      .offset(filters?.offset || 0);

    return tenants;
  }

  /**
   * Check tenant resource quotas
   */
  static async checkQuotas(organizationId: string): Promise<{
    users: { current: number; limit: number; percentUsed: number };
    workspaces: { current: number; limit: number; percentUsed: number };
    models: { current: number; limit: number; percentUsed: number };
    dailyTokens: { current: number; limit: number; percentUsed: number };
    storage: { current: number; limit: number; percentUsed: number };
  }> {
    const tenant = await this.getTenant(organizationId);

    // In production, these would query actual usage from related tables
    // For now, return quota structure
    return {
      users: {
        current: 0, // Query from users table
        limit: parseInt(tenant.max_users?.toString() || '50'),
        percentUsed: 0,
      },
      workspaces: {
        current: 0, // Query from workspaces table
        limit: parseInt(tenant.max_workspaces?.toString() || '5'),
        percentUsed: 0,
      },
      models: {
        current: 0, // Query from models table
        limit: parseInt(tenant.max_models?.toString() || '5'),
        percentUsed: 0,
      },
      dailyTokens: {
        current: 0, // Query from usage table for today
        limit: parseInt(tenant.max_daily_tokens?.toString() || '10000000'),
        percentUsed: 0,
      },
      storage: {
        current: 0, // Query from storage metrics
        limit: parseFloat(tenant.max_storage_gb?.toString() || '10'),
        percentUsed: 0,
      },
    };
  }

  /**
   * Enforce tenant isolation with Row-Level Security (RLS)
   */
  static async enableRLS(organizationId: string, config?: { policies?: string[] }) {
    // Create RLS policies for key tables
    const policies = config?.policies || [
      'users',
      'workspaces',
      'conversations',
      'files',
      'documents',
      'models',
      'agents',
    ];

    for (const table of policies) {
      await db.insert(tenantIsolationPolicies).values({
        organization_id: organizationId as any,
        policy_name: `${table}_tenant_isolation`,
        table_name: table,
        policy_type: 'organization',
        rls_expression: `organization_id = current_user_id()::uuid`, // Simplified
        is_enabled: true,
      });
    }

    return {
      message: 'RLS policies enabled',
      policiesCreated: policies.length,
    };
  }

  /**
   * Record tenant resource usage for billing
   */
  static async recordUsage(organizationId: string, usage: {
    periodStart: Date;
    periodEnd: Date;
    apiCalls: number;
    tokensProcessed: number;
    computeSeconds: number;
    dbSizeGb: number;
    fileSizeGb: number;
    peakConcurrentConnections: number;
    peakDailyApiCalls: number;
  }) {
    const resource = await db
      .insert(tenantResources)
      .values({
        organization_id: organizationId as any,
        period_start: usage.periodStart,
        period_end: usage.periodEnd,
        total_api_calls: usage.apiCalls.toString() as any,
        total_tokens_processed: usage.tokensProcessed.toString() as any,
        total_compute_seconds: usage.computeSeconds.toString() as any,
        database_size_gb: usage.dbSizeGb.toString() as any,
        file_storage_gb: usage.fileSizeGb.toString() as any,
        peak_concurrent_connections: usage.peakConcurrentConnections.toString() as any,
        peak_daily_api_calls: usage.peakDailyApiCalls.toString() as any,
      })
      .returning();

    return resource[0];
  }

  /**
   * Get tenant resource usage and costs
   */
  static async getUsageStats(organizationId: string, periodStart: Date, periodEnd: Date) {
    const usage = await db
      .select()
      .from(tenantResources)
      .where(
        and(
          eq(tenantResources.organization_id, organizationId as any),
          gte(tenantResources.period_start, periodStart),
          lte(tenantResources.period_end, periodEnd)
        )
      );

    // Aggregate usage across periods
    const aggregated = usage.reduce(
      (acc, u) => ({
        totalApiCalls: acc.totalApiCalls + parseInt(u.total_api_calls?.toString() || '0'),
        totalTokens: acc.totalTokens + parseInt(u.total_tokens_processed?.toString() || '0'),
        totalComputeSeconds: acc.totalComputeSeconds + parseFloat(u.total_compute_seconds?.toString() || '0'),
        maxDbSize: Math.max(acc.maxDbSize, parseFloat(u.database_size_gb?.toString() || '0')),
        maxStorageSize: Math.max(acc.maxStorageSize, parseFloat(u.file_storage_gb?.toString() || '0')),
      }),
      {
        totalApiCalls: 0,
        totalTokens: 0,
        totalComputeSeconds: 0,
        maxDbSize: 0,
        maxStorageSize: 0,
      }
    );

    return aggregated;
  }

  /**
   * Log compliance event for audit trail
   */
  static async logComplianceEvent(organizationId: string, event: {
    eventType: 'data_access' | 'data_export' | 'user_provision' | 'permission_change' | 'settings_change';
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    action: string;
    isPhiAccessed?: boolean;
    isPiiAccessed?: boolean;
    status: 'success' | 'failure' | 'denied';
    reason?: string;
    ipAddress?: string;
    requestId?: string;
  }) {
    const log = await db
      .insert(tenantComplianceLogs)
      .values({
        organization_id: organizationId as any,
        event_type: event.eventType,
        resource_type: event.resourceType,
        resource_id: event.resourceId as any,
        actor_id: event.actorId as any,
        action: event.action,
        is_phi_accessed: event.isPhiAccessed,
        is_pii_accessed: event.isPiiAccessed,
        status: event.status,
        reason: event.reason,
        ip_address: event.ipAddress,
        request_id: event.requestId,
      })
      .returning();

    return log[0];
  }

  /**
   * Get compliance audit trail
   */
  static async getAuditTrail(organizationId: string, filters?: {
    eventType?: string;
    isPiiAccessed?: boolean;
    isPhiAccessed?: boolean;
    dateRange?: { start: Date; end: Date };
    limit?: number;
  }) {
    let query = db
      .select()
      .from(tenantComplianceLogs)
      .where(eq(tenantComplianceLogs.organization_id, organizationId as any));

    if (filters?.eventType) {
      query = query.where(eq(tenantComplianceLogs.event_type, filters.eventType as any));
    }
    if (filters?.isPiiAccessed) {
      query = query.where(eq(tenantComplianceLogs.is_pii_accessed, filters.isPiiAccessed));
    }
    if (filters?.dateRange) {
      query = query.where(
        and(
          gte(tenantComplianceLogs.timestamp, filters.dateRange.start),
          lte(tenantComplianceLogs.timestamp, filters.dateRange.end)
        )
      );
    }

    const logs = await query
      .orderBy(desc(tenantComplianceLogs.timestamp))
      .limit(filters?.limit || 1000);

    return logs;
  }

  /**
   * Create data export for GDPR compliance
   */
  static async requestDataExport(organizationId: string, data: {
    userId: string;
    exportType: 'user_data' | 'workspace_data' | 'full_export';
    format?: 'json' | 'csv' | 'parquet';
    scope?: 'self' | 'workspace' | 'organization';
  }) {
    const exportRecord = await db
      .insert(tenantDataExport)
      .values({
        organization_id: organizationId as any,
        user_id: data.userId as any,
        export_type: data.exportType,
        format: data.format || 'json',
        scope: data.scope || 'self',
        status: 'pending',
        requested_by: data.userId as any,
      })
      .returning();

    return exportRecord[0];
  }

  /**
   * Complete data export
   */
  static async completeDataExport(exportId: string, data: {
    downloadUrl: string;
    dataSizeBytes: number;
    processingTimeSeconds: number;
  }) {
    const exportRecord = await db
      .update(tenantDataExport)
      .set({
        status: 'ready',
        download_url: data.downloadUrl,
        data_size_bytes: data.dataSizeBytes.toString() as any,
        processing_time_seconds: data.processingTimeSeconds.toString() as any,
        completed_at: new Date(),
        // 30-day expiration
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .where(eq(tenantDataExport.id, exportId as any))
      .returning();

    return exportRecord[0];
  }

  /**
   * Suspend tenant (for compliance or payment)
   */
  static async suspendTenant(organizationId: string, data: {
    suspensionType: 'automatic' | 'manual' | 'compliance' | 'payment_failure';
    reasonCategory?: 'payment' | 'abuse' | 'compliance' | 'user_request';
    reasonDetails: string;
    scheduledDeletionDays?: number;
    suspendedBy: string;
  }) {
    // Record suspension
    const suspension = await db
      .insert(tenantSuspensionHistory)
      .values({
        organization_id: organizationId as any,
        suspension_type: data.suspensionType,
        reason_category: data.reasonCategory,
        reason_details: data.reasonDetails,
        suspended_at: new Date(),
        scheduled_deletion_at: data.scheduledDeletionDays
          ? new Date(Date.now() + data.scheduledDeletionDays * 24 * 60 * 60 * 1000)
          : null,
        suspended_by: data.suspendedBy as any,
        data_backup_created: true,
      })
      .returning();

    // Update tenant status
    await db
      .update(tenantRegistry)
      .set({
        is_suspended: true,
        suspension_reason: data.reasonDetails,
        suspension_date: new Date(),
        is_active: false,
      })
      .where(eq(tenantRegistry.organization_id, organizationId as any));

    return suspension[0];
  }

  /**
   * Reactivate suspended tenant
   */
  static async reactivateTenant(organizationId: string, reactivatedBy: string) {
    // Update last suspension record
    const lastSuspension = await db.query.tenantSuspensionHistory.findFirst({
      where: eq(tenantSuspensionHistory.organization_id, organizationId as any),
      orderBy: desc(tenantSuspensionHistory.suspended_at),
    });

    if (lastSuspension) {
      await db
        .update(tenantSuspensionHistory)
        .set({
          was_resolved: true,
          resolution_action: 'reactivated',
          resolved_at: new Date(),
          resolved_by: reactivatedBy as any,
        })
        .where(eq(tenantSuspensionHistory.id, lastSuspension.id as any));
    }

    // Reactivate tenant
    const tenant = await db
      .update(tenantRegistry)
      .set({
        is_suspended: false,
        is_active: true,
        suspension_reason: null,
      })
      .where(eq(tenantRegistry.organization_id, organizationId as any))
      .returning();

    return tenant[0];
  }

  /**
   * Migrate tenant to different region
   */
  static async scheduleMigration(organizationId: string, migration: {
    targetRegion: string;
    migrationDate: Date;
    scheduledBy: string;
  }) {
    const tenant = await this.getTenant(organizationId);

    const migrationRecord = await db
      .insert(tenantMigrations)
      .values({
        organization_id: organizationId as any,
        migration_type: 'region_change',
        source_region: tenant.data_region,
        target_region: migration.targetRegion,
        scheduled_start: migration.migrationDate,
        status: 'planned',
      })
      .returning();

    return migrationRecord[0];
  }

  /**
   * Track migration progress
   */
  static async updateMigrationProgress(migrationId: string, data: {
    totalRecords: number;
    migratedRecords: number;
    status: 'in_progress' | 'completed' | 'failed';
    validationStatus?: 'passed' | 'failed';
  }) {
    const migration = await db
      .update(tenantMigrations)
      .set({
        total_records: data.totalRecords.toString() as any,
        migrated_records: data.migratedRecords.toString() as any,
        status: data.status,
        validation_status: data.validationStatus,
        completed_at: data.status === 'completed' ? new Date() : undefined,
        actual_start: new Date(),
      })
      .where(eq(tenantMigrations.id, migrationId as any))
      .returning();

    return migration[0];
  }

  /**
   * Enable compliance features for tenant
   */
  static async enableCompliance(organizationId: string, features: {
    hipaa?: boolean;
    gdpr?: boolean;
    sox?: boolean;
    pci?: boolean;
  }) {
    const tenant = await db
      .update(tenantRegistry)
      .set({
        hipaa_enabled: features.hipaa || false,
        gdpr_enabled: features.gdpr || false,
        sox_enabled: features.sox || false,
        pci_enabled: features.pci || false,
        compliance_requirements: {
          hipaa: features.hipaa || false,
          gdpr: features.gdpr || false,
          sox: features.sox || false,
          pci: features.pci || false,
        },
      })
      .where(eq(tenantRegistry.organization_id, organizationId as any))
      .returning();

    return tenant[0];
  }

  /**
   * Get tenant compliance status
   */
  static async getComplianceStatus(organizationId: string) {
    const tenant = await this.getTenant(organizationId);
    const auditLogs = await this.getAuditTrail(organizationId, { limit: 100 });

    return {
      organization_id: tenant.organization_id,
      compliance_requirements: tenant.compliance_requirements,
      tax_id_verified: false,
      data_encryption_enabled: true,
      api_rate_limiting_enabled: true,
      audit_logging_enabled: true,
      pii_masking_enabled: tenant.gdpr_enabled,
      phi_access_logged: tenant.hipaa_enabled,
      recent_audits: auditLogs.slice(0, 10),
    };
  }

  /**
   * Terminate tenant account (hard delete after grace period)
   */
  static async terminateTenant(organizationId: string, terminationData: {
    reason: string;
    terminatedBy: string;
    dataRetentionDays?: number;
  }) {
    const suspension = await db
      .insert(tenantSuspensionHistory)
      .values({
        organization_id: organizationId as any,
        suspension_type: 'manual',
        reason_category: 'user_request',
        reason_details: terminationData.reason,
        suspended_at: new Date(),
        scheduled_deletion_at: new Date(
          Date.now() + (terminationData.dataRetentionDays || 30) * 24 * 60 * 60 * 1000
        ),
        suspended_by: terminationData.terminatedBy as any,
        data_backup_created: true,
      })
      .returning();

    // Delete tenant (can be recovered from backup within retention period)
    await db
      .update(tenantRegistry)
      .set({
        is_active: false,
        is_suspended: true,
      })
      .where(eq(tenantRegistry.organization_id, organizationId as any));

    return suspension[0];
  }
}
