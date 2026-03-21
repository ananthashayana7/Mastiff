/**
 * LLM Provider Abstraction Layer
 * 
 * Supports multiple LLM providers: Gemini, GPT-4, Claude, custom models
 * Provides unified interface for switching between providers
 */

/**
 * Common LLM response types
 */
export interface LLMResponse {
    text: string;
    tokens?: {
        input: number;
        output: number;
    };
    provider: string;
    model: string;
}

/**
 * LLM Provider Configuration
 */
export interface LLMProviderConfig {
    provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
    model: string;
    apiKey: string;
    apiEndpoint?: string;
    temperature?: number;
    maxTokens?: number;
    customHeaders?: Record<string, string>;
}

/**
 * Abstract LLM Provider Interface
 */
export abstract class LLMProvider {
    protected config: LLMProviderConfig;
    protected name: string;

    constructor(config: LLMProviderConfig) {
        this.config = config;
        this.name = config.provider;
    }

    abstract generateContent(
        prompt: string,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse>;

    abstract chat(
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse>;

    abstract validateConnection(): Promise<boolean>;

    getConfig(): LLMProviderConfig {
        return { ...this.config };
    }

    getProviderName(): string {
        return this.name;
    }
}

/**
 * Detect errors that indicate a key-level failure (rate-limit, quota, auth).
 */
function isKeyExhaustedError(error: any): boolean {
    const status = error?.status ?? error?.statusCode ?? error?.code;
    if (status === 429 || status === 403 || status === 401) return true;

    const msg = String(error?.message || error || '').toLowerCase();
    return (
        msg.includes('resource_exhausted') ||
        msg.includes('rate limit') ||
        msg.includes('rate_limit') ||
        msg.includes('quota') ||
        msg.includes('permission_denied') ||
        msg.includes('api key not valid') ||
        msg.includes('api_key_invalid') ||
        msg.includes('invalid api key') ||
        msg.includes('unauthorized')
    );
}

/**
 * Parse a possibly comma-separated API key string into individual keys.
 */
function parseApiKeys(raw: string): string[] {
    return raw
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);
}

/**
 * Google Gemini Provider
 */
export class GeminiProvider extends LLMProvider {
    private static readonly MODEL_FALLBACKS = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
    ];

    /** All API keys parsed from the comma-separated config value */
    private apiKeys: string[];
    private currentKeyIndex = 0;

    constructor(config: LLMProviderConfig) {
        super(config);
        this.name = 'gemini';

        this.apiKeys = parseApiKeys(config.apiKey || '');
        if (this.apiKeys.length === 0) {
            throw new Error('Gemini API key is required');
        }
    }

    private normalizeModelName(model: string): string {
        const normalized = (model || '').trim();
        const remap: Record<string, string> = {
            'gemini-1.5-flash': 'gemini-2.5-flash',
            'gemini-1.5-flash-latest': 'gemini-2.5-flash',
            'gemini-pro': 'gemini-2.0-flash',
            'gemini-pro-vision': 'gemini-2.0-flash',
        };
        return remap[normalized] || normalized || 'gemini-2.0-flash';
    }

    private getModelCandidates(): string[] {
        const configured = this.normalizeModelName(this.config.model);
        const all = [configured, ...GeminiProvider.MODEL_FALLBACKS];
        return Array.from(new Set(all));
    }

    private isModelNotFoundError(error: any): boolean {
        const msg = String(error?.message || error || '').toLowerCase();
        return msg.includes('not_found') || msg.includes('not found') || msg.includes('models/');
    }

    private extractText(response: any): string {
        if (!response) return '';
        if (typeof response.text === 'function') return response.text() || '';
        if (typeof response.text === 'string') return response.text;
        return '';
    }

    /**
     * Try all model candidates with a single GoogleGenAI client.
     * Returns a result on success, or null if every model was "not found".
     * Throws key-exhausted or unexpected errors for the caller to handle.
     */
    private async tryModelsWithClient(
        ai: any,
        requestFactory: (model: string, ai: any) => Promise<any>
    ): Promise<{ text: string; model: string } | null> {
        let lastError: any;

        for (const model of this.getModelCandidates()) {
            try {
                const response = await requestFactory(model, ai);
                return { text: this.extractText(response), model };
            } catch (error: any) {
                lastError = error;
                if (isKeyExhaustedError(error)) {
                    throw error; // bubble up for key rotation
                }
                if (!this.isModelNotFoundError(error)) {
                    throw error;
                }
            }
        }

        if (lastError && !this.isModelNotFoundError(lastError)) {
            throw lastError;
        }
        return null; // all models not found
    }

    /**
     * Run a request with automatic key rotation and model fallback.
     *
     * For each API key (starting from the current index), tries every model
     * candidate. If the key is exhausted (rate-limit / quota / auth), rotates
     * to the next key and retries.
     */
    private async runWithModelFallback(
        requestFactory: (model: string, ai: any) => Promise<any>
    ): Promise<{ text: string; model: string }> {
        const { GoogleGenAI } = await import('@google/genai');
        let lastError: any;

        for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
            const keyIndex = (this.currentKeyIndex + attempt) % this.apiKeys.length;
            const ai = new GoogleGenAI({ apiKey: this.apiKeys[keyIndex] });

            try {
                const result = await this.tryModelsWithClient(ai, requestFactory);
                if (result) {
                    this.currentKeyIndex = keyIndex; // promote working key
                    return result;
                }
            } catch (error: any) {
                lastError = error;
                if (isKeyExhaustedError(error)) {
                    console.warn(
                        `Gemini API key ${keyIndex + 1}/${this.apiKeys.length} exhausted, rotating…`
                    );
                    continue;
                }
                throw error;
            }
        }

        throw lastError || new Error('No supported Gemini model is available');
    }

    async generateContent(
        prompt: string,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse> {
        try {
            const { text, model } = await this.runWithModelFallback((candidate, ai) =>
                ai.models.generateContent({
                    model: candidate,
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: prompt }],
                        },
                    ],
                    config: {
                        systemInstruction,
                        temperature: this.config.temperature ?? 0.7,
                        responseMimeType: options?.responseMimeType || 'text/plain',
                    },
                })
            );

            return {
                text,
                provider: 'gemini',
                model,
            };
        } catch (error) {
            console.error('Gemini generation error:', error);
            throw error;
        }
    }

    async chat(
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse> {
        try {
            const { text, model } = await this.runWithModelFallback((candidate, ai) =>
                ai.models.generateContent({
                    model: candidate,
                    contents: messages.map((msg) => ({
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.content }],
                    })),
                    config: {
                        systemInstruction,
                        temperature: options?.temperature ?? this.config.temperature ?? 0.7,
                    },
                })
            );

            return {
                text,
                provider: 'gemini',
                model,
            };
        } catch (error) {
            console.error('Gemini chat error:', error);
            throw error;
        }
    }

    async validateConnection(): Promise<boolean> {
        try {
            await this.runWithModelFallback((candidate, ai) =>
                ai.models.generateContent({
                    model: candidate,
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: 'test' }],
                        },
                    ],
                })
            );
            return true;
        } catch (error) {
            console.error('Gemini connection validation failed:', error);
            return false;
        }
    }
}

/**
 * OpenAI Provider (GPT-4, GPT-3.5)
 */
export class OpenAIProvider extends LLMProvider {
    private client: any;

    constructor(config: LLMProviderConfig) {
        super(config);
        this.name = 'openai';

        if (!config.apiKey) {
            throw new Error('OpenAI API key is required');
        }
    }

    async generateContent(
        prompt: string,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse> {
        try {
            const { OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey: this.config.apiKey });

            const response = await client.chat.completions.create({
                model: this.config.model,
                messages: [
                    ...(systemInstruction
                        ? [{ role: 'system' as const, content: systemInstruction }]
                        : []),
                    { role: 'user' as const, content: prompt },
                ],
                temperature: this.config.temperature ?? 0.7,
                max_tokens: this.config.maxTokens ?? 2000,
            });

            const text = response.choices[0]?.message?.content || '';

            return {
                text,
                tokens: {
                    input: response.usage?.prompt_tokens ?? 0,
                    output: response.usage?.completion_tokens ?? 0,
                },
                provider: 'openai',
                model: this.config.model,
            };
        } catch (error) {
            console.error('OpenAI generation error:', error);
            throw error;
        }
    }

    async chat(
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse> {
        try {
            const { OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey: this.config.apiKey });

            const mappedMessages: any[] = [];

            if (systemInstruction) {
                mappedMessages.push({
                    role: 'system',
                    content: systemInstruction,
                });
            }

            mappedMessages.push(
                ...messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                }))
            );

            const response = await client.chat.completions.create({
                model: this.config.model,
                messages: mappedMessages,
                temperature: this.config.temperature ?? 0.7,
                max_tokens: this.config.maxTokens ?? 2000,
            });

            const text = response.choices[0]?.message?.content || '';

            return {
                text,
                tokens: {
                    input: response.usage?.prompt_tokens ?? 0,
                    output: response.usage?.completion_tokens ?? 0,
                },
                provider: 'openai',
                model: this.config.model,
            };
        } catch (error) {
            console.error('OpenAI chat error:', error);
            throw error;
        }
    }

    async validateConnection(): Promise<boolean> {
        try {
            const { OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey: this.config.apiKey });

            await client.chat.completions.create({
                model: this.config.model,
                messages: [{ role: 'user' as const, content: 'test' }],
                max_tokens: 10,
            });

            return true;
        } catch (error) {
            console.error('OpenAI connection validation failed:', error);
            return false;
        }
    }
}

/**
 * Anthropic Claude Provider
 */
export class ClaudeProvider extends LLMProvider {
    private client: any;

    constructor(config: LLMProviderConfig) {
        super(config);
        this.name = 'anthropic';

        if (!config.apiKey) {
            throw new Error('Anthropic API key is required');
        }
    }

    async generateContent(
        prompt: string,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse> {
        try {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey: this.config.apiKey });

            const response = await client.messages.create({
                model: this.config.model,
                max_tokens: this.config.maxTokens ?? 2000,
                system: systemInstruction,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            });

            const text = response.content
                .filter(block => block.type === 'text')
                .map(block => (block.type === 'text' ? block.text : ''))
                .join('');

            return {
                text,
                tokens: {
                    input: response.usage?.input_tokens ?? 0,
                    output: response.usage?.output_tokens ?? 0,
                },
                provider: 'anthropic',
                model: this.config.model,
            };
        } catch (error) {
            console.error('Claude generation error:', error);
            throw error;
        }
    }

    async chat(
        messages: Array<{ role: 'user' | 'assistant'; content: string }>,
        systemInstruction?: string,
        options?: any
    ): Promise<LLMResponse> {
        try {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey: this.config.apiKey });

            const response = await client.messages.create({
                model: this.config.model,
                max_tokens: this.config.maxTokens ?? 2000,
                system: systemInstruction,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                })),
            });

            const text = response.content
                .filter(block => block.type === 'text')
                .map(block => (block.type === 'text' ? block.text : ''))
                .join('');

            return {
                text,
                tokens: {
                    input: response.usage?.input_tokens ?? 0,
                    output: response.usage?.output_tokens ?? 0,
                },
                provider: 'anthropic',
                model: this.config.model,
            };
        } catch (error) {
            console.error('Claude chat error:', error);
            throw error;
        }
    }

    async validateConnection(): Promise<boolean> {
        try {
            const { default: Anthropic } = await import('@anthropic-ai/sdk');
            const client = new Anthropic({ apiKey: this.config.apiKey });

            await client.messages.create({
                model: this.config.model,
                max_tokens: 10,
                messages: [
                    {
                        role: 'user',
                        content: 'test',
                    },
                ],
            });

            return true;
        } catch (error) {
            console.error('Claude connection validation failed:', error);
            return false;
        }
    }
}

/**
 * LLM Provider Factory
 */
export class LLMProviderFactory {
    static create(config: LLMProviderConfig): LLMProvider {
        switch (config.provider) {
            case 'gemini':
                return new GeminiProvider(config);
            case 'openai':
                return new OpenAIProvider(config);
            case 'anthropic':
                return new ClaudeProvider(config);
            case 'custom':
                // For custom providers, return a generic wrapper
                return new GeminiProvider(config); // fallback
            default:
                throw new Error(`Unsupported LLM provider: ${config.provider}`);
        }
    }

    static getSupportedProviders(): string[] {
        return ['gemini', 'openai', 'anthropic'];
    }
}
