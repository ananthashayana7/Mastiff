import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../../../db';
import { users } from '../../../../../db/schema';
import { setAuthCookies } from '../../../../../lib/authCookies';
import { getJwtSecret } from '../../../../../lib/runtimeSecrets';
import {
    clearMicrosoftStateCookie,
    exchangeMicrosoftCodeForProfile,
    isMicrosoftAuthEnabled,
    readMicrosoftState,
} from '../../../../../lib/microsoftAuth';

export const dynamic = 'force-dynamic';

function buildErrorRedirect(request: NextRequest, reason: string) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', reason);
    return url;
}

export async function GET(request: NextRequest) {
    if (!isMicrosoftAuthEnabled()) {
        return NextResponse.redirect(buildErrorRedirect(request, 'microsoft_not_configured'));
    }

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');
    const storedState = readMicrosoftState(request);

    if (!code || !state || !storedState || state !== storedState) {
        const response = NextResponse.redirect(buildErrorRedirect(request, 'invalid_microsoft_state'));
        clearMicrosoftStateCookie(response);
        return response;
    }

    try {
        const profile = await exchangeMicrosoftCodeForProfile(code, request.nextUrl.origin);
        const email = profile.email.toLowerCase().trim();

        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        let user = existingUser;
        if (!user) {
            const [createdUser] = await db.insert(users).values({
                email,
                name: profile.name,
            }).returning();
            user = createdUser;
        } else if (!user.name && profile.name) {
            const [updatedUser] = await db.update(users)
                .set({ name: profile.name })
                .where(and(eq(users.id, user.id), eq(users.email, email)))
                .returning();
            user = updatedUser || user;
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, name: user.name },
            getJwtSecret(),
            { expiresIn: '7d' }
        );

        const response = NextResponse.redirect(new URL('/', request.url));
        setAuthCookies(response, {
            token,
            userId: user.id,
            email: user.email,
            name: user.name,
        });
        clearMicrosoftStateCookie(response);
        return response;
    } catch (error) {
        console.error('Microsoft auth callback failed:', error);
        const response = NextResponse.redirect(buildErrorRedirect(request, 'microsoft_auth_failed'));
        clearMicrosoftStateCookie(response);
        return response;
    }
}