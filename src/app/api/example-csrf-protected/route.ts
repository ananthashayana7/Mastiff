/**
 * Example CSRF-Protected API Route
 * 
 * Shows how to use CSRF protection in API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCSRFProtection, validateCSRFRequest } from '@/app/api/csrf-token/route';

/**
 * Example POST endpoint protected with CSRF
 * All POST/PUT/DELETE requests must include valid CSRF token
 */
export async function POST(request: NextRequest) {
    // Validate CSRF token first
    const csrfValidation = await validateCSRFRequest(request);
    if (!csrfValidation.valid) {
        return NextResponse.json(
            { error: csrfValidation.error || 'Invalid CSRF token' },
            { status: 403 }
        );
    }

    // Process the request
    try {
        const body = await request.json();
        
        // Your API logic here
        return NextResponse.json({
            success: true,
            message: 'Request processed successfully',
            data: body,
        });
    } catch (err) {
        return NextResponse.json(
            { error: 'Failed to process request' },
            { status: 500 }
        );
    }
}

/**
 * GET is allowed without CSRF (as it doesn't change state)
 */
export async function GET(request: NextRequest) {
    return NextResponse.json({
        message: 'GET request - no CSRF protection needed',
    });
}

/**
 * Alternative: Use the middleware wrapper
 */
export const POST_WITH_WRAPPER = withCSRFProtection(async (request: NextRequest) => {
    const body = await request.json();
    
    return NextResponse.json({
        success: true,
        message: 'Request processed with CSRF wrapper',
        data: body,
    });
});
