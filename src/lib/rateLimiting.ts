/**
 * Rate Limiting & DDoS Protection
 * 
 * Configurable rate limiting for API endpoints
 */

type LimiterResult = { success: boolean; remaining: number; reset: number };
type RuntimeLimiter = { limit: (key: string) => Promise<LimiterResult> };

let UpstashRatelimit: any = null;
let UpstashRedis: any = null;

try {
    // Keep Upstash optional at runtime; if loading fails, we transparently fall back to in-memory limits.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ratelimitPkg = require('@upstash/ratelimit');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const redisPkg = require('@upstash/redis');
    UpstashRatelimit = ratelimitPkg?.Ratelimit || null;
    UpstashRedis = redisPkg?.Redis || null;
} catch (error) {
    console.warn('Upstash rate limiting modules unavailable; using in-memory fallback.');
}

const hasUpstashConfig = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = hasUpstashConfig && UpstashRedis
    ? new UpstashRedis({
          url: process.env.UPSTASH_REDIS_REST_URL as string,
          token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
      })
    : null;

const memoryCounters = new Map<string, { count: number; resetAt: number }>();

function checkMemoryLimit(
    key: string,
    maxRequests: number,
    windowMs: number
): { success: boolean; remaining: number; reset: number } {
    const now = Date.now();
    const current = memoryCounters.get(key);

    if (!current || now > current.resetAt) {
        const reset = now + windowMs;
        memoryCounters.set(key, { count: 1, resetAt: reset });
        return {
            success: true,
            remaining: Math.max(maxRequests - 1, 0),
            reset,
        };
    }

    current.count += 1;
    memoryCounters.set(key, current);

    return {
        success: current.count <= maxRequests,
        remaining: Math.max(maxRequests - current.count, 0),
        reset: current.resetAt,
    };
}

function createLimiter(maxRequests: number, window: string, prefix: string): RuntimeLimiter | null {
    if (!redis || !UpstashRatelimit) return null;

    return new UpstashRatelimit({
        redis,
        limiter: UpstashRatelimit.slidingWindow(maxRequests, window),
        analytics: true,
        prefix,
    });
}

// Rate limit configurations
export const rateLimits = {
    // Authentication endpoints
    login: createLimiter(5, '15 m', 'ratelimit:login'),

    signup: createLimiter(3, '1 h', 'ratelimit:signup'),

    // API endpoints
    apiCall: createLimiter(100, '1 m', 'ratelimit:api'),

    // Code execution
    codeExecution: createLimiter(10, '1 m', 'ratelimit:code'),

    // File upload
    fileUpload: createLimiter(5, '1 m', 'ratelimit:upload'),
};

/**
 * Check rate limit
 */
export async function checkRateLimit(
    limiter: RuntimeLimiter | null,
    key: string,
    maxRequests = 100,
    windowMs = 60 * 1000
): Promise<{ success: boolean; remaining: number; resetTime?: Date }> {
    try {
        if (!limiter) {
            const result = checkMemoryLimit(key, maxRequests, windowMs);

            return {
                success: result.success,
                remaining: result.remaining,
                resetTime: new Date(result.reset),
            };
        }

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
    const result = await checkRateLimit(rateLimits.login, `login:${email}`, 5, 15 * 60 * 1000);

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
    const result = await checkRateLimit(rateLimits.signup, `signup:${ipAddress}`, 3, 60 * 60 * 1000);

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
    const result = await checkRateLimit(rateLimits.apiCall, `api:${userId}`, 100, 60 * 1000);

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
    const result = await checkRateLimit(rateLimits.codeExecution, `code:${userId}`, 10, 60 * 1000);

    if (!result.success) {
        return {
            allowed: false,
            message: 'Code execution limit exceeded. Please wait before running more code.',
        };
    }

    return { allowed: true };
}

/**
 * Legacy route helper expected by multiple API modules.
 */
export const rateLimiter = {
    async checkLimit(
        namespace: string,
        clientId: string,
        maxRequests: number,
        windowSeconds: number
    ): Promise<void> {
        const key = `${namespace}:${clientId}`;
        const result = await checkRateLimit(
            rateLimits.apiCall,
            key,
            maxRequests,
            windowSeconds * 1000
        );

        if (!result.success) {
            throw new Error('Rate limit exceeded');
        }
    },
};
