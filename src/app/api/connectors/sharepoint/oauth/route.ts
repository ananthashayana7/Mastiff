import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { z } from 'zod';
import { rateLimiter } from '@/lib/rateLimiting';
import { authenticateRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_SCOPE = [
    'openid',
    'profile',
    'offline_access',
    'https://graph.microsoft.com/Files.Read',
    'https://graph.microsoft.com/Sites.Read.All',
].join(' ');

function buildAuthUrl(tenantId: string, clientId: string, redirectUri: string, state: string, scope: string) {
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope,
        state,
    });

    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

const tokenExchangeSchema = z.object({
    mode: z.enum(['exchange', 'refresh']).default('exchange'),
    tenantId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    redirectUri: z.string().url().optional(),
    code: z.string().min(1).optional(),
    refreshToken: z.string().min(1).optional(),
    scope: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
    try {
        const user = await authenticateRequest(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const clientIdForLimit = request.headers.get('x-forwarded-for') || 'unknown';
        await rateLimiter.checkLimit('connector:sharepoint:oauth:url', clientIdForLimit, 100, 3600);

        const tenantId = request.nextUrl.searchParams.get('tenantId') || process.env.SHAREPOINT_TENANT_ID;
        const clientId = request.nextUrl.searchParams.get('clientId') || process.env.SHAREPOINT_CLIENT_ID;
        const redirectUri = request.nextUrl.searchParams.get('redirectUri') || process.env.SHAREPOINT_REDIRECT_URI;
        const state = request.nextUrl.searchParams.get('state') || crypto.randomUUID();
        const scope = request.nextUrl.searchParams.get('scope') || DEFAULT_SCOPE;

        if (!tenantId || !clientId || !redirectUri) {
            return NextResponse.json(
                { error: 'Missing tenantId, clientId, or redirectUri (query or env vars)' },
                { status: 400 }
            );
        }

        const authUrl = buildAuthUrl(tenantId, clientId, redirectUri, state, scope);

        return NextResponse.json({
            success: true,
            authUrl,
            state,
            scope,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Failed to build SharePoint OAuth URL' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await authenticateRequest(request);
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const clientIdForLimit = request.headers.get('x-forwarded-for') || 'unknown';
        await rateLimiter.checkLimit('connector:sharepoint:oauth:token', clientIdForLimit, 100, 3600);

        const payload = tokenExchangeSchema.parse(await request.json());

        const tenantId = payload.tenantId || process.env.SHAREPOINT_TENANT_ID;
        const clientId = payload.clientId || process.env.SHAREPOINT_CLIENT_ID;
        const clientSecret = payload.clientSecret || process.env.SHAREPOINT_CLIENT_SECRET;
        const redirectUri = payload.redirectUri || process.env.SHAREPOINT_REDIRECT_URI;
        const scope = payload.scope || DEFAULT_SCOPE;

        if (!tenantId || !clientId || !clientSecret) {
            return NextResponse.json(
                { error: 'Missing tenantId, clientId, or clientSecret (body or env vars)' },
                { status: 400 }
            );
        }

        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const form = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            scope,
        });

        if (payload.mode === 'refresh') {
            if (!payload.refreshToken) {
                return NextResponse.json({ error: 'Missing refreshToken for refresh mode' }, { status: 400 });
            }
            form.set('grant_type', 'refresh_token');
            form.set('refresh_token', payload.refreshToken);
        } else {
            if (!payload.code || !redirectUri) {
                return NextResponse.json({ error: 'Missing code or redirectUri for exchange mode' }, { status: 400 });
            }
            form.set('grant_type', 'authorization_code');
            form.set('code', payload.code);
            form.set('redirect_uri', redirectUri);
        }

        const response = await axios.post(tokenUrl, form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000,
        });

        return NextResponse.json({
            success: true,
            tokenType: response.data?.token_type,
            accessToken: response.data?.access_token,
            refreshToken: response.data?.refresh_token,
            expiresIn: response.data?.expires_in,
            scope: response.data?.scope,
        });
    } catch (error: any) {
        const providerMessage = error?.response?.data?.error_description
            || error?.response?.data?.error;
        return NextResponse.json(
            {
                error: providerMessage || 'Failed to exchange SharePoint token',
            },
            { status: 500 }
        );
    }
}
