import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression tests for src/lib/rateLimiting.ts
 *
 * Validates that the module loads and works when Upstash
 * modules/config are missing (memory fallback path).
 */

describe('rateLimiting resilience (no Upstash)', () => {
  let mod: typeof import('../src/lib/rateLimiting');

  beforeEach(async () => {
    // Ensure no Upstash env vars
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    // Re-import to get a fresh module
    vi.resetModules();
    mod = await import('../src/lib/rateLimiting');
  });

  it('module loads without crashing when Upstash config is absent', () => {
    expect(mod).toBeDefined();
    expect(mod.checkRateLimit).toBeTypeOf('function');
    expect(mod.rateLimiter).toBeDefined();
    expect(mod.rateLimiter.checkLimit).toBeTypeOf('function');
  });

  it('checkRateLimit with null limiter falls back to memory and allows requests', async () => {
    const result = await mod.checkRateLimit(null, 'test-key', 5, 60000);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.resetTime).toBeInstanceOf(Date);
  });

  it('memory fallback enforces limits after max requests', async () => {
    const maxRequests = 3;
    const windowMs = 60000;

    for (let i = 0; i < maxRequests; i++) {
      const result = await mod.checkRateLimit(null, 'enforce-test', maxRequests, windowMs);
      expect(result.success).toBe(true);
    }

    // Next request should be denied
    const denied = await mod.checkRateLimit(null, 'enforce-test', maxRequests, windowMs);
    expect(denied.success).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('rateLimiter.checkLimit throws on limit exceeded', async () => {
    // Use a very tight limit
    const namespace = 'rl-test';
    const clientId = 'client-x';
    const maxReq = 2;
    const windowSec = 60;

    await mod.rateLimiter.checkLimit(namespace, clientId, maxReq, windowSec);
    await mod.rateLimiter.checkLimit(namespace, clientId, maxReq, windowSec);

    // Third call should throw
    await expect(
      mod.rateLimiter.checkLimit(namespace, clientId, maxReq, windowSec),
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('checkLoginRateLimit returns allowed=true within limit', async () => {
    const result = await mod.checkLoginRateLimit('test@example.com');
    expect(result.allowed).toBe(true);
  });
});
