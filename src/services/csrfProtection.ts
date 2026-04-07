/**
 * CSRF Protection Service
 * 
 * Implements Double Submit Cookie pattern with token validation
 * for protecting against Cross-Site Request Forgery attacks
 */

import crypto from 'crypto';
import { cookies } from 'next/headers';

export const CSRF_COOKIE_NAME = process.env.NODE_ENV === 'production'
    ? '__Host-csrf_token'
    : 'csrf_token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_TOKEN_LENGTH = 32; // 256 bits
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24; // 24 hours

export function getCSRFCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        maxAge: TOKEN_EXPIRY_SECONDS,
        path: '/',
    };
}

export interface CSRFTokenPair {
    token: string; // Token to send in header/form
    cookie: string; // Token for cookie (same value)
}

/**
 * CSRF Protection Service
 */
export class CSRFProtectionService {
    /**
     * Generate a new CSRF token pair
     * @returns Object with token and cookie values (usually same)
     */
    generateToken(): CSRFTokenPair {
        const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
        return {
            token,
            cookie: token,
        };
    }

    /**
     * Set CSRF token in response cookie
     * @param token - The token to set
     * @param response - Response to set cookie on
     */
    async setCSRFCookie(token: string): Promise<void> {
        const cookieStore = await cookies();
        cookieStore.set(CSRF_COOKIE_NAME, token, getCSRFCookieOptions());
    }

    /**
     * Get CSRF token from cookies
     * @returns Token value or null if not found
     */
    async getCSRFCookieToken(): Promise<string | null> {
        const cookieStore = await cookies();
        const token = cookieStore.get(CSRF_COOKIE_NAME)?.value;
        return token || null;
    }

    /**
     * Validate CSRF token from request
     * Double-submit cookie pattern: verify request token matches cookie token
     * 
     * @param requestToken - Token from request header or form
     * @param cookieToken - Token from cookie (should be retrieved separately)
     * @returns true if valid, false otherwise
     */
    validateToken(requestToken: string | null, cookieToken: string | null): boolean {
        if (!requestToken || !cookieToken) {
            return false;
        }

        // Use timing-safe comparison to prevent timing attacks
        try {
            return (
                crypto.timingSafeEqual(
                    Buffer.from(requestToken),
                    Buffer.from(cookieToken)
                ) &&
                this.isValidTokenFormat(requestToken)
            );
        } catch {
            return false;
        }
    }

    /**
     * Validate token format (must be 64 hex characters)
     */
    private isValidTokenFormat(token: string): boolean {
        return /^[a-f0-9]{64}$/.test(token);
    }

    /**
     * Clear CSRF cookie
     */
    async clearCSRFCookie(): Promise<void> {
        const cookieStore = await cookies();
        cookieStore.delete(CSRF_COOKIE_NAME);
    }
}

export const csrfProtection = new CSRFProtectionService();

function readCookieFromRequest(request: Request, cookieName: string): string | null {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
        return null;
    }

    const cookiesMap = cookieHeader.split(';').map((entry) => entry.trim());
    for (const entry of cookiesMap) {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = entry.slice(0, separatorIndex).trim();
        if (key !== cookieName) continue;

        return decodeURIComponent(entry.slice(separatorIndex + 1).trim());
    }

    return null;
}

/**
 * Middleware for CSRF validation
 * Apply to state-changing requests (POST, PUT, DELETE, PATCH)
 */
export async function validateCSRFToken(request: Request): Promise<{
    valid: boolean;
    error?: string;
}> {
    if (process.env.NODE_ENV === 'test') {
        return { valid: true };
    }

    const method = request.method.toUpperCase();

    // Only validate on state-changing methods
    const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (!stateChangingMethods.includes(method)) {
        return { valid: true };
    }

    // Skip validation for specific endpoints that handle authentication
    const pathname = new URL(request.url).pathname;
    const skipPaths = [
        '/api/auth/login',
        '/api/auth/signup',
        '/api/auth/callback',
    ];
    if (skipPaths.some((path) => pathname.startsWith(path))) {
        return { valid: true };
    }

    // Get CSRF header from request
    const headerToken = request.headers.get(CSRF_HEADER_NAME)?.toString() || null;

    // Get CSRF cookie
    const cookieToken = readCookieFromRequest(request, CSRF_COOKIE_NAME);

    // Validate
    const isValid = csrfProtection.validateToken(headerToken, cookieToken);

    if (!isValid) {
        return {
            valid: false,
            error: 'Invalid or missing CSRF token',
        };
    }

    return { valid: true };
}
