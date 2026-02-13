/**
 * Edge Middleware for CSRF Token Injection
 * 
 * This middleware runs on every request at the edge
 * Ensures CSRF tokens are available globally
 */

import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const response = NextResponse.next();

    // Skip middleware for static assets and API endpoints that generate tokens
    const pathname = request.nextUrl.pathname;
    if (
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/static/') ||
        pathname === '/api/csrf-token' ||
        pathname.endsWith('.js') ||
        pathname.endsWith('.css')
    ) {
        return response;
    }

    // For HTML page requests, ensure they can fetch CSRF token
    // The actual token generation happens client-side via GET /api/csrf-token
    if (
        request.headers.get('accept')?.includes('text/html') &&
        !pathname.startsWith('/api/')
    ) {
        const requestHeaders = new Headers(request.headers);
        // Allow subsequent CSRF token requests
        requestHeaders.set('x-middleware-request-csrf', 'true');
        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    return response;
}

export const config = {
    matcher: [
        // Match all routes except static assets
        {
            source: '/((?!_next/static|_next/image|favicon.ico).*)',
            missing: [
                {
                    type: 'header',
                    key: 'next-router-prefetch',
                },
            ],
        },
    ],
};
