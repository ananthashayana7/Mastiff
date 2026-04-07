import { afterEach, describe, expect, it } from 'vitest';
import {
  buildMicrosoftAuthorizationUrl,
  isMicrosoftAuthEnabled,
  normalizeMicrosoftProfile,
} from '../src/lib/microsoftAuth';

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

describe('Microsoft auth helpers', () => {
  it('reports configuration readiness only when all required env vars are present', () => {
    delete process.env.MICROSOFT_ENTRA_CLIENT_ID;
    delete process.env.MICROSOFT_ENTRA_CLIENT_SECRET;
    delete process.env.MICROSOFT_ENTRA_TENANT_ID;

    expect(isMicrosoftAuthEnabled()).toBe(false);

    process.env.MICROSOFT_ENTRA_CLIENT_ID = 'client-id';
    process.env.MICROSOFT_ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.MICROSOFT_ENTRA_TENANT_ID = 'tenant-id';

    expect(isMicrosoftAuthEnabled()).toBe(true);
  });

  it('builds a Microsoft authorization URL with the expected redirect target', () => {
    process.env.MICROSOFT_ENTRA_CLIENT_ID = 'client-id';
    process.env.MICROSOFT_ENTRA_CLIENT_SECRET = 'client-secret';
    process.env.MICROSOFT_ENTRA_TENANT_ID = 'tenant-id';
    process.env.APP_URL = 'https://mastiff.example.com';

    const url = new URL(buildMicrosoftAuthorizationUrl('state-123'));

    expect(url.origin).toBe('https://login.microsoftonline.com');
    expect(url.pathname).toBe('/tenant-id/oauth2/v2.0/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://mastiff.example.com/api/auth/microsoft/callback');
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('scope')).toContain('User.Read');
  });

  it('normalizes Microsoft profile payloads into app user fields', () => {
    const profile = normalizeMicrosoftProfile({
      sub: 'abc-123',
      preferred_username: 'User@Example.com',
      given_name: 'Mastiff',
      family_name: 'Admin',
    });

    expect(profile).toEqual({
      sub: 'abc-123',
      email: 'user@example.com',
      name: 'Mastiff Admin',
      givenName: 'Mastiff',
      familyName: 'Admin',
      preferredUsername: 'User@Example.com',
    });
  });
});