import { NextResponse } from 'next/server';

const AUTH_TOKEN_COOKIE = 'mastiff_auth_token';
const USER_ID_COOKIE = 'userId';
const USER_EMAIL_COOKIE = 'userEmail';
const USER_NAME_COOKIE = 'userName';
const ORGANIZATION_ID_COOKIE = 'organizationId';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function buildCookieOptions(httpOnly = true) {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        httpOnly,
        secure: isProduction,
        sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
        path: '/',
        maxAge: AUTH_COOKIE_MAX_AGE,
    };
}

export function setAuthCookies(
    response: NextResponse,
    payload: { token: string; userId: string; email?: string | null; name?: string | null; organizationId?: string | null }
) {
    response.cookies.set(AUTH_TOKEN_COOKIE, payload.token, buildCookieOptions(true));
    response.cookies.set(USER_ID_COOKIE, payload.userId, buildCookieOptions(true));

    if (payload.email) {
        response.cookies.set(USER_EMAIL_COOKIE, payload.email, buildCookieOptions(true));
    } else {
        response.cookies.delete(USER_EMAIL_COOKIE);
    }

    if (payload.name) {
        response.cookies.set(USER_NAME_COOKIE, payload.name, buildCookieOptions(true));
    } else {
        response.cookies.delete(USER_NAME_COOKIE);
    }

    if (payload.organizationId) {
        response.cookies.set(ORGANIZATION_ID_COOKIE, payload.organizationId, buildCookieOptions(true));
    }
}

export function clearAuthCookies(response: NextResponse) {
    response.cookies.delete(AUTH_TOKEN_COOKIE);
    response.cookies.delete(USER_ID_COOKIE);
    response.cookies.delete(USER_EMAIL_COOKIE);
    response.cookies.delete(USER_NAME_COOKIE);
    response.cookies.delete(ORGANIZATION_ID_COOKIE);
}

export const authCookieNames = {
    authToken: AUTH_TOKEN_COOKIE,
    userId: USER_ID_COOKIE,
    userEmail: USER_EMAIL_COOKIE,
    userName: USER_NAME_COOKIE,
    organizationId: ORGANIZATION_ID_COOKIE,
};