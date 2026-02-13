/**
 * LLM Provider Configuration API Routes
 * 
 * POST /api/llm/register - Register new LLM model
 * GET /api/llm/models - List available models
 * GET /api/llm/default - Get default model
 * PUT /api/llm/default - Set default model
 * POST /api/llm/validate - Validate provider connection
 * GET /api/llm/providers - List supported providers
 * DELETE /api/llm/models/:id - Remove model
 * GET /api/llm/usage - Get usage stats
 * POST /api/llm/preference - Set user preference
 */

import { NextRequest, NextResponse } from 'next/server';
import llmManagementService from '@/src/services/llmManagement';
import { auditLogger } from '@/src/services/auditLogger';
import { getSession } from '@/src/lib/auth';
import { rateLimiter } from '@/src/middleware/rateLimit';

// Rate limit: 60 requests per minute for LLM endpoints
const limiter = rateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });

/**
 * GET /api/llm/providers
 * List all supported LLM providers
 */
export async function GET_providers(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const providers = llmManagementService.getSupportedProviders();
        return NextResponse.json({
            success: true,
            providers,
            count: providers.length,
        });
    } catch (error) {
        console.error('Failed to get providers:', error);
        return NextResponse.json(
            { error: 'Failed to get providers' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/llm/models
 * List configured LLM models for workspace
 */
export async function GET_models(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = request.nextUrl.searchParams.get('workspaceId');
        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        await limiter(request);

        const models = await llmManagementService.listModels(workspaceId);

        return NextResponse.json({
            success: true,
            models,
            count: models.length,
        });
    } catch (error) {
        console.error('Failed to list models:', error);
        return NextResponse.json(
            { error: 'Failed to list models' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/llm/register
 * Register a new LLM provider
 */
export async function POST_register(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { workspaceId, provider, model, displayName, apiKey, temperature, maxTokens, description } = body;

        // Validate required fields
        if (!workspaceId || !provider || !model || !displayName || !apiKey) {
            return NextResponse.json(
                { error: 'Missing required fields: workspaceId, provider, model, displayName, apiKey' },
                { status: 400 }
            );
        }

        // Validate provider
        const supportedProviders = ['gemini', 'openai', 'anthropic'];
        if (!supportedProviders.includes(provider)) {
            return NextResponse.json(
                { error: `Unsupported provider. Must be one of: ${supportedProviders.join(', ')}` },
                { status: 400 }
            );
        }

        // Register the provider
        const modelId = await llmManagementService.registerProvider(
            workspaceId,
            session.user.id,
            {
                provider,
                model,
                displayName,
                apiKey,
                temperature: temperature ? parseFloat(temperature) : undefined,
                maxTokens: maxTokens ? parseInt(maxTokens) : undefined,
                description,
            }
        );

        return NextResponse.json(
            {
                success: true,
                modelId,
                message: `Registered ${provider} model: ${displayName}`,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to register LLM provider:', error);
        return NextResponse.json(
            {
                error: 'Failed to register provider',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/llm/validate
 * Test/validate LLM provider connection
 */
export async function POST_validate(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { provider, model, apiKey, customEndpoint } = body;

        if (!provider || !model || !apiKey) {
            return NextResponse.json(
                { error: 'Missing required fields: provider, model, apiKey' },
                { status: 400 }
            );
        }

        try {
            const testProvider = require('@/src/services/llmProvider').LLMProviderFactory.create({
                provider,
                model,
                apiKey,
                apiEndpoint: customEndpoint,
            });

            const isValid = await testProvider.validateConnection();

            return NextResponse.json({
                success: true,
                isValid,
                message: isValid
                    ? `✓ Successfully connected to ${provider} (${model})`
                    : `✗ Failed to connect to ${provider}`,
            });
        } catch (error) {
            return NextResponse.json({
                success: false,
                isValid: false,
                message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    } catch (error) {
        console.error('Validation failed:', error);
        return NextResponse.json(
            { error: 'Validation request failed' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/llm/default
 * Get default LLM model for workspace
 */
export async function GET_default(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = request.nextUrl.searchParams.get('workspaceId');
        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        const models = await llmManagementService.listModels(workspaceId);
        const defaultModel = models.find((m) => m.isDefault);

        if (!defaultModel) {
            return NextResponse.json({
                success: false,
                message: 'No default model configured. Will use Gemini.',
            });
        }

        return NextResponse.json({
            success: true,
            model: {
                id: defaultModel.id,
                provider: defaultModel.provider,
                model: defaultModel.model,
                displayName: defaultModel.displayName,
            },
        });
    } catch (error) {
        console.error('Failed to get default model:', error);
        return NextResponse.json(
            { error: 'Failed to get default model' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/llm/default
 * Set default LLM model for workspace
 */
export async function PUT_default(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { workspaceId, modelId } = body;

        if (!workspaceId || !modelId) {
            return NextResponse.json(
                { error: 'Missing required fields: workspaceId, modelId' },
                { status: 400 }
            );
        }

        await llmManagementService.setDefaultModel(workspaceId, modelId);

        await auditLogger.log({
            userId: session.user.id,
            action: 'set_default_llm_model',
            resourceType: 'llm_model',
            resourceId: modelId,
            details: { workspaceId },
        });

        return NextResponse.json({
            success: true,
            message: 'Default model updated',
        });
    } catch (error) {
        console.error('Failed to set default model:', error);
        return NextResponse.json(
            { error: 'Failed to set default model' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/llm/preference
 * Set user's preferred LLM model
 */
export async function POST_preference(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const body = await request.json();
        const { modelId } = body;

        if (!modelId) {
            return NextResponse.json(
                { error: 'modelId is required' },
                { status: 400 }
            );
        }

        await llmManagementService.setUserPreference(session.user.id, modelId);

        await auditLogger.log({
            userId: session.user.id,
            action: 'set_llm_preference',
            resourceType: 'user_preference',
            resourceId: session.user.id,
            details: { modelId },
        });

        return NextResponse.json({
            success: true,
            message: 'Preference updated',
        });
    } catch (error) {
        console.error('Failed to set preference:', error);
        return NextResponse.json(
            { error: 'Failed to set preference' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/llm/models/:id
 * Deactivate/remove an LLM model
 */
export async function DELETE_model(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await limiter(request);

        const { id: modelId } = params;

        if (!modelId) {
            return NextResponse.json(
                { error: 'Model ID is required' },
                { status: 400 }
            );
        }

        await llmManagementService.deactivateModel(modelId, session.user.id);

        return NextResponse.json({
            success: true,
            message: 'Model deactivated',
        });
    } catch (error) {
        console.error('Failed to deactivate model:', error);
        return NextResponse.json(
            { error: 'Failed to deactivate model' },
            { status: 500 }
        );
    }
}
