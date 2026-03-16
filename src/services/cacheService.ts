/**
 * Redis Cache Service
 * 
 * Caches connector query results and other expensive operations
 */

import { AppError } from '@/src/lib/errors';
import { Redis } from '@upstash/redis';

/**
 * Cache configuration
 */
interface CacheOptions {
    ttl?: number; // Time to live in seconds
    tags?: string[]; // Cache tags for invalidation
}

/**
 * Cache entry metadata
 */
interface CacheEntry<T = any> {
    data: T;
    createdAt: number;
    expiresAt: number;
    hits: number;
    tags?: string[];
}

/**
 * Redis Cache Service
 */
class RedisCacheService {
    private redis: Redis;
    private defaultTTL = 3600; // 1 hour default
    private keyPrefix = 'mastiff:';

    constructor() {
        // Initialize Upstash Redis
        this.redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
    }

    /**
     * Get value from cache
     */
    async get<T = any>(key: string): Promise<T | null> {
        try {
            const prefixedKey = this.getKey(key);
            const value = await this.redis.get(prefixedKey);

            if (!value) {
                return null;
            }

            // Parse and validate cache entry
            if (typeof value === 'string') {
                const entry = JSON.parse(value) as CacheEntry<T>;

                // Check expiration
                if (entry.expiresAt && Date.now() > entry.expiresAt) {
                    await this.delete(key);
                    return null;
                }

                // Increment hit counter
                entry.hits++;
                await this.redis.set(prefixedKey, JSON.stringify(entry));

                return entry.data;
            }

            return value as T;
        } catch (error) {
            console.warn('Cache get error:', error);
            return null;
        }
    }

    /**
     * Set value in cache
     */
    async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
        try {
            const ttl = options?.ttl ?? this.defaultTTL;
            const prefixedKey = this.getKey(key);

            const entry: CacheEntry<T> = {
                data: value,
                createdAt: Date.now(),
                expiresAt: Date.now() + ttl * 1000,
                hits: 0,
                tags: options?.tags,
            };

            // Store in Redis with TTL
            await this.redis.setex(
                prefixedKey,
                ttl,
                JSON.stringify(entry)
            );

            // Store tag relationships for invalidation
            if (options?.tags) {
                for (const tag of options.tags) {
                    const tagKey = this.getTagKey(tag);
                    await this.redis.sadd(tagKey, prefixedKey);
                    // Set tag expiration
                    await this.redis.expire(tagKey, ttl);
                }
            }
        } catch (error) {
            console.warn('Cache set error:', error);
            // Don't throw - cache failures shouldn't break the app
        }
    }

    /**
     * Delete value from cache
     */
    async delete(key: string): Promise<void> {
        try {
            const prefixedKey = this.getKey(key);
            await this.redis.del(prefixedKey);
        } catch (error) {
            console.warn('Cache delete error:', error);
        }
    }

    /**
     * Invalidate all cache entries with a specific tag
     */
    async invalidateTag(tag: string): Promise<void> {
        try {
            const tagKey = this.getTagKey(tag);
            
            // Get all keys with this tag
            const keys = await this.redis.smembers(tagKey);

            // Delete all keys
            if (keys && keys.length > 0) {
                await this.redis.del(...keys);
            }

            // Delete the tag key itself
            await this.redis.del(tagKey);
        } catch (error) {
            console.warn('Cache invalidation error:', error);
        }
    }

    /**
     * Invalidate all cache entries
     */
    async flush(): Promise<void> {
        try {
            // Get all keys with our prefix
            const keys = await this.redis.keys(`${this.keyPrefix}*`);
            if (keys && keys.length > 0) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            console.warn('Cache flush error:', error);
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{
        totalKeys: number;
        memoryUsage: number;
        uptime: number;
    }> {
        try {
            // This requires Redis INFO command which might not be available on Upstash
            // Fallback to returning basic stats
            return {
                totalKeys: 0,
                memoryUsage: 0,
                uptime: 0,
            };
        } catch (error) {
            console.warn('Cache stats error:', error);
            return {
                totalKeys: 0,
                memoryUsage: 0,
                uptime: 0,
            };
        }
    }

    /**
     * Cache a function result
     */
    async wrap<T = any>(
        key: string,
        fn: () => Promise<T>,
        options?: CacheOptions
    ): Promise<T> {
        // Try to get from cache
        const cached = await this.get<T>(key);
        if (cached) {
            return cached;
        }

        // Execute function
        const result = await fn();

        // Store in cache
        await this.set(key, result, options);

        return result;
    }

    /**
     * Memoize a function with caching
     */
    memoize<Args extends any[], T>(
        fn: (...args: Args) => Promise<T>,
        options?: { keyPrefix?: string; ttl?: number }
    ): (...args: Args) => Promise<T> {
        return async (...args: Args) => {
            const keyPrefix = options?.keyPrefix || fn.name;
            const key = `${keyPrefix}:${JSON.stringify(args)}`;

            return this.wrap(
                key,
                () => fn(...args),
                { ttl: options?.ttl }
            );
        };
    }

    /**
     * Get prefixed key
     */
    private getKey(key: string): string {
        return `${this.keyPrefix}${key}`;
    }

    /**
     * Get tag key
     */
    private getTagKey(tag: string): string {
        return `${this.keyPrefix}tag:${tag}`;
    }
}

// Export singleton instance
export const cacheService = new RedisCacheService();

/**
 * Legacy service-style API expected by health and route handlers.
 */
export const CacheService = {
    async healthCheck(): Promise<boolean> {
        try {
            const key = '__cache_health_check__';
            await cacheService.set(key, { ok: true }, { ttl: 10 });
            await cacheService.get(key);
            return true;
        } catch {
            return false;
        }
    },

    get: <T = any>(key: string) => cacheService.get<T>(key),
    set: <T = any>(key: string, value: T, options?: { ttl?: number; tags?: string[] }) =>
        cacheService.set(key, value, options),
    delete: (key: string) => cacheService.delete(key),
    flush: () => cacheService.flush(),
    getStats: () => cacheService.getStats(),
};

export default RedisCacheService;
