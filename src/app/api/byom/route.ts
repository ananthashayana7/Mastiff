/**
 * BYOM API Routes - Bring Your Own Model Management
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { RBACEngine } from '@/src/services/rbacService';
import { BYOMService } from '@/src/services/byomService';

const rbacEngine = new RBACEngine();

/**
 * GET /api/byom/models
 * List organization's custom models
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const organizationId = searchParams.get('organizationId');
        const workspaceId = searchParams.get('workspaceId');
        const type = searchParams.get('type');

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'workspace',
            resourceId: organizationId,
            action: 'view_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const models = await BYOMService.listModels(organizationId, {
            workspaceId: workspaceId || undefined,
            type: type || undefined,
            isActive: true,
        });

        return NextResponse.json({ models });
    } catch (error) {
        console.error('Error listing BYOM models:', error);
        return NextResponse.json(
            { error: 'Failed to list models' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/byom/models
 * Register a new custom model
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, ...config } = body;

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'workspace',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const model = await BYOMService.registerModel({
            ...config,
            organizationId,
            createdBy: session.user.id,
        });

        return NextResponse.json(
            {
                model,
                message: 'Model registered successfully',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error registering BYOM model:', error);
        return NextResponse.json(
            { error: 'Failed to register model' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/byom/models/:modelId
 * Get model details and statistics
 */
export async function GET_ModelDetail(
    req: NextRequest,
    { params }: { params: { modelId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = new URL(req.url).searchParams.get('organizationId');
        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'workspace',
            resourceId: organizationId,
            action: 'view_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const model = await BYOMService.getModel(params.modelId);
        if (!model) {
            return NextResponse.json({ error: 'Model not found' }, { status: 404 });
        }

        const stats = await BYOMService.getModelStats(params.modelId, organizationId);

        return NextResponse.json({ model, stats });
    } catch (error) {
        console.error('Error getting BYOM model:', error);
        return NextResponse.json(
            { error: 'Failed to get model' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/byom/models/:modelId
 * Update model configuration
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: { modelId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, ...updates } = body;

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'workspace',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const updated = await BYOMService.updateModel(params.modelId, {
            ...updates,
            updatedBy: session.user.id,
        });

        return NextResponse.json({ model: updated });
    } catch (error) {
        console.error('Error updating BYOM model:', error);
        return NextResponse.json(
            { error: 'Failed to update model' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/byom/models/:modelId/health-check
 * Record model health check
 */
export async function POST_HealthCheck(
    req: NextRequest,
    { params }: { params: { modelId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, status, responseTimeMs, statusCode, errorMessage, metrics } = body;

        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        const healthCheck = await BYOMService.recordHealthCheck(
            params.modelId,
            organizationId,
            status,
            responseTimeMs,
            statusCode,
            errorMessage,
            metrics
        );

        return NextResponse.json({ healthCheck });
    } catch (error) {
        console.error('Error recording health check:', error);
        return NextResponse.json(
            { error: 'Failed to record health check' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/byom/models/:modelId/invoke
 * Invoke model completion
 */
export async function POST_Invoke(
    req: NextRequest,
    { params }: { params: { modelId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, prompt, maxTokens, temperature, stream } = body;

        if (!organizationId || !prompt) {
            return NextResponse.json(
                { error: 'organizationId and prompt are required' },
                { status: 400 }
            );
        }

        const result = await BYOMService.invokeCompletion(
            params.modelId,
            session.user.id,
            organizationId,
            {
                prompt,
                maxTokens,
                temperature,
                stream,
            }
        );

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: 400 }
            );
        }

        return NextResponse.json({
            output: result.output,
            tokens: result.tokens,
        });
    } catch (error) {
        console.error('Error invoking model:', error);
        return NextResponse.json(
            { error: 'Failed to invoke model' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/byom/models/:modelId/versions
 * Get model versions
 */
export async function GET_Versions(
    req: NextRequest,
    { params }: { params: { modelId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = new URL(req.url).searchParams.get('organizationId');
        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        const versions = await BYOMService.getVersions(params.modelId, organizationId);

        return NextResponse.json({ versions });
    } catch (error) {
        console.error('Error getting versions:', error);
        return NextResponse.json(
            { error: 'Failed to get versions' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/byom/models/:modelId/versions
 * Create a new model version
 */
export async function POST_CreateVersion(
    req: NextRequest,
    { params }: { params: { modelId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, versionNumber, description, finetuneParameters, performanceMetrics } = body;

        if (!organizationId || !versionNumber) {
            return NextResponse.json(
                { error: 'organizationId and versionNumber are required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'workspace',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const version = await BYOMService.createVersion(
            params.modelId,
            organizationId,
            {
                versionNumber,
                description,
                finetuneParameters,
                performanceMetrics,
                createdBy: session.user.id,
            }
        );

        return NextResponse.json(
            { version, message: 'Version created' },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating version:', error);
        return NextResponse.json(
            { error: 'Failed to create version' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/byom/models/:modelId/versions/:versionId/activate
 * Activate a model version
 */
export async function POST_ActivateVersion(
    req: NextRequest,
    { params }: { params: { modelId: string; versionId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = new URL(req.url).searchParams.get('organizationId');
        if (!organizationId) {
            return NextResponse.json(
                { error: 'organizationId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'workspace',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const version = await BYOMService.activateVersion(params.versionId, params.modelId);

        return NextResponse.json({ version, message: 'Version activated' });
    } catch (error) {
        console.error('Error activating version:', error);
        return NextResponse.json(
            { error: 'Failed to activate version' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/byom/models/:modelId/access
 * Grant user/team/workspace access to model
 */
export async function POST_GrantAccess(
    req: NextRequest,
    { params }: { params: { modelId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { organizationId, subjectType, subjectId, accessLevel, constraints } = body;

        if (!organizationId || !subjectType || !subjectId) {
            return NextResponse.json(
                { error: 'organizationId, subjectType, and subjectId are required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId: organizationId,
            resourceType: 'workspace',
            resourceId: organizationId,
            action: 'manage_settings',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const access = await BYOMService.grantAccess(
            params.modelId,
            organizationId,
            subjectType,
            subjectId,
            accessLevel || 'use',
            session.user.id,
            constraints
        );

        return NextResponse.json(
            { access, message: 'Access granted' },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error granting access:', error);
        return NextResponse.json(
            { error: 'Failed to grant access' },
            { status: 500 }
        );
    }
}
