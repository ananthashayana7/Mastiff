/**
 * RBAC Management API Routes
 * 
 * POST /api/rbac/roles - Create role
 * GET /api/rbac/roles - List roles
 * PUT /api/rbac/roles/:id - Update role
 * DELETE /api/rbac/roles/:id - Delete role
 * 
 * POST /api/rbac/roles/:id/permissions - Grant permission to role
 * DELETE /api/rbac/roles/:id/permissions/:permissionId - Revoke permission
 * 
 * POST /api/rbac/users/:userId/roles - Assign role to user
 * DELETE /api/rbac/users/:userId/roles/:roleId - Revoke role from user
 * GET /api/rbac/users/:userId/permissions - Get user permissions
 * 
 * POST /api/rbac/permissions - Get all permissions
 * GET /api/rbac/permissions/:code - Get permission details
 * 
 * POST /api/rbac/resources/:resourceId/share - Grant resource permission
 * GET /api/rbac/resources/:resourceId/permissions - Get resource permissions
 * DELETE /api/rbac/resources/:resourceId/share/:subjectId - Revoke resource permission
 * 
 * POST /api/rbac/policies - Create policy
 * GET /api/rbac/policies - List policies
 * PUT /api/rbac/policies/:id - Update policy
 * DELETE /api/rbac/policies/:id - Delete policy
 * 
 * GET /api/rbac/check - Check permission
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    rbacEngine,
    roleService,
    permissionService,
    resourcePermissionService,
    policyService,
} from '@/src/services/rbacService';
import { auditLogger } from '@/src/services/auditLogger';
import { getSession } from '@/src/lib/auth';
import { rateLimiter } from '@/src/middleware/rateLimit';

const limiter = rateLimiter({ windowMs: 60 * 1000, maxRequests: 100 });

/**
 * POST /api/rbac/roles
 * Create custom role
 */
export async function POST_role(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { workspaceId, name, slug, description, color } = body;

        if (!workspaceId || !name || !slug) {
            return NextResponse.json(
                { error: 'Missing required fields: workspaceId, name, slug' },
                { status: 400 }
            );
        }

        const roleId = await roleService.createRole(
            workspaceId,
            { name, slug, description, color },
            session.user.id
        );

        return NextResponse.json(
            {
                success: true,
                roleId,
                message: `Created role: ${name}`,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to create role:', error);
        return NextResponse.json(
            { error: 'Failed to create role' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/rbac/roles/:roleId/permissions
 * Grant permission to role
 */
export async function POST_rolePermission(
    request: NextRequest,
    { params }: { params: { roleId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { roleId } = params;
        const body = await request.json();
        const { permissionId } = body;

        if (!permissionId) {
            return NextResponse.json(
                { error: 'permissionId is required' },
                { status: 400 }
            );
        }

        await roleService.grantPermissionToRole(roleId, permissionId, session.user.id);

        return NextResponse.json(
            {
                success: true,
                message: 'Permission granted to role',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to grant permission:', error);
        return NextResponse.json(
            { error: 'Failed to grant permission' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/rbac/roles/:roleId/permissions/:permissionId
 * Revoke permission from role
 */
export async function DELETE_rolePermission(
    request: NextRequest,
    { params }: { params: { roleId: string; permissionId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { roleId, permissionId } = params;

        await roleService.revokePermissionFromRole(roleId, permissionId, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Permission revoked from role',
        });
    } catch (error) {
        console.error('Failed to revoke permission:', error);
        return NextResponse.json(
            { error: 'Failed to revoke permission' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/rbac/users/:userId/roles
 * Assign role to user
 */
export async function POST_userRole(
    request: NextRequest,
    { params }: { params: { userId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { userId } = params;
        const body = await request.json();
        const { workspaceId, roleId, expiresAt } = body;

        if (!workspaceId || !roleId) {
            return NextResponse.json(
                { error: 'Missing required fields: workspaceId, roleId' },
                { status: 400 }
            );
        }

        await roleService.assignRoleToUser(
            workspaceId,
            userId,
            roleId,
            session.user.id,
            expiresAt ? new Date(expiresAt) : undefined
        );

        return NextResponse.json(
            {
                success: true,
                message: 'Role assigned to user',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to assign role:', error);
        return NextResponse.json(
            { error: 'Failed to assign role' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/rbac/users/:userId/roles/:roleId
 * Revoke role from user
 */
export async function DELETE_userRole(
    request: NextRequest,
    { params }: { params: { userId: string; roleId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { userId, roleId } = params;
        const workspaceId = request.nextUrl.searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        await roleService.revokeRoleFromUser(workspaceId, userId, roleId, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Role revoked from user',
        });
    } catch (error) {
        console.error('Failed to revoke role:', error);
        return NextResponse.json(
            { error: 'Failed to revoke role' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/rbac/users/:userId/permissions
 * Get user's permissions
 */
export async function GET_userPermissions(
    request: NextRequest,
    { params }: { params: { userId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userId } = params;
        const workspaceId = request.nextUrl.searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        const permissions = await rbacEngine.getUserPermissions(userId, workspaceId);

        return NextResponse.json({
            success: true,
            permissions: Array.from(permissions),
            count: permissions.size,
        });
    } catch (error) {
        console.error('Failed to get user permissions:', error);
        return NextResponse.json(
            { error: 'Failed to get user permissions' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/rbac/permissions
 * List all permissions
 */
export async function POST_listPermissions(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { category } = body;

        let permissions: any[];
        if (category) {
            permissions = await permissionService.getPermissionsByCategory(category);
        } else {
            permissions = await permissionService.getAllPermissions();
        }

        return NextResponse.json({
            success: true,
            permissions,
            count: permissions.length,
        });
    } catch (error) {
        console.error('Failed to get permissions:', error);
        return NextResponse.json(
            { error: 'Failed to get permissions' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/rbac/permissions/:code
 * Get permission details
 */
export async function GET_permission(
    request: NextRequest,
    { params }: { params: { code: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { code } = params;
        const permission = await permissionService.getPermission(code);

        if (!permission) {
            return NextResponse.json(
                { error: 'Permission not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            permission,
        });
    } catch (error) {
        console.error('Failed to get permission:', error);
        return NextResponse.json(
            { error: 'Failed to get permission' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/rbac/resources/:resourceId/share
 * Grant resource permission
 */
export async function POST_shareResource(
    request: NextRequest,
    { params }: { params: { resourceId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { resourceId } = params;
        const body = await request.json();
        const { workspaceId, resourceType, subjectType, subjectId, permissions } = body;

        if (!workspaceId || !resourceType || !subjectType || !subjectId || !permissions) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        await resourcePermissionService.grantResourcePermission(
            workspaceId,
            resourceType,
            resourceId,
            subjectType,
            subjectId,
            permissions,
            session.user.id
        );

        return NextResponse.json(
            {
                success: true,
                message: 'Resource shared',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to share resource:', error);
        return NextResponse.json(
            { error: 'Failed to share resource' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/rbac/resources/:resourceId/permissions
 * Get resource permissions
 */
export async function GET_resourcePermissions(
    request: NextRequest,
    { params }: { params: { resourceId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { resourceId } = params;
        const workspaceId = request.nextUrl.searchParams.get('workspaceId');
        const resourceType = request.nextUrl.searchParams.get('resourceType') || 'notebook';

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        const permissions = await resourcePermissionService.getResourcePermissions(
            workspaceId,
            resourceType,
            resourceId
        );

        return NextResponse.json({
            success: true,
            permissions,
            count: permissions.length,
        });
    } catch (error) {
        console.error('Failed to get resource permissions:', error);
        return NextResponse.json(
            { error: 'Failed to get resource permissions' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/rbac/resources/:resourceId/share/:subjectId
 * Revoke resource permission
 */
export async function DELETE_unshareResource(
    request: NextRequest,
    { params }: { params: { resourceId: string; subjectId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { resourceId, subjectId } = params;
        const workspaceId = request.nextUrl.searchParams.get('workspaceId');
        const resourceType = request.nextUrl.searchParams.get('resourceType') || 'notebook';
        const subjectType = request.nextUrl.searchParams.get('subjectType') || 'user';

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        await resourcePermissionService.revokeResourcePermission(
            workspaceId,
            resourceType,
            resourceId,
            subjectType as any,
            subjectId,
            session.user.id
        );

        return NextResponse.json({
            success: true,
            message: 'Resource unshared',
        });
    } catch (error) {
        console.error('Failed to unshare resource:', error);
        return NextResponse.json(
            { error: 'Failed to unshare resource' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/rbac/policies
 * Create access policy
 */
export async function POST_policy(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { workspaceId, name, description, rules, effect, resourceType, actions } = body;

        if (!workspaceId || !name || !rules || !effect) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        const policyId = await policyService.createPolicy(
            workspaceId,
            {
                name,
                description,
                rules,
                effect,
                resourceType,
                actions,
            },
            session.user.id
        );

        return NextResponse.json(
            {
                success: true,
                policyId,
                message: `Created policy: ${name}`,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to create policy:', error);
        return NextResponse.json(
            { error: 'Failed to create policy' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/rbac/check
 * Check if user has permission
 */
export async function GET_checkPermission(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = request.nextUrl.searchParams.get('workspaceId');
        const action = request.nextUrl.searchParams.get('action');
        const resourceType = request.nextUrl.searchParams.get('resourceType');
        const resourceId = request.nextUrl.searchParams.get('resourceId');

        if (!workspaceId || !action) {
            return NextResponse.json(
                { error: 'Missing required parameters: workspaceId, action' },
                { status: 400 }
            );
        }

        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            action,
            resourceType: resourceType || undefined,
            resourceId: resourceId || undefined,
        });

        return NextResponse.json({
            success: true,
            hasPermission,
        });
    } catch (error) {
        console.error('Failed to check permission:', error);
        return NextResponse.json(
            { error: 'Failed to check permission' },
            { status: 500 }
        );
    }
}
