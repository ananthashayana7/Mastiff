import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { getUserIdFromRequest, shouldAllowHeaderIdentityFallback } from './requestAuth';
import { getJwtSecret } from './runtimeSecrets';
import { authCookieNames } from './authCookies';

export interface SessionUser {
    id: string;
    email?: string;
    name?: string;
    isAdmin?: boolean;
}

export interface SessionInfo {
    user: SessionUser;
    userId: string;
    organizationId?: string | null;
    isAdmin?: boolean;
}

function parseBearerToken(value: string | null): string | null {
    if (!value) return null;
    const [scheme, token] = value.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
}

function decodeToken(token: string | null): SessionUser | null {
    if (!token) return null;

    try {
        const payload = jwt.verify(token, getJwtSecret()) as {
            userId?: string;
            id?: string;
            email?: string;
            name?: string;
            isAdmin?: boolean;
        };

        const userId = payload.userId || payload.id;
        if (!userId) return null;

        return {
            id: userId,
            email: payload.email,
            name: payload.name,
            isAdmin: Boolean(payload.isAdmin),
        };
    } catch {
        return null;
    }
}

export async function authenticateRequest(request: NextRequest): Promise<SessionUser | null> {
    const authUser = decodeToken(parseBearerToken(request.headers.get('authorization')));
    if (authUser) return authUser;

    const cookieToken = request.cookies.get(authCookieNames.authToken)?.value || null;
    const cookieUser = decodeToken(cookieToken);
    if (cookieUser) return cookieUser;

    const userId = getUserIdFromRequest(request);
    return userId ? { id: userId } : null;
}

export async function getSessionUser(request?: NextRequest): Promise<SessionUser | null> {
    if (request) {
        return authenticateRequest(request);
    }

    const headerStore = await headers();
    const authUser = decodeToken(parseBearerToken(headerStore.get('authorization')));
    if (authUser) return authUser;

    const cookieStore = await cookies();
    const cookieAuthUser = decodeToken(cookieStore.get(authCookieNames.authToken)?.value || null);
    if (cookieAuthUser) return cookieAuthUser;

    const headerUserId = shouldAllowHeaderIdentityFallback() ? headerStore.get('x-user-id') : null;
    const userId = headerUserId || cookieStore.get(authCookieNames.userId)?.value || null;
    const email = cookieStore.get(authCookieNames.userEmail)?.value;
    const name = cookieStore.get(authCookieNames.userName)?.value;

    return userId ? { id: userId, email: email || undefined, name: name || undefined } : null;
}

export async function getSession(): Promise<SessionInfo | null> {
    const user = await getSessionUser();
    if (!user) return null;

    const cookieStore = await cookies();
    const organizationId = cookieStore.get(authCookieNames.organizationId)?.value || null;

    return {
        user,
        userId: user.id,
        organizationId,
        isAdmin: Boolean(user.isAdmin),
    };
}

export async function getCookies(): Promise<{ userId: string | null; organizationId: string | null }> {
    const headerStore = await headers();
    const cookieStore = await cookies();
    const headerUserId = shouldAllowHeaderIdentityFallback() ? headerStore.get('x-user-id') : null;

    return {
        userId: headerUserId || cookieStore.get(authCookieNames.userId)?.value || null,
        organizationId: headerStore.get('x-organization-id') || cookieStore.get(authCookieNames.organizationId)?.value || null,
    };
}
