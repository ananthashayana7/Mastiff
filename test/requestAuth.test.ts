import { describe, expect, it, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { getUserIdFromRequest } from '../src/lib/requestAuth';

const DEFAULT_SECRET = 'mastiff-ai-secret-key-change-in-production';
const originalNodeEnv = process.env.NODE_ENV;
const originalAllowHeaderAuth = process.env.ALLOW_HEADER_AUTH;
const originalJwtSecret = process.env.JWT_SECRET;

function buildRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/test', { headers });
}

afterEach(() => {
  (process.env as any).NODE_ENV = originalNodeEnv;
  if (originalAllowHeaderAuth === undefined) {
    delete process.env.ALLOW_HEADER_AUTH;
  } else {
    process.env.ALLOW_HEADER_AUTH = originalAllowHeaderAuth;
  }
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('request auth identity resolution', () => {
  it('prefers bearer token identity over header fallback', () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.ALLOW_HEADER_AUTH = 'true';
    process.env.JWT_SECRET = DEFAULT_SECRET;

    const token = jwt.sign({ userId: 'token-user' }, process.env.JWT_SECRET || DEFAULT_SECRET);
    const req = buildRequest({
      authorization: `Bearer ${token}`,
      'x-user-id': 'header-user',
    });

    expect(getUserIdFromRequest(req)).toBe('token-user');
  });

  it('disables header-only identity in production by default', () => {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.ALLOW_HEADER_AUTH;

    const req = buildRequest({ 'x-user-id': 'header-user' });
    expect(getUserIdFromRequest(req)).toBeNull();
  });

  it('allows header-only identity in production when explicitly enabled', () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.ALLOW_HEADER_AUTH = 'true';

    const req = buildRequest({ 'x-user-id': 'header-user' });
    expect(getUserIdFromRequest(req)).toBe('header-user');
  });

  it('allows header fallback outside production', () => {
    (process.env as any).NODE_ENV = 'development';
    delete process.env.ALLOW_HEADER_AUTH;

    const req = buildRequest({ 'x-user-id': 'header-user' });
    expect(getUserIdFromRequest(req)).toBe('header-user');
  });
});
