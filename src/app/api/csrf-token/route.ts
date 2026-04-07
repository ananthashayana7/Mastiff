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
    validateCSRFToken,
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

/**
 * Middleware function for use in API routes
 * Usage: at the start of your POST/PUT/DELETE handler
 * 
 * const validation = await validateCSRFRequest(request);
 * if (!validation.valid) {
 *   return NextResponse.json({ error: validation.error }, { status: 403 });
 * }
 */
export async function validateCSRFRequest(request: NextRequest): Promise<{
    valid: boolean;
    error?: string;
}> {
    return validateCSRFToken(request);
}

/**
 * Middleware to protect specific routes
 * Usage: wrap protected route handlers with this
 */
export function withCSRFProtection(
    handler: (request: NextRequest) => Promise<NextResponse>
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        // Only validate on state-changing methods
        const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
        if (stateChangingMethods.includes(request.method.toUpperCase())) {
            const validation = await validateCSRFToken(request);
            if (!validation.valid) {
                return NextResponse.json(
                    { error: validation.error || 'Invalid CSRF token' },
                    { status: 403 }
                );
            }
        }

        // Call the actual handler
        return handler(request);
    };
}
