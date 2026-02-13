/**
 * Connector Schema
 * 
 * Database schema for storing connector configurations and metadata
 */

import { pgTable, uuid, varchar, text, timestamp, jsonb, enum as pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

/**
 * Connector types
 */
export const connectorTypeEnum = pgEnum('connector_type', [
    'sheets',
    'snowflake',
    'bigquery',
    'postgres',
    'api',
]);

/**
 * Connectors table - stores user data source connections
 */
export const connectors = pgTable(
    'connectors',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => users.id),
        name: varchar('name', { length: 255 }).notNull(),
        type: connectorTypeEnum('type').notNull(),
        description: text('description'),
        
        // Encrypted credentials stored as JSON
        encryptedCredentials: text('encrypted_credentials').notNull(),
        
        // Connector metadata
        metadata: jsonb('metadata'), // Type-specific metadata (spreadsheetId, warehouse, etc.)
        
        // State
        isActive: boolean('is_active').default(true),
        lastTestedAt: timestamp('last_tested_at'),
        lastUsedAt: timestamp('last_used_at'),
        
        // Timestamps
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (table) => ({
        userIdIdx: index('idx_connectors_user_id').on(table.userId),
        typeIdx: index('idx_connectors_type').on(table.type),
        activeIdx: index('idx_connectors_active').on(table.isActive),
    })
);

/**
 * Data sources table - caches list of available sources for each connector
 */
export const dataSources = pgTable(
    'data_sources',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        connectorId: uuid('connector_id').references(() => connectors.id),
        
        // Source info
        sourceName: varchar('source_name', { length: 255 }).notNull(),
        sourceType: varchar('source_type', { length: 100 }), // 'table', 'sheet', 'dataset', etc.
        description: text('description'),
        
        // Schema/structure information
        schema: jsonb('schema'), // Column names, types, etc.
        
        // Metadata
        rowCount: integer('row_count'),
        sizeBytes: integer('size_bytes'),
        lastRefreshedAt: timestamp('last_refreshed_at'),
        
        // Timestamps
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (table) => ({
        connectorIdIdx: index('idx_data_sources_connector_id').on(table.connectorId),
        sourceNameIdx: index('idx_data_sources_source_name').on(table.sourceName),
    })
);

/**
 * Query execution history - for caching and audit
 */
export const connectorQueries = pgTable(
    'connector_queries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => users.id),
        connectorId: uuid('connector_id').references(() => connectors.id),
        
        // Query info
        query: text('query').notNull(),
        result: jsonb('result'), // Query results
        
        // Execution stats
        rowsReturned: integer('rows_returned'),
        executionTimeMs: integer('execution_time_ms'),
        cachedResult: boolean('cached_result').default(false),
        
        // Status
        status: varchar('status', { length: 50 }).notNull(), // 'success', 'failed', 'timeout'
        error: text('error'),
        
        // Timestamps
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        userIdIdx: index('idx_connector_queries_user_id').on(table.userId),
        connectorIdIdx: index('idx_connector_queries_connector_id').on(table.connectorId),
        createdAtIdx: index('idx_connector_queries_created_at').on(table.createdAt),
    })
);

// Relations
export const connectorsRelations = relations(connectors, ({ one, many }) => ({
    user: one(users, { fields: [connectors.userId], references: [users.id] }),
    dataSources: many(dataSources),
    queries: many(connectorQueries),
}));

export const dataSourcesRelations = relations(dataSources, ({ one }) => ({
    connector: one(connectors, { fields: [dataSources.connectorId], references: [connectors.id] }),
}));

export const connectorQueriesRelations = relations(connectorQueries, ({ one }) => ({
    user: one(users, { fields: [connectorQueries.userId], references: [users.id] }),
    connector: one(connectors, { fields: [connectorQueries.connectorId], references: [connectors.id] }),
}));
