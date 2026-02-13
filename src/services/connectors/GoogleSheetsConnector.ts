/**
 * Google Sheets Connector
 * 
 * Connects to Google Sheets and provides data access
 */

import { BaseDataConnector, ConnectorConfig, QueryResult, DataSource, ColumnSchema } from './BaseConnector';
import { AppError } from '@/src/lib/errors';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * Google Sheets Connector Configuration
 */
interface GoogleSheetsConfig extends ConnectorConfig {
    refreshToken: string;
    accessToken?: string;
    tokenExpiry?: number;
}

/**
 * Google Sheets Connector
 * 
 * Provides access to Google Sheets for data analysis
 */
export class GoogleSheetsConnector extends BaseDataConnector {
    private oauth2Client: OAuth2Client | null = null;
    private sheetsAPI: any = null;
    private driveAPI: any = null;

    constructor(config: GoogleSheetsConfig) {
        super(config);
        this.config = config as GoogleSheetsConfig;
    }

    /**
     * Connect to Google Sheets
     */
    async connect(): Promise<void> {
        try {
            const config = this.config as GoogleSheetsConfig;

            // Initialize OAuth2 client
            this.oauth2Client = new OAuth2Client(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );

            // Set credentials from stored token
            this.oauth2Client.setCredentials({
                refresh_token: config.refreshToken,
                access_token: config.accessToken,
                expiry_date: config.tokenExpiry,
            });

            // Refresh token if needed
            if (!config.accessToken || (config.tokenExpiry && Date.now() >= config.tokenExpiry)) {
                const { credentials } = await this.oauth2Client.refreshAccessToken();
                this.oauth2Client.setCredentials(credentials);
            }

            // Initialize APIs
            this.sheetsAPI = google.sheets({ version: 'v4', auth: this.oauth2Client });
            this.driveAPI = google.drive({ version: 'v3', auth: this.oauth2Client });

            this.status = 'connected';
            this.lastTestedAt = new Date();
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to connect to Google Sheets',
                error
            );
        }
    }

    /**
     * Disconnect from Google Sheets
     */
    async disconnect(): Promise<void> {
        try {
            this.oauth2Client = null;
            this.sheetsAPI = null;
            this.driveAPI = null;
            this.status = 'disconnected';
        } catch (error) {
            throw new AppError(
                'CONNECTOR_ERROR',
                'Failed to disconnect from Google Sheets',
                error
            );
        }
    }

    /**
     * List available sheets (spreadsheets)
     */
    async listSources(): Promise<DataSource[]> {
        try {
            await this.ensureConnected();

            if (!this.driveAPI) {
                throw new AppError('CONNECTION_ERROR', 'Drive API not initialized');
            }

            // List Google Sheets files
            const response = await this.driveAPI.files.list({
                q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
                spaces: 'drive',
                fields: 'files(id, name, modifiedTime)',
                pageSize: 100,
            });

            this.lastUsedAt = new Date();

            return response.data.files?.map((file: any) => ({
                id: file.id,
                name: file.name,
                type: 'spreadsheet',
                metadata: {
                    modifiedTime: file.modifiedTime,
                },
            })) || [];
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to list Google Sheets',
                error
            );
        }
    }

    /**
     * Get sheet schema (column names and types)
     */
    async getSourceSchema(sheetId: string): Promise<ColumnSchema[]> {
        try {
            await this.ensureConnected();

            if (!this.sheetsAPI) {
                throw new AppError('CONNECTION_ERROR', 'Sheets API not initialized');
            }

            // Get metadata including sheet names
            const spreadsheet = await this.sheetsAPI.spreadsheets.get({
                spreadsheetId: sheetId,
            });

            if (!spreadsheet.data.sheets || spreadsheet.data.sheets.length === 0) {
                throw new AppError('DATA_ERROR', 'No sheets found in spreadsheet');
            }

            // Get first sheet
            const sheetName = spreadsheet.data.sheets[0].properties.title;

            // Get data to infer schema
            const data = await this.sheetsAPI.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: `${sheetName}!A1:Z1`,
            });

            const headers = data.data.values?.[0] || [];

            return headers.map((header: string, index: number) => ({
                name: header || `Column${index}`,
                type: 'string', // Google Sheets doesn't have strong typing
                nullable: true,
            }));
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to get sheet schema',
                error
            );
        }
    }

    /**
     * Execute query to fetch sheet data
     */
    async executeQuery(query: string): Promise<QueryResult> {
        try {
            await this.ensureConnected();

            if (!this.sheetsAPI) {
                throw new AppError('CONNECTION_ERROR', 'Sheets API not initialized');
            }

            // Parse query format: "spreadsheetId:sheetName:range"
            const [spreadsheetId, sheetName, range] = query.split(':');

            if (!spreadsheetId || !sheetName) {
                throw new AppError('VALIDATION_ERROR', 'Query format: spreadsheetId:sheetName:range');
            }

            // Fetch data
            const response = await this.sheetsAPI.spreadsheets.values.get({
                spreadsheetId,
                range: range || `${sheetName}!A:Z`,
            });

            const rows = response.data.values || [];
            const headers = rows[0] || [];
            const dataRows = rows.slice(1);

            // Convert to objects
            const data = dataRows.map((row: any[]) => {
                const obj: any = {};
                headers.forEach((header: string, index: number) => {
                    obj[header] = row[index];
                });
                return obj;
            });

            this.lastUsedAt = new Date();

            return {
                columns: headers,
                rows: data,
                rowCount: data.length,
                executionTimeMs: 0,
            };
        } catch (error) {
            throw new AppError(
                'QUERY_ERROR',
                'Failed to execute query on Google Sheets',
                error
            );
        }
    }

    /**
     * Write data to sheet
     */
    async writeData(sheetId: string, data: any[]): Promise<void> {
        try {
            await this.ensureConnected();

            if (!this.sheetsAPI) {
                throw new AppError('CONNECTION_ERROR', 'Sheets API not initialized');
            }

            if (!data || data.length === 0) {
                throw new AppError('VALIDATION_ERROR', 'No data to write');
            }

            // Get spreadsheet info
            const spreadsheet = await this.sheetsAPI.spreadsheets.get({
                spreadsheetId: sheetId,
            });

            const sheetName = spreadsheet.data.sheets[0].properties.title;

            // Prepare values
            const headers = Object.keys(data[0]);
            const values = [
                headers,
                ...data.map((row: any) =>
                    headers.map((header: string) => row[header] || '')
                ),
            ];

            // Append data
            await this.sheetsAPI.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: `${sheetName}!A:Z`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values },
            });

            this.lastUsedAt = new Date();
        } catch (error) {
            throw new AppError(
                'WRITE_ERROR',
                'Failed to write data to Google Sheets',
                error
            );
        }
    }

    /**
     * Get OAuth URL for user authorization
     */
    static getOAuthUrl(state: string): string {
        const oauth2Client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        const scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.readonly',
        ];

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state,
        });
    }

    /**
     * Exchange authorization code for tokens
     */
    static async getTokensFromCode(code: string): Promise<{
        refreshToken: string;
        accessToken: string;
        tokenExpiry: number;
    }> {
        try {
            const oauth2Client = new OAuth2Client(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );

            const { tokens } = await oauth2Client.getToken(code);

            return {
                refreshToken: tokens.refresh_token!,
                accessToken: tokens.access_token!,
                tokenExpiry: tokens.expiry_date || Date.now() + 3600000,
            };
        } catch (error) {
            throw new AppError(
                'AUTH_ERROR',
                'Failed to exchange authorization code',
                error
            );
        }
    }
}

export default GoogleSheetsConnector;
