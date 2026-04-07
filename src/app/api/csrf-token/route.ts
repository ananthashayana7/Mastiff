/**
 * CSRF Token Middleware
 * 
 * Ensures CSRF tokens are generated on initial page load
 * and validated on all state-changing requests
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    csrfProtection,
    CSRF_COOKIE_NAME,
    getCSRFCookieOptions,
} from '../../../services/csrfProtection';

/**
 * GET /api/csrf-token
 * Generates and returns a new CSRF token
 * Called on initial page load
 */
export async function GET(request: NextRequest) {
    const tokenPair = csrfProtection.generateToken();

    const response = NextResponse.json({ token: tokenPair.token });
    response.cookies.set(CSRF_COOKIE_NAME, tokenPair.cookie, getCSRFCookieOptions());

    return response;
}
