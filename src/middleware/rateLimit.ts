import { NextRequest } from 'next/server';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const counters = new Map<string, { count: number; resetAt: number }>();

/**
 * Lightweight in-memory rate limiter used by legacy API routes.
 */
export function rateLimiter(config: RateLimitConfig) {
  return async (request: NextRequest) => {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const key = `${request.nextUrl.pathname}:${ip}`;
    const now = Date.now();

    const current = counters.get(key);
    if (!current || now > current.resetAt) {
      counters.set(key, { count: 1, resetAt: now + config.windowMs });
      return;
    }

    current.count += 1;
    counters.set(key, current);

    if (current.count > config.maxRequests) {
      throw new Error('Rate limit exceeded');
    }
  };
}
