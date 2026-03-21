# Redis Caching System Documentation

## Overview

Mastiff integrates Upstash Redis for high-performance caching of connector queries, session data, and other expensive operations. The caching system is designed to be transparent, fault-tolerant, and configurable per-operation.

## Architecture

### Caching Layers

#### 1. General Cache Service (`cacheService`)
Generic key-value caching with TTL and tag-based invalidation.

```typescript
// Get from cache
const value = await cacheService.get<T>(key)

// Set in cache with TTL
await cacheService.set(key, value, { 
  ttl: 3600,
  tags: ['user:123', 'profile'] 
})

// Invalidate by tag
await cacheService.invalidateTag('user:123')

// Clear all cache
await cacheService.flush()
```

#### 2. Query Cache Service (`connectorQueryCache`)
Specialized caching for connector queries with automatic invalidation.

```typescript
// Get cached query result
const result = await connectorQueryCache.getQueryResult(connectorId, query)

// Cache query result
await connectorQueryCache.cacheQueryResult(connectorId, query, result, {
  ttl: 3600,
  tags: ['analysis:demand']
})

// Execute with caching (wrap pattern)
const result = await connectorQueryCache.executeWithCache(
  connectorId,
  query,
  async () => connector.executeQuery(query),
  { ttl: 3600 }
)

// Invalidate all cache for connector
await connectorQueryCache.invalidateConnector(connectorId)

// Invalidate query pattern
await connectorQueryCache.invalidateQueryPattern('SELECT * FROM customers')
```

### Cache Storage

**Provider**: Upstash Redis (serverless, managed)

**Configuration**:
```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

**Key Format**:
```
mastiff:{cache-type}:{identifier}:{hash}
mastiff:connector_query:uuid:a1b2c3d4
mastiff:session:token:...
mastiff:tag:connector:uuid
```

## Features

### 1. TTL (Time-To-Live)

All cache entries have automatic expiration:

```typescript
// Default: 3600 seconds (1 hour)
await cacheService.set(key, value)

// Custom TTL
await cacheService.set(key, value, { ttl: 7200 })

// No expiration
await cacheService.set(key, value, { ttl: 0 })
```

### 2. Tag-Based Invalidation

Efficiently invalidate related cache entries:

```typescript
// Cache with tags
await cacheService.set('query:1', result, {
  ttl: 3600,
  tags: ['connector:abc', 'user:123', 'analysis:segmentation']
})

// Invalidate all entries with tag
await cacheService.invalidateTag('connector:abc')
// Clears: query:1, query:2, query:3 (if all have this tag)
```

### 3. Hit Tracking

Track cache hit rates for performance monitoring:

```typescript
// Automatically incremented on cache hit
const entry = await cacheService.get(key)
// entry.hits is incremented each time

// Use for analytics
const stats = await cacheService.getStats()
```

### 4. Wrap Pattern

Automatic get-execute-set pattern:

```typescript
const result = await cacheService.wrap(
  'expensive-operation',
  async () => {
    // Only executed if cache miss
    return await expensiveOperation()
  },
  { ttl: 3600 }
)
```

### 5. Memoization

Functional memoization with caching:

```typescript
const memoizedFunction = cacheService.memoize(
  async (userId, days) => {
    return await complexAnalysis(userId, days)
  },
  { keyPrefix: 'analysis', ttl: 86400 }
)

// Subsequent calls with same args return cached result
const result1 = await memoizedFunction('user123', 30)
const result2 = await memoizedFunction('user123', 30) // From cache
```

## API Routes

### GET `/api/cache/stats`
Get cache statistics and status.

**Response**:
```json
{
  "success": true,
  "stats": {
    "totalKeys": 1250,
    "memoryUsage": 2500000,
    "uptime": 604800,
    "redis": {
      "url": "configured"
    }
  }
}
```

### POST `/api/cache/invalidate`
Invalidate specific cache entries.

**Request**:
```json
{
  "type": "connector",
  "target": "connector-uuid-123"
}
```

**Types**:
- `connector` - Invalidate all cache for a connector
- `query` - Invalidate cache for query pattern
- `tag` - Invalidate all entries with tag

**Response**:
```json
{
  "success": true,
  "message": "connector cache invalidated: connector-uuid-123"
}
```

### DELETE `/api/cache/clear`
Clear all cache (rate-limited to 10/hour).

**Response**:
```json
{
  "success": true,
  "message": "All cache cleared"
}
```

## Connector Query Caching

### Default Behavior

Connector queries are automatically cached with defaults:

```typescript
// Default: 1 hour TTL, enabled
const result = await connector.executeQuery(sql)
// Automatically cached with tag: connector:{connectorId}
```

### Configuration

Control caching per query:

```typescript
// Disable for real-time queries
const config = { 
  enabled: false 
}

// Custom TTL
const config = { 
  ttl: 300, // 5 minutes for frequently changing data
  tags: ['real-time', 'critical']
}

// Execute with caching options
const result = await connectorQueryCache.executeWithCache(
  connectorId,
  query,
  () => connector.executeQuery(query),
  config
)
```

### Cache Invalidation Triggers

Cache is automatically invalidated when:

1. **Connector Updated**
   ```typescript
   await connectorQueryCache.invalidateConnector(connectorId)
   ```

2. **Data Written**
   ```typescript
   await connector.writeData(table, data)
   // Should trigger invalidation
   ```

3. **Manual Invalidation**
   ```typescript
   POST /api/cache/invalidate { 
     "type": "connector", 
     "target": "abc123" 
   }
   ```

4. **TTL Expiration**
   ```typescript
   // Automatic after configured TTL
   // Default: 3600 seconds
   ```

## Performance Optimization

### 1. Query Result Caching

```typescript
// Slow query (10 seconds)
SELECT * FROM large_table WHERE condition = true

// First request: 10 seconds
const result1 = await executeQuery(sql) // Not cached

// Second request: < 10ms
const result2 = await executeQuery(sql) // From cache
```

### 2. Session Caching

Sessions stored in Redis for faster authentication:

```typescript
// Session lookup: < 5ms from Redis
const session = await sessionManager.getSession(token)
```

### 3. Batch Operations

Cache batch results for analysis templates:

```typescript
// Template caches intermediate results
await cacheService.set('template:segmentation:step1', results, {
  ttl: 300, // 5 minutes for template session
  tags: ['template:segmentation']
})
```

## Monitoring & Debugging

### Cache Hit Rate

```typescript
const stats = await cacheService.getStats()
// totalKeys: number of cached entries
// memoryUsage: bytes used
// uptime: cache server uptime

// Estimate hit rate from index operations
const hits = totalOperations - misses
const hitRate = hits / totalOperations * 100
```

### Cache Debugging

Monitor cache operations:

```typescript
// Log cache hits
console.log('Cache hit for:', key)

// Log cache misses
console.log('Cache miss for:', key, '- executing function')

// Monitor invalidations
console.log('Invalidating tag:', tag)
```

### Common Issues

**Issue**: Cache not working
- Check Redis URL and token in environment
- Verify network connectivity to Upstash
- Check cache enablement in connectorQueryCache config

**Issue**: Stale data
- Reduce TTL for frequently changing data
- Use query patterns for targeted invalidation
- Trigger manual invalidation after writes

**Issue**: High memory usage
- Reduce default TTL
- Clear old cache entries
- Implement eviction policies in Redis

## Best Practices

### 1. Cache-Busting Strategy

```typescript
// When data changes, invalidate related cache
async function updateTable(table, data) {
  // Write data
  await connector.writeData(table, data)
  
  // Invalidate related cache
  await connectorQueryCache.invalidateConnector(connectorId)
}
```

### 2. TTL Selection

```typescript
// Real-time data: 5-10 minutes
const realtimeTTL = 300

// Daily reports: 1 hour
const dailyTTL = 3600

// Reference data: 24 hours
const referenceTTL = 86400

// Static data: 7 days
const staticTTL = 604800
```

### 3. Tag Organization

```typescript
// Organize by type and scope
await cacheService.set(key, value, {
  tags: [
    `connector:${connectorId}`,
    `user:${userId}`,
    `analysis:${analysisType}`,
    `priority:high`
  ]
})

// Single invalidation clears all related
await cacheService.invalidateTag(`user:${userId}`)
```

### 4. Rate-Limited Cache Operations

```
GET  /api/cache/stats       - 100/hour
POST /api/cache/invalidate  - 50/hour  
DELETE /api/cache/clear     - 10/hour (very limited)
```

## Integration Examples

### With Notebooks

```typescript
// In notebook cell - automatically cached
const result = await connector.executeQuery(sql)
// Cached for 1 hour by default

// Force refresh
await connectorQueryCache.invalidateConnector(connectorId)
const freshResult = await connector.executeQuery(sql)
```

### With Templates

```typescript
// Template execution caches intermediate steps
async function executeTemplate(template, connector) {
  const step1 = await cacheService.wrap(
    `template:${template.id}:step1`,
    () => connector.executeQuery(template.queries[0]),
    { ttl: 300, tags: [`template:${template.id}`] }
  )
  
  const step2 = await cacheService.wrap(
    `template:${template.id}:step2`,
    () => processStep1(step1),
    { ttl: 300, tags: [`template:${template.id}`] }
  )
  
  return { step1, step2 }
}
```

### With Reports

```typescript
// Scheduled reports use long-lived cache
async function generateReport(reportId) {
  const data = await cacheService.wrap(
    `report:${reportId}:data`,
    async () => {
      // Long-running query
      return await connector.executeQuery(reportSql)
    },
    { 
      ttl: 86400, // Cache for 1 day
      tags: [`report:${reportId}`]
    }
  )
  
  return generatePDF(data)
}
```

## Fallback Behavior

### Transparent Failure

If Redis is unavailable or cache operations fail:

1. Cache operations are treated as silent failures
2. Functions execute as if cache wasn't configured
3. No exceptions are raised to user
4. Logging warns about cache failures

```typescript
try {
  const cached = await cacheService.get(key)
  if (cached) return cached
} catch (error) {
  console.warn('Cache error:', error)
  // Continue without cache
}

const result = await expensiveOperation()
```

## Configuration

### Environment Variables

```env
# Upstash Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Optional: Customize defaults in cacheService
REDIS_DEFAULT_TTL=3600          # seconds
REDIS_KEY_PREFIX=mastiff:       # key namespace
```

### Runtime Configuration

```typescript
// Disable caching globally
const config = { enabled: false }

// Custom TTL per operation
{ ttl: 300 }

// Tag-based grouping
{ tags: ['user:123', 'critical'] }
```

## Summary

The Redis caching system provides:
- ✅ High-speed data retrieval (< 10ms)
- ✅ Automatic TTL and expiration
- ✅ Tag-based invalidation
- ✅ Transparent failure handling
- ✅ Rate-limited API endpoints
- ✅ Performance monitoring
- ✅ Easy integration with connectors and notebooks

All configured through environment variables and optional parameters - zero configuration required for defaults.
