/**
 * Connector Configuration & Utilities
 * 
 * Configuration helpers for different connector types
 */

import { BaseDataConnector, ConnectorConfig } from './BaseConnector';

/**
 * Supported connector types
 */
export enum ConnectorType {
    GOOGLE_SHEETS = 'sheets',
    SNOWFLAKE = 'snowflake',
    BIGQUERY = 'bigquery',
    POSTGRESQL = 'postgres',
    API = 'api',
}

/**
 * Configuration schemas for each connector type
 */
export const connectorSchemas = {
    [ConnectorType.GOOGLE_SHEETS]: {
        required: ['clientId', 'clientSecret', 'refreshToken'],
        optional: ['spreadsheetId'],
    },
    [ConnectorType.SNOWFLAKE]: {
        required: ['account', 'user', 'password'],
        optional: ['warehouse', 'database', 'schema', 'role'],
    },
    [ConnectorType.BIGQUERY]: {
        required: ['projectId', 'serviceAccountKey'],
        optional: ['datasetId'],
    },
    [ConnectorType.POSTGRESQL]: {
        required: ['host', 'port', 'database', 'user', 'password'],
        optional: ['ssl', 'connectionTimeout'],
    },
    [ConnectorType.API]: {
        required: ['url', 'authType'],
        optional: ['apiKey', 'headers', 'baseUrl'],
    },
};

/**
 * Validate connector configuration
 */
export function validateConnectorConfig(
    config: ConnectorConfig
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if type is supported
    if (!Object.values(ConnectorType).includes(config.type as ConnectorType)) {
        errors.push(`Unsupported connector type: ${config.type}`);
        return { valid: false, errors };
    }

    const schema = connectorSchemas[config.type as ConnectorType];
    if (!schema) {
        errors.push(`No schema defined for connector type: ${config.type}`);
        return { valid: false, errors };
    }

    // Check required fields
    if (config.credentials) {
        for (const required of schema.required) {
            if (!config.credentials[required]) {
                errors.push(`Missing required credential: ${required}`);
            }
        }
    } else {
        errors.push('Credentials are required');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Create connector instance from config
 */
export async function createConnector(config: ConnectorConfig): Promise<BaseDataConnector> {
    const validation = validateConnectorConfig(config);
    if (!validation.valid) {
        throw new Error(`Invalid connector config: ${validation.errors.join(', ')}`);
    }

    let connector: BaseDataConnector;

    switch (config.type) {
        case ConnectorType.GOOGLE_SHEETS:
            const { GoogleSheetsConnector } = await import('./GoogleSheetsConnector');
            connector = new GoogleSheetsConnector(config);
            break;

        case ConnectorType.SNOWFLAKE:
            const { SnowflakeConnector } = await import('./SnowflakeConnector');
            connector = new SnowflakeConnector(config);
            break;

        case ConnectorType.BIGQUERY:
            const { BigQueryConnector } = await import('./BigQueryConnector');
            connector = new BigQueryConnector(config);
            break;

        case ConnectorType.POSTGRESQL:
            const { PostgreSQLConnector } = await import('./PostgreSQLConnector');
            connector = new PostgreSQLConnector(config);
            break;

        case ConnectorType.API:
            const { APIConnector } = await import('./APIConnector');
            connector = new APIConnector(config);
            break;

        default:
            throw new Error(`Unsupported connector type: ${config.type}`);
    }

    return connector;
}

/**
 * Connector connection pool
 */
export class ConnectorConnectionPool {
    private maxConnections = 10;
    private activeConnections = new Map<string, BaseDataConnector>();
    private connectionQueue: ((connector: BaseDataConnector) => void)[] = [];

    async getConnection(
        connectorId: string,
        config: ConnectorConfig
    ): Promise<BaseDataConnector> {
        // Check if already connected
        if (this.activeConnections.has(connectorId)) {
            return this.activeConnections.get(connectorId)!;
        }

        // Check pool size
        if (this.activeConnections.size >= this.maxConnections) {
            // Wait for connection to be available
            return new Promise((resolve) => {
                this.connectionQueue.push((connector) => resolve(connector));
            });
        }

        // Create new connection
        const connector = await createConnector(config);
        await connector.connect();
        this.activeConnections.set(connectorId, connector);

        return connector;
    }

    async releaseConnection(connectorId: string): Promise<void> {
        const connector = this.activeConnections.get(connectorId);
        if (connector) {
            if (this.connectionQueue.length > 0) {
                const waiting = this.connectionQueue.shift();
                if (waiting) {
                    waiting(connector);
                }
            } else {
                await connector.close();
                this.activeConnections.delete(connectorId);
            }
        }
    }

    async closeAll(): Promise<void> {
        for (const connector of this.activeConnections.values()) {
            await connector.close();
        }
        this.activeConnections.clear();
    }
}

export const connectionPool = new ConnectorConnectionPool();
