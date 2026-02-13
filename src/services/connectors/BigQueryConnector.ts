/**
 * BigQuery Connector
 * 
 * Connects to Google BigQuery
 */

import { BaseDataConnector, ConnectorConfig, QueryResult, DataSource, ColumnSchema } from './BaseConnector';
import { AppError } from '@/src/lib/errors';
import { BigQuery } from '@google-cloud/bigquery';

/**
 * BigQuery Connector Configuration
 */
interface BigQueryConfig extends ConnectorConfig {
    projectId: string;
    keyFilePath?: string;
    credentials?: any;
}

/**
 * BigQuery Connector
 * 
 * Provides access to Google BigQuery datasets and tables
 */
export class BigQueryConnector extends BaseDataConnector {
    private bigquery: BigQuery | null = null;

    constructor(config: BigQueryConfig) {
        super(config);
        this.config = config as BigQueryConfig;
    }

    /**
     * Connect to BigQuery
     */
    async connect(): Promise<void> {
        try {
            const config = this.config as BigQueryConfig;

            // Initialize BigQuery client
            const options: any = {
                projectId: config.projectId,
            };

            if (config.keyFilePath) {
                options.keyFilename = config.keyFilePath;
            } else if (config.credentials) {
                options.credentials = config.credentials;
            }

            this.bigquery = new BigQuery(options);

            // Test connection
            const datasets = await this.bigquery.getDatasets({ maxResults: 1 });
            if (datasets.length === 0) {
                throw new AppError('CONNECTION_ERROR', 'No datasets found in BigQuery project');
            }

            this.status = 'connected';
            this.lastTestedAt = new Date();
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to connect to BigQuery',
                error
            );
        }
    }

    /**
     * Disconnect from BigQuery
     */
    async disconnect(): Promise<void> {
        try {
            this.bigquery = null;
            this.status = 'disconnected';
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to disconnect from BigQuery',
                error
            );
        }
    }

    /**
     * List BigQuery datasets
     */
    async listSources(): Promise<DataSource[]> {
        try {
            await this.ensureConnected();

            if (!this.bigquery) {
                throw new AppError('CONNECTION_ERROR', 'BigQuery client not initialized');
            }

            const [datasets] = await this.bigquery.getDatasets();

            this.lastUsedAt = new Date();

            return datasets.map((dataset: any) => ({
                id: dataset.id,
                name: dataset.friendlyName || dataset.id,
                type: 'dataset',
                metadata: {
                    created: dataset.metadata?.creationTime,
                    location: dataset.metadata?.location,
                    labels: dataset.metadata?.labels,
                },
            }));
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to list BigQuery datasets',
                error
            );
        }
    }

    /**
     * Get table schema
     */
    async getSourceSchema(tableId: string): Promise<ColumnSchema[]> {
        try {
            await this.ensureConnected();

            if (!this.bigquery) {
                throw new AppError('CONNECTION_ERROR', 'BigQuery client not initialized');
            }

            // Parse dataset.table format
            const [datasetId, tableName] = tableId.split('.');
            const dataset = this.bigquery.dataset(datasetId);
            const table = dataset.table(tableName);

            const [metadata] = await table.getMetadata();
            const fields = metadata.schema?.fields || [];

            return fields.map((field: any) => ({
                name: field.name,
                type: field.type.toLowerCase(),
                nullable: field.mode !== 'REQUIRED',
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
     * Execute SQL query in BigQuery
     */
    async executeQuery(query: string): Promise<QueryResult> {
        try {
            await this.ensureConnected();

            if (!this.bigquery) {
                throw new AppError('CONNECTION_ERROR', 'BigQuery client not initialized');
            }

            const startTime = Date.now();

            // Run query
            const [rows] = await this.bigquery.query({
                query,
                location: 'US',
            });

            const executionTimeMs = Date.now() - startTime;

            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

            this.lastUsedAt = new Date();

            return {
                columns,
                rows: rows || [],
                rowCount: rows?.length || 0,
                executionTimeMs,
            };
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to execute BigQuery query',
                error
            );
        }
    }

    /**
     * Write data to BigQuery table
     */
    async writeData(tableId: string, data: any[]): Promise<void> {
        try {
            await this.ensureConnected();

            if (!this.bigquery) {
                throw new AppError('CONNECTION_ERROR', 'BigQuery client not initialized');
            }

            if (!data || data.length === 0) {
                throw new AppError('VALIDATION_ERROR', 'No data to write');
            }

            // Parse dataset.table format
            const [datasetId, tableName] = tableId.split('.');
            const dataset = this.bigquery.dataset(datasetId);
            const table = dataset.table(tableName);

            // Insert rows
            await table.insert(data);

            this.lastUsedAt = new Date();
        } catch (error) {
            throw new AppError(
                'WRITE_ERROR',
                'Failed to write data to BigQuery',
                error
            );
        }
    }

    /**
     * Get cost estimation for query
     */
    async estimateQueryCost(query: string): Promise<{ bytesScanned: number; estimatedCost: number }> {
        try {
            await this.ensureConnected();

            if (!this.bigquery) {
                throw new AppError('CONNECTION_ERROR', 'BigQuery client not initialized');
            }

            const queryJob = await this.bigquery.createQueryJob({
                query,
                dryRun: true,
            });

            const metadata = queryJob[1];
            const bytesScanned = parseInt(metadata.statistics?.query?.totalBytesProcessed || '0');

            // BigQuery costs $6.25 per TB
            const costPerByte = 6.25 / (1024 ** 4);
            const estimatedCost = bytesScanned * costPerByte;

            return {
                bytesScanned,
                estimatedCost,
            };
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to estimate query cost',
                error
            );
        }
    }
}

export default BigQueryConnector;
