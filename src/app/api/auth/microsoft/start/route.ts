import { NextRequest, NextResponse } from 'next/server';
import {
    buildMicrosoftAuthorizationUrl,
    createMicrosoftAuthState,
    isMicrosoftAuthEnabled,
    setMicrosoftStateCookie,
} from '../../../../../lib/microsoftAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    if (!isMicrosoftAuthEnabled()) {
        return NextResponse.json({ error: 'Microsoft sign-in is not configured' }, { status: 503 });
    }

    const state = createMicrosoftAuthState();
    const redirectUrl = buildMicrosoftAuthorizationUrl(state, request.nextUrl.origin);
    const response = NextResponse.redirect(redirectUrl);
    setMicrosoftStateCookie(response, state);
    return response;
}