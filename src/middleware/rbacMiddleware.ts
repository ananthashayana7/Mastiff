/**
 * RBAC Authorization Middleware
 * 
 * Permission checking for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { rbacEngine } from '@/src/services/rbacService';
import { getSession } from '@/src/lib/auth';

/**
 * Check permission middleware
 */
export function requirePermission(...actions: string[]) {
    return async (request: NextRequest, handler: Function) => {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = request.nextUrl.searchParams.get('workspaceId') || 
                          new URL(request.url).pathname.split('/')[3]; // Extract from path

        const hasPermission = await Promise.any(
            actions.map((action) =>
                rbacEngine.hasPermission({
                    userId: session.user.id,
                    workspaceId,
                    action,
                })
            )
        ).catch(() => false);

        if (!hasPermission) {
            return NextResponse.json(
                {
                    error: 'Forbidden',
                    message: `Requires one of: ${actions.join(', ')}`,
                },
                { status: 403 }
            );
        }

        return handler(request);
    };
}

/**
 * Check resource permission middleware
 */
export function requireResourcePermission(action: string) {
    return async (request: NextRequest, handler: Function) => {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resourceId = new URL(request.url).pathname.split('/').pop();
        const resourceType = new URL(request.url).pathname.split('/')[4]; // Extract from path

        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: request.nextUrl.searchParams.get('workspaceId') || '',
            resourceType,
            resourceId,
            action,
        });

        if (!hasPermission) {
            return NextResponse.json(
                {
                    error: 'Forbidden',
                    message: `Requires ${action} permission on this resource`,
                },
                { status: 403 }
            );
        }

        return handler(request);
    };
}

/**
 * Ownership check middleware
 */
export async function checkOwnership(
    userId: string,
    resourceType: string,
    resourceId: string,
    workspaceId: string
): Promise<boolean> {
    // Get resource owner
    // const resource = await db.query[`${resourceType}sTable`].findFirst({
    //     where: eq(baseTable.id, resourceId)
    // });

    // return resource?.createdBy === userId;
    return true; // Simplified for now
}
