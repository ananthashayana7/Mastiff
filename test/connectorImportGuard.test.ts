import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regression tests for src/app/api/connectors/[id]/import/route.ts
 *
 * Validates auth/session-ownership guards without real DB or network.
 */

// Stub rateLimiter
vi.mock('@/lib/rateLimiting', () => ({
  rateLimiter: { checkLimit: vi.fn().mockResolvedValue(undefined) },
}));

// Stub getUserIdFromRequest
const mockGetUserId = vi.fn<[], string | null>();
vi.mock('@/lib/requestAuth', () => ({
  getUserIdFromRequest: (...args: unknown[]) => mockGetUserId(),
}));

// vi.mock factories are hoisted, so we cannot reference top-level variables.
// Instead, use vi.hoisted to create the mock before hoisting.
const { mockLimit } = vi.hoisted(() => {
  const mockLimit = vi.fn().mockResolvedValue([]);
  return { mockLimit };
});

vi.mock('@/db', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: mockLimit,
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  return { db: chain };
});

// Stub schema exports
vi.mock('@/db/schema', () => ({
  files: {},
  sessions: { id: 'id', userId: 'userId' },
}));
vi.mock('@/db/connectorSchema', () => ({
  connectors: { id: 'id', userId: 'userId' },
}));
vi.mock('@/services/encryptionService', () => ({
  encryptionService: { decryptFromString: vi.fn().mockReturnValue('{}') },
}));
vi.mock('@/lib/fileIngestion', () => ({
  buildTabularMetadataFallback: vi.fn().mockResolvedValue({}),
}));

// Stub drizzle-orm operators
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
}));

import { POST } from '../src/app/api/connectors/[id]/import/route';

function buildNextRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/connectors/conn-1/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

describe('Connector import route guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the chain so limit resolves to empty (session not found)
    mockLimit.mockResolvedValue([]);
  });

  it('POST returns 401 when unauthenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    const res = await POST(
      buildNextRequest({
        sessionId: 'a0000000-0000-4000-8000-000000000001',
        sources: [{ id: 'src1' }],
      }),
      { params: { id: 'conn-1' } },
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('POST with non-owned session returns 404', async () => {
    mockGetUserId.mockReturnValue('user-1');
    // mockLimit returns [] => session not found => 404
    const res = await POST(
      buildNextRequest({
        sessionId: 'a0000000-0000-4000-8000-000000000001',
        sources: [{ id: 'src1' }],
      }),
      { params: { id: 'conn-1' } },
    );
    const json = await res.json();
    expect(res.status).toBe(404);
    expect(json.error).toContain('not found');
  });
});
