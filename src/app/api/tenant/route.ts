import { NextRequest, NextResponse } from 'next/server';
import { TenantService } from '@/src/services/tenantService';
import { RBACService } from '@/src/services/rbacService';

/**
 * MULTI-TENANT API ROUTES
 * Tenant management, compliance, and resource management
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const organizationId = searchParams.get('organizationId') as string;
  const userId = request.headers.get('x-user-id');

  try {
    // GET /api/tenant?action=get&organizationId=...
    if (action === 'get') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      // Check permission: user must be org admin
      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const tenant = await TenantService.getTenant(organizationId);
      return NextResponse.json({ tenant }, { status: 200 });
    }

    // GET /api/tenant?action=list
    if (action === 'list') {
      // Admin-only: check system admin role
      const isSystemAdmin = userId === 'system-admin'; // Would be verified via RBAC
      if (!isSystemAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const tier = searchParams.get('tier');
      const region = searchParams.get('region');
      const limit = parseInt(searchParams.get('limit') || '100');
      const offset = parseInt(searchParams.get('offset') || '0');

      const tenants = await TenantService.listTenants({
        tier: tier || undefined,
        region: region || undefined,
        limit,
        offset,
      });

      return NextResponse.json({ tenants }, { status: 200 });
    }

    // GET /api/tenant?action=quotas&organizationId=...
    if (action === 'quotas') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const quotas = await TenantService.checkQuotas(organizationId);
      return NextResponse.json({ quotas }, { status: 200 });
    }

    // GET /api/tenant?action=usage&organizationId=...&startDate=...&endDate=...
    if (action === 'usage') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_billing');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const startDate = new Date(searchParams.get('startDate') || new Date().toISOString());
      const endDate = new Date(searchParams.get('endDate') || new Date().toISOString());

      const usage = await TenantService.getUsageStats(organizationId, startDate, endDate);
      return NextResponse.json({ usage }, { status: 200 });
    }

    // GET /api/tenant?action=audit&organizationId=...&limit=100
    if (action === 'audit') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'audit_read');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const limit = parseInt(searchParams.get('limit') || '100');
      const auditTrail = await TenantService.getAuditTrail(organizationId, { limit });

      return NextResponse.json({ auditTrail }, { status: 200 });
    }

    // GET /api/tenant?action=compliance&organizationId=...
    if (action === 'compliance') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const compliance = await TenantService.getComplianceStatus(organizationId);
      return NextResponse.json({ compliance }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Tenant GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, organizationId } = body;
  const userId = request.headers.get('x-user-id');

  try {
    // POST /api/tenant - Onboard new tenant
    if (action === 'onboard') {
      // System admin only
      const isSystemAdmin = userId === 'system-admin';
      if (!isSystemAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const tenant = await TenantService.onboardTenant({
        organizationId: body.organizationId,
        name: body.name,
        slug: body.slug,
        email: body.email,
        billingEmail: body.billingEmail,
        tier: body.tier || 'free',
        dataRegion: body.dataRegion,
        supportTier: body.supportTier,
      });

      // Enable RLS for tenant
      await TenantService.enableRLS(tenant.organization_id as string);

      return NextResponse.json({ tenant, message: 'Tenant onboarded successfully' }, { status: 201 });
    }

    // POST /api/tenant - Enable RLS policies
    if (action === 'enable-rls') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const result = await TenantService.enableRLS(organizationId);
      return NextResponse.json(result, { status: 200 });
    }

    // POST /api/tenant - Record usage for billing
    if (action === 'record-usage') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_billing');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const resource = await TenantService.recordUsage(organizationId, {
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        apiCalls: body.apiCalls,
        tokensProcessed: body.tokensProcessed,
        computeSeconds: body.computeSeconds,
        dbSizeGb: body.dbSizeGb,
        fileSizeGb: body.fileSizeGb,
        peakConcurrentConnections: body.peakConcurrentConnections,
        peakDailyApiCalls: body.peakDailyApiCalls,
      });

      return NextResponse.json({ resource }, { status: 201 });
    }

    // POST /api/tenant - Log compliance event
    if (action === 'log-compliance') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const log = await TenantService.logComplianceEvent(organizationId, {
        eventType: body.eventType,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        actorId: body.actorId,
        action: body.action,
        isPiiAccessed: body.isPiiAccessed,
        isPhiAccessed: body.isPhiAccessed,
        status: body.status,
        reason: body.reason,
        ipAddress: body.ipAddress,
        requestId: body.requestId,
      });

      return NextResponse.json({ log }, { status: 201 });
    }

    // POST /api/tenant - Request data export (GDPR)
    if (action === 'export-data') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const exportRecord = await TenantService.requestDataExport(organizationId, {
        userId: body.userId,
        exportType: body.exportType,
        format: body.format,
        scope: body.scope,
      });

      // Log compliance event
      await TenantService.logComplianceEvent(organizationId, {
        eventType: 'data_export',
        resourceType: 'organization',
        actorId: body.userId,
        action: 'export',
        status: 'success',
      });

      return NextResponse.json({ export: exportRecord, message: 'Data export requested' }, { status: 201 });
    }

    // POST /api/tenant - Suspend tenant
    if (action === 'suspend') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      // System admin only
      const isSystemAdmin = userId === 'system-admin';
      if (!isSystemAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const suspension = await TenantService.suspendTenant(organizationId, {
        suspensionType: body.suspensionType,
        reasonCategory: body.reasonCategory,
        reasonDetails: body.reasonDetails,
        scheduledDeletionDays: body.scheduledDeletionDays,
        suspendedBy: userId,
      });

      // Log compliance event
      await TenantService.logComplianceEvent(organizationId, {
        eventType: 'settings_change',
        action: 'suspend',
        status: 'success',
        actorId: userId,
      });

      return NextResponse.json({ suspension }, { status: 200 });
    }

    // POST /api/tenant - Reactivate tenant
    if (action === 'reactivate') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const isSystemAdmin = userId === 'system-admin';
      if (!isSystemAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const tenant = await TenantService.reactivateTenant(organizationId, userId);

      await TenantService.logComplianceEvent(organizationId, {
        eventType: 'settings_change',
        action: 'reactivate',
        status: 'success',
        actorId: userId,
      });

      return NextResponse.json({ tenant }, { status: 200 });
    }

    // POST /api/tenant - Enable compliance features
    if (action === 'enable-compliance') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const tenant = await TenantService.enableCompliance(organizationId, {
        hipaa: body.hipaa,
        gdpr: body.gdpr,
        sox: body.sox,
        pci: body.pci,
      });

      return NextResponse.json({ tenant }, { status: 200 });
    }

    // POST /api/tenant - Schedule migration
    if (action === 'schedule-migration') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const isSystemAdmin = userId === 'system-admin';
      if (!isSystemAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const migration = await TenantService.scheduleMigration(organizationId, {
        targetRegion: body.targetRegion,
        migrationDate: new Date(body.migrationDate),
        scheduledBy: userId,
      });

      return NextResponse.json({ migration }, { status: 201 });
    }

    // POST /api/tenant - Terminate account
    if (action === 'terminate') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const termination = await TenantService.terminateTenant(organizationId, {
        reason: body.reason,
        terminatedBy: userId,
        dataRetentionDays: body.dataRetentionDays,
      });

      return NextResponse.json({ termination }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Tenant POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { organizationId } = body;
  const userId = request.headers.get('x-user-id');

  try {
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
    }

    // PUT /api/tenant - Update tenant configuration
    const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_settings');
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenant = await TenantService.updateTenant(organizationId, {
      name: body.name,
      description: body.description,
      billing_email: body.billingEmail,
      support_tier: body.supportTier,
      max_users: body.maxUsers,
      max_workspaces: body.maxWorkspaces,
      max_models: body.maxModels,
      // Additional fields can be updated
    });

    // Log compliance event
    await TenantService.logComplianceEvent(organizationId, {
      eventType: 'settings_change',
      action: 'update',
      status: 'success',
      actorId: userId,
    });

    return NextResponse.json({ tenant }, { status: 200 });
  } catch (error) {
    console.error('Tenant PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
