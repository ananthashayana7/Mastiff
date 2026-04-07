import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../src/app/api/csrf-token/route', () => ({
  validateCSRFRequest: vi.fn(async () => ({ valid: true })),
}));

import { POST } from '../src/app/api/auth/logout/route';

describe('auth logout route', () => {
  it('clears auth cookies on logout', async () => {
    const request = new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: 'mastiff_auth_token=abc; userId=user-1; userEmail=test@example.com; userName=Test User',
      },
    });

    const response = await POST(request);
    const setCookieHeader = response.headers.get('set-cookie') || '';
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true });
    expect(setCookieHeader).toContain('mastiff_auth_token=');
    expect(setCookieHeader).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(setCookieHeader).toContain('userId=');
  });
});