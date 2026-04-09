import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseApiKeys, isKeyExhaustedError, classifyLlmError } from '../src/services/llm';

/* ------------------------------------------------------------------ */
/*  parseApiKeys                                                       */
/* ------------------------------------------------------------------ */
describe('parseApiKeys', () => {
    it('parses a single key', () => {
        expect(parseApiKeys('key1')).toEqual(['key1']);
    });

    it('parses comma-separated keys', () => {
        expect(parseApiKeys('key1,key2,key3')).toEqual(['key1', 'key2', 'key3']);
    });

    it('trims whitespace around keys', () => {
        expect(parseApiKeys(' key1 , key2 , key3 ')).toEqual(['key1', 'key2', 'key3']);
    });

    it('filters out empty segments', () => {
        expect(parseApiKeys('key1,,key2,,,key3')).toEqual(['key1', 'key2', 'key3']);
    });

    it('returns empty for undefined input', () => {
        expect(parseApiKeys(undefined)).toEqual([]);
    });

    it('returns empty for empty string', () => {
        expect(parseApiKeys('')).toEqual([]);
    });

    it('aggregates keys from multiple env vars', () => {
        expect(parseApiKeys('a1,a2', undefined, 'b1')).toEqual(['a1', 'a2', 'b1']);
    });

    it('deduplication is the caller responsibility — returns all keys', () => {
        expect(parseApiKeys('k1,k1')).toEqual(['k1', 'k1']);
    });
});

/* ------------------------------------------------------------------ */
/*  isKeyExhaustedError                                                */
/* ------------------------------------------------------------------ */
describe('isKeyExhaustedError', () => {
    it('detects HTTP 429 status', () => {
        expect(isKeyExhaustedError({ status: 429 })).toBe(true);
    });

    it('detects HTTP 403 status', () => {
        expect(isKeyExhaustedError({ status: 403 })).toBe(true);
    });

    it('detects HTTP 401 status', () => {
        expect(isKeyExhaustedError({ statusCode: 401 })).toBe(true);
    });

    it('detects RESOURCE_EXHAUSTED message', () => {
        expect(isKeyExhaustedError({ message: 'RESOURCE_EXHAUSTED: quota exceeded' })).toBe(true);
    });

    it('detects rate limit message', () => {
        expect(isKeyExhaustedError({ message: 'Rate limit exceeded for this key' })).toBe(true);
    });

    it('detects quota message', () => {
        expect(isKeyExhaustedError({ message: 'You have exceeded your quota' })).toBe(true);
    });

    it('detects permission denied message', () => {
        expect(isKeyExhaustedError({ message: 'PERMISSION_DENIED' })).toBe(true);
    });

    it('detects invalid API key message', () => {
        expect(isKeyExhaustedError({ message: 'API key not valid. Please pass a valid API key.' })).toBe(true);
    });

    it('detects api_key_invalid message', () => {
        expect(isKeyExhaustedError({ message: 'api_key_invalid' })).toBe(true);
    });

    it('detects unauthorized message', () => {
        expect(isKeyExhaustedError({ message: 'Unauthorized access' })).toBe(true);
    });

    it('returns false for model not found error', () => {
        expect(isKeyExhaustedError({ message: 'models/gemini-unknown is not found' })).toBe(false);
    });

    it('returns false for generic errors', () => {
        expect(isKeyExhaustedError({ message: 'Network timeout' })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isKeyExhaustedError(null)).toBe(false);
        expect(isKeyExhaustedError(undefined)).toBe(false);
    });

    it('handles plain string errors', () => {
        expect(isKeyExhaustedError('RESOURCE_EXHAUSTED')).toBe(true);
        expect(isKeyExhaustedError('some other error')).toBe(false);
    });
});

describe('classifyLlmError', () => {
    it('classifies context-window failures distinctly', () => {
        const result = classifyLlmError({ message: 'The input token count exceeds the maximum context length for this model.' });

        expect(result.code).toBe('context_limit');
        expect(result.status).toBe(400);
        expect(result.content).toContain('too large for the current model context window');
    });

    it('classifies API configuration failures distinctly', () => {
        const result = classifyLlmError(new Error('At least one Gemini API key must be set'));

        expect(result.code).toBe('configuration');
        expect(result.status).toBe(503);
        expect(result.content).toContain('API configuration is incomplete');
    });

    it('classifies quota and rate-limit failures distinctly', () => {
        const result = classifyLlmError({ status: 429, message: 'RESOURCE_EXHAUSTED: quota exceeded' });

        expect(result.code).toBe('rate_limit');
        expect(result.status).toBe(429);
        expect(result.content).toContain('temporarily rate-limited or out of quota');
    });

    it('falls back to the generic message for unknown failures', () => {
        const result = classifyLlmError(new Error('Socket hang up'));

        expect(result.code).toBe('unknown');
        expect(result.status).toBe(500);
        expect(result.content).toBe('I encountered an error while processing your request. Please try again.');
    });
});

/* ------------------------------------------------------------------ */
/*  LLMService key rotation (integration-style via env)               */
/* ------------------------------------------------------------------ */
describe('LLMService multi-key fallback', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.resetModules();
        // Ensure clean state
        delete process.env.API_KEY;
        delete process.env.GEMINI_API_KEY;
        delete process.env.GOOGLE_API_KEY;
    });

    afterEach(() => {
        // Restore all env vars that tests may touch
        process.env.API_KEY = originalEnv.API_KEY;
        process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
        process.env.GOOGLE_API_KEY = originalEnv.GOOGLE_API_KEY;
        process.env.NODE_ENV = originalEnv.NODE_ENV;
        if (originalEnv.NEXT_PHASE !== undefined) {
            process.env.NEXT_PHASE = originalEnv.NEXT_PHASE;
        } else {
            delete process.env.NEXT_PHASE;
        }
    });

    it('resolves multiple keys from a single comma-separated env var', async () => {
        process.env.API_KEY = 'keyA,keyB,keyC';
        const { LLMService } = await import('../src/services/llm');
        const svc = new LLMService();

        const keys = (svc as any).resolveApiKeys();
        expect(keys).toEqual(['keyA', 'keyB', 'keyC']);
    });

    it('merges keys across multiple env vars', async () => {
        process.env.API_KEY = 'primary1,primary2';
        process.env.GEMINI_API_KEY = 'gemini1';
        process.env.GOOGLE_API_KEY = 'google1';

        const { LLMService } = await import('../src/services/llm');
        const svc = new LLMService();

        const keys = (svc as any).resolveApiKeys();
        expect(keys).toEqual(['primary1', 'primary2', 'gemini1', 'google1']);
    });

    it('supports more than three comma-separated keys for higher concurrency', async () => {
        process.env.API_KEY = 'key1,key2,key3,key4,key5,key6';
        const { LLMService } = await import('../src/services/llm');
        const svc = new LLMService();

        const keys = (svc as any).resolveApiKeys();
        expect(keys).toEqual(['key1', 'key2', 'key3', 'key4', 'key5', 'key6']);
    });

    it('getClient returns null in dev mode with no keys', async () => {
        process.env.NODE_ENV = 'development';
        const { LLMService } = await import('../src/services/llm');
        const svc = new LLMService();

        const client = (svc as any).getClient();
        expect(client).toBeNull();
    });

    it('getClient throws in production with no keys', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.NEXT_PHASE;
        const { LLMService } = await import('../src/services/llm');
        const svc = new LLMService();

        expect(() => (svc as any).getClient()).toThrow('At least one Gemini API key must be set');
    });
});
