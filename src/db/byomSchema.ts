/**
 * BYOM (Bring Your Own Model) Database Schema
 * Support for custom/self-hosted LLM models
 */

import { pgTable, text, boolean, timestamp, uuid, jsonb, decimal, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * BYOM Models Table
 * Registered custom LLM models
 */
export const byomModelsTable = pgTable(
    'byom_models',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        organizationId: uuid('organization_id').notNull(),
        workspaceId: uuid('workspace_id'), // NULL = org-wide, set = workspace-specific

        // Model Identity
        name: text('name').notNull(), // 'Claude-3-local', 'Llama-2-70B'
        slug: text('slug').notNull(),
        description: text('description'),

        // Model Type and Architecture
        type: text('type').notNull().default('custom'), // 'custom' | 'llama' | 'mistral' | 'qwen' | 'proprietary'
        architecture: text('architecture'), // 'transformer' | 'moe' | 'other'
        baseModel: text('base_model'), // Original model (e.g., 'Llama-2-70B')
        finetuningStatus: text('finetuning_status').default('base'), // 'base' | 'finetuned' | 'qlora' | 'lora'

        // Hosting Information
        hostingType: text('hosting_type').notNull(), // 'self-hosted' | 'api' | 'saas' | 'hybrid'
        endpointUrl: text('endpoint_url').notNull(), // Base URL for model endpoint
        apiVersion: text('api_version'), // API version (e.g., 'v1')
        authMethod: text('auth_method'), // 'api_key' | 'bearer_token' | 'basic_auth' | 'oauth2' | 'mtls'
        apiKey: text('api_key'), // Encrypted API key/token
        tlsCertificate: text('tls_certificate'), // For mTLS connections

        // Model Configuration
        maxTokens: decimal('max_tokens', { precision: 10, scale: 0 }),
        contextWindow: decimal('context_window', { precision: 10, scale: 0 }), // Max context size
        temperature: decimal('temperature', { precision: 3, scale: 2 }),
        topP: decimal('top_p', { precision: 3, scale: 2 }),

        // Capabilities
        supportsStreamingCompletion: boolean('supports_streaming_completion').default(false),
        supportsTokenCounting: boolean('supports_token_counting').default(false),
        supportsEmbeddings: boolean('supports_embeddings').default(false),
        supportsImageInput: boolean('supports_image_input').default(false),
        supportsToolCalls: boolean('supports_tool_calls').default(false),
        supportsFunctionCalls: boolean('supports_function_calls').default(false),

        // Performance Profile
        avgLatencyMs: decimal('avg_latency_ms', { precision: 10, scale: 2 }), // Average response time
        throughputTokensPerSecond: decimal('throughput_tokens_per_second', { precision: 10, scale: 2 }),
        costPer1kTokens: decimal('cost_per_1k_tokens', { precision: 10, scale: 6 }),

        // Health & Monitoring
        isAvailable: boolean('is_available').notNull().default(true),
        lastHealthCheckAt: timestamp('last_health_check_at'),
        healthCheckIntervalSeconds: decimal('health_check_interval_seconds', { precision: 10, scale: 0 }).default('300'), // 5 mins
        uptimePercent: decimal('uptime_percent', { precision: 5, scale: 2 }), // 99.99
        totalCallsProcessed: decimal('total_calls_processed', { precision: 20, scale: 0 }).default('0'),

        // Status
        isActive: boolean('is_active').notNull().default(true),
        isPrimary: boolean('is_primary').default(false), // Default model for org/workspace
        isPrivate: boolean('is_private').default(true), // Only organization can use

        // Metadata & Configuration
        customHeaders: jsonb('custom_headers'), // Custom HTTP headers
        metadata: jsonb('metadata'), // {modelSize: '70B', quantization: 'Q4_K_M', framework: 'vLLM'}
        tags: jsonb('tags'), // ['local-only', 'high-performance', 'inference-optimized']
        securityPolicy: jsonb('security_policy'), // {allowExternalAccess: false, dataRetention: 'none'}

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
        updatedBy: uuid('updated_by'),
    },
    (table) => {
        return {
            organizationIdIdx: index('byom_models_organization_id_idx').on(table.organizationId),
            workspaceIdIdx: index('byom_models_workspace_id_idx').on(table.workspaceId),
            slugIdx: uniqueIndex('byom_models_slug_idx').on(table.organizationId, table.slug),
            typeIdx: index('byom_models_type_idx').on(table.type),
            hostingTypeIdx: index('byom_models_hosting_type_idx').on(table.hostingType),
            isActiveIdx: index('byom_models_is_active_idx').on(table.isActive),
            isAvailableIdx: index('byom_models_is_available_idx').on(table.isAvailable),
        };
    }
);

/**
 * BYOM Health Checks Table
 * Track model health and availability
 */
export const byomHealthChecksTable = pgTable(
    'byom_health_checks',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        modelId: uuid('model_id').notNull(),
        organizationId: uuid('organization_id').notNull(),

        // Health Status
        status: text('status').notNull(), // 'healthy' | 'degraded' | 'unhealthy' | 'timeout'
        responseTimeMs: decimal('response_time_ms', { precision: 10, scale: 2 }),
        statusCode: decimal('status_code', { precision: 5, scale: 0 }),

        // Error Information
        errorCode: text('error_code'),
        errorMessage: text('error_message'),

        // Details
        tokensPerSecond: decimal('tokens_per_second', { precision: 10, scale: 2 }),
        memoryUsagePercent: decimal('memory_usage_percent', { precision: 5, scale: 2 }),
        gpuUsagePercent: decimal('gpu_usage_percent', { precision: 5, scale: 2 }),
        cpuUsagePercent: decimal('cpu_usage_percent', { precision: 5, scale: 2 }),

        // Metadata
        metadata: jsonb('metadata'),
        timestamp: timestamp('timestamp').notNull().defaultNow(),
    },
    (table) => {
        return {
            modelIdIdx: index('byom_health_checks_model_id_idx').on(table.modelId),
            organizationIdIdx: index('byom_health_checks_organization_id_idx').on(table.organizationId),
            statusIdx: index('byom_health_checks_status_idx').on(table.status),
            timestampIdx: index('byom_health_checks_timestamp_idx').on(table.timestamp),
        };
    }
);

/**
 * BYOM Usage Table
 * Track model usage and costs
 */
export const byomUsageTable = pgTable(
    'byom_usage',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        modelId: uuid('model_id').notNull(),
        organizationId: uuid('organization_id').notNull(),
        workspaceId: uuid('workspace_id'),
        userId: uuid('user_id').notNull(),

        // Request tracking
        requestId: text('request_id'),

        // Token counting
        inputTokens: decimal('input_tokens', { precision: 20, scale: 0 }).notNull(),
        outputTokens: decimal('output_tokens', { precision: 20, scale: 0 }).notNull(),
        totalTokens: decimal('total_tokens', { precision: 20, scale: 0 }).notNull(),

        // Timing
        responseTimeMs: decimal('response_time_ms', { precision: 10, scale: 2 }),

        // Costing
        costUSD: decimal('cost_usd', { precision: 10, scale: 6 }),

        // Metadata
        modelName: text('model_name'),
        purpose: text('purpose'), // 'chat' | 'completion' | 'embedding' | 'analysis'
        metadata: jsonb('metadata'),

        // Timestamp
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            modelIdIdx: index('byom_usage_model_id_idx').on(table.modelId),
            organizationIdIdx: index('byom_usage_organization_id_idx').on(table.organizationId),
            userIdIdx: index('byom_usage_user_id_idx').on(table.userId),
            createdAtIdx: index('byom_usage_created_at_idx').on(table.createdAt),
        };
    }
);

/**
 * BYOM Model Versions Table
 * Track model versions and fine-tuning iterations
 */
export const byomVersionsTable = pgTable(
    'byom_versions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        modelId: uuid('model_id').notNull(),
        organizationId: uuid('organization_id').notNull(),

        // Version tracking
        versionNumber: text('version_number').notNull(), // 'v1.0', 'v1.1', 'ft-v2'
        description: text('description'),
        releaseNotes: text('release_notes'),

        // Fine-tuning info
        finetuningDatasetId: uuid('finetuning_dataset_id'), // Link to training data
        finetuneParameters: jsonb('finetune_parameters'), // {learningRate: 1e-4, epochs: 3, ...}
        performanceMetrics: jsonb('performance_metrics'), // {accuracy: 0.95, f1: 0.92, ...}

        // Artifact locations
        modelCheckpointUrl: text('model_checkpoint_url'),
        weightsUrl: text('weights_url'),

        // Status
        status: text('status').notNull().default('draft'), // 'draft' | 'training' | 'evaluating' | 'active' | 'deprecated'
        isProduction: boolean('is_production').default(false),
        rolloutPercentage: decimal('rollout_percentage', { precision: 5, scale: 2 }).default('0'), // Gradual rollout

        // Audit
        createdBy: uuid('created_by'),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        activatedAt: timestamp('activated_at'),
        deprecatedAt: timestamp('deprecated_at'),
    },
    (table) => {
        return {
            modelIdIdx: index('byom_versions_model_id_idx').on(table.modelId),
            organizationIdIdx: index('byom_versions_organization_id_idx').on(table.organizationId),
            statusIdx: index('byom_versions_status_idx').on(table.status),
            isProductionIdx: index('byom_versions_is_production_idx').on(table.isProduction),
        };
    }
);

/**
 * BYOM Access Control Table
 * Control which workspaces/users can access which models
 */
export const byomAccessControlTable = pgTable(
    'byom_access_control',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        modelId: uuid('model_id').notNull(),
        organizationId: uuid('organization_id').notNull(),

        // Subject of access
        subjectType: text('subject_type').notNull(), // 'user' | 'role' | 'team' | 'workspace'
        subjectId: uuid('subject_id').notNull(),

        // Access level
        accessLevel: text('access_level').notNull().default('use'), // 'view' | 'use' | 'manage' | 'admin'

        // Constraints
        maxTokensPerDay: decimal('max_tokens_per_day', { precision: 20, scale: 0 }), // Daily quota
        maxRequestsPerDay: decimal('max_requests_per_day', { precision: 10, scale: 0 }),
        expiresAt: timestamp('expires_at'), // Temporary access

        // Audit
        grantedBy: uuid('granted_by'),
        grantedAt: timestamp('granted_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            modelIdIdx: index('byom_access_control_model_id_idx').on(table.modelId),
            organizationIdIdx: index('byom_access_control_organization_id_idx').on(table.organizationId),
            subjectIdx: index('byom_access_control_subject_idx').on(table.subjectType, table.subjectId),
            accessLevelIdx: index('byom_access_control_access_level_idx').on(table.accessLevel),
        };
    }
);

/**
 * Relations
 */
export const byomModelsRelations = relations(byomModelsTable, ({ one, many }) => ({
    healthChecks: many(byomHealthChecksTable),
    usage: many(byomUsageTable),
    versions: many(byomVersionsTable),
    accessControl: many(byomAccessControlTable),
}));

export const byomHealthChecksRelations = relations(byomHealthChecksTable, ({ one }) => ({
    model: one(byomModelsTable, {
        fields: [byomHealthChecksTable.modelId],
        references: [byomModelsTable.id],
    }),
}));

export const byomUsageRelations = relations(byomUsageTable, ({ one }) => ({
    model: one(byomModelsTable, {
        fields: [byomUsageTable.modelId],
        references: [byomModelsTable.id],
    }),
}));

export const byomVersionsRelations = relations(byomVersionsTable, ({ one }) => ({
    model: one(byomModelsTable, {
        fields: [byomVersionsTable.modelId],
        references: [byomModelsTable.id],
    }),
}));

export const byomAccessControlRelations = relations(byomAccessControlTable, ({ one }) => ({
    model: one(byomModelsTable, {
        fields: [byomAccessControlTable.modelId],
        references: [byomModelsTable.id],
    }),
}));
