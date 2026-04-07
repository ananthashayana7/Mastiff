import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/auth/microsoft/start/route';

const originalClientId = process.env.MICROSOFT_ENTRA_CLIENT_ID;
const originalClientSecret = process.env.MICROSOFT_ENTRA_CLIENT_SECRET;
const originalTenantId = process.env.MICROSOFT_ENTRA_TENANT_ID;
const originalAppUrl = process.env.APP_URL;

afterEach(() => {
  if (originalClientId === undefined) {
    delete process.env.MICROSOFT_ENTRA_CLIENT_ID;
  } else {
    process.env.MICROSOFT_ENTRA_CLIENT_ID = originalClientId;
  }

  if (originalClientSecret === undefined) {
    delete process.env.MICROSOFT_ENTRA_CLIENT_SECRET;
  } else {
    process.env.MICROSOFT_ENTRA_CLIENT_SECRET = originalClientSecret;
  }

  if (originalTenantId === undefined) {
    delete process.env.MICROSOFT_ENTRA_TENANT_ID;
  } else {
    process.env.MICROSOFT_ENTRA_TENANT_ID = originalTenantId;
  }

  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }
});

describe('Microsoft auth start route', () => {
  it('redirects to Microsoft and sets the transient state cookie when configured', async () => {
    process.env.MICROSOFT_ENTRA_CLIENT_ID = 'client-id';
    process.env.MICROSOFT_ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.MICROSOFT_ENTRA_TENANT_ID = 'tenant-id';
    process.env.APP_URL = 'https://mastiff.example.com';

    const request = new NextRequest('https://mastiff.example.com/api/auth/microsoft/start');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize');
    expect(response.headers.get('set-cookie')).toContain('mastiff_ms_auth_state=');
  });
});