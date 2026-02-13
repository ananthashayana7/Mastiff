/**
 * Custom Agents Framework Database Schema
 * 
 * Support for autonomous AI agents with tools, memory, and execution
 */

import { pgTable, text, boolean, timestamp, uuid, jsonb, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Agents Table
 * Defines AI agents with capabilities and configuration
 */
export const agentsTable = pgTable(
    'agents',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        name: text('name').notNull(),
        slug: text('slug').notNull(),
        description: text('description'),

        // Agent type
        type: text('type').notNull().default('assistant'), // 'assistant' | 'analyst' | 'researcher' | 'custom'

        // LLM Configuration
        llmModelId: uuid('llm_model_id'), // References llm_models table
        systemPrompt: text('system_prompt'),
        temperature: decimal('temperature', { precision: 3, scale: 2 }),
        maxTokens: decimal('max_tokens', { precision: 10, scale: 0 }),

        // Agent capabilities
        availableTools: jsonb('available_tools'), // ['web_search', 'code_executor', 'database_query']
        canUseBrowser: boolean('can_use_browser').default(false),
        canExecuteCode: boolean('can_execute_code').default(false),
        canAccessDatabase: boolean('can_access_database').default(false),
        canCreateResources: boolean('can_create_resources').default(false),

        // Agent configuration
        maxSteps: decimal('max_steps', { precision: 5, scale: 0 }).default('20'), // Max iterations
        timeout: decimal('timeout', { precision: 10, scale: 0 }).default('300000'), // 5 mins in ms
        allowUserInteraction: boolean('allow_user_interaction').default(false),
        memoryStrategy: text('memory_strategy').default('conversation'), // 'conversation' | 'summary' | 'hierarchical'
        memorySize: decimal('memory_size', { precision: 10, scale: 0 }).default('100'), // Number of messages to keep

        // Status
        isActive: boolean('is_active').notNull().default(true),
        isPublic: boolean('is_public').notNull().default(false),

        // Metadata
        tags: jsonb('tags'), // ['automation', 'analytics', 'reporting']
        metadata: jsonb('metadata'),
        version: decimal('version', { precision: 5, scale: 0 }).default('1'),

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('agents_workspace_id_idx').on(table.workspaceId),
            slugIdx: uniqueIndex('agents_slug_idx').on(table.workspaceId, table.slug),
            typeIdx: index('agents_type_idx').on(table.type),
            isActiveIdx: index('agents_is_active_idx').on(table.isActive),
        };
    }
);

/**
 * Tools Registry Table
 * Available tools that agents can use
 */
export const toolsTable = pgTable(
    'tools',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),

        // Tool identity
        code: text('code').notNull(), // 'web_search', 'code_executor'
        name: text('name').notNull(),
        description: text('description'),

        // Tool type
        type: text('type').notNull(), // 'builtin' | 'custom' | 'webhook'
        category: text('category').notNull(), // 'search' | 'execution' | 'data' | 'integration'

        // Tool definition
        inputSchema: jsonb('input_schema').notNull(), // JSON schema for parameters
        outputSchema: jsonb('output_schema'), // JSON schema for output

        // Tool execution
        handler: text('handler'), // 'builtin_function' or webhook URL
        webhookUrl: text('webhook_url'), // If type is 'webhook'
        webhookSecret: text('webhook_secret'), // For securing webhooks

        // Configuration
        requiresApproval: boolean('requires_approval').default(false),
        rateLimit: decimal('rate_limit', { precision: 10, scale: 0 }), // Call limit per hour
        timeout: decimal('timeout', { precision: 10, scale: 0 }).default('30000'), // 30 seconds

        // Status
        isActive: boolean('is_active').notNull().default(true),
        isPublic: boolean('is_public').notNull().default(false),

        // Metadata
        version: text('version').default('1.0.0'),
        metadata: jsonb('metadata'),

        // Audit
        createdBy: uuid('created_by'),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('tools_workspace_id_idx').on(table.workspaceId),
            codeIdx: uniqueIndex('tools_code_idx').on(table.workspaceId, table.code),
            typeIdx: index('tools_type_idx').on(table.type),
            categoryIdx: index('tools_category_idx').on(table.category),
        };
    }
);

/**
 * Agent Executions Table
 * Track agent runs and their results
 */
export const agentExecutionsTable = pgTable(
    'agent_executions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        agentId: uuid('agent_id').notNull(),
        userId: uuid('user_id').notNull(),

        // Execution context
        status: text('status').notNull().default('running'), // 'running' | 'success' | 'failed' | 'cancelled'
        goal: text('goal').notNull(), // What agent is trying to accomplish
        input: jsonb('input'), // Initial input/parameters

        // Execution tracking
        currentStep: decimal('current_step', { precision: 5, scale: 0 }).default('0'),
        totalSteps: decimal('total_steps', { precision: 5, scale: 0 }).default('0'),
        tokensUsed: jsonb('tokens_used'), // {input: 123, output: 456}
        costUSD: decimal('cost_usd', { precision: 10, scale: 6 }),

        // Results
        output: jsonb('output'), // Final output
        error: text('error'), // Error message if failed
        successMetrics: jsonb('success_metrics'), // {accuracy: 0.95, quality: 'high'}

        // Timing
        startedAt: timestamp('started_at').notNull().defaultNow(),
        completedAt: timestamp('completed_at'),
        duration: decimal('duration', { precision: 10, scale: 0 }), // Milliseconds

        // Metadata
        metadata: jsonb('metadata'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('agent_executions_workspace_id_idx').on(table.workspaceId),
            agentIdIdx: index('agent_executions_agent_id_idx').on(table.agentId),
            userIdIdx: index('agent_executions_user_id_idx').on(table.userId),
            statusIdx: index('agent_executions_status_idx').on(table.status),
            startedAtIdx: index('agent_executions_started_at_idx').on(table.startedAt),
        };
    }
);

/**
 * Agent Execution Steps Table
 * Individual steps within an execution
 */
export const agentStepsTable = pgTable(
    'agent_steps',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        executionId: uuid('execution_id').notNull(),
        agentId: uuid('agent_id').notNull(),

        // Step tracking
        stepNumber: decimal('step_number', { precision: 5, scale: 0 }).notNull(),
        actionType: text('action_type').notNull(), // 'think' | 'tool_call' | 'user_input' | 'response'
        status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'error'

        // Thinking step
        thought: text('thought'), // Agent's reasoning
        reasoning: text('reasoning'), // Detailed explanation

        // Tool call step
        toolCode: text('tool_code'), // Which tool was called
        toolInput: jsonb('tool_input'), // Parameters passed to tool
        toolOutput: jsonb('tool_output'), // Result from tool
        toolError: text('tool_error'), // Error if tool failed

        // Response step
        message: text('message'), // Message to send back
        isConversationEnd: boolean('is_conversation_end').default(false),

        // Metadata
        tokens: jsonb('tokens'), // {input: 50, output: 100}
        duration: decimal('duration', { precision: 10, scale: 0 }), // Milliseconds
        metadata: jsonb('metadata'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            executionIdIdx: index('agent_steps_execution_id_idx').on(table.executionId),
            agentIdIdx: index('agent_steps_agent_id_idx').on(table.agentId),
            actionTypeIdx: index('agent_steps_action_type_idx').on(table.actionType),
            statusIdx: index('agent_steps_status_idx').on(table.status),
        };
    }
);

/**
 * Agent Memory Table
 * Persistent memory for agent conversations
 */
export const agentMemoryTable = pgTable(
    'agent_memory',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        agentId: uuid('agent_id').notNull(),
        workspaceId: uuid('workspace_id').notNull(),
        conversationId: uuid('conversation_id').notNull(), // Conversation context

        // Memory entry
        type: text('type').notNull(), // 'message' | 'observation' | 'fact' | 'summary'
        role: text('role'), // 'user' | 'assistant'
        content: text('content').notNull(),

        // Memory metadata
        importance: decimal('importance', { precision: 3, scale: 2 }).default('0.5'), // 0-1 score
        embedding: text('embedding'), // Vector embedding for semantic search
        tags: jsonb('tags'), // For categorization

        // Retention
        expiresAt: timestamp('expires_at'), // For temporary memories
        isShortTerm: boolean('is_short_term').default(true), // Auto-prune after conversation

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            agentIdIdx: index('agent_memory_agent_id_idx').on(table.agentId),
            conversationIdIdx: index('agent_memory_conversation_id_idx').on(table.conversationId),
            typeIdx: index('agent_memory_type_idx').on(table.type),
            importanceIdx: index('agent_memory_importance_idx').on(table.importance),
            expiresAtIdx: index('agent_memory_expires_at_idx').on(table.expiresAt),
        };
    }
);

/**
 * Agent Conversations Table
 * Track agent conversations with users
 */
export const agentConversationsTable = pgTable(
    'agent_conversations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        agentId: uuid('agent_id').notNull(),
        userId: uuid('user_id').notNull(),

        // Conversation metadata
        title: text('title'),
        description: text('description'),
        status: text('status').notNull().default('active'), // 'active' | 'archived' | 'closed'

        // Tracking
        messageCount: decimal('message_count', { precision: 10, scale: 0 }).default('0'),
        executionCount: decimal('execution_count', { precision: 10, scale: 0 }).default('0'),
        totalTokens: jsonb('total_tokens'), // {input: 1000, output: 500}

        // Context
        context: jsonb('context'), // Shared context/state
        metadata: jsonb('metadata'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
        lastMessageAt: timestamp('last_message_at'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('agent_conversations_workspace_id_idx').on(table.workspaceId),
            agentIdIdx: index('agent_conversations_agent_id_idx').on(table.agentId),
            userIdIdx: index('agent_conversations_user_id_idx').on(table.userId),
            statusIdx: index('agent_conversations_status_idx').on(table.status),
            createdAtIdx: index('agent_conversations_created_at_idx').on(table.createdAt),
        };
    }
);

/**
 * Tool Execution Log Table
 * Audit trail for all tool executions
 */
export const toolExecutionLogTable = pgTable(
    'tool_execution_log',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        toolId: uuid('tool_id').notNull(),
        executionId: uuid('execution_id').notNull(),

        // Execution details
        status: text('status').notNull(), // 'pending' | 'success' | 'error' | 'timeout'
        input: jsonb('input').notNull(),
        output: jsonb('output'),
        error: text('error'),

        // Performance
        duration: decimal('duration', { precision: 10, scale: 0 }).notNull(), // Milliseconds
        retries: decimal('retries', { precision: 5, scale: 0 }).default('0'),

        // Audit
        startedAt: timestamp('started_at').notNull(),
        completedAt: timestamp('completed_at'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('tool_execution_log_workspace_id_idx').on(table.workspaceId),
            toolIdIdx: index('tool_execution_log_tool_id_idx').on(table.toolId),
            executionIdIdx: index('tool_execution_log_execution_id_idx').on(table.executionId),
            statusIdx: index('tool_execution_log_status_idx').on(table.status),
            startedAtIdx: index('tool_execution_log_started_at_idx').on(table.startedAt),
        };
    }
);

/**
 * Relations
 */
export const agentsRelations = relations(agentsTable, ({ one, many }) => ({
    executions: many(agentExecutionsTable),
    steps: many(agentStepsTable),
    memory: many(agentMemoryTable),
    conversations: many(agentConversationsTable),
}));

export const agentExecutionsRelations = relations(agentExecutionsTable, ({ one, many }) => ({
    agent: one(agentsTable, {
        fields: [agentExecutionsTable.agentId],
        references: [agentsTable.id],
    }),
    steps: many(agentStepsTable),
}));

export const agentStepsRelations = relations(agentStepsTable, ({ one }) => ({
    execution: one(agentExecutionsTable, {
        fields: [agentStepsTable.executionId],
        references: [agentExecutionsTable.id],
    }),
    agent: one(agentsTable, {
        fields: [agentStepsTable.agentId],
        references: [agentsTable.id],
    }),
}));

export const agentMemoryRelations = relations(agentMemoryTable, ({ one }) => ({
    agent: one(agentsTable, {
        fields: [agentMemoryTable.agentId],
        references: [agentsTable.id],
    }),
    conversation: one(agentConversationsTable, {
        fields: [agentMemoryTable.conversationId],
        references: [agentConversationsTable.id],
    }),
}));

export const agentConversationsRelations = relations(agentConversationsTable, ({ one, many }) => ({
    agent: one(agentsTable, {
        fields: [agentConversationsTable.agentId],
        references: [agentsTable.id],
    }),
    memory: many(agentMemoryTable),
}));

export const toolExecutionLogRelations = relations(toolExecutionLogTable, ({ one }) => ({
    tool: one(toolsTable, {
        fields: [toolExecutionLogTable.toolId],
        references: [toolsTable.id],
    }),
    execution: one(agentExecutionsTable, {
        fields: [toolExecutionLogTable.executionId],
        references: [agentExecutionsTable.id],
    }),
}));
