/**
 * Rate Limiting & DDoS Protection
 * 
 * Configurable rate limiting for API endpoints
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Rate limit configurations
export const rateLimits = {
    // Authentication endpoints
    login: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '15 m'), // 5 attempts per 15 minutes
        analytics: true,
        prefix: 'ratelimit:login',
    }),

    signup: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, '1 h'), // 3 signups per hour per IP
        analytics: true,
        prefix: 'ratelimit:signup',
    }),

    // API endpoints
    apiCall: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(100, '1 m'), // 100 requests per minute
        analytics: true,
        prefix: 'ratelimit:api',
    }),

    // Code execution
    codeExecution: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 executions per minute
        analytics: true,
        prefix: 'ratelimit:code',
    }),

    // File upload
    fileUpload: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 uploads per minute
        analytics: true,
        prefix: 'ratelimit:upload',
    }),
};

/**
 * Check rate limit
 */
export async function checkRateLimit(
    limiter: Ratelimit,
    key: string
): Promise<{ success: boolean; remaining: number; resetTime?: Date }> {
    try {
        const result = await limiter.limit(key);

        return {
            success: result.success,
            remaining: result.remaining,
            resetTime: new Date(result.reset),
        };
    } catch (err) {
        console.error('Rate limit check error:', err);
        // Fail open - don't block on rate limit errors
        return { success: true, remaining: 0 };
    }
}

/**
 * Helper for login rate limiting
 */
export async function checkLoginRateLimit(
    email: string
): Promise<{ allowed: boolean; message?: string }> {
    const result = await checkRateLimit(rateLimits.login, `login:${email}`);

    if (!result.success) {
        const minutesRemaining = Math.ceil(
            (result.resetTime?.getTime() || 0 - Date.now()) / 1000 / 60
        );
        return {
            allowed: false,
            message: `Too many login attempts. Try again in ${minutesRemaining} minutes.`,
        };
    }

    return { allowed: true };
}

/**
 * Helper for signup rate limiting
 */
export async function checkSignupRateLimit(
    ipAddress: string
): Promise<{ allowed: boolean; message?: string }> {
    const result = await checkRateLimit(rateLimits.signup, `signup:${ipAddress}`);

    if (!result.success) {
        return {
            allowed: false,
            message: 'Too many signup attempts from this IP. Try again later.',
        };
    }

    return { allowed: true };
}

/**
 * Helper for API rate limiting
 */
export async function checkAPIRateLimit(
    userId: string
): Promise<{ allowed: boolean; message?: string }> {
    const result = await checkRateLimit(rateLimits.apiCall, `api:${userId}`);

    if (!result.success) {
        return {
            allowed: false,
            message: 'Rate limit exceeded. Please wait before making more requests.',
        };
    }

    return { allowed: true };
}

/**
 * Helper for code execution rate limiting
 */
export async function checkCodeExecutionRateLimit(
    userId: string
): Promise<{ allowed: boolean; message?: string }> {
    const result = await checkRateLimit(rateLimits.codeExecution, `code:${userId}`);

    if (!result.success) {
        return {
            allowed: false,
            message: 'Code execution limit exceeded. Please wait before running more code.',
        };
    }

    return { allowed: true };
}
