/**
 * Workspace Management API Routes
 * 
 * POST /api/workspaces/orgs - Create organization
 * GET /api/workspaces/orgs - List organizations
 * GET /api/workspaces/:id - Get workspace
 * POST /api/workspaces - Create workspace
 * GET /api/workspaces - List user workspaces
 * PUT /api/workspaces/:id - Update workspace
 * DELETE /api/workspaces/:id - Delete workspace
 * 
 * POST /api/workspaces/:id/members - Add member
 * GET /api/workspaces/:id/members - List members
 * PUT /api/workspaces/:id/members/:userId - Update member role
 * DELETE /api/workspaces/:id/members/:userId - Remove member
 * POST /api/workspaces/:id/invite - Invite user
 * POST /api/workspaces/invite/accept - Accept invite
 * 
 * POST /api/workspaces/:id/teams - Create team
 * GET /api/workspaces/:id/teams - List teams
 * PUT /api/workspaces/teams/:id - Update team
 * DELETE /api/workspaces/teams/:id - Archive team
 * 
 * GET /api/workspaces/:id/features - Get features
 * PUT /api/workspaces/:id/features - Update features
 * GET /api/workspaces/:id/audit - Get audit logs
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    organizationService,
    workspaceService,
    workspaceMemberService,
    teamService,
    workspaceFeaturesService,
} from '@/src/services/workspaceService';
import { auditLogger } from '@/src/services/auditLogger';
import { getSession } from '@/src/lib/auth';
import { rateLimiter } from '@/src/middleware/rateLimit';

const limiter = rateLimiter({ windowMs: 60 * 1000, maxRequests: 100 });

/**
 * POST /api/workspaces
 * Create a new workspace
 */
export async function POST_workspace(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { organizationId, name, slug, description, type } = body;

        if (!organizationId || !name || !slug) {
            return NextResponse.json(
                { error: 'Missing required fields: organizationId, name, slug' },
                { status: 400 }
            );
        }

        const workspaceId = await workspaceService.createWorkspace(
            { organizationId, name, slug, description, type },
            session.user.id
        );

        return NextResponse.json(
            {
                success: true,
                workspaceId,
                message: `Created workspace: ${name}`,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to create workspace:', error);
        return NextResponse.json(
            { error: 'Failed to create workspace' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/workspaces
 * List user's workspaces
 */
export async function GET_workspaces(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

        const workspaces = await workspaceService.getUserWorkspaces(
            session.user.id,
            limit,
            offset
        );

        return NextResponse.json({
            success: true,
            workspaces,
            count: workspaces.length,
        });
    } catch (error) {
        console.error('Failed to get workspaces:', error);
        return NextResponse.json(
            { error: 'Failed to get workspaces' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/workspaces/:id
 * Get workspace details
 */
export async function GET_workspace(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: workspaceId } = params;
        const workspace = await workspaceService.getWorkspace(workspaceId);

        if (!workspace) {
            return NextResponse.json(
                { error: 'Workspace not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            workspace,
        });
    } catch (error) {
        console.error('Failed to get workspace:', error);
        return NextResponse.json(
            { error: 'Failed to get workspace' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/workspaces/:id
 * Update workspace
 */
export async function PUT_workspace(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId } = params;
        const body = await request.json();

        await workspaceService.updateWorkspace(workspaceId, body, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Workspace updated',
        });
    } catch (error) {
        console.error('Failed to update workspace:', error);
        return NextResponse.json(
            { error: 'Failed to update workspace' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/workspaces/:id
 * Delete/archive workspace
 */
export async function DELETE_workspace(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId } = params;

        await workspaceService.archiveWorkspace(workspaceId, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Workspace archived',
        });
    } catch (error) {
        console.error('Failed to delete workspace:', error);
        return NextResponse.json(
            { error: 'Failed to delete workspace' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/workspaces/:id/members
 * Add member to workspace
 */
export async function POST_member(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId } = params;
        const body = await request.json();
        const { userId, role } = body;

        if (!userId || !role) {
            return NextResponse.json(
                { error: 'Missing required fields: userId, role' },
                { status: 400 }
            );
        }

        const memberId = await workspaceMemberService.addMember(
            workspaceId,
            userId,
            role,
            session.user.id
        );

        return NextResponse.json(
            {
                success: true,
                memberId,
                message: `Added member with role: ${role}`,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to add member:', error);
        return NextResponse.json(
            { error: 'Failed to add member' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/workspaces/:id/members
 * List workspace members
 */
export async function GET_members(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: workspaceId } = params;
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

        const members = await workspaceMemberService.getMembers(workspaceId, limit, offset);

        return NextResponse.json({
            success: true,
            members,
            count: members.length,
        });
    } catch (error) {
        console.error('Failed to get members:', error);
        return NextResponse.json(
            { error: 'Failed to get members' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/workspaces/:id/members/:userId
 * Update member role
 */
export async function PUT_memberRole(
    request: NextRequest,
    { params }: { params: { id: string; userId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId, userId } = params;
        const body = await request.json();
        const { role } = body;

        if (!role) {
            return NextResponse.json(
                { error: 'role is required' },
                { status: 400 }
            );
        }

        await workspaceMemberService.updateMemberRole(workspaceId, userId, role, session.user.id);

        return NextResponse.json({
            success: true,
            message: `Updated member role to: ${role}`,
        });
    } catch (error) {
        console.error('Failed to update member role:', error);
        return NextResponse.json(
            { error: 'Failed to update member role' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/workspaces/:id/members/:userId
 * Remove member from workspace
 */
export async function DELETE_member(
    request: NextRequest,
    { params }: { params: { id: string; userId: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId, userId } = params;

        await workspaceMemberService.removeMember(workspaceId, userId, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Member removed',
        });
    } catch (error) {
        console.error('Failed to remove member:', error);
        return NextResponse.json(
            { error: 'Failed to remove member' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/workspaces/:id/invite
 * Invite user to workspace
 */
export async function POST_invite(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId } = params;
        const body = await request.json();
        const { email, role } = body;

        if (!email || !role) {
            return NextResponse.json(
                { error: 'Missing required fields: email, role' },
                { status: 400 }
            );
        }

        const { inviteId, token } = await workspaceMemberService.inviteMember(
            workspaceId,
            email,
            role,
            session.user.id
        );

        return NextResponse.json(
            {
                success: true,
                inviteId,
                token,
                message: `Sent invite to ${email}`,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to invite member:', error);
        return NextResponse.json(
            { error: 'Failed to invite member' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/workspaces/invite/accept
 * Accept workspace invite
 */
export async function POST_acceptInvite(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { token } = body;

        if (!token) {
            return NextResponse.json(
                { error: 'token is required' },
                { status: 400 }
            );
        }

        await workspaceMemberService.acceptInvite(token, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Invite accepted',
        });
    } catch (error) {
        console.error('Failed to accept invite:', error);
        return NextResponse.json(
            {
                error: 'Failed to accept invite',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/workspaces/:id/teams
 * Create team
 */
export async function POST_team(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId } = params;
        const body = await request.json();
        const { name, slug, description, type } = body;

        if (!name || !slug) {
            return NextResponse.json(
                { error: 'Missing required fields: name, slug' },
                { status: 400 }
            );
        }

        const teamId = await teamService.createTeam(
            workspaceId,
            { name, slug, description, type },
            session.user.id
        );

        return NextResponse.json(
            {
                success: true,
                teamId,
                message: `Created team: ${name}`,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to create team:', error);
        return NextResponse.json(
            { error: 'Failed to create team' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/workspaces/:id/teams
 * List teams in workspace
 */
export async function GET_teams(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: workspaceId } = params;
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

        const teams = await teamService.listTeams(workspaceId, limit, offset);

        return NextResponse.json({
            success: true,
            teams,
            count: teams.length,
        });
    } catch (error) {
        console.error('Failed to get teams:', error);
        return NextResponse.json(
            { error: 'Failed to get teams' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/workspaces/:id/features
 * Get workspace features & limits
 */
export async function GET_features(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: workspaceId } = params;
        const features = await workspaceFeaturesService.getFeatures(workspaceId);

        return NextResponse.json({
            success: true,
            features,
        });
    } catch (error) {
        console.error('Failed to get features:', error);
        return NextResponse.json(
            { error: 'Failed to get features' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/workspaces/:id/features
 * Update workspace features
 */
export async function PUT_features(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: workspaceId } = params;
        const body = await request.json();

        await workspaceFeaturesService.updateFeatures(workspaceId, body, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Features updated',
        });
    } catch (error) {
        console.error('Failed to update features:', error);
        return NextResponse.json(
            { error: 'Failed to update features' },
            { status: 500 }
        );
    }
}
