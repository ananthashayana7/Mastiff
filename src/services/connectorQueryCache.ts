/**
 * Connector Query Cache Service
 * 
 * Specialized caching for connector queries with smart invalidation
 */

import { cacheService } from './cacheService';
import { QueryResult } from './connectors/BaseConnector';

/**
 * Query cache entry
 */
interface QueryCacheEntry {
    connectorId: string;
    query: string;
    result: QueryResult;
    timestamp: number;
}

/**
 * Cache configuration for connector queries
 */
export interface ConnectorQueryCacheConfig {
    enabled: boolean;
    ttl: number; // Default: 3600 seconds (1 hour)
    tags?: string[];
}

/**
 * Connector Query Cache Service
 */
class ConnectorQueryCacheService {
    private defaultConfig: ConnectorQueryCacheConfig = {
        enabled: true,
        ttl: 3600, // 1 hour
    };

    /**
     * Get cached query result
     */
    async getQueryResult(
        connectorId: string,
        query: string
    ): Promise<QueryResult | null> {
        try {
            const key = this.getCacheKey(connectorId, query);
            const cached = await cacheService.get<QueryCacheEntry>(key);

            if (cached) {
                return cached.result;
            }

            return null;
        } catch (error) {
            console.warn('Query cache get error:', error);
            return null;
        }
    }

    /**
     * Cache query result
     */
    async cacheQueryResult(
        connectorId: string,
        query: string,
        result: QueryResult,
        config?: Partial<ConnectorQueryCacheConfig>
    ): Promise<void> {
        try {
            const finalConfig = { ...this.defaultConfig, ...config };

            if (!finalConfig.enabled) {
                return;
            }

            const key = this.getCacheKey(connectorId, query);
            const entry: QueryCacheEntry = {
                connectorId,
                query,
                result,
                timestamp: Date.now(),
            };

            // Add connector tag for invalidation
            const tags = [
                `connector:${connectorId}`,
                `query:${this.getQueryHash(query)}`,
                ...( finalConfig.tags || []),
            ];

            await cacheService.set(key, entry, {
                ttl: finalConfig.ttl,
                tags,
            });
        } catch (error) {
            console.warn('Query cache set error:', error);
        }
    }

    /**
     * Wrap query execution with caching
     */
    async executeWithCache(
        connectorId: string,
        query: string,
        executor: () => Promise<QueryResult>,
        config?: Partial<ConnectorQueryCacheConfig>
    ): Promise<QueryResult> {
        const finalConfig = { ...this.defaultConfig, ...config };

        // Check cache first
        if (finalConfig.enabled) {
            const cached = await this.getQueryResult(connectorId, query);
            if (cached) {
                return cached;
            }
        }

        // Execute query
        const result = await executor();

        // Cache result
        if (finalConfig.enabled) {
            await this.cacheQueryResult(connectorId, query, result, finalConfig);
        }

        return result;
    }

    /**
     * Invalidate all cache for a specific connector
     */
    async invalidateConnector(connectorId: string): Promise<void> {
        try {
            await cacheService.invalidateTag(`connector:${connectorId}`);
        } catch (error) {
            console.warn('Connector cache invalidation error:', error);
        }
    }

    /**
     * Invalidate cache for a specific query pattern
     */
    async invalidateQueryPattern(pattern: string): Promise<void> {
        try {
            const hash = this.getQueryHash(pattern);
            await cacheService.invalidateTag(`query:${hash}`);
        } catch (error) {
            console.warn('Query pattern invalidation error:', error);
        }
    }

    /**
     * Clear all query cache
     */
    async clearAll(): Promise<void> {
        try {
            await cacheService.flush();
        } catch (error) {
            console.warn('Cache flush error:', error);
        }
    }

    /**
     * Get cache key for a query
     */
    private getCacheKey(connectorId: string, query: string): string {
        const queryHash = this.getQueryHash(query);
        return `connector_query:${connectorId}:${queryHash}`;
    }

    /**
     * Simple hash function for queries
     */
    private getQueryHash(query: string): string {
        // Simple hash for demonstration
        // In production, use a proper hash function like sha256
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }
}

// Export singleton instance
export const connectorQueryCache = new ConnectorQueryCacheService();

export default ConnectorQueryCacheService;
