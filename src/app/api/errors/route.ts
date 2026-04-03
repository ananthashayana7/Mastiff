import { NextRequest, NextResponse } from 'next/server';
import { ErrorTrackingService } from '@/src/services/errorTrackingService';
import { RBACService } from '@/src/services/rbacService';
import { authenticateRequest } from '@/lib/auth';

/**
 * ERROR TRACKING API ROUTES - Phase 4.3
 * Error capture, alerting, and on-call management
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const organizationId = searchParams.get('organizationId') as string;

  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // GET /api/errors?action=list&organizationId=...
    if (action === 'list') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_errors');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const status = searchParams.get('status') || undefined;
      const severity = searchParams.get('severity') || undefined;
      const environment = searchParams.get('environment') || undefined;
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = parseInt(searchParams.get('offset') || '0');

      const errors = await ErrorTrackingService.getRecentErrors(organizationId, {
        status: status as any,
        severity: severity as any,
        environment: environment as any,
        limit,
        offset,
      });

      return NextResponse.json({ errors, count: errors.length }, { status: 200 });
    }

    // GET /api/errors?action=group&errorGroupId=...
    if (action === 'group') {
      const errorGroupId = searchParams.get('errorGroupId') as string;
      if (!errorGroupId) {
        return NextResponse.json({ error: 'errorGroupId required' }, { status: 400 });
      }

      const errorGroup = await ErrorTrackingService.getErrorGroup(errorGroupId);

      const hasPermission = await RBACService.hasPermission(
        userId,
        errorGroup.organizationId,
        'view_errors'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      return NextResponse.json({ errorGroup }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error tracking GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, organizationId } = body;

  try {
    const user = await authenticateRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    // POST /api/errors - Record error
    if (action === 'record-error') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'view_errors');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const result = await ErrorTrackingService.recordError({
        organizationId,
        workspaceId: body.workspaceId,
        errorType: body.errorType,
        errorMessage: body.errorMessage,
        stackTrace: body.stackTrace,
        context: body.context,
        breadcrumbs: body.breadcrumbs,
        environment: body.environment,
        releaseVersion: body.releaseVersion,
        sourceMapId: body.sourceMapId,
      });

      // Evaluate alert rules
      await ErrorTrackingService.evaluateAlertRules(result.errorGroupId);

      return NextResponse.json({ result }, { status: 201 });
    }

    // POST /api/errors - Start investigation
    if (action === 'investigate') {
      const errorGroupId = body.errorGroupId;
      if (!errorGroupId) {
        return NextResponse.json({ error: 'errorGroupId required' }, { status: 400 });
      }

      const errorGroup = await ErrorTrackingService.getErrorGroup(errorGroupId);
      const hasPermission = await RBACService.hasPermission(
        userId,
        errorGroup.organizationId,
        'manage_errors'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      await ErrorTrackingService.startInvestigation(errorGroupId, userId);

      return NextResponse.json({ status: 'investigating' }, { status: 200 });
    }

    // POST /api/errors - Resolve error
    if (action === 'resolve') {
      const errorGroupId = body.errorGroupId;
      if (!errorGroupId) {
        return NextResponse.json({ error: 'errorGroupId required' }, { status: 400 });
      }

      const errorGroup = await ErrorTrackingService.getErrorGroup(errorGroupId);
      const hasPermission = await RBACService.hasPermission(
        userId,
        errorGroup.organizationId,
        'manage_errors'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      await ErrorTrackingService.markResolved(errorGroupId, {
        rootCauseAnalysis: body.rootCauseAnalysis,
        fixDescription: body.fixDescription,
        fixCommitHash: body.fixCommitHash,
        fixReleaseVersion: body.fixReleaseVersion,
      });

      return NextResponse.json({ status: 'resolved' }, { status: 200 });
    }

    // POST /api/errors - Create alert rule
    if (action === 'create-alert-rule') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(
        userId,
        organizationId,
        'manage_settings'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const ruleId = await ErrorTrackingService.createAlertRule({
        organizationId,
        name: body.name,
        description: body.description,
        ruleType: body.ruleType,
        conditions: body.conditions,
        notificationChannelIds: body.notificationChannelIds,
        escalationPolicyId: body.escalationPolicyId,
        createIncident: body.createIncident,
        createdBy: userId,
      });

      return NextResponse.json({ ruleId }, { status: 201 });
    }

    // POST /api/errors - Create notification channel
    if (action === 'create-notification-channel') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(
        userId,
        organizationId,
        'manage_settings'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const channelId = await ErrorTrackingService.createNotificationChannel({
        organizationId,
        name: body.name,
        type: body.type,
        config: body.config,
      });

      return NextResponse.json({ channelId }, { status: 201 });
    }

    // POST /api/errors - Create on-call schedule
    if (action === 'create-on-call-schedule') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(
        userId,
        organizationId,
        'manage_settings'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const scheduleId = await ErrorTrackingService.createOnCallSchedule({
        organizationId,
        name: body.name,
        description: body.description,
        timezone: body.timezone,
        teamId: body.teamId,
        scheduleType: body.scheduleType,
        rotationDetails: body.rotationDetails,
      });

      return NextResponse.json({ scheduleId }, { status: 201 });
    }

    // POST /api/errors - Create escalation policy
    if (action === 'create-escalation-policy') {
      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }

      const hasPermission = await RBACService.hasPermission(
        userId,
        organizationId,
        'manage_settings'
      );
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const policyId = await ErrorTrackingService.createEscalationPolicy({
        organizationId,
        name: body.name,
        description: body.description,
        levels: body.levels,
        createdBy: userId,
      });

      return NextResponse.json({ policyId }, { status: 201 });
    }

    // POST /api/errors - Escalate alert
    if (action === 'escalate-alert') {
      const notificationId = body.notificationId;
      const escalationPolicyId = body.escalationPolicyId;

      if (!notificationId || !escalationPolicyId) {
        return NextResponse.json(
          { error: 'notificationId and escalationPolicyId required' },
          { status: 400 }
        );
      }

      if (!organizationId) {
        return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
      }
      const hasPermission = await RBACService.hasPermission(userId, organizationId, 'manage_errors');
      if (!hasPermission) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      await ErrorTrackingService.escalateAlert(notificationId, escalationPolicyId);

      return NextResponse.json({ status: 'escalated' }, { status: 200 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Error tracking POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
