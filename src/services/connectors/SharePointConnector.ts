/**
 * SharePoint Connector
 *
 * Connects to Microsoft Graph for SharePoint document libraries.
 */

import axios, { AxiosInstance } from 'axios';
import { BaseDataConnector, ConnectorConfig, QueryResult, DataSource, ColumnSchema } from './BaseConnector';
import { AppError } from '@/src/lib/errors';

interface SharePointConfig extends ConnectorConfig {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    siteId: string;
    driveId?: string;
    accessToken?: string;
    tokenExpiry?: number;
}

export class SharePointConnector extends BaseDataConnector {
    private client: AxiosInstance | null = null;
    private accessToken: string | null = null;
    private tokenExpiry: number | null = null;
    private refreshInFlight: Promise<void> | null = null;

    constructor(config: SharePointConfig) {
        super(config);
        this.config = config as SharePointConfig;
    }

    private async refreshAccessToken(): Promise<void> {
        const cfg = this.config as SharePointConfig;
        const tokenUrl = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;

        const body = new URLSearchParams({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: cfg.refreshToken,
            scope: 'https://graph.microsoft.com/.default offline_access',
        });

        const response = await axios.post(tokenUrl, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000,
        });

        const token = response.data?.access_token;
        if (!token) {
            throw new AppError('AUTH_ERROR', 'SharePoint token refresh did not return an access token');
        }

        this.accessToken = token;
        this.tokenExpiry = Date.now() + ((response.data?.expires_in || 3600) * 1000);
    }

    private async ensureToken(): Promise<string> {
        const cfg = this.config as SharePointConfig;
        const hasValidCached = this.accessToken && this.tokenExpiry && Date.now() < (this.tokenExpiry - 60_000);

        if (!hasValidCached) {
            if (cfg.accessToken && cfg.tokenExpiry && Date.now() < (cfg.tokenExpiry - 60_000)) {
                this.accessToken = cfg.accessToken;
                this.tokenExpiry = cfg.tokenExpiry;
            } else {
                // Prevent concurrent refresh races across parallel requests.
                if (!this.refreshInFlight) {
                    this.refreshInFlight = this.refreshAccessToken()
                        .finally(() => {
                            this.refreshInFlight = null;
                        });
                }
                await this.refreshInFlight;
            }
        }

        return this.accessToken as string;
    }

    async connect(): Promise<void> {
        try {
            const token = await this.ensureToken();
            this.client = axios.create({
                baseURL: 'https://graph.microsoft.com/v1.0',
                headers: { Authorization: `Bearer ${token}` },
                timeout: 30000,
            });

            const cfg = this.config as SharePointConfig;
            await this.client.get(`/sites/${cfg.siteId}`);

            this.status = 'connected';
            this.lastTestedAt = new Date();
        } catch (error) {
            throw new AppError('CONNECTOR_ERROR', 'Failed to connect to SharePoint', error);
        }
    }

    async disconnect(): Promise<void> {
        this.client = null;
        this.status = 'disconnected';
    }

    async listSources(): Promise<DataSource[]> {
        try {
            await this.ensureConnected();
            if (!this.client) throw new AppError('CONNECTION_ERROR', 'SharePoint client not initialized');

            const cfg = this.config as SharePointConfig;
            const drivesResponse = cfg.driveId
                ? { data: { value: [{ id: cfg.driveId, name: 'Configured Drive' }] } }
                : await this.client.get(`/sites/${cfg.siteId}/drives`);

            const drives = drivesResponse.data?.value || [];
            const sources: DataSource[] = [];

            for (const drive of drives.slice(0, 20)) {
                sources.push({
                    id: drive.id,
                    name: drive.name || drive.id,
                    type: 'document_library',
                    metadata: { driveId: drive.id },
                });

                try {
                    const children = await this.client.get(`/drives/${drive.id}/root/children?$top=50`);
                    const items = children.data?.value || [];
                    for (const item of items) {
                        if (!item?.id) continue;
                        sources.push({
                            id: `${drive.id}:${item.id}`,
                            name: item.name || item.id,
                            type: item.folder ? 'folder' : 'file',
                            metadata: {
                                driveId: drive.id,
                                itemId: item.id,
                                webUrl: item.webUrl,
                                mimeType: item.file?.mimeType,
                            },
                        });
                    }
                } catch {
                    // Best-effort listing per drive
                }
            }

            this.lastUsedAt = new Date();
            return sources;
        } catch (error) {
            throw new AppError('QUERY_ERROR', 'Failed to list SharePoint sources', error);
        }
    }

    async getSourceSchema(_sourceName: string): Promise<ColumnSchema[]> {
        return [
            { name: 'id', type: 'string', nullable: false },
            { name: 'name', type: 'string', nullable: false },
            { name: 'type', type: 'string', nullable: false },
            { name: 'webUrl', type: 'string', nullable: true },
        ];
    }

    async executeQuery(query: string): Promise<QueryResult> {
        try {
            await this.ensureConnected();
            if (!this.client) throw new AppError('CONNECTION_ERROR', 'SharePoint client not initialized');

            const endpoint = query.startsWith('/') ? query : `/${query}`;
            const startedAt = Date.now();
            const response = await this.client.get(endpoint);
            const executionTimeMs = Date.now() - startedAt;

            const payload = response.data;
            const rows = Array.isArray(payload?.value) ? payload.value : [payload];
            const columns = rows.length > 0 && rows[0] && typeof rows[0] === 'object'
                ? Object.keys(rows[0])
                : ['value'];

            this.lastUsedAt = new Date();
            return {
                rows,
                columns,
                rowCount: rows.length,
                executionTimeMs,
            };
        } catch (error) {
            throw new AppError('QUERY_ERROR', 'Failed to execute SharePoint query', error);
        }
    }

    async writeData(): Promise<void> {
        throw new AppError('WRITE_ERROR', 'SharePoint write operations are not supported in this connector');
    }
}
