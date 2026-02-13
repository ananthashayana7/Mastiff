/**
 * Base Data Connector Framework
 * 
 * Abstract base class for all data connectors (Sheets, Snowflake, BigQuery, etc.)
 */

export interface ConnectorConfig {
    id: string;
    name: string;
    type: string; // 'sheets', 'snowflake', 'bigquery', 'postgres', 'api'
    description?: string;
    credentials?: Record<string, any>;
    metadata?: Record<string, any>;
}

export interface QueryResult {
    rows: any[];
    columns: string[];
    rowCount: number;
    executionTime: number; // ms
}

export interface DataSource {
    id: string;
    name: string;
    type: string;
    description?: string;
    schema?: any;
}

export interface ConnectorError {
    code: string;
    message: string;
    details?: Record<string, any>;
}

/**
 * Abstract base class for data connectors
 */
export abstract class BaseDataConnector {
    protected config: ConnectorConfig;
    protected connected = false;

    constructor(config: ConnectorConfig) {
        this.config = config;
    }

    /**
     * Get connector type
     */
    abstract getType(): string;

    /**
     * Connect to data source
     */
    abstract connect(): Promise<void>;

    /**
     * Disconnect from data source
     */
    abstract disconnect(): Promise<void>;

    /**
     * Test connection
     */
    abstract testConnection(): Promise<boolean>;

    /**
     * List available data sources/tables
     */
    abstract listSources(): Promise<DataSource[]>;

    /**
     * Get schema for a source
     */
    abstract getSourceSchema(sourceName: string): Promise<any>;

    /**
     * Execute a query
     */
    abstract executeQuery(query: string, params?: Record<string, any>): Promise<QueryResult>;

    /**
     * Write data back to source
     */
    abstract writeData(
        targetName: string,
        data: any[],
        mode: 'append' | 'replace' | 'upsert'
    ): Promise<{ rowsWritten: number }>;

    /**
     * Close connection
     */
    abstract close(): Promise<void>;

    /**
     * Get connection status
     */
    getStatus(): { connected: boolean; lastActivity: Date | null } {
        return {
            connected: this.connected,
            lastActivity: this.lastActivity || null,
        };
    }

    protected lastActivity: Date | null = null;

    /**
     * Update last activity timestamp
     */
    protected updateActivity(): void {
        this.lastActivity = new Date();
    }

    /**
     * Validate connector credentials
     */
    protected abstract validateCredentials(): Promise<boolean>;

    /**
     * Refresh connection if needed
     */
    async ensureConnected(): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }
    }
}

/**
 * Connector Manager - handles connector lifecycle
 */
export class ConnectorManager {
    private connectors: Map<string, BaseDataConnector> = new Map();

    /**
     * Register a connector
     */
    registerConnector(id: string, connector: BaseDataConnector): void {
        this.connectors.set(id, connector);
    }

    /**
     * Get connector by ID
     */
    getConnector(id: string): BaseDataConnector | undefined {
        return this.connectors.get(id);
    }

    /**
     * List all registered connectors
     */
    listConnectors(): string[] {
        return Array.from(this.connectors.keys());
    }

    /**
     * Remove connector
     */
    async removeConnector(id: string): Promise<void> {
        const connector = this.connectors.get(id);
        if (connector) {
            await connector.close();
            this.connectors.delete(id);
        }
    }

    /**
     * Close all connectors
     */
    async closeAll(): Promise<void> {
        for (const connector of this.connectors.values()) {
            await connector.close();
        }
        this.connectors.clear();
    }
}

export const connectorManager = new ConnectorManager();
