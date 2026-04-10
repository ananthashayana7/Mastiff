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
    SHAREPOINT = 'sharepoint',
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
        required: ['refreshToken'],
        optional: ['accessToken', 'tokenExpiry', 'spreadsheetId', 'clientId', 'clientSecret'],
    },
    [ConnectorType.SHAREPOINT]: {
        required: ['tenantId', 'clientId', 'clientSecret', 'refreshToken'],
        optional: ['accessToken', 'tokenExpiry', 'driveId', 'siteId', 'siteUrl'],
    },
    [ConnectorType.SNOWFLAKE]: {
        required: ['account', 'username', 'password', 'database', 'schema'],
        optional: ['warehouse', 'role'],
    },
    [ConnectorType.BIGQUERY]: {
        required: ['projectId'],
        optional: ['keyFilePath', 'credentials', 'serviceAccountKey', 'datasetId'],
    },
    [ConnectorType.POSTGRESQL]: {
        required: ['host', 'port', 'database', 'username', 'password'],
        optional: ['ssl', 'connectionTimeout'],
    },
    [ConnectorType.API]: {
        required: ['baseUrl'],
        optional: ['authType', 'apiKey', 'bearerToken', 'headers'],
    },
};

function normalizeRuntimeConfig(config: ConnectorConfig): ConnectorConfig {
    const credentials = config.credentials || {};
    const normalized: ConnectorConfig = {
        ...config,
        ...credentials,
    };

    // Common key aliases
    if (!normalized.username && credentials.user) {
        normalized.username = credentials.user;
    }
    if (!normalized.user && credentials.username) {
        normalized.user = credentials.username;
    }
    if (!normalized.baseUrl && credentials.url) {
        normalized.baseUrl = credentials.url;
    }
    if (!normalized.siteUrl) {
        normalized.siteUrl = credentials.siteUrl
            || credentials.sharepointUrl
            || credentials.sharePointUrl
            || credentials.site_url
            || (typeof normalized.baseUrl === 'string' && /\.sharepoint\.com/i.test(normalized.baseUrl) ? normalized.baseUrl : undefined);
    }
    if (!normalized.refreshToken && credentials.refresh_token) {
        normalized.refreshToken = credentials.refresh_token;
    }

    // BigQuery service account JSON string support
    if (!normalized.credentials && typeof credentials.serviceAccountKey === 'string') {
        try {
            normalized.credentials = JSON.parse(credentials.serviceAccountKey);
        } catch {
            // Ignore parse failure; validation will catch missing usable credentials.
        }
    }

    return normalized;
}

/**
 * Validate connector configuration
 */
export function validateConnectorConfig(
    config: ConnectorConfig
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Object.values(ConnectorType).includes(config.type as ConnectorType)) {
        errors.push(`Unsupported connector type: ${config.type}`);
        return { valid: false, errors };
    }

    const schema = connectorSchemas[config.type as ConnectorType];
    if (!schema) {
        errors.push(`No schema defined for connector type: ${config.type}`);
        return { valid: false, errors };
    }

    const runtimeConfig = normalizeRuntimeConfig(config);
    for (const required of schema.required) {
        if (!runtimeConfig[required]) {
            errors.push(`Missing required field: ${required}`);
        }
    }

    if (runtimeConfig.type === ConnectorType.SHAREPOINT && !runtimeConfig.siteId && !runtimeConfig.siteUrl) {
        errors.push('Missing required field: siteId or siteUrl');
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
    const runtimeConfig = normalizeRuntimeConfig(config);
    const validation = validateConnectorConfig(runtimeConfig);
    if (!validation.valid) {
        throw new Error(`Invalid connector config: ${validation.errors.join(', ')}`);
    }

    let connector: BaseDataConnector;

    switch (runtimeConfig.type) {
        case ConnectorType.GOOGLE_SHEETS: {
            const { GoogleSheetsConnector } = await import('./GoogleSheetsConnector');
            connector = new GoogleSheetsConnector(runtimeConfig as any);
            break;
        }
        case ConnectorType.SHAREPOINT: {
            const { SharePointConnector } = await import('./SharePointConnector');
            connector = new SharePointConnector(runtimeConfig as any);
            break;
        }
        case ConnectorType.SNOWFLAKE: {
            const { SnowflakeConnector } = await import('./SnowflakeConnector');
            connector = new SnowflakeConnector(runtimeConfig as any);
            break;
        }
        case ConnectorType.BIGQUERY: {
            const { BigQueryConnector } = await import('./BigQueryConnector');
            connector = new BigQueryConnector(runtimeConfig as any);
            break;
        }
        case ConnectorType.POSTGRESQL: {
            const { PostgreSQLConnector } = await import('./PostgreSQLConnector');
            connector = new PostgreSQLConnector(runtimeConfig as any);
            break;
        }
        case ConnectorType.API: {
            const { APIConnector } = await import('./APIConnector');
            connector = new APIConnector(runtimeConfig as any);
            break;
        }
        default:
            throw new Error(`Unsupported connector type: ${runtimeConfig.type}`);
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
        if (this.activeConnections.has(connectorId)) {
            return this.activeConnections.get(connectorId)!;
        }

        if (this.activeConnections.size >= this.maxConnections) {
            return new Promise((resolve) => {
                this.connectionQueue.push((connector) => resolve(connector));
            });
        }

        const connector = await createConnector(config);
        await connector.connect();
        this.activeConnections.set(connectorId, connector);

        return connector;
    }

    async releaseConnection(connectorId: string): Promise<void> {
        const connector = this.activeConnections.get(connectorId);
        if (!connector) return;

        if (this.connectionQueue.length > 0) {
            const waiting = this.connectionQueue.shift();
            if (waiting) waiting(connector);
            return;
        }

        await connector.close();
        this.activeConnections.delete(connectorId);
    }

    async closeAll(): Promise<void> {
        for (const connector of this.activeConnections.values()) {
            await connector.close();
        }
        this.activeConnections.clear();
    }
}

export const connectionPool = new ConnectorConnectionPool();
