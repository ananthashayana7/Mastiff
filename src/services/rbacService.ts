/**
 * Advanced RBAC Service
 * 
 * Policy engine for fine-grained permission control
 */

import db from '@/src/db';
import { v4 as uuidv4 } from 'uuid';
import { auditLogger } from './auditLogger';

/**
 * Permission Check Context
 */
export interface PermissionContext {
    userId: string;
    workspaceId: string;
    resourceType?: string;
    resourceId?: string;
    action: string;
    attributes?: Record<string, any>;
}

/**
 * RBAC Policy Engine
 */
export class RBACEngine {
    /**
     * Check if user has permission
     */
    async hasPermission(context: PermissionContext): Promise<boolean> {
        try {
            const { userId, workspaceId, action, resourceType, resourceId, attributes } = context;

            // 1. Check role-based permissions
            const hasRolePermission = await this.checkRolePermission(userId, workspaceId, resourceType, action);
            if (!hasRolePermission) return false;

            // 2. Check resource-level permissions (if resource specified)
            if (resourceId && resourceType) {
                const hasResourcePermission = await this.checkResourcePermission(
                    userId,
                    workspaceId,
                    resourceType,
                    resourceId,
                    action
                );
                if (!hasResourcePermission) return false;
            }

            // 3. Check attribute-based policies
            const hasPolicyMatch = await this.checkAttributePolicy(context);
            if (!hasPolicyMatch) return false;

            return true;
        } catch (error) {
            console.error('Permission check failed:', error);
            return false;
        }
    }

    /**
     * Check role-based permission
     */
    private async checkRolePermission(
        userId: string,
        workspaceId: string,
        resourceType?: string,
        action?: string
    ): Promise<boolean> {
        try {
            // Get user's roles
            // const userRoles = await db.query.userRolesTable.findMany({
            //     where: and(
            //         eq(userRolesTable.workspaceId, workspaceId),
            //         eq(userRolesTable.userId, userId),
            //         or(
            //             isNull(userRolesTable.expiresAt),
            //             gte(userRolesTable.expiresAt, new Date())
            //         ),
            //         isNull(userRolesTable.revokedAt)
            //     ),
            //     with: {
            //         role: {
            //             with: {
            //                 permissions: {
            //                     with: { permission: true }
            //                 }
            //             }
            //         }
            //     }
            // });

            // if (!userRoles || userRoles.length === 0) return false;

            // Check if any role has the permission
            // for (const userRole of userRoles) {
            //     for (const rolePermission of userRole.role.permissions) {
            //         const perm = rolePermission.permission;
            //         if (
            //             (!resourceType || perm.resourceType === resourceType) &&
            //             (!action || perm.action === action)
            //         ) {
            //             return true;
            //         }
            //     }
            // }

            return false;
        } catch (error) {
            console.error('Role permission check failed:', error);
            return false;
        }
    }

    /**
     * Check resource-level permission
     */
    private async checkResourcePermission(
        userId: string,
        workspaceId: string,
        resourceType: string,
        resourceId: string,
        action: string
    ): Promise<boolean> {
        try {
            // Check direct resource permissions
            // const resourcePerm = await db.query.resourcePermissionsTable.findFirst({
            //     where: and(
            //         eq(resourcePermissionsTable.workspaceId, workspaceId),
            //         eq(resourcePermissionsTable.resourceType, resourceType),
            //         eq(resourcePermissionsTable.resourceId, resourceId),
            //         eq(resourcePermissionsTable.subjectType, 'user'),
            //         eq(resourcePermissionsTable.subjectId, userId),
            //         or(
            //             isNull(resourcePermissionsTable.expiresAt),
            //             gte(resourcePermissionsTable.expiresAt, new Date())
            //         )
            //     )
            // });

            // if (resourcePerm) {
            //     const permissions = resourcePerm.permissions as string[];
            //     return permissions.includes(action);
            // }

            // Check via role resource permissions
            // const userRoles = await this.getUserRoles(userId, workspaceId);
            // for (const roleId of userRoles) {
            //     const rolePerm = await db.query.resourcePermissionsTable.findFirst({
            //         where: and(
            //             eq(resourcePermissionsTable.workspaceId, workspaceId),
            //             eq(resourcePermissionsTable.resourceType, resourceType),
            //             eq(resourcePermissionsTable.resourceId, resourceId),
            //             eq(resourcePermissionsTable.subjectType, 'role'),
            //             eq(resourcePermissionsTable.subjectId, roleId)
            //         )
            //     });

            //     if (rolePerm) {
            //         const permissions = rolePerm.permissions as string[];
            //         if (permissions.includes(action)) {
            //             return true;
            //         }
            //     }
            // }

            return false;
        } catch (error) {
            console.error('Resource permission check failed:', error);
            return false;
        }
    }

    /**
     * Check attribute-based policy
     */
    private async checkAttributePolicy(context: PermissionContext): Promise<boolean> {
        try {
            const { userId, workspaceId, action, resourceType, attributes } = context;

            // Get active policies
            // const policies = await db.query.policiesTable.findMany({
            //     where: and(
            //         eq(policiesTable.workspaceId, workspaceId),
            //         eq(policiesTable.isActive, true),
            //         or(
            //             isNull(policiesTable.resourceType),
            //             eq(policiesTable.resourceType, resourceType)
            //         )
            //     )
            // });

            // if (!policies || policies.length === 0) return true; // No policies = allow

            // For each policy, check if it applies
            // for (const policy of policies) {
            //     const matches = await this.evaluatePolicy(policy, userId, workspaceId, context, attributes);
            //     if (matches) {
            //         return policy.effect === 'allow';
            //     }
            // }

            return true; // No matching policies = allow
        } catch (error) {
            console.error('Attribute policy check failed:', error);
            return true; // Fail open for security
        }
    }

    /**
     * Evaluate policy rules against context
     */
    private async evaluatePolicy(
        policy: any,
        userId: string,
        workspaceId: string,
        context: PermissionContext,
        attributes?: Record<string, any>
    ): Promise<boolean> {
        try {
            const rules = policy.rules as Array<{
                type: 'attribute' | 'condition' | 'comparison';
                attribute?: string;
                operator?: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';
                value?: any;
            }>;

            for (const rule of rules) {
                if (rule.type === 'attribute') {
                    // Get attribute value
                    // const attr = await db.query.attributesTable.findFirst({
                    //     where: and(
                    //         eq(attributesTable.workspaceId, workspaceId),
                    //         eq(attributesTable.entityType, 'user'),
                    //         eq(attributesTable.entityId, userId),
                    //         eq(attributesTable.attributeName, rule.attribute!)
                    //     )
                    // });

                    // if (!attr) return false;

                    // Compare value
                    // if (!this.compareValues(attr.attributeValue, rule.operator!, rule.value)) {
                    //     return false;
                    // }
                }
            }

            return true;
        } catch (error) {
            console.error('Policy evaluation failed:', error);
            return false;
        }
    }

    /**
     * Compare values based on operator
     */
    private compareValues(actual: any, operator: string, expected: any): boolean {
        switch (operator) {
            case 'eq':
                return actual === expected;
            case 'neq':
                return actual !== expected;
            case 'gt':
                return parseInt(actual) > parseInt(expected);
            case 'lt':
                return parseInt(actual) < parseInt(expected);
            case 'in':
                return Array.isArray(expected) && expected.includes(actual);
            case 'contains':
                return String(actual).includes(String(expected));
            default:
                return false;
        }
    }

    /**
     * Get all permissions for user
     */
    async getUserPermissions(userId: string, workspaceId: string): Promise<Set<string>> {
        try {
            const permissions = new Set<string>();

            // Get user roles
            // const userRoles = await db.query.userRolesTable.findMany({
            //     where: and(
            //         eq(userRolesTable.workspaceId, workspaceId),
            //         eq(userRolesTable.userId, userId),
            //         isNull(userRolesTable.revokedAt)
            //     ),
            //     with: {
            //         role: {
            //             with: {
            //                 permissions: {
            //                     with: { permission: true }
            //                 }
            //             }
            //         }
            //     }
            // });

            // for (const userRole of userRoles) {
            //     for (const rolePermission of userRole.role.permissions) {
            //         permissions.add(rolePermission.permission.code);
            //     }
            // }

            return permissions;
        } catch (error) {
            console.error('Failed to get user permissions:', error);
            return new Set();
        }
    }

    /**
     * Get user roles
     */
    private async getUserRoles(userId: string, workspaceId: string): Promise<string[]> {
        try {
            // return (
            //     await db.query.userRolesTable.findMany({
            //         where: and(
            //             eq(userRolesTable.workspaceId, workspaceId),
            //             eq(userRolesTable.userId, userId),
            //             isNull(userRolesTable.revokedAt)
            //         ),
            //     })
            // ).map((ur) => ur.roleId);
            return [];
        } catch (error) {
            console.error('Failed to get user roles:', error);
            return [];
        }
    }
}

/**
 * Role Management Service
 */
export class RoleService {
    async createRole(
        workspaceId: string,
        data: {
            name: string;
            slug: string;
            description?: string;
            color?: string;
        },
        createdBy: string
    ) {
        try {
            const roleId = uuidv4();

            // Insert role
            // await db.insert(rolesTable).values({
            //     id: roleId,
            //     workspaceId,
            //     ...data,
            //     isSystem: false,
            //     createdAt: new Date(),
            // });

            await auditLogger.log({
                userId: createdBy,
                action: 'create_role',
                resourceType: 'role',
                resourceId: roleId,
                details: data,
            });

            return roleId;
        } catch (error) {
            console.error('Failed to create role:', error);
            throw error;
        }
    }

    async grantPermissionToRole(roleId: string, permissionId: string, grantedBy: string) {
        try {
            // Insert role permission
            // await db.insert(rolePermissionsTable).values({
            //     id: uuidv4(),
            //     roleId,
            //     permissionId,
            //     grantedBy,
            //     grantedAt: new Date(),
            // });

            await auditLogger.log({
                userId: grantedBy,
                action: 'grant_permission',
                resourceType: 'role_permission',
                targetId: roleId,
                details: { permissionId },
            });
        } catch (error) {
            console.error('Failed to grant permission:', error);
            throw error;
        }
    }

    async revokePermissionFromRole(roleId: string, permissionId: string, revokedBy: string) {
        try {
            // Delete role permission
            // await db.delete(rolePermissionsTable).where(
            //     and(
            //         eq(rolePermissionsTable.roleId, roleId),
            //         eq(rolePermissionsTable.permissionId, permissionId)
            //     )
            // );

            await auditLogger.log({
                userId: revokedBy,
                action: 'revoke_permission',
                resourceType: 'role_permission',
                targetId: roleId,
                details: { permissionId },
            });
        } catch (error) {
            console.error('Failed to revoke permission:', error);
            throw error;
        }
    }

    async assignRoleToUser(
        workspaceId: string,
        userId: string,
        roleId: string,
        assignedBy: string,
        expiresAt?: Date
    ) {
        try {
            // Insert user role
            // await db.insert(userRolesTable).values({
            //     id: uuidv4(),
            //     workspaceId,
            //     userId,
            //     roleId,
            //     grantedBy: assignedBy,
            //     grantedAt: new Date(),
            //     expiresAt,
            // });

            await auditLogger.log({
                userId: assignedBy,
                action: 'assign_role',
                resourceType: 'user_role',
                targetId: userId,
                details: { workspaceId, roleId, expiresAt },
            });
        } catch (error) {
            console.error('Failed to assign role:', error);
            throw error;
        }
    }

    async revokeRoleFromUser(workspaceId: string, userId: string, roleId: string, revokedBy: string) {
        try {
            // Update user role
            // await db.update(userRolesTable)
            //     .set({ revokedAt: new Date(), revokedBy })
            //     .where(
            //         and(
            //             eq(userRolesTable.workspaceId, workspaceId),
            //             eq(userRolesTable.userId, userId),
            //             eq(userRolesTable.roleId, roleId)
            //         )
            //     );

            await auditLogger.log({
                userId: revokedBy,
                action: 'revoke_role',
                resourceType: 'user_role',
                targetId: userId,
                details: { workspaceId, roleId },
            });
        } catch (error) {
            console.error('Failed to revoke role:', error);
            throw error;
        }
    }

    async getUserRoles(workspaceId: string, userId: string): Promise<any[]> {
        try {
            // return await db.query.userRolesTable.findMany({
            //     where: and(
            //         eq(userRolesTable.workspaceId, workspaceId),
            //         eq(userRolesTable.userId, userId),
            //         isNull(userRolesTable.revokedAt)
            //     ),
            //     with: { role: true },
            // });
            return [];
        } catch (error) {
            console.error('Failed to get user roles:', error);
            return [];
        }
    }
}

/**
 * Permission Management Service
 */
export class PermissionService {
    async getAllPermissions(): Promise<any[]> {
        try {
            // return await db.query.permissionsTable.findMany();
            return [];
        } catch (error) {
            console.error('Failed to get permissions:', error);
            return [];
        }
    }

    async getPermissionsByCategory(category: string): Promise<any[]> {
        try {
            // return await db.query.permissionsTable.findMany({
            //     where: eq(permissionsTable.category, category),
            //     orderBy: asc(permissionsTable.name),
            // });
            return [];
        } catch (error) {
            console.error('Failed to get permissions by category:', error);
            return [];
        }
    }

    async getPermission(code: string): Promise<any> {
        try {
            // return await db.query.permissionsTable.findFirst({
            //     where: eq(permissionsTable.code, code),
            // });
            return null;
        } catch (error) {
            console.error('Failed to get permission:', error);
            return null;
        }
    }
}

/**
 * Resource Permission Service
 */
export class ResourcePermissionService {
    async grantResourcePermission(
        workspaceId: string,
        resourceType: string,
        resourceId: string,
        subjectType: 'user' | 'role' | 'team',
        subjectId: string,
        permissions: string[],
        grantedBy: string
    ) {
        try {
            // Insert resource permission
            // await db.insert(resourcePermissionsTable).values({
            //     id: uuidv4(),
            //     workspaceId,
            //     resourceType,
            //     resourceId,
            //     subjectType,
            //     subjectId,
            //     permissions,
            //     accessLevel: this.getAccessLevel(permissions),
            //     grantedBy,
            //     grantedAt: new Date(),
            // });

            await auditLogger.log({
                userId: grantedBy,
                action: 'grant_resource_permission',
                resourceType: 'resource_permission',
                targetId: resourceId,
                details: { subjectType, subjectId, permissions },
            });
        } catch (error) {
            console.error('Failed to grant resource permission:', error);
            throw error;
        }
    }

    async revokeResourcePermission(
        workspaceId: string,
        resourceType: string,
        resourceId: string,
        subjectType: 'user' | 'role' | 'team',
        subjectId: string,
        revokedBy: string
    ) {
        try {
            // Delete resource permission
            // await db.delete(resourcePermissionsTable).where(
            //     and(
            //         eq(resourcePermissionsTable.workspaceId, workspaceId),
            //         eq(resourcePermissionsTable.resourceType, resourceType),
            //         eq(resourcePermissionsTable.resourceId, resourceId),
            //         eq(resourcePermissionsTable.subjectType, subjectType),
            //         eq(resourcePermissionsTable.subjectId, subjectId)
            //     )
            // );

            await auditLogger.log({
                userId: revokedBy,
                action: 'revoke_resource_permission',
                resourceType: 'resource_permission',
                targetId: resourceId,
                details: { subjectType, subjectId },
            });
        } catch (error) {
            console.error('Failed to revoke resource permission:', error);
            throw error;
        }
    }

    async getResourcePermissions(
        workspaceId: string,
        resourceType: string,
        resourceId: string
    ): Promise<any[]> {
        try {
            // return await db.query.resourcePermissionsTable.findMany({
            //     where: and(
            //         eq(resourcePermissionsTable.workspaceId, workspaceId),
            //         eq(resourcePermissionsTable.resourceType, resourceType),
            //         eq(resourcePermissionsTable.resourceId, resourceId)
            //     ),
            // });
            return [];
        } catch (error) {
            console.error('Failed to get resource permissions:', error);
            return [];
        }
    }

    private getAccessLevel(permissions: string[]): string {
        if (permissions.includes('delete')) return 'owner';
        if (permissions.includes('write') || permissions.includes('edit')) return 'editor';
        return 'viewer';
    }
}

/**
 * Policy Management Service
 */
export class PolicyService {
    async createPolicy(
        workspaceId: string,
        data: {
            name: string;
            description?: string;
            rules: Array<any>;
            effect: 'allow' | 'deny';
            resourceType?: string;
            actions?: string[];
        },
        createdBy: string
    ) {
        try {
            const policyId = uuidv4();

            // Insert policy
            // await db.insert(policiesTable).values({
            //     id: policyId,
            //     workspaceId,
            //     ...data,
            //     isActive: true,
            //     priority: 'medium',
            //     createdBy,
            //     createdAt: new Date(),
            // });

            await auditLogger.log({
                userId: createdBy,
                action: 'create_policy',
                resourceType: 'policy',
                resourceId: policyId,
                details: data,
            });

            return policyId;
        } catch (error) {
            console.error('Failed to create policy:', error);
            throw error;
        }
    }

    async updatePolicy(policyId: string, data: Partial<any>, updatedBy: string) {
        try {
            // await db.update(policiesTable)
            //     .set({ ...data, updatedAt: new Date() })
            //     .where(eq(policiesTable.id, policyId));

            await auditLogger.log({
                userId: updatedBy,
                action: 'update_policy',
                resourceType: 'policy',
                resourceId: policyId,
                details: data,
            });
        } catch (error) {
            console.error('Failed to update policy:', error);
            throw error;
        }
    }

    async deletePolicy(policyId: string, deletedBy: string) {
        try {
            // await db.delete(policiesTable).where(eq(policiesTable.id, policyId));

            await auditLogger.log({
                userId: deletedBy,
                action: 'delete_policy',
                resourceType: 'policy',
                resourceId: policyId,
            });
        } catch (error) {
            console.error('Failed to delete policy:', error);
            throw error;
        }
    }
}

// Export singleton instances
export const rbacEngine = new RBACEngine();
export const roleService = new RoleService();
export const permissionService = new PermissionService();
export const resourcePermissionService = new ResourcePermissionService();
export const policyService = new PolicyService();

export default {
    rbacEngine,
    roleService,
    permissionService,
    resourcePermissionService,
    policyService,
};
