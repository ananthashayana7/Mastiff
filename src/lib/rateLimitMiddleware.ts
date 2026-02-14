import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/services/cacheService';

/**
 * Rate Limiting Middleware
 * 
 * Implements token bucket algorithm for rate limiting
 * Can be applied per-user, per-IP, or per-endpoint
 */

export interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
};

/**
 * Create rate limit middleware
 */
export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (req: NextRequest, handler: Function) => {
    const key = finalConfig.keyGenerator
      ? finalConfig.keyGenerator(req)
      : `ratelimit:${req.ip || req.headers.get('x-forwarded-for') || 'unknown'}`;

    try {
      // Get current count
      let count = 0;
      const cached = await CacheService.get<number>(key);
      if (cached !== null) {
        count = cached;
      }

      // Check if exceeded limit
      if (count >= finalConfig.maxRequests) {
        return NextResponse.json(
          {
            error: 'Too many requests',
            retryAfter: finalConfig.windowMs / 1000,
          },
          {
            status: 429,
            headers: {
              'Retry-After': Math.ceil(finalConfig.windowMs / 1000).toString(),
              'X-RateLimit-Limit': finalConfig.maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }

      // Execute handler
      const response = await handler();

      // Increment counter
      const newCount = await CacheService.increment(key, 1, Math.ceil(finalConfig.windowMs / 1000));

      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', finalConfig.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', Math.max(0, finalConfig.maxRequests - newCount).toString());
      response.headers.set('X-RateLimit-Reset', (Date.now() + finalConfig.windowMs).toString());

      return response;
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // If cache fails, allow request but log error
      return await handler();
    }
  };
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMITS = {
  // Strict limits for auth endpoints
  auth: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
  },

  // Moderate limits for API endpoints
  api: {
    maxRequests: 100,
    windowMs: 15 * 60 * 1000,
  },

  // Loose limits for read-only endpoints
  read: {
    maxRequests: 1000,
    windowMs: 15 * 60 * 1000,
  },

  // Strict limits for code execution
  execution: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  },

  // Very strict for exports
  export: {
    maxRequests: 5,
    windowMs: 60 * 1000,
  },
};

/**
 * Rate limit by user ID
 */
export function rateLimitByUser(config: Partial<RateLimitConfig> = {}) {
  return rateLimitMiddleware({
    ...config,
    keyGenerator: (req: NextRequest) => {
      // Extract user ID from JWT token or session
      const auth = req.headers.get('authorization');
      const token = auth?.split(' ')[1];
      if (token) {
        try {
          const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          return `ratelimit:user:${decoded.userId}`;
        } catch (e) {
          // Fall back to IP
        }
      }
      return `ratelimit:ip:${req.ip || 'unknown'}`;
    },
  });
}

/**
 * Rate limit by IP address
 */
export function rateLimitByIP(config: Partial<RateLimitConfig> = {}) {
  return rateLimitMiddleware({
    ...config,
    keyGenerator: (req: NextRequest) => {
      const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
      return `ratelimit:ip:${ip}`;
    },
  });
}

/**
 * Rate limit by endpoint
 */
export function rateLimitByEndpoint(endpoint: string, config: Partial<RateLimitConfig> = {}) {
  return rateLimitMiddleware({
    ...config,
    keyGenerator: () => `ratelimit:endpoint:${endpoint}`,
  });
}
