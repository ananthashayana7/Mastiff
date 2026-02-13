/**
 * Snowflake Connector
 * 
 * Connects to Snowflake data warehouse
 */

import { BaseDataConnector, ConnectorConfig, QueryResult, DataSource, ColumnSchema } from './BaseConnector';
import { AppError } from '@/src/lib/errors';
import snowflake from 'snowflake-sdk';

/**
 * Snowflake Connector Configuration
 */
interface SnowflakeConfig extends ConnectorConfig {
    account: string;
    username: string;
    password: string;
    warehouse?: string;
    database: string;
    schema: string;
    role?: string;
}

/**
 * Snowflake Connector
 * 
 * Provides access to Snowflake warehouse
 */
export class SnowflakeConnector extends BaseDataConnector {
    private connection: any = null;

    constructor(config: SnowflakeConfig) {
        super(config);
        this.config = config as SnowflakeConfig;
    }

    /**
     * Connect to Snowflake
     */
    async connect(): Promise<void> {
        try {
            const config = this.config as SnowflakeConfig;

            // Create connection
            this.connection = snowflake.createConnection({
                account: config.account,
                user: config.username,
                password: config.password,
                warehouse: config.warehouse,
                database: config.database,
                schema: config.schema,
                role: config.role,
            });

            // Test connection
            await new Promise<void>((resolve, reject) => {
                this.connection.connect((err: any) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            this.status = 'connected';
            this.lastTestedAt = new Date();
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to connect to Snowflake',
                error
            );
        }
    }

    /**
     * Disconnect from Snowflake
     */
    async disconnect(): Promise<void> {
        try {
            if (this.connection) {
                await new Promise<void>((resolve, reject) => {
                    this.connection.destroy((err: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            }
            this.connection = null;
            this.status = 'disconnected';
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to disconnect from Snowflake',
                error
            );
        }
    }

    /**
     * List databases in Snowflake
     */
    async listSources(): Promise<DataSource[]> {
        try {
            await this.ensureConnected();

            const databases = await this.executeQuery('SHOW DATABASES');

            this.lastUsedAt = new Date();

            return databases.rows.map((row: any) => ({
                id: row.name,
                name: row.name,
                type: 'database',
                metadata: {
                    created_on: row.created_on,
                    owner: row.owner,
                },
            }));
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to list Snowflake databases',
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

            const query = `
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '${tableName.toUpperCase()}'
                ORDER BY ORDINAL_POSITION
            `;

            const result = await this.executeQuery(query);

            return result.rows.map((row: any) => ({
                name: row.COLUMN_NAME,
                type: row.DATA_TYPE.toLowerCase(),
                nullable: row.IS_NULLABLE === 'YES',
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

            if (!this.connection) {
                throw new AppError('CONNECTION_ERROR', 'Snowflake connection not initialized');
            }

            const result = await new Promise<any>((resolve, reject) => {
                this.connection.execute({
                    sqlText: query,
                    complete: (err: any, stmt: any, rows: any[]) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ stmt, rows });
                        }
                    },
                });
            });

            this.lastUsedAt = new Date();

            const columnNames = result.stmt.getColumnNames?.() || [];

            return {
                columns: columnNames,
                rows: result.rows || [],
                rowCount: result.rows?.length || 0,
                executionTimeMs: 0,
            };
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to execute Snowflake query',
                error
            );
        }
    }

    /**
     * Write data to Snowflake table
     */
    async writeData(tableName: string, data: any[]): Promise<void> {
        try {
            await this.ensureConnected();

            if (!data || data.length === 0) {
                throw new AppError('VALIDATION_ERROR', 'No data to write');
            }

            // Build INSERT statement
            const columns = Object.keys(data[0]);
            const values = data
                .map((row: any) =>
                    `(${columns
                        .map((col: string) => {
                            const val = row[col];
                            if (val === null || val === undefined) {
                                return 'NULL';
                            }
                            if (typeof val === 'string') {
                                return `'${val.replace(/'/g, "''")}'`;
                            }
                            return val;
                        })
                        .join(', ')})`
                )
                .join(', ');

            const query = `
                INSERT INTO ${tableName.toUpperCase()} (${columns.join(', ')})
                VALUES ${values}
            `;

            await this.executeQuery(query);
            this.lastUsedAt = new Date();
        } catch (error) {
            throw new AppError(
                'WRITE_ERROR',
                'Failed to write data to Snowflake',
                error
            );
        }
    }
}

export default SnowflakeConnector;
