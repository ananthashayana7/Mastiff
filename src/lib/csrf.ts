import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * CSRF Protection Middleware
 * 
 * Generates CSRF tokens and validates them on state-changing requests (POST, PUT, DELETE)
 * Token is stored in session and must be included in request headers for verification
 */

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Store tokens in memory (in production, use Redis)
const csrfTokenStore = new Map<string, { token: string; expiry: number }>();

/**
 * Generate a new CSRF token for a session
 */
export function generateCSRFToken(sessionId: string): string {
  const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  const expiry = Date.now() + CSRF_TOKEN_EXPIRY;

  csrfTokenStore.set(sessionId, { token, expiry });

  return token;
}

/**
 * Verify CSRF token
 */
export function verifyCSRFToken(sessionId: string, token: string): boolean {
  const stored = csrfTokenStore.get(sessionId);

  if (!stored) {
    return false;
  }

  // Check expiry
  if (Date.now() > stored.expiry) {
    csrfTokenStore.delete(sessionId);
    return false;
  }

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(stored.token),
      Buffer.from(token)
    );
  } catch {
    return false;
  }
}

/**
 * CSRF Middleware for Next.js
 * Validates CSRF tokens on state-changing requests
 */
export async function csrfMiddleware(request: NextRequest): Promise<boolean> {
  const method = request.method.toUpperCase();

  // Only validate on state-changing requests
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    return true;
  }

  try {
    // Get session ID from cookie
    const sessionId = request.cookies.get('sessionId')?.value;

    if (!sessionId) {
      console.warn('No sessionId cookie found');
      return false;
    }

    // Get CSRF token from header or body
    let csrfToken = request.headers.get('x-csrf-token');

    if (!csrfToken) {
      const body = await request.json().catch(() => ({}));
      csrfToken = body._csrf;
    }

    if (!csrfToken) {
      console.warn('No CSRF token provided');
      return false;
    }

    const isValid = verifyCSRFToken(sessionId, csrfToken);

    if (!isValid) {
      console.warn('Invalid CSRF token');
    }

    return isValid;
  } catch (error) {
    console.error('CSRF validation error:', error);
    return false;
  }
}

/**
 * Generate CSRF response headers
 */
export function csrfResponse(sessionId: string): { [key: string]: string } {
  const token = generateCSRFToken(sessionId);
  return {
    'X-CSRF-Token': token,
    'X-CSRF-Cookie': sessionId,
  };
}
