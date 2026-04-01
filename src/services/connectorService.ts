import { encryptData, decryptData } from '@/lib/encryption';
import { db } from '@/db';

/**
 * Base Connector Interface
 * All data connectors implement this interface
 */
export interface DataConnector {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<{ success: boolean; message?: string; error?: string }>;

  // Schema discovery
  getSchemas(): Promise<string[]>;
  getSchema(name: string): Promise<Column[]>;

  // Data retrieval
  query(sql: string, params?: any[]): Promise<any[]>;
  getPreview(sourceName: string, limit?: number): Promise<any[]>;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
}

/**
 * Connector Factory
 * Creates appropriate connector based on type
 */
export class ConnectorFactory {
  static createConnector(type: string, config: any): DataConnector {
    switch (type.toLowerCase()) {
      case 'postgresql':
        return new PostgreSQLConnector(config);
      case 'snowflake':
        return new SnowflakeConnector(config);
      case 'google_sheets':
        return new GoogleSheetsConnector(config);
      case 'sharepoint':
        return new SharePointConnector(config);
      case 'bigquery':
        return new BigQueryConnector(config);
      default:
        throw new Error(`Unknown connector type: ${type}`);
    }
  }
}

/**
 * PostgreSQL Connector
 */
export class PostgreSQLConnector implements DataConnector {
  private config: any;
  private connection: any;

  constructor(config: any) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const { Pool } = require('pg');
    this.connection = new Pool({
      host: this.config.host,
      port: this.config.port || 5432,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl !== false,
    });

    await this.connection.query('SELECT 1');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
    }
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.connect();
      await this.disconnect();
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getSchemas(): Promise<string[]> {
    const result = await this.connection.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    return result.rows.map((r: any) => r.table_name);
  }

  async getSchema(name: string): Promise<Column[]> {
    const result = await this.connection.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [name]);

    return result.rows.map((r: any) => ({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
    }));
  }

  async query(sql: string, params?: any[]): Promise<any[]> {
    const result = await this.connection.query(sql, params);
    return result.rows;
  }

  async getPreview(sourceName: string, limit: number = 10): Promise<any[]> {
    return this.query(`SELECT * FROM ${sourceName} LIMIT $1`, [limit]);
  }
}

/**
 * Snowflake Connector
 */
export class SnowflakeConnector implements DataConnector {
  private config: any;
  private connection: any;

  constructor(config: any) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const snowflake = require('snowflake-sdk');
    this.connection = snowflake.createConnection({
      account: this.config.account,
      user: this.config.username,
      password: this.config.password,
      warehouse: this.config.warehouse,
      database: this.config.database,
      schema: this.config.schema,
    });

    return new Promise((resolve, reject) => {
      this.connection.connect((err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.connection) {
        this.connection.destroy(() => resolve());
      } else {
        resolve();
      }
    });
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.connect();
      await this.disconnect();
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getSchemas(): Promise<string[]> {
    // Return tables in current schema
    const result = await this.query(`SHOW TABLES`);
    return result.map((r: any) => r.name);
  }

  async getSchema(name: string): Promise<Column[]> {
    const result = await this.query(`DESC TABLE ${name}`);
    return result.map((r: any) => ({
      name: r.name,
      type: r.type,
      nullable: r.null?.toUpperCase() === 'Y',
    }));
  }

  async query(sql: string, params?: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.connection.execute(
        {
          sqlText: sql,
          binds: params,
          complete: (err: Error | null, stmt: any, rows: any[]) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows || []);
            }
          },
        }
      );
    });
  }

  async getPreview(sourceName: string, limit: number = 10): Promise<any[]> {
    return this.query(`SELECT * FROM ${sourceName} LIMIT ${limit}`);
  }
}

/**
 * Google Sheets Connector
 */
export class GoogleSheetsConnector implements DataConnector {
  private config: any;
  private sheets: any;

  constructor(config: any) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const { google } = require('googleapis');
    const auth = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUrl
    );

    auth.setCredentials({ access_token: this.config.accessToken });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async disconnect(): Promise<void> {
    // No-op for sheets
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.connect();
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getSchemas(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId: this.config.spreadsheetId,
    });
    return response.data.sheets.map((s: any) => s.properties.title);
  }

  async getSchema(name: string): Promise<Column[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.config.spreadsheetId,
      range: `${name}!1:1`,
    });

    const headers = response.data.values?.[0] || [];
    return headers.map((h: string) => ({
      name: h,
      type: 'string',
      nullable: true,
    }));
  }

  async query(): Promise<any[]> {
    throw new Error('Direct SQL not supported for Google Sheets');
  }

  async getPreview(sheetName: string, limit: number = 10): Promise<any[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.config.spreadsheetId,
      range: `${sheetName}!1:${limit + 1}`,
    });

    const rows = response.data.values || [];
    const headers = rows[0] || [];

    return rows.slice(1).map((row: any[]) => {
      const obj: any = {};
      headers.forEach((header: string, idx: number) => {
        obj[header] = row[idx];
      });
      return obj;
    });
  }
}

/**
 * BigQuery Connector
 */
export class BigQueryConnector implements DataConnector {
  private config: any;
  private client: any;

  constructor(config: any) {
    this.config = config;
  }

  async connect(): Promise<void> {
    const { BigQuery } = require('@google-cloud/bigquery');
    this.client = new BigQuery({
      projectId: this.config.projectId,
      credentials: this.config.credentials,
    });
  }

  async disconnect(): Promise<void> {
    // No-op
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.connect();
      // Simple query to test
      await this.client.query({ query: 'SELECT 1' });
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getSchemas(): Promise<string[]> {
    const datasets = await this.client.getDatasets();
    return datasets[0].map((d: any) => d.id);
  }

  async getSchema(datasetId: string): Promise<Column[]> {
    const dataset = this.client.dataset(datasetId);
    const tables = await dataset.getTables();
    return tables[0].map((t: any) => ({
      name: t.id,
      type: 'table',
      nullable: false,
    }));
  }

  async query(sql: string, params?: any[]): Promise<any[]> {
    const options = {
      query: sql,
      useLegacySql: false,
    };

    const [job] = await this.client.createQueryJob(options);
    return await job.getQueryResults();
  }

  async getPreview(tableName: string, limit: number = 10): Promise<any[]> {
    const sql = `SELECT * FROM ${this.config.datasetId}.${tableName} LIMIT ${limit}`;
    return this.query(sql);
  }
}

/**
 * SharePoint Connector (legacy adapter)
 */
export class SharePointConnector implements DataConnector {
  private config: any;
  private client: any;
  private token: string | null = null;

  constructor(config: any) {
    this.config = config;
  }

  private async ensureToken() {
    if (this.token) return this.token;

    const axios = require('axios');
    const tenantId = this.config.tenantId;
    const clientId = this.config.clientId;
    const clientSecret = this.config.clientSecret;
    const refreshToken = this.config.refreshToken;

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://graph.microsoft.com/.default offline_access',
    }).toString();

    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    });

    this.token = response?.data?.access_token;
    if (!this.token) throw new Error('Failed to obtain SharePoint access token');
    return this.token;
  }

  async connect(): Promise<void> {
    const axios = require('axios');
    const token = await this.ensureToken();
    this.client = axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0',
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });
    await this.client.get(`/sites/${this.config.siteId}`);
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }

  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.connect();
      await this.disconnect();
      return { success: true, message: 'Connection successful' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getSchemas(): Promise<string[]> {
    const drives = await this.client.get(`/sites/${this.config.siteId}/drives`);
    return (drives?.data?.value || []).map((d: any) => d.name || d.id);
  }

  async getSchema(_name: string): Promise<Column[]> {
    return [
      { name: 'id', type: 'string', nullable: false },
      { name: 'name', type: 'string', nullable: false },
      { name: 'webUrl', type: 'string', nullable: true },
    ];
  }

  async query(sql: string): Promise<any[]> {
    const endpoint = sql.startsWith('/') ? sql : `/${sql}`;
    const result = await this.client.get(endpoint);
    return Array.isArray(result?.data?.value) ? result.data.value : [result.data];
  }

  async getPreview(sourceName: string, limit: number = 10): Promise<any[]> {
    const drives = await this.client.get(`/sites/${this.config.siteId}/drives`);
    const drive = (drives?.data?.value || []).find((d: any) => d.name === sourceName) || (drives?.data?.value || [])[0];
    if (!drive?.id) return [];

    const children = await this.client.get(`/drives/${drive.id}/root/children?$top=${Math.max(1, Math.min(limit, 100))}`);
    return children?.data?.value || [];
  }
}

/**
 * Connector Service
 * Manages connector lifecycle and operations
 */
export class ConnectorService {
  static async testConnector(config: any): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const connector = ConnectorFactory.createConnector(config.type, config);
      await connector.connect();
      const result = await connector.testConnection();
      await connector.disconnect();
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  static async getConnectorSchemas(config: any): Promise<string[]> {
    try {
      const connector = ConnectorFactory.createConnector(config.type, config);
      await connector.connect();
      const schemas = await connector.getSchemas();
      await connector.disconnect();
      return schemas;
    } catch (error) {
      console.error('Failed to get schemas:', error);
      return [];
    }
  }

  static async getTableSchema(config: any, tableName: string): Promise<Column[]> {
    try {
      const connector = ConnectorFactory.createConnector(config.type, config);
      await connector.connect();
      const schema = await connector.getSchema(tableName);
      await connector.disconnect();
      return schema;
    } catch (error) {
      console.error('Failed to get table schema:', error);
      return [];
    }
  }

  static async getPreview(config: any, sourceName: string, limit?: number): Promise<any[]> {
    try {
      const connector = ConnectorFactory.createConnector(config.type, config);
      await connector.connect();
      const preview = await connector.getPreview(sourceName, limit);
      await connector.disconnect();
      return preview;
    } catch (error) {
      console.error('Failed to get preview:', error);
      return [];
    }
  }

  static async executeQuery(config: any, sql: string, params?: any[]): Promise<any[]> {
    try {
      const connector = ConnectorFactory.createConnector(config.type, config);
      await connector.connect();
      const results = await connector.query(sql, params);
      await connector.disconnect();
      return results;
    } catch (error) {
      console.error('Failed to execute query:', error);
      return [];
    }
  }
}
