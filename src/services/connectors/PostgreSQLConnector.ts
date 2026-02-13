/**
 * PostgreSQL Connector
 * 
 * Connects to PostgreSQL database
 */

import { BaseDataConnector, ConnectorConfig, QueryResult, DataSource, ColumnSchema } from './BaseConnector';
import { AppError } from '@/src/lib/errors';
import { Pool, Client } from 'pg';

/**
 * PostgreSQL Connector Configuration
 */
interface PostgreSQLConfig extends ConnectorConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl?: boolean;
}

/**
 * PostgreSQL Connector
 * 
 * Provides access to PostgreSQL databases
 */
export class PostgreSQLConnector extends BaseDataConnector {
    private pool: Pool | null = null;
    private client: Client | null = null;

    constructor(config: PostgreSQLConfig) {
        super(config);
        this.config = config as PostgreSQLConfig;
    }

    /**
     * Connect to PostgreSQL
     */
    async connect(): Promise<void> {
        try {
            const config = this.config as PostgreSQLConfig;

            // Create connection pool
            this.pool = new Pool({
                host: config.host,
                port: config.port,
                user: config.username,
                password: config.password,
                database: config.database,
                ssl: config.ssl,
            });

            // Test connection
            const client = await this.pool.connect();
            try {
                await client.query('SELECT NOW()');
            } finally {
                client.release();
            }

            this.status = 'connected';
            this.lastTestedAt = new Date();
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to connect to PostgreSQL',
                error
            );
        }
    }

    /**
     * Disconnect from PostgreSQL
     */
    async disconnect(): Promise<void> {
        try {
            if (this.client) {
                await this.client.release();
                this.client = null;
            }
            if (this.pool) {
                await this.pool.end();
                this.pool = null;
            }
            this.status = 'disconnected';
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to disconnect from PostgreSQL',
                error
            );
        }
    }

    /**
     * List schemas and tables
     */
    async listSources(): Promise<DataSource[]> {
        try {
            await this.ensureConnected();

            if (!this.pool) {
                throw new AppError('CONNECTION_ERROR', 'PostgreSQL pool not initialized');
            }

            const result = await this.pool.query(`
                SELECT
                    table_schema,
                    table_name,
                    table_type
                FROM information_schema.tables
                WHERE table_schema != 'pg_catalog'
                AND table_schema != 'information_schema'
                ORDER BY table_schema, table_name
            `);

            this.lastUsedAt = new Date();

            return result.rows.map((row: any) => ({
                id: `${row.table_schema}.${row.table_name}`,
                name: row.table_name,
                type: row.table_type.toLowerCase(),
                metadata: {
                    schema: row.table_schema,
                },
            }));
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to list PostgreSQL tables',
                error
            );
        }
    }

    /**
     * Get table schema
     */
    async getSourceSchema(tableName: string): Promise<ColumnSchema[]> {
        try {
            await this.ensureConnected();

            if (!this.pool) {
                throw new AppError('CONNECTION_ERROR', 'PostgreSQL pool not initialized');
            }

            // Parse schema.table if provided
            let schema = 'public';
            let table = tableName;

            if (tableName.includes('.')) {
                [schema, table] = tableName.split('.');
            }

            const result = await this.pool.query(`
                SELECT
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_schema = $1
                AND table_name = $2
                ORDER BY ordinal_position
            `, [schema, table]);

            return result.rows.map((row: any) => ({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable === 'YES',
            }));
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to get table schema',
                error
            );
        }
    }

    /**
     * Execute SQL query
     */
    async executeQuery(query: string): Promise<QueryResult> {
        try {
            await this.ensureConnected();

            if (!this.pool) {
                throw new AppError('CONNECTION_ERROR', 'PostgreSQL pool not initialized');
            }

            const startTime = Date.now();
            const result = await this.pool.query(query);
            const executionTimeMs = Date.now() - startTime;

            const columns = result.fields?.map((f: any) => f.name) || [];

            this.lastUsedAt = new Date();

            return {
                columns,
                rows: result.rows || [],
                rowCount: result.rows?.length || 0,
                executionTimeMs,
            };
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to execute PostgreSQL query',
                error
            );
        }
    }

    /**
     * Write data to PostgreSQL table
     */
    async writeData(tableName: string, data: any[]): Promise<void> {
        try {
            await this.ensureConnected();

            if (!this.pool) {
                throw new AppError('CONNECTION_ERROR', 'PostgreSQL pool not initialized');
            }

            if (!data || data.length === 0) {
                throw new AppError('VALIDATION_ERROR', 'No data to write');
            }

            // Start transaction
            const client = await this.pool.connect();

            try {
                await client.query('BEGIN');

                const columns = Object.keys(data[0]);
                const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                const query = `
                    INSERT INTO ${tableName} (${columns.join(', ')})
                    VALUES (${placeholders})
                `;

                // Insert each row
                for (const row of data) {
                    const values = columns.map(col => row[col]);
                    await client.query(query, values);
                }

                await client.query('COMMIT');
                this.lastUsedAt = new Date();
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        } catch (error) {
            throw new AppError(
                'WRITE_ERROR',
                'Failed to write data to PostgreSQL',
                error
            );
        }
    }

    /**
     * Stream large query results
     */
    async executeQueryStream(query: string): Promise<AsyncIterableIterator<any>> {
        try {
            await this.ensureConnected();

            if (!this.pool) {
                throw new AppError('CONNECTION_ERROR', 'PostgreSQL pool not initialized');
            }

            const client = await this.pool.connect();

            this.lastUsedAt = new Date();

            // Return async generator for streaming
            return (async function* () {
                try {
                    const res = await client.query(query);
                    for (const row of res.rows) {
                        yield row;
                    }
                } finally {
                    client.release();
                }
            })();
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to stream query results',
                error
            );
        }
    }
}

export default PostgreSQLConnector;
