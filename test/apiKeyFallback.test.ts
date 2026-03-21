import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseApiKeys, isKeyExhaustedError } from '../src/services/llm';

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

        expect(() => (svc as any).getClient()).toThrow('API_KEY must be set');
    });
});
