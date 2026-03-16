/**
 * Base Data Connector Framework
 *
 * Abstract base class for all data connectors (Sheets, Snowflake, BigQuery, etc.)
 */

export interface ConnectorConfig {
    id?: string;
    name?: string;
    type: string;
    description?: string;
    credentials?: Record<string, any>;
    metadata?: Record<string, any>;
    [key: string]: any;
}

export interface ColumnSchema {
    name: string;
    type: string;
    nullable: boolean;
}

export interface QueryResult {
    rows: any[];
    columns: string[];
    rowCount: number;
    executionTimeMs: number;
}

export interface DataSource {
    id: string;
    name: string;
    type: string;
    description?: string;
    metadata?: any;
    schema?: any;
}

export interface ConnectorError {
    code: string;
    message: string;
    details?: Record<string, any>;
}

export abstract class BaseDataConnector {
    protected config: ConnectorConfig;
    protected status: 'connected' | 'disconnected' | 'error' = 'disconnected';
    protected lastActivity: Date | null = null;
    protected lastTestedAt: Date | null = null;
    protected lastUsedAt: Date | null = null;

    constructor(config: ConnectorConfig) {
        this.config = config;
    }

    getType(): string {
        return this.config.type;
    }

    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;

    async testConnection(): Promise<boolean> {
        try {
            await this.connect();
            return true;
        } catch {
            return false;
        } finally {
            try {
                await this.disconnect();
            } catch {
                // no-op
            }
        }
    }

    abstract listSources(): Promise<DataSource[]>;
    abstract getSourceSchema(sourceName: string): Promise<any>;
    abstract executeQuery(query: string, params?: Record<string, any>): Promise<QueryResult>;
    abstract writeData(
        targetName: string,
        data: any[],
        mode?: 'append' | 'replace' | 'upsert'
    ): Promise<void>;

    async close(): Promise<void> {
        await this.disconnect();
    }

    getStatus(): {
        connected: boolean;
        status: 'connected' | 'disconnected' | 'error';
        lastActivity: Date | null;
        lastTestedAt: Date | null;
        lastUsedAt: Date | null;
    } {
        return {
            connected: this.status === 'connected',
            status: this.status,
            lastActivity: this.lastActivity,
            lastTestedAt: this.lastTestedAt,
            lastUsedAt: this.lastUsedAt,
        };
    }

    protected updateActivity(): void {
        this.lastActivity = new Date();
    }

    protected async validateCredentials(): Promise<boolean> {
        return true;
    }

    async ensureConnected(): Promise<void> {
        if (this.status !== 'connected') {
            await this.connect();
        }
    }
}

export class ConnectorManager {
    private connectors: Map<string, BaseDataConnector> = new Map();

    registerConnector(id: string, connector: BaseDataConnector): void {
        this.connectors.set(id, connector);
    }

    getConnector(id: string): BaseDataConnector | undefined {
        return this.connectors.get(id);
    }

    listConnectors(): string[] {
        return Array.from(this.connectors.keys());
    }

    async removeConnector(id: string): Promise<void> {
        const connector = this.connectors.get(id);
        if (connector) {
            await connector.close();
            this.connectors.delete(id);
        }
    }

    async closeAll(): Promise<void> {
        for (const connector of this.connectors.values()) {
            await connector.close();
        }
        this.connectors.clear();
    }
}

export const connectorManager = new ConnectorManager();
