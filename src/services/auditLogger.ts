/**
 * Audit Logger Service
 * 
 * High-level service for logging audit events
 */

import { NextRequest } from 'next/server';

export interface AuditLogEntry {
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
}

/**
 * Extract information from request
 */
export function extractRequestInfo(request: NextRequest) {
    const ipAddress =
        request.headers.get('x-forwarded-for')?.split(',')[0] ||
        request.headers.get('x-real-ip') ||
        request.ip ||
        'unknown';

    const userAgent = request.headers.get('user-agent') || 'unknown';

    return { ipAddress, userAgent };
}

/**
 * Log user action
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
    try {
        const { auditLog } = await import('@/db/auditSchema');
        await auditLog.log(entry);
    } catch (err) {
        console.error('Failed to log audit event:', err);
        // Don't throw - ensure logging doesn't break the application
    }
}

/**
 * Log login event
 */
export async function logLoginEvent(data: {
    userId: string;
    email: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
    failureReason?: string;
    twoFactorUsed?: boolean;
}): Promise<void> {
    try {
        const { auditLog } = await import('@/db/auditSchema');
        await auditLog.logLogin(data);
    } catch (err) {
        console.error('Failed to log login event:', err);
    }
}

/**
 * Log file upload
 */
export async function logFileUpload(
    userId: string,
    fileId: string,
    filename: string,
    fileSize: number,
    request: NextRequest
): Promise<void> {
    const { ipAddress, userAgent } = extractRequestInfo(request);

    await logAuditEvent({
        userId,
        action: 'file.upload',
        resourceType: 'file',
        resourceId: fileId,
        status: 'success',
        description: `Uploaded file: ${filename}`,
        details: { filename, fileSize },
        ipAddress,
        userAgent,
    });
}

/**
 * Log file deletion
 */
export async function logFileDelete(
    userId: string,
    fileId: string,
    filename: string,
    request: NextRequest
): Promise<void> {
    const { ipAddress, userAgent } = extractRequestInfo(request);

    await logAuditEvent({
        userId,
        action: 'file.delete',
        resourceType: 'file',
        resourceId: fileId,
        status: 'success',
        description: `Deleted file: ${filename}`,
        ipAddress,
        userAgent,
    });
}

/**
 * Log session creation
 */
export async function logSessionCreate(
    userId: string,
    sessionId: string,
    title: string | undefined,
    request: NextRequest
): Promise<void> {
    const { ipAddress, userAgent } = extractRequestInfo(request);

    await logAuditEvent({
        userId,
        action: 'session.create',
        resourceType: 'session',
        resourceId: sessionId,
        status: 'success',
        description: `Created session${title ? ': ' + title : ''}`,
        ipAddress,
        userAgent,
    });
}

/**
 * Log code execution
 */
export async function logCodeExecution(
    userId: string,
    sessionId: string,
    codeLength: number,
    success: boolean,
    error?: string,
    duration?: number,
    request?: NextRequest
): Promise<void> {
    const info = request ? extractRequestInfo(request) : { ipAddress: 'system', userAgent: 'system' };

    await logAuditEvent({
        userId,
        action: 'code.execute',
        resourceType: 'execution',
        resourceId: sessionId,
        status: success ? 'success' : 'failure',
        description: `Code execution ${success ? 'completed' : 'failed'} (${codeLength} bytes)`,
        details: { codeLength, success },
        ipAddress: info.ipAddress,
        userAgent: info.userAgent,
        error: error,
        duration: duration,
    });
}

/**
 * Log security event
 */
export async function logSecurityEvent(
    userId: string | undefined,
    action: string,
    status: 'success' | 'failure' | 'warning',
    description: string,
    request: NextRequest,
    details?: Record<string, any>
): Promise<void> {
    const { ipAddress, userAgent } = extractRequestInfo(request);

    await logAuditEvent({
        userId,
        action: `security.${action}`,
        resourceType: 'security',
        status,
        description,
        details,
        ipAddress,
        userAgent,
    });
}

/**
 * Log settings change
 */
export async function logSettingChange(
    userId: string,
    settingName: string,
    oldValue: any,
    newValue: any,
    request: NextRequest
): Promise<void> {
    const { ipAddress, userAgent } = extractRequestInfo(request);

    await logAuditEvent({
        userId,
        action: 'setting.change',
        resourceType: 'setting',
        description: `Changed ${settingName}`,
        details: { settingName, oldValue, newValue },
        ipAddress,
        userAgent,
    });
}

/**
 * Log API access
 */
export async function logAPIAccess(
    userId: string | undefined,
    endpoint: string,
    method: string,
    statusCode: number,
    request: NextRequest,
    duration?: number
): Promise<void> {
    const { ipAddress, userAgent } = extractRequestInfo(request);

    await logAuditEvent({
        userId,
        action: `api.${method.toLowerCase()}`,
        resourceType: 'api',
        status: statusCode >= 200 && statusCode < 400 ? 'success' : 'failure',
        statusCode,
        description: `${method} ${endpoint}`,
        ipAddress,
        userAgent,
        duration,
    });
}

type AuditLoggerCompatEntry = {
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    targetId?: string;
    status?: 'success' | 'failure' | 'warning';
    statusCode?: number;
    description?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    error?: string;
    duration?: number;
};

/**
 * Backward-compatible logger API expected by legacy services.
 */
export const auditLogger = {
    async log(entry: AuditLoggerCompatEntry): Promise<void> {
        await logAuditEvent({
            userId: entry.userId,
            action: entry.action,
            resourceType: entry.resourceType || 'system',
            resourceId: entry.resourceId || entry.targetId,
            status: entry.status || 'success',
            statusCode: entry.statusCode,
            description: entry.description,
            details: entry.details,
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
            error: entry.error,
            duration: entry.duration,
        });
    },
};
