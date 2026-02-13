/**
 * Agent Service - Management and execution of autonomous AI agents
 * Handles agent lifecycle, execution orchestration, and memory management
 */

import { db } from '@/src/db/index';
import {
    agentsTable,
    agentExecutionsTable,
    agentStepsTable,
    agentMemoryTable,
    agentConversationsTable,
} from '@/src/db/agentSchema';
import { eq, and, desc } from 'drizzle-orm';
import { ToolRegistry } from './toolRegistry';

export interface AgentConfig {
    workspaceId: string;
    name: string;
    description?: string;
    type: 'assistant' | 'analyst' | 'researcher' | 'custom';
    llmModelId?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    maxSteps?: number;
    memoryStrategy?: 'conversation' | 'summary' | 'hierarchical';
    tags?: string[];
}

export interface ExecutionRequest {
    workspaceId: string;
    agentId: string;
    userId: string;
    goal: string;
    input?: Record<string, any>;
    conversationId?: string;
    context?: Record<string, any>;
}

export interface ExecutionStep {
    stepNumber: number;
    actionType: 'think' | 'tool_call' | 'user_input' | 'response';
    thought?: string;
    toolCode?: string;
    toolInput?: Record<string, any>;
    toolOutput?: Record<string, any>;
    message?: string;
}

/**
 * Agent Service
 */
export class AgentService {
    /**
     * Create a new agent
     */
    static async createAgent(config: AgentConfig & { createdBy: string }) {
        const agent = await db
            .insert(agentsTable)
            .values({
                workspaceId: config.workspaceId,
                name: config.name,
                slug: config.name.toLowerCase().replace(/\s+/g, '-'),
                description: config.description,
                type: config.type,
                llmModelId: config.llmModelId,
                systemPrompt: config.systemPrompt,
                temperature: config.temperature?.toString(),
                maxTokens: config.maxTokens?.toString(),
                maxSteps: config.maxSteps?.toString() || '20',
                memoryStrategy: config.memoryStrategy || 'conversation',
                availableTools: config.tags || [],
                tags: config.tags,
                createdBy: config.createdBy,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return agent[0];
    }

    /**
     * Get agent by ID
     */
    static async getAgent(workspaceId: string, agentId: string) {
        const agent = await db
            .select()
            .from(agentsTable)
            .where(and(eq(agentsTable.workspaceId, workspaceId), eq(agentsTable.id, agentId)))
            .limit(1);

        return agent[0] || null;
    }

    /**
     * List agents in workspace
     */
    static async listAgents(workspaceId: string, filter?: { isActive?: boolean; type?: string }) {
        let query = db.select().from(agentsTable).where(eq(agentsTable.workspaceId, workspaceId));

        if (filter?.isActive !== undefined) {
            query = query.where(eq(agentsTable.isActive, filter.isActive));
        }

        if (filter?.type) {
            query = query.where(eq(agentsTable.type, filter.type));
        }

        return query;
    }

    /**
     * Update agent configuration
     */
    static async updateAgent(workspaceId: string, agentId: string, updates: Partial<AgentConfig>) {
        const agent = await db
            .update(agentsTable)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(and(eq(agentsTable.workspaceId, workspaceId), eq(agentsTable.id, agentId)))
            .returning();

        return agent[0] || null;
    }

    /**
     * Delete agent
     */
    static async deleteAgent(workspaceId: string, agentId: string) {
        await db
            .update(agentsTable)
            .set({ isActive: false })
            .where(and(eq(agentsTable.workspaceId, workspaceId), eq(agentsTable.id, agentId)));
    }

    /**
     * Get or create conversation
     */
    static async getOrCreateConversation(
        workspaceId: string,
        agentId: string,
        userId: string
    ) {
        let conversation = await db
            .select()
            .from(agentConversationsTable)
            .where(
                and(
                    eq(agentConversationsTable.workspaceId, workspaceId),
                    eq(agentConversationsTable.agentId, agentId),
                    eq(agentConversationsTable.userId, userId),
                    eq(agentConversationsTable.status, 'active')
                )
            )
            .orderBy(desc(agentConversationsTable.createdAt))
            .limit(1);

        if (conversation.length > 0) {
            return conversation[0];
        }

        // Create new conversation
        const newConv = await db
            .insert(agentConversationsTable)
            .values({
                workspaceId,
                agentId,
                userId,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return newConv[0];
    }

    /**
     * Start agent execution
     */
    static async startExecution(req: ExecutionRequest) {
        // Get or create conversation
        const conversation = await this.getOrCreateConversation(
            req.workspaceId,
            req.agentId,
            req.userId
        );

        // Create execution record
        const execution = await db
            .insert(agentExecutionsTable)
            .values({
                workspaceId: req.workspaceId,
                agentId: req.agentId,
                userId: req.userId,
                goal: req.goal,
                input: req.input,
                status: 'running',
                currentStep: '0',
                startedAt: new Date(),
            })
            .returning();

        return {
            executionId: execution[0].id,
            conversationId: conversation.id,
            execution: execution[0],
        };
    }

    /**
     * Add step to execution
     */
    static async addExecutionStep(executionId: string, step: ExecutionStep & { agentId: string }) {
        const stepRecord = await db
            .insert(agentStepsTable)
            .values({
                executionId,
                agentId: step.agentId,
                stepNumber: step.stepNumber.toString(),
                actionType: step.actionType,
                thought: step.thought,
                toolCode: step.toolCode,
                toolInput: step.toolInput,
                toolOutput: step.toolOutput,
                message: step.message,
                status: 'completed',
                createdAt: new Date(),
            })
            .returning();

        return stepRecord[0];
    }

    /**
     * This calls tools and tracks their usage
     */
    static async callTool(
        executionId: string,
        workspaceId: string,
        toolCode: string,
        input: Record<string, any>
    ) {
        return await ToolRegistry.executeTool({
            workspaceId,
            toolId: '',
            toolCode,
            input,
            executionId,
        });
    }

    /**
     * Complete execution
     */
    static async completeExecution(
        executionId: string,
        status: 'success' | 'failed' | 'cancelled',
        output?: Record<string, any>,
        error?: string
    ) {
        const now = new Date();
        const execution = await db.query.agentExecutionsTable.findFirst({
            where: eq(agentExecutionsTable.id, executionId),
        });

        const duration = execution ? now.getTime() - execution.startedAt.getTime() : 0;

        const updated = await db
            .update(agentExecutionsTable)
            .set({
                status,
                output,
                error,
                completedAt: now,
                duration: duration.toString(),
            })
            .where(eq(agentExecutionsTable.id, executionId))
            .returning();

        return updated[0];
    }

    /**
     * Get execution history
     */
    static async getExecutionHistory(
        workspaceId: string,
        agentId: string,
        userId?: string,
        limit: number = 50
    ) {
        let query = db
            .select()
            .from(agentExecutionsTable)
            .where(
                and(
                    eq(agentExecutionsTable.workspaceId, workspaceId),
                    eq(agentExecutionsTable.agentId, agentId)
                )
            );

        if (userId) {
            query = query.where(eq(agentExecutionsTable.userId, userId));
        }

        return query.orderBy(desc(agentExecutionsTable.startedAt)).limit(limit);
    }

    /**
     * Get execution steps
     */
    static async getExecutionSteps(executionId: string) {
        return await db
            .select()
            .from(agentStepsTable)
            .where(eq(agentStepsTable.executionId, executionId))
            .orderBy(agentStepsTable.stepNumber);
    }

    /**
     * Add memory entry
     */
    static async addMemory(
        agentId: string,
        workspaceId: string,
        conversationId: string,
        memory: {
            type: 'message' | 'observation' | 'fact' | 'summary';
            role?: 'user' | 'assistant';
            content: string;
            importance?: number;
            tags?: string[];
            expiresAt?: Date;
        }
    ) {
        const entry = await db
            .insert(agentMemoryTable)
            .values({
                agentId,
                workspaceId,
                conversationId,
                type: memory.type,
                role: memory.role,
                content: memory.content,
                importance: memory.importance?.toString(),
                tags: memory.tags,
                expiresAt: memory.expiresAt,
                isShortTerm: !!memory.expiresAt,
                createdAt: new Date(),
            })
            .returning();

        return entry[0];
    }

    /**
     * Get recent memory for conversation
     */
    static async getConversationMemory(conversationId: string, limit: number = 50) {
        return await db
            .select()
            .from(agentMemoryTable)
            .where(eq(agentMemoryTable.conversationId, conversationId))
            .orderBy(desc(agentMemoryTable.createdAt))
            .limit(limit);
    }

    /**
     * Get agent statistics
     */
    static async getAgentStats(workspaceId: string, agentId: string) {
        const executions = await db
            .select()
            .from(agentExecutionsTable)
            .where(
                and(
                    eq(agentExecutionsTable.workspaceId, workspaceId),
                    eq(agentExecutionsTable.agentId, agentId)
                )
            );

        const totalExecutions = executions.length;
        const successfulExecutions = executions.filter((e) => e.status === 'success').length;
        const failedExecutions = executions.filter((e) => e.status === 'failed').length;
        const totalTokens = executions.reduce((sum, e) => {
            const tokens = e.tokensUsed as any || {};
            return sum + (tokens.input || 0) + (tokens.output || 0);
        }, 0);

        const conversations = await db
            .select()
            .from(agentConversationsTable)
            .where(
                and(
                    eq(agentConversationsTable.workspaceId, workspaceId),
                    eq(agentConversationsTable.agentId, agentId)
                )
            );

        return {
            totalExecutions,
            successfulExecutions,
            failedExecutions,
            successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
            totalTokens,
            totalConversations: conversations.length,
            totalMessages: conversations.reduce((sum, c) => {
                return sum + (Number(c.messageCount) || 0);
            }, 0),
        };
    }
}

/**
 * Agent Executor - Handles the actual execution loop
 */
export class AgentExecutor {
    private executionId: string;
    private agentId: string;
    private workspaceId: string;
    private userId: string;
    private conversationId: string;
    private maxSteps: number;
    private currentStep: number = 0;
    private stepHistory: ExecutionStep[] = [];

    constructor(
        executionId: string,
        agentId: string,
        workspaceId: string,
        userId: string,
        conversationId: string,
        maxSteps: number = 20
    ) {
        this.executionId = executionId;
        this.agentId = agentId;
        this.workspaceId = workspaceId;
        this.userId = userId;
        this.conversationId = conversationId;
        this.maxSteps = maxSteps;
    }

    /**
     * Execute agent with goal
     */
    async execute(goal: string): Promise<{ success: boolean; output: any; error?: string }> {
        try {
            // Get agent config
            const agent = await AgentService.getAgent(this.workspaceId, this.agentId);
            if (!agent) {
                return { success: false, output: null, error: 'Agent not found' };
            }

            // Get available tools
            const tools = await ToolRegistry.getAvailableTools(this.workspaceId);

            // Get conversation memory
            const memory = await AgentService.getConversationMemory(this.conversationId);

            // Execution loop
            while (this.currentStep < this.maxSteps) {
                this.currentStep++;

                // Agent thinks about next action
                const decision = await this.think(goal, agent, memory);

                if (decision.actionType === 'response') {
                    // Agent has final response
                    await AgentService.addExecutionStep(this.executionId, {
                        agentId: this.agentId,
                        stepNumber: this.currentStep,
                        actionType: 'response',
                        message: decision.message,
                    });

                    // Store in memory
                    await AgentService.addMemory(
                        this.agentId,
                        this.workspaceId,
                        this.conversationId,
                        {
                            type: 'message',
                            role: 'assistant',
                            content: decision.message || '',
                            importance: 0.8,
                        }
                    );

                    return { success: true, output: decision.message };
                }

                if (decision.actionType === 'tool_call') {
                    // Execute tool
                    const toolResult = await AgentService.callTool(
                        this.executionId,
                        this.workspaceId,
                        decision.toolCode || '',
                        decision.toolInput || {}
                    );

                    // Record step
                    await AgentService.addExecutionStep(this.executionId, {
                        agentId: this.agentId,
                        stepNumber: this.currentStep,
                        actionType: 'tool_call',
                        toolCode: decision.toolCode,
                        toolInput: decision.toolInput,
                        toolOutput: toolResult.output,
                    });

                    // Store observation in memory
                    await AgentService.addMemory(
                        this.agentId,
                        this.workspaceId,
                        this.conversationId,
                        {
                            type: 'observation',
                            content: `Tool ${decision.toolCode} returned: ${JSON.stringify(toolResult.output)}`,
                            importance: 0.7,
                        }
                    );
                }
            }

            return {
                success: false,
                output: null,
                error: `Max steps (${this.maxSteps}) reached`,
            };
        } catch (error) {
            return {
                success: false,
                output: null,
                error: error instanceof Error ? error.message : 'Execution error',
            };
        }
    }

    /**
     * Agent thinking process
     */
    private async think(
        goal: string,
        _agent: any,
        _memory: any[]
    ): Promise<{
        actionType: 'think' | 'tool_call' | 'response';
        toolCode?: string;
        toolInput?: Record<string, any>;
        message?: string;
    }> {
        // In production, call LLM to decide next action
        // For now, return dummy response
        if (this.currentStep >= this.maxSteps - 1) {
            return {
                actionType: 'response',
                message: `Completed execution of: ${goal}`,
            };
        }

        return {
            actionType: 'response',
            message: `Executed goal: ${goal}`,
        };
    }
}
