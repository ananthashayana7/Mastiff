import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { authenticateRequest } from '../src/lib/auth';

const DEFAULT_SECRET = 'mastiff-ai-secret-key-change-in-production';
const originalJwtSecret = process.env.JWT_SECRET;

function buildRequestWithCookie(cookieValue: string): NextRequest {
  return new NextRequest('http://localhost/api/test', {
    headers: {
      cookie: cookieValue,
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('cookie-backed auth resolution', () => {
  it('authenticates requests from the signed auth cookie', async () => {
    process.env.JWT_SECRET = DEFAULT_SECRET;
    const token = jwt.sign(
      { userId: 'cookie-user', email: 'cookie@example.com', name: 'Cookie User' },
      process.env.JWT_SECRET
    );

    const user = await authenticateRequest(
      buildRequestWithCookie(`mastiff_auth_token=${token}; userId=cookie-user`)
    );

    expect(user).toEqual({
      id: 'cookie-user',
      email: 'cookie@example.com',
      name: 'Cookie User',
      isAdmin: false,
    });
  });

  it('falls back to header identity when cookie auth is unavailable in development', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'development';

    const user = await authenticateRequest(
      new NextRequest('http://localhost/api/test', {
        headers: {
          'x-user-id': 'header-user',
        },
      })
    );

    expect(user).toEqual({ id: 'header-user' });
    (process.env as any).NODE_ENV = originalNodeEnv;
  });
});