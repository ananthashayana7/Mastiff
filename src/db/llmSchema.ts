/**
 * LLM Management Database Schema
 * 
 * Tables for managing multiple LLM providers and user preferences
 */

import { pgTable, text, boolean, timestamp, uuid, decimal, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { usersTable } from './schema'; // Adjust based on your existing schema

/**
 * LLM Models Table
 * Stores configured LLM providers for each workspace
 */
export const llmModelsTable = pgTable(
    'llm_models',
    {
        // Identifiers
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),

        // Provider Configuration
        provider: text('provider').notNull(), // 'gemini' | 'openai' | 'anthropic' | 'custom'
        model: text('model').notNull(), // e.g., 'gpt-4-turbo', 'claude-3-opus'
        displayName: text('display_name').notNull(), // User-friendly name
        description: text('description'),

        // API Configuration (encrypted in production)
        apiKey: text('api_key').notNull(), // Should be encrypted
        customEndpoint: text('custom_endpoint'), // For BYOM support

        // Model Parameters
        temperature: decimal('temperature', { precision: 3, scale: 2 }), // 0.0 - 2.0
        maxTokens: decimal('max_tokens', { precision: 10, scale: 0 }), // Max output tokens

        // Cost Tracking
        costPerInput: decimal('cost_per_input', { precision: 10, scale: 8 }), // Per 1K tokens
        costPerOutput: decimal('cost_per_output', { precision: 10, scale: 8 }), // Per 1K tokens

        // Metadata
        metadata: jsonb('metadata'), // Provider-specific metadata
        isActive: boolean('is_active').notNull().default(true),
        isDefault: boolean('is_default').notNull().default(false),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('llm_models_workspace_id_idx').on(table.workspaceId),
            defaultIdx: index('llm_models_default_idx').on(table.isDefault),
            providerIdx: index('llm_models_provider_idx').on(table.provider),
        };
    }
);

/**
 * User LLM Preferences Table
 * Tracks each user's preferred LLM model
 */
export const userLLMPreferencesTable = pgTable(
    'user_llm_preferences',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').notNull(),
        workspaceId: uuid('workspace_id').notNull(),

        // Preference
        preferredModelId: uuid('preferred_model_id').notNull(), // References llmModelsTable
        temperature: decimal('temperature', { precision: 3, scale: 2 }), // User override
        maxTokens: decimal('max_tokens', { precision: 10, scale: 0 }), // User override

        // Metadata
        lastUsedAt: timestamp('last_used_at'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            userIdIdx: index('user_llm_prefs_user_id_idx').on(table.userId),
            workspaceIdIdx: index('user_llm_prefs_workspace_id_idx').on(table.workspaceId),
        };
    }
);

/**
 * LLM Usage Tracking Table
 * Logs all LLM API calls for analytics and billing
 */
export const llmUsageTable = pgTable(
    'llm_usage',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').notNull(),
        workspaceId: uuid('workspace_id').notNull(),
        modelId: uuid('model_id').notNull(), // References llmModelsTable

        // Request Details
        provider: text('provider').notNull(),
        model: text('model').notNull(),
        operation: text('operation').notNull(), // 'generateContent' | 'chat' | 'embedding'

        // Token Usage
        inputTokens: decimal('input_tokens', { precision: 10, scale: 0 }).notNull(),
        outputTokens: decimal('output_tokens', { precision: 10, scale: 0 }).notNull(),
        totalTokens: decimal('total_tokens', { precision: 10, scale: 0 }).notNull(),

        // Cost
        costUSD: decimal('cost_usd', { precision: 10, scale: 6 }), // Calculated cost

        // Request/Response Info
        requestLength: decimal('request_length', { precision: 10, scale: 0 }), // Characters
        responseLength: decimal('response_length', { precision: 10, scale: 0 }), // Characters
        duration: decimal('duration', { precision: 10, scale: 0 }), // Milliseconds

        // Status
        status: text('status').notNull(), // 'success' | 'error' | 'partial'
        errorMessage: text('error_message'),

        // Context
        context: jsonb('context'), // Partial request/response for debugging
        sourceAction: text('source_action'), // What triggered the call

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            userIdIdx: index('llm_usage_user_id_idx').on(table.userId),
            workspaceIdIdx: index('llm_usage_workspace_id_idx').on(table.workspaceId),
            modelIdIdx: index('llm_usage_model_id_idx').on(table.modelId),
            createdAtIdx: index('llm_usage_created_at_idx').on(table.createdAt),
        };
    }
);

/**
 * LLM Provider Health Table
 * Monitors provider availability and performance
 */
export const llmHealthTable = pgTable(
    'llm_health',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        modelId: uuid('model_id').notNull(), // References llmModelsTable
        provider: text('provider').notNull(),

        // Health Metrics
        isHealthy: boolean('is_healthy').notNull().default(true),
        lastCheckedAt: timestamp('last_checked_at').notNull().defaultNow(),
        lastFailureAt: timestamp('last_failure_at'),
        consecutiveFailures: decimal('consecutive_failures', { precision: 5, scale: 0 }).default('0'),

        // Performance
        avgResponseTime: decimal('avg_response_time', { precision: 10, scale: 2 }), // Milliseconds
        errorRate: decimal('error_rate', { precision: 5, scale: 2 }), // Percentage (0-100)
        uptime: decimal('uptime', { precision: 5, scale: 2 }), // Percentage (0-100)

        // Status
        statusMessage: text('status_message'),
        lastError: text('last_error'),

        // Configuration
        retryCount: decimal('retry_count', { precision: 5, scale: 0 }).default('0'),
        isCircuitBreakerOpen: boolean('is_circuit_breaker_open').notNull().default(false),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            modelIdIdx: index('llm_health_model_id_idx').on(table.modelId),
            providersIdx: index('llm_health_provider_idx').on(table.provider),
            healthIdx: index('llm_health_is_healthy_idx').on(table.isHealthy),
        };
    }
);

/**
 * Relations
 */
export const llmModelsRelations = relations(llmModelsTable, ({ many }) => ({
    usageHistory: many(llmUsageTable),
    userPreferences: many(userLLMPreferencesTable),
    health: many(llmHealthTable),
}));

export const userLLMPreferencesRelations = relations(userLLMPreferencesTable, ({ one }) => ({
    model: one(llmModelsTable, {
        fields: [userLLMPreferencesTable.preferredModelId],
        references: [llmModelsTable.id],
    }),
}));

export const llmUsageRelations = relations(llmUsageTable, ({ one }) => ({
    model: one(llmModelsTable, {
        fields: [llmUsageTable.modelId],
        references: [llmModelsTable.id],
    }),
}));

export const llmHealthRelations = relations(llmHealthTable, ({ one }) => ({
    model: one(llmModelsTable, {
        fields: [llmHealthTable.modelId],
        references: [llmModelsTable.id],
    }),
}));
