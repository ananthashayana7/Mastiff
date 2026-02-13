/**
 * Multi-Model LLM Management Service
 * 
 * Handles provider selection, model configuration, and switching
 * Supports user preferences and workspace-level defaults
 */

import db from '@/src/db';
import { v4 as uuidv4 } from 'uuid';
import {
    LLMProvider,
    LLMProviderConfig,
    LLMProviderFactory,
    LLMResponse,
} from './llmProvider';
import { auditLogger } from './auditLogger';

/**
 * LLM Model Configuration
 */
export interface LLMModelConfig {
    id: string;
    workspaceId: string;
    provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
    model: string;
    displayName: string;
    description?: string;
    isActive: boolean;
    isDefault: boolean;
    apiKey: string; // Encrypted
    temperature?: number;
    maxTokens?: number;
    customEndpoint?: string;
    costPer1kTokens?: {
        input: number;
        output: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

/**
 * LLM Management Service
 */
export class LLMManagementService {
    private providerCache: Map<string, LLMProvider> = new Map();

    /**
     * Register a new LLM provider for a workspace
     */
    async registerProvider(
        workspaceId: string,
        userId: string,
        config: {
            provider: 'gemini' | 'openai' | 'anthropic';
            model: string;
            displayName: string;
            apiKey: string;
            temperature?: number;
            maxTokens?: number;
            description?: string;
        }
    ): Promise<string> {
        try {
            // Validate connection
            const providerConfig: LLMProviderConfig = {
                provider: config.provider,
                model: config.model,
                apiKey: config.apiKey,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
            };

            const provider = LLMProviderFactory.create(providerConfig);
            const isValid = await provider.validateConnection();

            if (!isValid) {
                throw new Error(`Failed to validate ${config.provider} connection`);
            }

            const modelId = uuidv4();

            // Store encrypted config (in real implementation)
            // For now, store directly
            const modelConfig: LLMModelConfig = {
                id: modelId,
                workspaceId,
                provider: config.provider,
                model: config.model,
                displayName: config.displayName,
                description: config.description,
                isActive: true,
                isDefault: false,
                apiKey: config.apiKey, // Should be encrypted
                temperature: config.temperature,
                maxTokens: config.maxTokens,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Store in database (you'll need to add llmModels table)
            // await db.insert(llmModels).values(modelConfig);

            await auditLogger.log({
                userId,
                action: 'register_llm_provider',
                resourceType: 'llm_model',
                resourceId: modelId,
                details: {
                    provider: config.provider,
                    model: config.model,
                    displayName: config.displayName,
                },
            });

            return modelId;
        } catch (error) {
            console.error('Failed to register LLM provider:', error);
            throw error;
        }
    }

    /**
     * Get default provider for workspace
     */
    async getDefaultProvider(workspaceId: string): Promise<LLMProvider> {
        // First check cache
        const cacheKey = `default:${workspaceId}`;
        if (this.providerCache.has(cacheKey)) {
            return this.providerCache.get(cacheKey)!;
        }

        // Get from database
        const defaultModel = await this.getDefaultModelConfig(workspaceId);

        if (!defaultModel) {
            // Fallback to Gemini with env API key
            return this.createGeminiProvider();
        }

        const provider = LLMProviderFactory.create({
            provider: defaultModel.provider,
            model: defaultModel.model,
            apiKey: defaultModel.apiKey,
            temperature: defaultModel.temperature,
            maxTokens: defaultModel.maxTokens,
        });

        this.providerCache.set(cacheKey, provider);
        return provider;
    }

    /**
     * Get specific provider by ID
     */
    async getProviderById(modelId: string): Promise<LLMProvider> {
        const cacheKey = `model:${modelId}`;
        if (this.providerCache.has(cacheKey)) {
            return this.providerCache.get(cacheKey)!;
        }

        const modelConfig = await this.getModelConfig(modelId);
        if (!modelConfig) {
            throw new Error(`LLM model not found: ${modelId}`);
        }

        const provider = LLMProviderFactory.create({
            provider: modelConfig.provider,
            model: modelConfig.model,
            apiKey: modelConfig.apiKey,
            temperature: modelConfig.temperature,
            maxTokens: modelConfig.maxTokens,
        });

        this.providerCache.set(cacheKey, provider);
        return provider;
    }

    /**
     * Get provider for user (checks preferences, then workspace default)
     */
    async getProviderForUser(
        userId: string,
        workspaceId: string,
        preferredModelId?: string
    ): Promise<LLMProvider> {
        // If specific model requested, use it
        if (preferredModelId) {
            return this.getProviderById(preferredModelId);
        }

        // Check user preference
        // const userPref = await db.query.userLLMPreferences.findFirst({
        //     where: eq(userLLMPreferences.userId, userId),
        // });
        // if (userPref?.preferredModelId) {
        //     return this.getProviderById(userPref.preferredModelId);
        // }

        // Fall back to workspace default
        return this.getDefaultProvider(workspaceId);
    }

    /**
     * Generate content using best available provider
     */
    async generateContent(
        prompt: string,
        workspaceId: string,
        userId?: string,
        options?: {
            systemInstruction?: string;
            modelId?: string;
            temperature?: number;
        }
    ): Promise<LLMResponse> {
        try {
            const provider = userId
                ? await this.getProviderForUser(userId, workspaceId, options?.modelId)
                : await this.getDefaultProvider(workspaceId);

            return await provider.generateContent(prompt, options?.systemInstruction, options);
        } catch (error) {
            console.error('Content generation failed:', error);
            throw error;
        }
    }

    /**
     * Chat with LLM
     */
    async chat(
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        workspaceId: string,
        userId?: string,
        options?: {
            systemInstruction?: string;
            modelId?: string;
        }
    ): Promise<LLMResponse> {
        try {
            const provider = userId
                ? await this.getProviderForUser(userId, workspaceId, options?.modelId)
                : await this.getDefaultProvider(workspaceId);

            return await provider.chat(messages, options?.systemInstruction, options);
        } catch (error) {
            console.error('Chat failed:', error);
            throw error;
        }
    }

    /**
     * List available models for workspace
     */
    async listModels(workspaceId: string): Promise<LLMModelConfig[]> {
        // In real implementation, query from database
        // return await db.query.llmModels.findMany({
        //     where: eq(llmModels.workspaceId, workspaceId),
        // });

        return [];
    }

    /**
     * Set default model for workspace
     */
    async setDefaultModel(workspaceId: string, modelId: string): Promise<void> {
        // Update database
        // await db.update(llmModels)
        //     .set({ isDefault: false })
        //     .where(eq(llmModels.workspaceId, workspaceId));
        //
        // await db.update(llmModels)
        //     .set({ isDefault: true })
        //     .where(eq(llmModels.id, modelId));

        // Clear cache
        this.providerCache.delete(`default:${workspaceId}`);
    }

    /**
     * Set user's preferred model
     */
    async setUserPreference(userId: string, modelId: string): Promise<void> {
        // Store user preference
        // await db.insert(userLLMPreferences).values({
        //     userId,
        //     preferredModelId: modelId,
        //     updatedAt: new Date(),
        // });

        // Clear cache
        this.providerCache.delete(`user:${userId}`);
    }

    /**
     * Deactivate a model
     */
    async deactivateModel(modelId: string, userId: string): Promise<void> {
        // Update database
        // await db.update(llmModels)
        //     .set({ isActive: false })
        //     .where(eq(llmModels.id, modelId));

        this.providerCache.delete(`model:${modelId}`);

        await auditLogger.log({
            userId,
            action: 'deactivate_llm_model',
            resourceType: 'llm_model',
            resourceId: modelId,
        });
    }

    /**
     * Get supported providers
     */
    getSupportedProviders(): Array<{
        name: string;
        displayName: string;
        description: string;
        models: string[];
    }> {
        return [
            {
                name: 'gemini',
                displayName: 'Google Gemini',
                description: 'Advanced multimodal AI model from Google',
                models: ['gemini-2.0-flash', 'gemini-pro', 'gemini-pro-vision'],
            },
            {
                name: 'openai',
                displayName: 'OpenAI',
                description: 'GPT-4, GPT-3.5, and other OpenAI models',
                models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
            },
            {
                name: 'anthropic',
                displayName: 'Anthropic Claude',
                description: 'Claude family of advanced AI models',
                models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
            },
        ];
    }

    /**
     * Private helper: Create default Gemini provider
     */
    private createGeminiProvider(): LLMProvider {
        const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
        if (!apiKey) {
            throw new Error('No Gemini API key configured');
        }

        return LLMProviderFactory.create({
            provider: 'gemini',
            model: 'gemini-2.0-flash',
            apiKey,
        });
    }

    /**
     * Private helper: Get model config
     */
    private async getModelConfig(modelId: string): Promise<LLMModelConfig | null> {
        // Query database
        // return await db.query.llmModels.findFirst({
        //     where: eq(llmModels.id, modelId),
        // });

        return null;
    }

    /**
     * Private helper: Get default model config
     */
    private async getDefaultModelConfig(workspaceId: string): Promise<LLMModelConfig | null> {
        // Query database
        // return await db.query.llmModels.findFirst({
        //     where: and(
        //         eq(llmModels.workspaceId, workspaceId),
        //         eq(llmModels.isDefault, true),
        //         eq(llmModels.isActive, true)
        //     ),
        // });

        return null;
    }

    /**
     * Clear provider cache
     */
    clearCache(): void {
        this.providerCache.clear();
    }
}

export default new LLMManagementService();
