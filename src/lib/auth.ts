import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { getUserIdFromRequest, shouldAllowHeaderIdentityFallback } from './requestAuth';

const JWT_SECRET = process.env.JWT_SECRET || 'mastiff-ai-secret-key-change-in-production';

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
        const payload = jwt.verify(token, JWT_SECRET) as {
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
    const headerUserId = shouldAllowHeaderIdentityFallback() ? headerStore.get('x-user-id') : null;
    const userId = headerUserId || cookieStore.get('userId')?.value || null;
    const email = cookieStore.get('userEmail')?.value;
    const name = cookieStore.get('userName')?.value;

    return userId ? { id: userId, email: email || undefined, name: name || undefined } : null;
}

export async function getSession(): Promise<SessionInfo | null> {
    const user = await getSessionUser();
    if (!user) return null;

    const cookieStore = await cookies();
    const organizationId = cookieStore.get('organizationId')?.value || null;

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
        userId: headerUserId || cookieStore.get('userId')?.value || null,
        organizationId: headerStore.get('x-organization-id') || cookieStore.get('organizationId')?.value || null,
    };
}
