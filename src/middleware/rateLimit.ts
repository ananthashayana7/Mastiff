import { NextRequest } from 'next/server';
import { checkRateLimit, rateLimits } from '@/lib/rateLimiting';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Lightweight in-memory rate limiter used by legacy API routes.
 */
export function rateLimiter(config: RateLimitConfig) {
  return async (request: NextRequest) => {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const key = `${request.nextUrl.pathname}:${ip}`;
    const result = await checkRateLimit(
      rateLimits.apiCall,
      key,
      config.maxRequests,
      config.windowMs
    );

    if (!result.success) {
      throw new Error('Rate limit exceeded');
    }
  };
}
