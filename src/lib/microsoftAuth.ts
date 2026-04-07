import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const MICROSOFT_STATE_COOKIE = 'mastiff_ms_auth_state';
const MICROSOFT_STATE_MAX_AGE = 60 * 10;
const MICROSOFT_DEFAULT_SCOPES = ['openid', 'profile', 'email', 'User.Read'];

export interface MicrosoftProfile {
    sub: string;
    email: string;
    name: string;
    givenName?: string;
    familyName?: string;
    preferredUsername?: string;
}

function getBaseUrl(origin?: string) {
    return process.env.APP_URL || origin || 'http://localhost:3000';
}

function requireEnv(name: 'MICROSOFT_ENTRA_CLIENT_ID' | 'MICROSOFT_ENTRA_CLIENT_SECRET' | 'MICROSOFT_ENTRA_TENANT_ID') {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}

function buildStateCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax' as const,
        path: '/',
        maxAge: MICROSOFT_STATE_MAX_AGE,
    };
}

export function isMicrosoftAuthEnabled() {
    return Boolean(
        process.env.MICROSOFT_ENTRA_CLIENT_ID &&
        process.env.MICROSOFT_ENTRA_CLIENT_SECRET &&
        process.env.MICROSOFT_ENTRA_TENANT_ID
    );
}

export function createMicrosoftAuthState() {
    return crypto.randomBytes(24).toString('hex');
}

export function getMicrosoftRedirectUri(origin?: string) {
    return `${getBaseUrl(origin)}/api/auth/microsoft/callback`;
}

export function buildMicrosoftAuthorizationUrl(state: string, origin?: string) {
    const tenantId = requireEnv('MICROSOFT_ENTRA_TENANT_ID');
    const clientId = requireEnv('MICROSOFT_ENTRA_CLIENT_ID');

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: getMicrosoftRedirectUri(origin),
        response_mode: 'query',
        scope: MICROSOFT_DEFAULT_SCOPES.join(' '),
        state,
        prompt: 'select_account',
    });

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftCodeForProfile(code: string, origin?: string): Promise<MicrosoftProfile> {
    const tenantId = requireEnv('MICROSOFT_ENTRA_TENANT_ID');
    const clientId = requireEnv('MICROSOFT_ENTRA_CLIENT_ID');
    const clientSecret = requireEnv('MICROSOFT_ENTRA_CLIENT_SECRET');

    const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: getMicrosoftRedirectUri(origin),
                scope: MICROSOFT_DEFAULT_SCOPES.join(' '),
            }).toString(),
        }
    );

    if (!tokenResponse.ok) {
        throw new Error(`Microsoft token exchange failed with status ${tokenResponse.status}`);
    }

    const tokenPayload = await tokenResponse.json();
    if (!tokenPayload?.access_token) {
        throw new Error('Microsoft token response did not include an access token');
    }

    const profileResponse = await fetch('https://graph.microsoft.com/oidc/userinfo', {
        headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
        },
    });

    if (!profileResponse.ok) {
        throw new Error(`Microsoft profile request failed with status ${profileResponse.status}`);
    }

    const rawProfile = await profileResponse.json();
    return normalizeMicrosoftProfile(rawProfile);
}

export function normalizeMicrosoftProfile(rawProfile: Record<string, any>): MicrosoftProfile {
    const email = String(
        rawProfile.email || rawProfile.preferred_username || rawProfile.upn || ''
    ).trim().toLowerCase();

    if (!email) {
        throw new Error('Microsoft profile did not include an email address');
    }

    const name = String(
        rawProfile.name ||
        [rawProfile.given_name, rawProfile.family_name].filter(Boolean).join(' ') ||
        email.split('@')[0]
    ).trim();

    return {
        sub: String(rawProfile.sub || rawProfile.oid || email),
        email,
        name,
        givenName: rawProfile.given_name ? String(rawProfile.given_name) : undefined,
        familyName: rawProfile.family_name ? String(rawProfile.family_name) : undefined,
        preferredUsername: rawProfile.preferred_username ? String(rawProfile.preferred_username) : undefined,
    };
}

export function setMicrosoftStateCookie(response: NextResponse, state: string) {
    response.cookies.set(MICROSOFT_STATE_COOKIE, state, buildStateCookieOptions());
}

export function clearMicrosoftStateCookie(response: NextResponse) {
    response.cookies.delete(MICROSOFT_STATE_COOKIE);
}

export function readMicrosoftState(request: NextRequest) {
    return request.cookies.get(MICROSOFT_STATE_COOKIE)?.value || null;
}
