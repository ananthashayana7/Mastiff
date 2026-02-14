import { db } from '@/db';
import { auditLogs } from '@/db/auditSchema';
import { eq } from 'drizzle-orm';

/**
 * Audit Logging Service
 * 
 * Centralized service for logging all user actions
 */

export interface AuditLogParams {
  userId?: string;
  action: string; // e.g., user.login, file.upload, notebook.execute
  resourceType: string; // user, file, notebook, connection
  resourceId?: string;
  status: 'success' | 'failure' | 'warning';
  statusCode?: number;
  description?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  error?: string;
  duration?: number;
}

/**
 * Log an action to audit log
 */
export async function logAuditAction(params: AuditLogParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      status: params.status,
      statusCode: params.statusCode,
      description: params.description,
      details: params.details as any,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      error: params.error,
      duration: params.duration,
    });
  } catch (error) {
    console.error('Failed to log audit action:', error);
    // Don't throw - audit logging should not break the application
  }
}

/**
 * Get audit logs for a resource
 */
export async function getAuditLogsForResource(
  resourceType: string,
  resourceId: string,
  limit: number = 50
) {
  try {
    const logs = await db
      .select()
      .from(auditLogs)
      .where((t) => ({
        resourceType: eq(t.resourceType, resourceType),
        resourceId: eq(t.resourceId, resourceId),
      }))
      .limit(limit)
      .orderBy((t) => t.createdAt);

    return logs;
  } catch (error) {
    console.error('Failed to get audit logs:', error);
    return [];
  }
}

/**
 * Helper to extract IP address from request
 */
export function getClientIp(headers: any): string {
  const forwarded = headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0] : headers.get('x-real-ip') || 'unknown';
}

/**
 * Helper to get user agent from headers
 */
export function getUserAgent(headers: any): string {
  return headers.get('user-agent') || 'unknown';
}

/**
 * Create audit middleware for API routes
 */
export function createAuditMiddleware(action: string, resourceType: string) {
  return async (params: Partial<AuditLogParams>) => {
    await logAuditAction({
      action,
      resourceType,
      status: 'success',
      ...params,
    });
  };
}
