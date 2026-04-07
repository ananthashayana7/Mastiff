import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies } from '../../../../lib/authCookies';
import { validateCSRFRequest } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const csrfValidation = await validateCSRFRequest(request);
    if (!csrfValidation.valid) {
        return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
    }

    const response = NextResponse.json({ success: true });
    clearAuthCookies(response);
    return response;
}
