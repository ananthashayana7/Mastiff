import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression tests for src/app/api/connectors/sharepoint/oauth/route.ts
 *
 * Validates auth guards and basic response shapes without real
 * Upstash/DB/network dependencies.
 */

// Stub rateLimiter before the route module loads
vi.mock('@/lib/rateLimiting', () => ({
  rateLimiter: { checkLimit: vi.fn().mockResolvedValue(undefined) },
}));

// Stub getUserIdFromRequest so we can toggle auth per-test
const mockGetUserId = vi.fn<[], string | null>();
vi.mock('@/lib/requestAuth', () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockGetUserId(),
}));

// Stub axios to avoid real HTTP
vi.mock('axios', () => ({
  default: { post: vi.fn().mockRejectedValue(new Error('no real network')) },
  post: vi.fn().mockRejectedValue(new Error('no real network')),
}));

import { GET, POST } from '../src/app/api/connectors/sharepoint/oauth/route';
import { NextRequest } from 'next/server';

function buildNextRequest(method: string, params: Record<string, string> = {}, body?: unknown): NextRequest {
  const url = new URL('http://localhost:3000/api/connectors/sharepoint/oauth');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const headers = new Headers({ 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' });
  if (body !== undefined) {
    return new NextRequest(url.toString(), { method, headers, body: JSON.stringify(body) });
  }
  return new NextRequest(url.toString(), { method, headers });
}

describe('SharePoint OAuth route guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Unauthenticated ---

  it('GET returns 401 when unauthenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    const res = await GET(buildNextRequest('GET'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('POST returns 401 when unauthenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    const res = await POST(
      buildNextRequest('POST', {}, { mode: 'exchange', code: 'abc' }),
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  // --- Authenticated GET ---

  it('GET with required params returns success payload with authUrl and state', async () => {
    mockGetUserId.mockReturnValue('user-1');
    const res = await GET(
      buildNextRequest('GET', {
        tenantId: 'tid',
        clientId: 'cid',
        redirectUri: 'http://localhost:3000/callback',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json).toHaveProperty('authUrl');
    expect(json).toHaveProperty('state');
    expect(json.authUrl).toContain('login.microsoftonline.com');
  });

  // --- Authenticated POST with bad payload ---

  it('POST with bad token payload returns error status', async () => {
    mockGetUserId.mockReturnValue('user-1');
    // Missing required fields for exchange mode => should fail at validation or downstream
    const res = await POST(
      buildNextRequest('POST', {}, { mode: 'exchange' }),
    );
    // Expect 400 (missing code/redirectUri) or 500 (zod parse error)
    expect(res.status).toBeGreaterThanOrEqual(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });
});
