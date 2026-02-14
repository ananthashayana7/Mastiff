/**
 * BYOM Service - Bring Your Own Model (Custom LLM Models)
 * Manages custom/self-hosted LLM integrations and usage tracking
 */

import { db } from '@/src/db/index';
import {
    byomModelsTable,
    byomHealthChecksTable,
    byomUsageTable,
    byomVersionsTable,
    byomAccessControlTable,
} from '@/src/db/byomSchema';
import { eq, and, gte, desc } from 'drizzle-orm';

export interface BYOMModelConfig {
    organizationId: string;
    workspaceId?: string;
    name: string;
    description?: string;
    type: 'custom' | 'llama' | 'mistral' | 'qwen' | 'proprietary';
    baseModel?: string;
    hostingType: 'self-hosted' | 'api' | 'saas' | 'hybrid';
    endpointUrl: string;
    apiVersion?: string;
    authMethod: 'api_key' | 'bearer_token' | 'basic_auth' | 'oauth2' | 'mtls';
    apiKey?: string;
    tlsCertificate?: string;
    maxTokens?: number;
    contextWindow?: number;
    temperature?: number;
    supportsStreamingCompletion?: boolean;
    supportsTokenCounting?: boolean;
    supportsEmbeddings?: boolean;
}

export interface BYOMCompletion {
    modelId: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
}

export interface BYOMUsageRecord {
    modelId: string;
    organizationId: string;
    workspaceId?: string;
    userId: string;
    inputTokens: number;
    outputTokens: number;
    responseTimeMs?: number;
    purpose: 'chat' | 'completion' | 'embedding' | 'analysis';
}

/**
 * BYOM Service
 */
export class BYOMService {
    /**
     * Register a custom LLM model
     */
    static async registerModel(
        config: BYOMModelConfig & { createdBy: string }
    ): Promise<typeof byomModelsTable.$inferSelect> {
        const slug = config.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const model = await db
            .insert(byomModelsTable)
            .values({
                organizationId: config.organizationId,
                workspaceId: config.workspaceId,
                name: config.name,
                slug,
                description: config.description,
                type: config.type,
                baseModel: config.baseModel,
                hostingType: config.hostingType,
                endpointUrl: config.endpointUrl,
                apiVersion: config.apiVersion,
                authMethod: config.authMethod,
                apiKey: config.apiKey, // In production, would encrypt
                tlsCertificate: config.tlsCertificate,
                maxTokens: config.maxTokens?.toString(),
                contextWindow: config.contextWindow?.toString(),
                temperature: config.temperature?.toString(),
                supportsStreamingCompletion: config.supportsStreamingCompletion,
                supportsTokenCounting: config.supportsTokenCounting,
                supportsEmbeddings: config.supportsEmbeddings,
                createdBy: config.createdBy,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return model[0];
    }

    /**
     * Get model by ID
     */
    static async getModel(modelId: string) {
        const models = await db
            .select()
            .from(byomModelsTable)
            .where(eq(byomModelsTable.id, modelId))
            .limit(1);

        return models[0] || null;
    }

    /**
     * List organization's models
     */
    static async listModels(
        organizationId: string,
        filters?: {
            workspaceId?: string;
            type?: string;
            isActive?: boolean;
            isAvailable?: boolean;
        }
    ) {
        let query = db
            .select()
            .from(byomModelsTable)
            .where(eq(byomModelsTable.organizationId, organizationId));

        if (filters?.workspaceId) {
            query = query.where(eq(byomModelsTable.workspaceId, filters.workspaceId));
        }

        if (filters?.type) {
            query = query.where(eq(byomModelsTable.type, filters.type));
        }

        if (filters?.isActive !== undefined) {
            query = query.where(eq(byomModelsTable.isActive, filters.isActive));
        }

        if (filters?.isAvailable !== undefined) {
            query = query.where(eq(byomModelsTable.isAvailable, filters.isAvailable));
        }

        return query;
    }

    /**
     * Update model configuration
     */
    static async updateModel(
        modelId: string,
        updates: Partial<BYOMModelConfig> & { updatedBy: string }
    ) {
        const { updatedBy, ...data } = updates;

        const updated = await db
            .update(byomModelsTable)
            .set({
                ...data,
                updatedBy,
                updatedAt: new Date(),
            })
            .where(eq(byomModelsTable.id, modelId))
            .returning();

        return updated[0];
    }

    /**
     * Delete/deactivate model
     */
    static async deleteModel(modelId: string) {
        await db
            .update(byomModelsTable)
            .set({ isActive: false })
            .where(eq(byomModelsTable.id, modelId));
    }

    /**
     * Record health check
     */
    static async recordHealthCheck(
        modelId: string,
        organizationId: string,
        status: 'healthy' | 'degraded' | 'unhealthy' | 'timeout',
        responseTimeMs?: number,
        statusCode?: number,
        errorMessage?: string,
        metrics?: {
            tokensPerSecond?: number;
            memoryUsagePercent?: number;
            gpuUsagePercent?: number;
            cpuUsagePercent?: number;
        }
    ) {
        const healthCheck = await db
            .insert(byomHealthChecksTable)
            .values({
                modelId,
                organizationId,
                status,
                responseTimeMs: responseTimeMs?.toString(),
                statusCode: statusCode?.toString(),
                errorMessage,
                tokensPerSecond: metrics?.tokensPerSecond?.toString(),
                memoryUsagePercent: metrics?.memoryUsagePercent?.toString(),
                gpuUsagePercent: metrics?.gpuUsagePercent?.toString(),
                cpuUsagePercent: metrics?.cpuUsagePercent?.toString(),
                timestamp: new Date(),
            })
            .returning();

        // Update model availability
        const isAvailable = status !== 'unhealthy' && status !== 'timeout';
        await db
            .update(byomModelsTable)
            .set({
                isAvailable,
                lastHealthCheckAt: new Date(),
            })
            .where(eq(byomModelsTable.id, modelId));

        return healthCheck[0];
    }

    /**
     * Get health check history
     */
    static async getHealthCheckHistory(
        modelId: string,
        organizationId: string,
        limit: number = 50
    ) {
        return await db
            .select()
            .from(byomHealthChecksTable)
            .where(
                and(
                    eq(byomHealthChecksTable.modelId, modelId),
                    eq(byomHealthChecksTable.organizationId, organizationId)
                )
            )
            .orderBy(desc(byomHealthChecksTable.timestamp))
            .limit(limit);
    }

    /**
     * Record model usage
     */
    static async recordUsage(usage: BYOMUsageRecord & { requestId?: string; metadata?: any }) {
        const totalTokens = usage.inputTokens + usage.outputTokens;

        const record = await db
            .insert(byomUsageTable)
            .values({
                modelId: usage.modelId,
                organizationId: usage.organizationId,
                workspaceId: usage.workspaceId,
                userId: usage.userId,
                inputTokens: usage.inputTokens.toString(),
                outputTokens: usage.outputTokens.toString(),
                totalTokens: totalTokens.toString(),
                responseTimeMs: usage.responseTimeMs?.toString(),
                purpose: usage.purpose,
                requestId: usage.requestId,
                metadata: usage.metadata,
                createdAt: new Date(),
            })
            .returning();

        return record[0];
    }

    /**
     * Get model usage statistics
     */
    static async getUsageStats(
        modelId: string,
        organizationId: string,
        fromDate?: Date,
        toDate: Date = new Date()
    ) {
        let query = db
            .select()
            .from(byomUsageTable)
            .where(
                and(
                    eq(byomUsageTable.modelId, modelId),
                    eq(byomUsageTable.organizationId, organizationId)
                )
            );

        if (fromDate) {
            query = query.where(gte(byomUsageTable.createdAt, fromDate));
        }

        const records = await query;

        // Calculate statistics
        const totalRequests = records.length;
        const totalInputTokens = records.reduce((sum, r) => sum + Number(r.inputTokens || 0), 0);
        const totalOutputTokens = records.reduce((sum, r) => sum + Number(r.outputTokens || 0), 0);
        const avgResponseTime =
            records.length > 0
                ? records.reduce((sum, r) => sum + Number(r.responseTimeMs || 0), 0) / records.length
                : 0;

        return {
            totalRequests,
            totalInputTokens,
            totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
            avgResponseTime,
            fromDate,
            toDate,
        };
    }

    /**
     * Create model version
     */
    static async createVersion(
        modelId: string,
        organizationId: string,
        versionConfig: {
            versionNumber: string;
            description?: string;
            releaseNotes?: string;
            finetuneParameters?: Record<string, any>;
            performanceMetrics?: Record<string, any>;
            modelCheckpointUrl?: string;
            createdBy?: string;
        }
    ) {
        const version = await db
            .insert(byomVersionsTable)
            .values({
                modelId,
                organizationId,
                versionNumber: versionConfig.versionNumber,
                description: versionConfig.description,
                releaseNotes: versionConfig.releaseNotes,
                finetuneParameters: versionConfig.finetuneParameters,
                performanceMetrics: versionConfig.performanceMetrics,
                modelCheckpointUrl: versionConfig.modelCheckpointUrl,
                status: 'draft',
                createdBy: versionConfig.createdBy,
                createdAt: new Date(),
            })
            .returning();

        return version[0];
    }

    /**
     * Get model versions
     */
    static async getVersions(
        modelId: string,
        organizationId: string
    ) {
        return await db
            .select()
            .from(byomVersionsTable)
            .where(
                and(
                    eq(byomVersionsTable.modelId, modelId),
                    eq(byomVersionsTable.organizationId, organizationId)
                )
            )
            .orderBy(desc(byomVersionsTable.createdAt));
    }

    /**
     * Activate version
     */
    static async activateVersion(
        versionId: string,
        modelId: string
    ) {
        // Deactivate other versions
        await db
            .update(byomVersionsTable)
            .set({ isProduction: false })
            .where(
                and(
                    eq(byomVersionsTable.modelId, modelId),
                    eq(byomVersionsTable.isProduction, true)
                )
            );

        // Activate new version
        const updated = await db
            .update(byomVersionsTable)
            .set({
                isProduction: true,
                status: 'active',
                activatedAt: new Date(),
                rolloutPercentage: 100,
            })
            .where(eq(byomVersionsTable.id, versionId))
            .returning();

        return updated[0];
    }

    /**
     * Grant access to model
     */
    static async grantAccess(
        modelId: string,
        organizationId: string,
        subjectType: 'user' | 'role' | 'team' | 'workspace',
        subjectId: string,
        accessLevel: 'view' | 'use' | 'manage' | 'admin' = 'use',
        grantedBy?: string,
        constraints?: {
            maxTokensPerDay?: number;
            maxRequestsPerDay?: number;
            expiresAt?: Date;
        }
    ) {
        const access = await db
            .insert(byomAccessControlTable)
            .values({
                modelId,
                organizationId,
                subjectType,
                subjectId,
                accessLevel,
                maxTokensPerDay: constraints?.maxTokensPerDay?.toString(),
                maxRequestsPerDay: constraints?.maxRequestsPerDay?.toString(),
                expiresAt: constraints?.expiresAt,
                grantedBy,
                grantedAt: new Date(),
            })
            .returning();

        return access[0];
    }

    /**
     * Check if user can access model
     */
    static async canAccessModel(
        modelId: string,
        userId: string,
        organizationId: string,
        requiredLevel: 'view' | 'use' | 'manage' | 'admin' = 'use'
    ): Promise<boolean> {
        const access = await db
            .select()
            .from(byomAccessControlTable)
            .where(
                and(
                    eq(byomAccessControlTable.modelId, modelId),
                    eq(byomAccessControlTable.organizationId, organizationId),
                    eq(byomAccessControlTable.subjectId, userId)
                )
            )
            .limit(1);

        if (access.length === 0) {
            return false;
        }

        // Check if access is still valid
        if (access[0].expiresAt && access[0].expiresAt < new Date()) {
            return false;
        }

        // Check access level
        const levelHierarchy = { view: 1, use: 2, manage: 3, admin: 4 };
        const userLevel = levelHierarchy[access[0].accessLevel as keyof typeof levelHierarchy] || 0;
        const requiredLevelValue = levelHierarchy[requiredLevel];

        return userLevel >= requiredLevelValue;
    }

    /**
     * Invoke model completion
     */
    static async invokeCompletion(
        modelId: string,
        userId: string,
        organizationId: string,
        request: {
            prompt: string;
            maxTokens?: number;
            temperature?: number;
            stream?: boolean;
        }
    ): Promise<{
        success: boolean;
        output?: string;
        tokens?: { input: number; output: number };
        error?: string;
    }> {
        try {
            const model = await this.getModel(modelId);
            if (!model) {
                return { success: false, error: 'Model not found' };
            }

            if (!model.isActive || !model.isAvailable) {
                return { success: false, error: 'Model is not available' };
            }

            // Check access
            const hasAccess = await this.canAccessModel(modelId, userId, organizationId, 'use');
            if (!hasAccess) {
                return { success: false, error: 'Access denied' };
            }

            // In production, would make actual API call to endpoint
            const startTime = Date.now();

            // Simulate API call
            const completion = {
                choices: [
                    {
                        text: `Response from ${model.name}: ` + request.prompt.substring(0, 100),
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 20,
                    total_tokens: 30,
                },
            };

            const responseTime = Date.now() - startTime;

            // Record usage
            await this.recordUsage({
                modelId,
                organizationId,
                userId,
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
                responseTimeMs: responseTime,
                purpose: 'completion',
            });

            return {
                success: true,
                output: completion.choices[0].text,
                tokens: {
                    input: completion.usage.prompt_tokens,
                    output: completion.usage.completion_tokens,
                },
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Completion failed',
            };
        }
    }

    /**
     * Get model statistics
     */
    static async getModelStats(modelId: string, organizationId: string) {
        const model = await this.getModel(modelId);
        if (!model) {
            return null;
        }

        // Last 30 days stats
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const usage = await this.getUsageStats(modelId, organizationId, thirtyDaysAgo);

        // Recent health checks
        const healthChecks = await this.getHealthCheckHistory(modelId, organizationId, 100);

        // Calculate uptime percentage
        const totalChecks = healthChecks.length;
        const healthyChecks = healthChecks.filter((h) => h.status === 'healthy').length;
        const uptimePercent = totalChecks > 0 ? (healthyChecks / totalChecks) * 100 : 0;

        return {
            modelId,
            name: model.name,
            type: model.type,
            isAvailable: model.isAvailable,
            lastHealthCheckAt: model.lastHealthCheckAt,
            usage,
            uptimePercent,
            totalCalls: Number(model.totalCallsProcessed || 0),
        };
    }
}
