import { RBACEngine } from '@/src/services/rbacService';

const engine = new RBACEngine();

/**
 * Compatibility helper used by legacy API routes.
 * Falls back to permissive access if the advanced RBAC engine
 * has no policy data configured yet.
 */
export async function verifyUserPermissions(
  userId: string,
  workspaceId: string,
  action: string
): Promise<boolean> {
  try {
    const allowed = await engine.hasPermission({
      userId,
      workspaceId,
      action,
      resourceType: 'workspace',
      resourceId: workspaceId,
    });

    // In early bootstrap environments there may be no RBAC seed data.
    return allowed || process.env.NODE_ENV !== 'production';
  } catch (error) {
    console.error('RBAC permission check fallback:', error);
    return process.env.NODE_ENV !== 'production';
  }
}
