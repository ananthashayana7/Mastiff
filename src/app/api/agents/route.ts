/**
 * Agent Framework API Routes
 * Endpoints for agent management, execution, and conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { RBACEngine } from '@/src/services/rbacService';
import { AgentService, AgentExecutor } from '@/src/services/agentService';
import { ToolRegistry } from '@/src/services/toolRegistry';

const rbacEngine = new RBACEngine();

/**
 * GET /api/agents
 * List agents in workspace
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            resourceType: 'workspace',
            resourceId: workspaceId,
            action: 'view_agents',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const agents = await AgentService.listAgents(workspaceId, {
            isActive: true,
        });

        return NextResponse.json({ agents });
    } catch (error) {
        console.error('Error listing agents:', error);
        return NextResponse.json(
            { error: 'Failed to list agents' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/agents
 * Create new agent
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { workspaceId, name, description, type, systemPrompt, maxSteps } = body;

        if (!workspaceId || !name) {
            return NextResponse.json(
                { error: 'workspaceId and name are required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            resourceType: 'workspace',
            resourceId: workspaceId,
            action: 'create_agents',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const agent = await AgentService.createAgent({
            workspaceId,
            name,
            description,
            type: type || 'assistant',
            systemPrompt,
            maxSteps,
            createdBy: session.user.id,
        });

        return NextResponse.json({ agent }, { status: 201 });
    } catch (error) {
        console.error('Error creating agent:', error);
        return NextResponse.json(
            { error: 'Failed to create agent' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/agents/:agentId
 * Get agent details
 */
export async function GET_Detail(
    req: NextRequest,
    { params }: { params: { agentId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            resourceType: 'workspace',
            resourceId: workspaceId,
            action: 'view_agents',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const agent = await AgentService.getAgent(workspaceId, params.agentId);
        if (!agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        const stats = await AgentService.getAgentStats(workspaceId, params.agentId);

        return NextResponse.json({ agent, stats });
    } catch (error) {
        console.error('Error getting agent:', error);
        return NextResponse.json(
            { error: 'Failed to get agent' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/agents/:agentId/execute
 * Start agent execution
 */
export async function POST_Execute(
    req: NextRequest,
    { params }: { params: { agentId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { workspaceId, goal, input, context } = body;

        if (!workspaceId || !goal) {
            return NextResponse.json(
                { error: 'workspaceId and goal are required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            resourceType: 'workspace',
            resourceId: workspaceId,
            action: 'execute_agents',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Start execution
        const { executionId, conversationId } = await AgentService.startExecution({
            workspaceId,
            agentId: params.agentId,
            userId: session.user.id,
            goal,
            input,
            context,
        });

        // Get agent config
        const agent = await AgentService.getAgent(workspaceId, params.agentId);
        if (!agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        }

        // Start async execution (in production, use job queue)
        const executor = new AgentExecutor(
            executionId,
            params.agentId,
            workspaceId,
            session.user.id,
            conversationId,
            Number(agent.maxSteps) || 20
        );

        executor.execute(goal).then(async (result) => {
            await AgentService.completeExecution(
                executionId,
                result.success ? 'success' : 'failed',
                result.output,
                result.error
            );
        });

        return NextResponse.json(
            {
                executionId,
                conversationId,
                status: 'running',
            },
            { status: 202 }
        );
    } catch (error) {
        console.error('Error executing agent:', error);
        return NextResponse.json(
            { error: 'Failed to execute agent' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/agents/:agentId/executions
 * Get execution history
 */
export async function GET_Executions(
    req: NextRequest,
    { params }: { params: { agentId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');
        const limit = parseInt(searchParams.get('limit') || '50');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            resourceType: 'workspace',
            resourceId: workspaceId,
            action: 'view_agents',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const executions = await AgentService.getExecutionHistory(
            workspaceId,
            params.agentId,
            session.user.id,
            limit
        );

        return NextResponse.json({ executions });
    } catch (error) {
        console.error('Error getting executions:', error);
        return NextResponse.json(
            { error: 'Failed to get executions' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/agents/:agentId/executions/:executionId
 * Get execution details with steps
 */
export async function GET_ExecutionDetail(
    req: NextRequest,
    { params }: { params: { agentId: string; executionId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = new URL(req.url).searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            resourceType: 'workspace',
            resourceId: workspaceId,
            action: 'view_agents',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const steps = await AgentService.getExecutionSteps(params.executionId);

        return NextResponse.json({ steps });
    } catch (error) {
        console.error('Error getting execution detail:', error);
        return NextResponse.json(
            { error: 'Failed to get execution' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/agents/conversations/:conversationId/message
 * Send message to agent conversation
 */
export async function POST_Message(
    req: NextRequest,
    { params }: { params: { conversationId: string } }
) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { workspaceId, agentId, message } = body;

        if (!workspaceId || !agentId || !message) {
            return NextResponse.json(
                { error: 'workspaceId, agentId, and message are required' },
                { status: 400 }
            );
        }

        // Check permission
        const hasPermission = await rbacEngine.hasPermission({
            userId: session.user.id,
            workspaceId,
            resourceType: 'workspace',
            resourceId: workspaceId,
            action: 'execute_agents',
        });

        if (!hasPermission) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Add user message to memory
        await AgentService.addMemory(agentId, workspaceId, params.conversationId, {
            type: 'message',
            role: 'user',
            content: message,
            importance: 0.9,
        });

        // Start execution with message as goal
        const { executionId } = await AgentService.startExecution({
            workspaceId,
            agentId,
            userId: session.user.id,
            goal: message,
            conversationId: params.conversationId,
        });

        return NextResponse.json({
            executionId,
            conversationId: params.conversationId,
            status: 'running',
        });
    } catch (error) {
        console.error('Error sending message:', error);
        return NextResponse.json(
            { error: 'Failed to send message' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/agents/tools
 * List available tools
 */
export async function GET_Tools(req: NextRequest) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'workspaceId is required' },
                { status: 400 }
            );
        }

        const tools = await ToolRegistry.getAvailableTools(workspaceId);

        return NextResponse.json({ tools });
    } catch (error) {
        console.error('Error getting tools:', error);
        return NextResponse.json(
            { error: 'Failed to get tools' },
            { status: 500 }
        );
    }
}

/**
 * Generic route handler that dispatches to specific methods
 */
export async function handleRequest(
    req: NextRequest,
    params: any
): Promise<NextResponse> {
    const path = new URL(req.url).pathname;

    if (path.endsWith('/tools')) {
        return GET_Tools(req);
    }

    if (path.includes('/execute')) {
        return POST_Execute(req, params);
    }

    if (path.includes('/executions/') && !path.includes('/message')) {
        return GET_ExecutionDetail(req, params);
    }

    if (path.includes('/executions') && !path.includes('/message')) {
        return GET_Executions(req, params);
    }

    if (path.includes('/message')) {
        return POST_Message(req, params);
    }

    if (req.method === 'GET' && path.includes('/agents/')) {
        return GET_Detail(req, params);
    }

    if (req.method === 'GET') {
        return GET(req);
    }

    if (req.method === 'POST') {
        return POST(req);
    }

    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
