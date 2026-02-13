/**
 * API Connector
 * 
 * Generic HTTP API connector for REST endpoints
 */

import { BaseDataConnector, ConnectorConfig, QueryResult, DataSource, ColumnSchema } from './BaseConnector';
import { AppError } from '@/src/lib/errors';
import axios, { AxiosInstance } from 'axios';

/**
 * API Connector Configuration
 */
interface APIConfig extends ConnectorConfig {
    baseUrl: string;
    apiKey?: string;
    bearerToken?: string;
    headers?: Record<string, string>;
    authType?: 'apiKey' | 'bearer' | 'basic' | 'none';
}

/**
 * API Connector
 * 
 * Provides access to REST APIs
 */
export class APIConnector extends BaseDataConnector {
    private client: AxiosInstance | null = null;

    constructor(config: APIConfig) {
        super(config);
        this.config = config as APIConfig;
    }

    /**
     * Connect to API
     */
    async connect(): Promise<void> {
        try {
            const config = this.config as APIConfig;

            const headers: Record<string, string> = {
                ...config.headers,
            };

            // Add authentication headers
            if (config.authType === 'apiKey' && config.apiKey) {
                headers['X-API-Key'] = config.apiKey;
            } else if (config.authType === 'bearer' && config.bearerToken) {
                headers['Authorization'] = `Bearer ${config.bearerToken}`;
            } else if (config.authType === 'basic' && config.apiKey) {
                const encoded = Buffer.from(config.apiKey).toString('base64');
                headers['Authorization'] = `Basic ${encoded}`;
            }

            // Create axios instance
            this.client = axios.create({
                baseURL: config.baseUrl,
                headers,
                timeout: 30000,
            });

            // Test connection
            try {
                await this.client.get('/');
            } catch (error: any) {
                // 404 is ok for test, just check if we can reach the server
                if (error.response?.status !== 404 && !error.response) {
                    throw error;
                }
            }

            this.status = 'connected';
            this.lastTestedAt = new Date();
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to connect to API',
                error
            );
        }
    }

    /**
     * Disconnect from API
     */
    async disconnect(): Promise<void> {
        try {
            this.client = null;
            this.status = 'disconnected';
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to disconnect from API',
                error
            );
        }
    }

    /**
     * List available endpoints (sources)
     */
    async listSources(): Promise<DataSource[]> {
        try {
            await this.ensureConnected();

            if (!this.client) {
                throw new AppError('CONNECTION_ERROR', 'HTTP client not initialized');
            }

            // Try to get API documentation if available
            const sources: DataSource[] = [];

            // Common documentation endpoints
            const docEndpoints = [
                '/api/docs',
                '/api/documentation',
                '/swagger.json',
                '/openapi.json',
                '/api.json',
            ];

            for (const endpoint of docEndpoints) {
                try {
                    const response = await this.client.get(endpoint);
                    const docs = response.data;

                    // Parse paths from OpenAPI/Swagger docs
                    if (docs.paths) {
                        sources.push(
                            ...Object.keys(docs.paths).map((path: string) => ({
                                id: path,
                                name: path,
                                type: 'endpoint',
                                metadata: docs.paths[path] as any,
                            }))
                        );
                        break;
                    }
                } catch (error) {
                    // Continue to next endpoint
                    continue;
                }
            }

            // If no documentation found, return generic source
            if (sources.length === 0) {
                sources.push({
                    id: '/',
                    name: 'API Root',
                    type: 'endpoint',
                });
            }

            this.lastUsedAt = new Date();
            return sources;
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to list API endpoints',
                error
            );
        }
    }

    /**
     * Get endpoint schema (inferred from response)
     */
    async getSourceSchema(endpoint: string): Promise<ColumnSchema[]> {
        try {
            await this.ensureConnected();

            if (!this.client) {
                throw new AppError('CONNECTION_ERROR', 'HTTP client not initialized');
            }

            // Make test request
            const response = await this.client.get(endpoint);
            const data = response.data;

            // Infer schema from response
            const schema: ColumnSchema[] = [];

            if (Array.isArray(data) && data.length > 0) {
                // Array of objects
                const firstItem = data[0];
                Object.keys(firstItem).forEach((key: string) => {
                    const value = firstItem[key];
                    let type = 'string';

                    if (typeof value === 'number') {
                        type = 'number';
                    } else if (typeof value === 'boolean') {
                        type = 'boolean';
                    } else if (value instanceof Date) {
                        type = 'date';
                    } else if (typeof value === 'object') {
                        type = 'object';
                    }

                    schema.push({
                        name: key,
                        type,
                        nullable: value === null,
                    });
                });
            } else if (typeof data === 'object' && data !== null) {
                // Single object
                Object.keys(data).forEach((key: string) => {
                    const value = data[key];
                    let type = 'string';

                    if (typeof value === 'number') {
                        type = 'number';
                    } else if (typeof value === 'boolean') {
                        type = 'boolean';
                    } else if (typeof value === 'object') {
                        type = 'object';
                    }

                    schema.push({
                        name: key,
                        type,
                        nullable: false,
                    });
                });
            }

            return schema;
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to get endpoint schema',
                error
            );
        }
    }

    /**
     * Execute API request
     * Query format: "METHOD /endpoint?params=value"
     */
    async executeQuery(query: string): Promise<QueryResult> {
        try {
            await this.ensureConnected();

            if (!this.client) {
                throw new AppError('CONNECTION_ERROR', 'HTTP client not initialized');
            }

            // Parse query
            const match = query.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/i);
            if (!match) {
                throw new AppError('VALIDATION_ERROR', 'Query format: METHOD /endpoint?params=value');
            }

            const [, method, endpoint] = match;
            const startTime = Date.now();

            // Execute request
            const response = await this.client.request({
                method: method.toUpperCase(),
                url: endpoint,
            });

            const executionTimeMs = Date.now() - startTime;
            const data = response.data;

            let rows: any[] = [];
            let columns: string[] = [];

            if (Array.isArray(data)) {
                rows = data;
                columns = Object.keys(data[0] || {});
            } else if (typeof data === 'object') {
                rows = [data];
                columns = Object.keys(data);
            } else {
                rows = [{ value: data }];
                columns = ['value'];
            }

            this.lastUsedAt = new Date();

            return {
                columns,
                rows,
                rowCount: rows.length,
                executionTimeMs,
            };
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to execute API request',
                error
            );
        }
    }

    /**
     * Write data via API (POST/PUT)
     */
    async writeData(endpoint: string, data: any[]): Promise<void> {
        try {
            await this.ensureConnected();

            if (!this.client) {
                throw new AppError('CONNECTION_ERROR', 'HTTP client not initialized');
            }

            if (!data || data.length === 0) {
                throw new AppError('VALIDATION_ERROR', 'No data to write');
            }

            // Send data to endpoint
            for (const item of data) {
                await this.client.post(endpoint, item);
            }

            this.lastUsedAt = new Date();
        } catch (error) {
            throw new AppError(
                'WRITE_ERROR',
                'Failed to write data via API',
                error
            );
        }
    }

    /**
     * Make custom HTTP request
     */
    async makeRequest(method: string, endpoint: string, data?: any): Promise<any> {
        try {
            await this.ensureConnected();

            if (!this.client) {
                throw new AppError('CONNECTION_ERROR', 'HTTP client not initialized');
            }

            const response = await this.client.request({
                method,
                url: endpoint,
                data,
            });

            this.lastUsedAt = new Date();
            return response.data;
        } catch (error) {
            throw new AppError(
                'REQUEST_ERROR',
                'Failed to make HTTP request',
                error
            );
        }
    }
}

export default APIConnector;
