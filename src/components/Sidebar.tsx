"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Plus, X, FileUp, Trash2, Settings, Clock, Database, Info,
    FileText, FileSpreadsheet, File, Loader2, MessageSquare,
    LogOut, Link2, Unlink, FlaskConical, List, Pencil,
    Save, CheckCircle2, AlertCircle, HelpCircle
} from 'lucide-react';
import { DataFile, User, Session, ConnectorSummary } from '../types';

type ConnectorType = 'sheets' | 'sharepoint' | 'snowflake' | 'bigquery' | 'postgres' | 'api';

interface ConnectorCreatePayload {
    name: string;
    type: ConnectorType;
    description?: string;
    credentials: Record<string, any>;
    metadata?: Record<string, any>;
}

interface ConnectorUpdatePayload {
    name?: string;
    description?: string;
    credentials?: Record<string, any>;
    isActive?: boolean;
}

interface ConnectorActionResult {
    success: boolean;
    message: string;
    sources?: any[];
    files?: any[];
}

interface SidebarProps {
    files: DataFile[];
    pendingFiles?: DataFile[];
    activeFileIds: string[];
    connectors?: ConnectorSummary[];
    linkedConnectorIds?: string[];
    isLoadingConnectors?: boolean;
    onRefreshConnectors?: () => void;
    onCreateConnector?: (payload: ConnectorCreatePayload) => Promise<any>;
    onUpdateConnector?: (connectorId: string, payload: ConnectorUpdatePayload) => Promise<any>;
    onDeleteConnector?: (connectorId: string) => Promise<any>;
    onTestConnector?: (connectorId: string) => Promise<ConnectorActionResult>;
    onLoadConnectorSources?: (connectorId: string) => Promise<ConnectorActionResult>;
    onImportConnectorSources?: (connectorId: string, sources: any[]) => Promise<ConnectorActionResult>;
    onToggleLinkedConnector?: (connectorId: string) => void;
    isSidebarOpen: boolean;
    currentUser: User;
    onClose: () => void;
    onClearMessages: () => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onToggleFile: (id: string) => void;
    onInspectFile: (id: string) => void;
    onDeleteFile: (id: string, e: React.MouseEvent) => void;
    onDeletePendingFile?: (id: string) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    sessions: Session[];
    currentSessionId: string | null;
    onSwitchSession: (id: string) => void;
    onDeleteSession: (id: string, e: React.MouseEvent) => void;
    isUploading?: boolean;
    uploadingFileNames?: string[];
    onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    files,
    pendingFiles = [],
    activeFileIds,
    connectors = [],
    linkedConnectorIds = [],
    isSidebarOpen,
    currentUser,
    onClose,
    onClearMessages,
    onFileUpload,
    onToggleFile,
    onInspectFile,
    onDeleteFile,
    onDeletePendingFile,
    fileInputRef,
    sessions,
    currentSessionId,
    onSwitchSession,
    onDeleteSession,
    isUploading = false,
    uploadingFileNames = [],
    isLoadingConnectors = false,
    onRefreshConnectors,
    onCreateConnector,
    onUpdateConnector,
    onDeleteConnector,
    onTestConnector,
    onLoadConnectorSources,
    onImportConnectorSources,
    onToggleLinkedConnector,
    onLogout
}) => {

    const [isConnectorModalOpen, setIsConnectorModalOpen] = useState(false);
    const [connectorSearch, setConnectorSearch] = useState('');
    const [editingConnector, setEditingConnector] = useState<ConnectorSummary | null>(null);
    const [activeConnectorActionId, setActiveConnectorActionId] = useState<string | null>(null);
    const [expandedSourcesConnectorId, setExpandedSourcesConnectorId] = useState<string | null>(null);
    const [sourcesByConnector, setSourcesByConnector] = useState<Record<string, any[]>>({});
    const [selectedSourceIdsByConnector, setSelectedSourceIdsByConnector] = useState<Record<string, string[]>>({});
    const [connectorFeedback, setConnectorFeedback] = useState<{
        kind: 'success' | 'error';
        text: string;
    } | null>(null);
    const [isCredentialHelpOpen, setIsCredentialHelpOpen] = useState(false);
    const [sharepointAuthCode, setSharepointAuthCode] = useState('');
    const [sharepointOAuthState, setSharepointOAuthState] = useState('');
    const [sharepointOAuthUrl, setSharepointOAuthUrl] = useState('');
    const [isSharepointOauthBusy, setIsSharepointOauthBusy] = useState(false);
    const [connectorForm, setConnectorForm] = useState<{
        name: string;
        type: ConnectorType;
        description: string;
        credentialsJson: string;
        isActive: boolean;
    }>({
        name: '',
        type: 'sheets',
        description: '',
        credentialsJson: '{\n  "refreshToken": ""\n}',
        isActive: true,
    });

    const connectorCredentialTemplates: Record<ConnectorType, string> = {
        sheets: '{\n  "refreshToken": "",\n  "spreadsheetId": ""\n}',
        sharepoint: '{\n  "tenantId": "",\n  "clientId": "",\n  "clientSecret": "",\n  "refreshToken": "",\n  "siteId": "",\n  "driveId": ""\n}',
        snowflake: '{\n  "account": "",\n  "username": "",\n  "password": "",\n  "database": "",\n  "schema": "",\n  "warehouse": ""\n}',
        bigquery: '{\n  "projectId": "",\n  "datasetId": "",\n  "serviceAccountKey": "{}"\n}',
        postgres: '{\n  "host": "",\n  "port": 5432,\n  "database": "",\n  "username": "",\n  "password": "",\n  "ssl": false\n}',
        api: '{\n  "baseUrl": "https://api.example.com",\n  "authType": "apikey",\n  "apiKey": ""\n}',
    };

    const connectorCredentialGuides: Record<ConnectorType, { fields: { name: string; description: string }[]; steps: string[] }> = {
        sheets: {
            fields: [
                { name: 'refreshToken', description: 'A long-lived token that lets Mastiff access your Google Sheets without re-authenticating. It is obtained through the Google OAuth 2.0 consent flow.' },
                { name: 'spreadsheetId', description: 'The unique ID of your Google Sheets spreadsheet. You can find it in the spreadsheet URL: https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit. It is the long string of characters between /d/ and /edit. This field is optional — if omitted, Mastiff will list all accessible spreadsheets.' },
            ],
            steps: [
                'Go to the Google Cloud Console (console.cloud.google.com) and create or select a project.',
                'Enable the Google Sheets API and Google Drive API for your project.',
                'Go to "APIs & Services → Credentials" and create an OAuth 2.0 Client ID (Web application type).',
                'Set the redirect URI to your Mastiff instance URL (e.g. http://localhost:3000/api/auth/callback/google).',
                'Use the generated Client ID and Client Secret to complete the OAuth consent flow.',
                'After authorizing, you will receive a refresh token — paste it into the "refreshToken" field above.',
                'To find your Spreadsheet ID, open the Google Sheet and copy the ID from the URL between /d/ and /edit.',
            ],
        },
        sharepoint: {
            fields: [
                { name: 'tenantId', description: 'Azure AD tenant ID (GUID) for your Microsoft 365 organization.' },
                { name: 'clientId', description: 'Application (client) ID from your Azure App Registration used for Graph API access.' },
                { name: 'clientSecret', description: 'Client secret generated for your Azure App Registration.' },
                { name: 'refreshToken', description: 'OAuth refresh token for delegated Graph access to SharePoint resources.' },
                { name: 'siteId', description: 'SharePoint Site ID in Microsoft Graph format used as the root source for document libraries.' },
                { name: 'driveId', description: 'Optional specific document library drive ID. If omitted, all site drives are listed.' },
            ],
            steps: [
                'Create an app registration in Azure Portal and grant Microsoft Graph delegated permissions: Files.Read, Sites.Read.All, offline_access.',
                'Create a client secret and copy tenantId, clientId, and clientSecret from the app registration overview.',
                'Run OAuth consent flow to obtain a refresh token for the SharePoint user context.',
                'Get your Site ID from Graph Explorer (GET /sites/{hostname}:/sites/{site-path}) and paste it as siteId.',
                'Optionally provide driveId to lock Mastiff to one document library; otherwise all available libraries are listed.',
            ],
        },
        snowflake: {
            fields: [
                { name: 'account', description: 'Your Snowflake account identifier, e.g. "xy12345.us-east-1". Found in your Snowflake login URL.' },
                { name: 'username', description: 'Your Snowflake login username.' },
                { name: 'password', description: 'Your Snowflake login password.' },
                { name: 'database', description: 'The name of the Snowflake database to connect to.' },
                { name: 'schema', description: 'The schema within the database (e.g. "PUBLIC").' },
                { name: 'warehouse', description: 'The Snowflake compute warehouse to use for queries (optional).' },
            ],
            steps: [
                'Log in to your Snowflake account at https://app.snowflake.com.',
                'Your account identifier is in the URL: https://{account}.snowflakecomputing.com.',
                'Use your Snowflake username and password for authentication.',
                'Choose a database and schema from the left panel in the Snowflake console.',
            ],
        },
        bigquery: {
            fields: [
                { name: 'projectId', description: 'Your Google Cloud project ID. Found in the Google Cloud Console dashboard.' },
                { name: 'datasetId', description: 'The BigQuery dataset to query (optional). If omitted, all datasets in the project are accessible.' },
                { name: 'serviceAccountKey', description: 'A JSON service account key for authentication. Download it from Google Cloud Console → IAM & Admin → Service Accounts.' },
            ],
            steps: [
                'Go to the Google Cloud Console (console.cloud.google.com) and select your project.',
                'Copy the Project ID from the dashboard.',
                'Go to "IAM & Admin → Service Accounts" and create a service account with BigQuery access.',
                'Create a JSON key for the service account and paste the entire JSON content into the "serviceAccountKey" field.',
            ],
        },
        postgres: {
            fields: [
                { name: 'host', description: 'The hostname or IP address of your PostgreSQL server (e.g. "localhost" or "db.example.com").' },
                { name: 'port', description: 'The port number (default: 5432).' },
                { name: 'database', description: 'The name of the database to connect to.' },
                { name: 'username', description: 'Your PostgreSQL username.' },
                { name: 'password', description: 'Your PostgreSQL password.' },
                { name: 'ssl', description: 'Whether to use SSL for the connection (true/false). Required for most cloud-hosted databases.' },
            ],
            steps: [
                'Get the connection details from your database provider or administrator.',
                'For cloud databases (e.g. AWS RDS, Supabase, Neon), find connection details in the provider dashboard.',
                'Ensure the database allows connections from your Mastiff server IP address.',
            ],
        },
        api: {
            fields: [
                { name: 'baseUrl', description: 'The base URL of the API (e.g. "https://api.example.com/v1").' },
                { name: 'authType', description: 'Authentication method: "apikey", "bearer", or "none" (optional).' },
                { name: 'apiKey', description: 'Your API key, if authType is "apikey" (optional).' },
                { name: 'bearerToken', description: 'Your Bearer token, if authType is "bearer" (optional).' },
            ],
            steps: [
                'Refer to the API documentation for the base URL and authentication method.',
                'Generate an API key or token from the API provider\'s dashboard.',
                'Set "authType" to match the authentication the API expects.',
            ],
        },
    };

    const connectorTypeLabels: Record<string, string> = {
        sheets: 'Google Sheets',
        sharepoint: 'SharePoint',
        snowflake: 'Snowflake',
        bigquery: 'BigQuery',
        postgres: 'Postgres',
        api: 'API',
    };
    const availableConnectorTypes: ConnectorType[] = ['sheets', 'sharepoint', 'snowflake', 'bigquery', 'postgres', 'api'];

    const parseCredentialsSafe = (): Record<string, any> => {
        try {
            const parsed = JSON.parse(connectorForm.credentialsJson || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
            return {};
        } catch {
            return {};
        }
    };

    const getSharepointRedirectUri = useCallback(() => {
        if (typeof window === 'undefined') return '';
        return `${window.location.origin}/connectors/sharepoint/callback`;
    }, []);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (typeof window === 'undefined') return;
            if (event.origin !== window.location.origin) return;

            const payload = event.data;
            if (!payload || payload.type !== 'mastiff:sharepoint-oauth-callback') return;

            if (payload.error) {
                setConnectorFeedback({ kind: 'error', text: `SharePoint OAuth failed: ${payload.error}` });
                return;
            }

            if (sharepointOAuthState && payload.state !== sharepointOAuthState) {
                setConnectorFeedback({
                    kind: 'error',
                    text: 'SharePoint OAuth state mismatch. Please retry authorization.',
                });
                return;
            }

            if (payload.code && typeof payload.code === 'string') {
                setSharepointAuthCode(payload.code);
                setConnectorFeedback({
                    kind: 'success',
                    text: 'Authorization code received from SharePoint callback. Exchanging tokens automatically...',
                });
                handleExchangeSharepointCode(payload.code);
            }
        };

        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [sharepointOAuthState]);

    const handleGenerateSharepointOAuthUrl = async () => {
        try {
            setIsSharepointOauthBusy(true);
            setConnectorFeedback(null);

            const creds = parseCredentialsSafe();
            const tenantId = String(creds.tenantId || '').trim();
            const clientId = String(creds.clientId || '').trim();

            if (!tenantId || !clientId) {
                throw new Error('SharePoint OAuth requires tenantId and clientId in credentials JSON.');
            }

            const state = crypto.randomUUID();
            const redirectUri = getSharepointRedirectUri();
            const url = `/api/connectors/sharepoint/oauth?tenantId=${encodeURIComponent(tenantId)}&clientId=${encodeURIComponent(clientId)}&redirectUri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

            const response = await fetch(url);
            const payload = await response.json();
            if (!response.ok || payload?.success === false || !payload?.authUrl) {
                throw new Error(payload?.error || 'Failed to generate SharePoint OAuth URL');
            }

            setSharepointOAuthState(payload.state || state);
            setSharepointOAuthUrl(payload.authUrl);
            window.open(payload.authUrl, '_blank', 'popup=yes,width=720,height=760');

            setConnectorFeedback({
                kind: 'success',
                text: 'SharePoint auth URL generated and opened. Complete consent; the code will be captured automatically (manual paste still works).',
            });
        } catch (error: any) {
            setConnectorFeedback({ kind: 'error', text: error?.message || 'Failed to start SharePoint OAuth flow.' });
        } finally {
            setIsSharepointOauthBusy(false);
        }
    };

    const handleExchangeSharepointCode = async (codeOverride?: string) => {
        try {
            setIsSharepointOauthBusy(true);
            setConnectorFeedback(null);

            const code = (codeOverride || sharepointAuthCode).trim();
            if (!code) throw new Error('Paste the SharePoint authorization code first.');

            const creds = parseCredentialsSafe();
            const tenantId = String(creds.tenantId || '').trim();
            const clientId = String(creds.clientId || '').trim();
            const clientSecret = String(creds.clientSecret || '').trim();
            const redirectUri = getSharepointRedirectUri();

            if (!tenantId || !clientId || !clientSecret) {
                throw new Error('Exchange requires tenantId, clientId, and clientSecret in credentials JSON.');
            }

            const response = await fetch('/api/connectors/sharepoint/oauth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'exchange',
                    tenantId,
                    clientId,
                    clientSecret,
                    redirectUri,
                    code,
                }),
            });

            const payload = await response.json();
            if (!response.ok || payload?.success === false) {
                throw new Error(payload?.error || 'Failed to exchange SharePoint auth code');
            }

            const updatedCreds = {
                ...creds,
                accessToken: payload.accessToken,
                refreshToken: payload.refreshToken || creds.refreshToken,
                tokenExpiry: payload.expiresIn ? Date.now() + Number(payload.expiresIn) * 1000 : creds.tokenExpiry,
            };

            setConnectorForm((prev) => ({
                ...prev,
                credentialsJson: JSON.stringify(updatedCreds, null, 2),
            }));

            setConnectorFeedback({
                kind: 'success',
                text: 'SharePoint tokens exchanged successfully. Credentials JSON has been updated.',
            });

            if (codeOverride) {
                setSharepointAuthCode(codeOverride);
            }
        } catch (error: any) {
            setConnectorFeedback({ kind: 'error', text: error?.message || 'Failed to exchange SharePoint code.' });
        } finally {
            setIsSharepointOauthBusy(false);
        }
    };

    const resetConnectorForm = (type: ConnectorType = 'sheets') => {
        setConnectorForm({
            name: '',
            type,
            description: '',
            credentialsJson: connectorCredentialTemplates[type],
            isActive: true,
        });
        setSharepointAuthCode('');
        setSharepointOAuthState('');
        setSharepointOAuthUrl('');
    };

    const openCreateConnectorModal = () => {
        setEditingConnector(null);
        resetConnectorForm();
        setConnectorFeedback(null);
        setIsCredentialHelpOpen(false);
        setIsConnectorModalOpen(true);
    };

    const openEditConnectorModal = (connector: ConnectorSummary) => {
        setEditingConnector(connector);
        setConnectorForm({
            name: connector.name,
            type: (availableConnectorTypes.includes(connector.type as ConnectorType)
                ? connector.type
                : 'api') as ConnectorType,
            description: connector.description || '',
            credentialsJson: '',
            isActive: connector.isActive ?? true,
        });
        setConnectorFeedback(null);
        setIsCredentialHelpOpen(false);
        setIsConnectorModalOpen(true);
    };

    const closeConnectorModal = () => {
        setIsConnectorModalOpen(false);
        setEditingConnector(null);
        setIsCredentialHelpOpen(false);
        resetConnectorForm();
    };

    const parseCredentials = (rawJson: string, required: boolean): Record<string, any> | undefined => {
        const trimmed = rawJson.trim();
        if (!trimmed) {
            if (required) throw new Error('Credentials JSON is required.');
            return undefined;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            throw new Error('Credentials must be valid JSON.');
        }

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Credentials must be a JSON object.');
        }

        if (required && Object.keys(parsed).length === 0) {
            throw new Error('Credentials object cannot be empty.');
        }

        return parsed;
    };

    const handleSubmitConnector = async () => {
        try {
            setConnectorFeedback(null);

            if (!connectorForm.name.trim()) {
                throw new Error('Connector name is required.');
            }

            if (editingConnector) {
                if (!onUpdateConnector) return;

                const credentials = parseCredentials(connectorForm.credentialsJson, false);
                await onUpdateConnector(editingConnector.id, {
                    name: connectorForm.name.trim(),
                    description: connectorForm.description.trim(),
                    isActive: connectorForm.isActive,
                    ...(credentials ? { credentials } : {}),
                });

                setConnectorFeedback({ kind: 'success', text: 'Connector updated successfully.' });
            } else {
                if (!onCreateConnector) return;

                const credentials = parseCredentials(connectorForm.credentialsJson, true) || {};
                await onCreateConnector({
                    name: connectorForm.name.trim(),
                    type: connectorForm.type,
                    description: connectorForm.description.trim(),
                    credentials,
                });

                setConnectorFeedback({ kind: 'success', text: 'Connector created successfully.' });
            }

            closeConnectorModal();
        } catch (error: any) {
            setConnectorFeedback({
                kind: 'error',
                text: error?.message || 'Failed to save connector.',
            });
        }
    };

    const handleTestConnector = async (connectorId: string) => {
        if (!onTestConnector) return;

        setActiveConnectorActionId(connectorId);
        setConnectorFeedback(null);
        try {
            const result = await onTestConnector(connectorId);
            setConnectorFeedback({
                kind: result.success ? 'success' : 'error',
                text: result.message,
            });
        } catch (error: any) {
            setConnectorFeedback({
                kind: 'error',
                text: error?.message || 'Connection test failed.',
            });
        } finally {
            setActiveConnectorActionId(null);
        }
    };

    const handleLoadSources = async (connectorId: string) => {
        if (!onLoadConnectorSources) return;

        setActiveConnectorActionId(connectorId);
        setConnectorFeedback(null);
        try {
            const result = await onLoadConnectorSources(connectorId);
            const sources = Array.isArray(result.sources) ? result.sources : [];

            setSourcesByConnector((prev) => ({
                ...prev,
                [connectorId]: sources,
            }));
            setSelectedSourceIdsByConnector((prev) => ({
                ...prev,
                [connectorId]: [],
            }));
            setExpandedSourcesConnectorId((prev) => (prev === connectorId ? null : connectorId));

            setConnectorFeedback({
                kind: result.success ? 'success' : 'error',
                text: result.success
                    ? `Loaded ${sources.length} source${sources.length === 1 ? '' : 's'} for connector.`
                    : result.message,
            });
        } catch (error: any) {
            setConnectorFeedback({
                kind: 'error',
                text: error?.message || 'Failed to load connector sources.',
            });
        } finally {
            setActiveConnectorActionId(null);
        }
    };

    const toggleSourceSelection = (connectorId: string, sourceId: string) => {
        setSelectedSourceIdsByConnector((prev) => {
            const current = prev[connectorId] || [];
            const next = current.includes(sourceId)
                ? current.filter((id) => id !== sourceId)
                : [...current, sourceId];
            return {
                ...prev,
                [connectorId]: next,
            };
        });
    };

    const handleImportSelectedSources = async (connectorId: string) => {
        if (!onImportConnectorSources) return;

        const selectedIds = selectedSourceIdsByConnector[connectorId] || [];
        const allSources = sourcesByConnector[connectorId] || [];
        const selectedSources = allSources.filter((source: any) => selectedIds.includes(String(source?.id || '')));

        if (selectedSources.length === 0) {
            setConnectorFeedback({
                kind: 'error',
                text: 'Select at least one source to import.',
            });
            return;
        }

        setActiveConnectorActionId(connectorId);
        setConnectorFeedback(null);
        try {
            const result = await onImportConnectorSources(connectorId, selectedSources);
            setConnectorFeedback({
                kind: result.success ? 'success' : 'error',
                text: result.message,
            });
        } catch (error: any) {
            setConnectorFeedback({
                kind: 'error',
                text: error?.message || 'Failed to import selected connector sources.',
            });
        } finally {
            setActiveConnectorActionId(null);
        }
    };

    const handleDeleteConnector = async (connectorId: string) => {
        if (!onDeleteConnector) return;
        if (!confirm('Delete this connector?')) return;

        setActiveConnectorActionId(connectorId);
        setConnectorFeedback(null);
        try {
            await onDeleteConnector(connectorId);
            setSourcesByConnector((prev) => {
                const next = { ...prev };
                delete next[connectorId];
                return next;
            });
            if (expandedSourcesConnectorId === connectorId) {
                setExpandedSourcesConnectorId(null);
            }
            setConnectorFeedback({ kind: 'success', text: 'Connector deleted.' });
        } catch (error: any) {
            setConnectorFeedback({
                kind: 'error',
                text: error?.message || 'Failed to delete connector.',
            });
        } finally {
            setActiveConnectorActionId(null);
        }
    };

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'csv': return <FileText size={14} className="text-green-400" />;
            case 'xlsx': case 'xls': return <FileSpreadsheet size={14} className="text-blue-400" />;
            case 'pdf': return <FileText size={14} className="text-red-400" />;
            case 'docx': case 'doc': return <FileText size={14} className="text-blue-300" />;
            default: return <File size={14} className="text-zinc-400" />;
        }
    };

    // Group sessions by date
    const groupedSessions = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86400000;
        const weekAgo = today - 7 * 86400000;

        const groups: { label: string; sessions: Session[] }[] = [
            { label: 'Today', sessions: [] },
            { label: 'Yesterday', sessions: [] },
            { label: 'This Week', sessions: [] },
            { label: 'Older', sessions: [] },
        ];

        sessions.forEach(s => {
            const created = typeof s.createdAt === 'number' ? s.createdAt : new Date(s.createdAt).getTime();
            if (created >= today) groups[0].sessions.push(s);
            else if (created >= yesterday) groups[1].sessions.push(s);
            else if (created >= weekAgo) groups[2].sessions.push(s);
            else groups[3].sessions.push(s);
        });

        return groups.filter(g => g.sessions.length > 0);
    }, [sessions]);

    const uploadedFiles = files.filter(f => f.id !== 'sample-sales');
    const stagedFiles = pendingFiles.filter(f => f.id !== 'sample-sales');
    const connectorsByType = useMemo(() => {
        const counter: Record<string, number> = {
            sheets: 0,
            sharepoint: 0,
            snowflake: 0,
            bigquery: 0,
            postgres: 0,
            api: 0,
        };

        connectors.forEach((connector) => {
            if (connector.type in counter) counter[connector.type] += 1;
        });

        return counter;
    }, [connectors]);
    const filteredConnectors = useMemo(() => {
        const query = connectorSearch.trim().toLowerCase();
        if (!query) {
            return connectors;
        }

        return connectors.filter((connector) => {
            const name = connector.name?.toLowerCase() || '';
            const description = connector.description?.toLowerCase() || '';
            const type = connectorTypeLabels[connector.type]?.toLowerCase() || connector.type?.toLowerCase() || '';

            return name.includes(query) || description.includes(query) || type.includes(query);
        });
    }, [connectorSearch, connectors]);
    const configuredConnectorTypes = availableConnectorTypes.filter((type) => connectorsByType[type] > 0);
    const connectorBrandCards: Array<{ type: ConnectorType; label: string; accent: string; badge: string }> = [
        { type: 'sheets', label: 'Sheets', accent: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/8', badge: 'GS' },
        { type: 'sharepoint', label: 'SharePoint', accent: 'text-sky-300 border-sky-500/20 bg-sky-500/8', badge: 'SP' },
        { type: 'snowflake', label: 'Snowflake', accent: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/8', badge: 'SF' },
        { type: 'bigquery', label: 'BigQuery', accent: 'text-amber-300 border-amber-500/20 bg-amber-500/8', badge: 'BQ' },
        { type: 'postgres', label: 'Postgres', accent: 'text-indigo-300 border-indigo-500/20 bg-indigo-500/8', badge: 'PG' },
        { type: 'api', label: 'API', accent: 'text-rose-300 border-rose-500/20 bg-rose-500/8', badge: 'API' },
    ];
    const uploadStatusLabel = uploadingFileNames.length > 0
        ? `Processing ${uploadingFileNames.length} file${uploadingFileNames.length === 1 ? '' : 's'}`
        : 'Processing file';
    const uploadStatusDetail = uploadingFileNames.length > 0
        ? uploadingFileNames.slice(0, 2).join(', ')
        : 'Schema extraction and profiling in progress';

    return (
        <>
            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={onClose} />
            )}

            <aside className={`fixed md:relative inset-y-0 left-0 w-72 glass flex flex-col z-50 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
                {/* Header */}
                <div className="p-4 flex items-center justify-between border-b border-zinc-900/80 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-gradient-to-br from-[#E50914] to-[#ff4d4d] rounded-xl flex items-center justify-center shadow-lg glow-accent">
                            <span className="text-white text-sm font-black">M</span>
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-white tracking-tight">Mastiff</h1>
                            <p className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest">Data Intelligence</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="md:hidden p-1.5 text-zinc-500 hover:text-white rounded-lg transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* New Session Button */}
                <div className="p-3 shrink-0">
                    <button
                        onClick={onClearMessages}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#E50914] to-[#b20710] text-white font-extrabold text-[10px] uppercase tracking-widest rounded-xl hover:shadow-lg hover:shadow-[#E50914]/20 transition-all active:scale-[0.98]"
                    >
                        <Plus size={14} /> New Chat
                    </button>
                </div>

                {/* File Upload Input (Hidden) */}
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.doc,.txt,.tsv,.parquet"
                    onChange={onFileUpload}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Uploaded Files Section */}
                    <div className="px-3 pb-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-[2px]">
                                Data Sources
                            </p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-1 text-zinc-600 hover:text-[#E50914] transition-colors rounded"
                            >
                                <Plus size={12} />
                            </button>
                        </div>

                        {isUploading && (
                            <div className="p-2.5 glass rounded-xl mb-2 animate-fade-in space-y-2">
                                <div className="flex items-center gap-2">
                                    <Loader2 size={12} className="animate-spin text-[#E50914]" />
                                    <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider">{uploadStatusLabel}</span>
                                </div>
                                <p className="text-[10px] text-zinc-500 leading-tight">{uploadStatusDetail}</p>
                                <div className="h-1 w-full rounded-full bg-zinc-950 overflow-hidden">
                                    <div className="h-full w-2/3 bg-gradient-to-r from-[#E50914] to-[#ff6b6b] animate-shimmer" />
                                </div>
                            </div>
                        )}

                        {stagedFiles.length > 0 && (
                            <div className="mb-2 space-y-1.5">
                                <p className="px-1 text-[8px] font-extrabold text-amber-500 uppercase tracking-[2px]">Pending Review</p>
                                {stagedFiles.map((f) => (
                                    <div
                                        key={f.id}
                                        onClick={() => onInspectFile(f.id)}
                                        className="group flex items-center gap-2.5 p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 cursor-pointer transition-all hover:border-amber-400/40 hover:bg-amber-500/10"
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                                            {getFileIcon(f.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-white truncate">{f.name}</p>
                                            <p className="text-[8px] text-zinc-500 font-medium">
                                                {f.metadata?.row_count?.toLocaleString() || '?'} rows • {f.columns.length} cols
                                            </p>
                                            <p className="text-[8px] font-bold uppercase tracking-wide mt-1 text-amber-400">
                                                Review before activation
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onInspectFile(f.id);
                                            }}
                                            className="p-1 text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                            title="Review schema"
                                        >
                                            <Info size={11} />
                                        </button>
                                        {onDeletePendingFile && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeletePendingFile(f.id);
                                                }}
                                                className="p-1 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                title="Remove pending file"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {uploadedFiles.length > 0 ? (
                            <div className="space-y-1">
                                {uploadedFiles.map(f => (
                                    <div
                                        key={f.id}
                                        className={`group flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all ${activeFileIds.includes(f.id)
                                            ? 'bg-[#E50914]/8 border border-[#E50914]/20'
                                            : 'hover:bg-zinc-900/50'
                                            }`}
                                        onClick={() => onToggleFile(f.id)}
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                                            {getFileIcon(f.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-white truncate">{f.name}</p>
                                            <p className="text-[8px] text-zinc-600 font-medium">
                                                {f.metadata?.row_count?.toLocaleString() || '?'} rows • {f.columns.length} cols
                                            </p>
                                            <p className={`text-[8px] font-bold uppercase tracking-wide mt-1 ${activeFileIds.includes(f.id) ? 'text-[#ff6b6b]' : 'text-zinc-700'}`}>
                                                {activeFileIds.includes(f.id) ? 'Active in chat context' : 'Click to include in chat context'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onInspectFile(f.id);
                                            }}
                                            className="p-1 text-zinc-700 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                            title="Inspect data sample"
                                        >
                                            <Info size={11} />
                                        </button>
                                        <button
                                            onClick={(e) => onDeleteFile(f.id, e)}
                                            className="p-1 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full p-4 border border-dashed border-zinc-800 rounded-xl text-center hover:border-[#E50914]/30 hover:bg-[#E50914]/3 transition-all group"
                            >
                                <FileUp size={16} className="mx-auto text-zinc-700 group-hover:text-[#E50914] mb-1.5 transition-colors" />
                                <p className="text-[9px] font-bold text-zinc-600 group-hover:text-zinc-400 transition-colors">Upload files</p>
                                <p className="mt-1 text-[10px] text-zinc-700 leading-tight">CSV, Excel, PDF, Word, text, JSON, TSV, and Parquet are supported. Multi-sheet or nested files may need cleanup after import.</p>
                            </button>
                        )}
                    </div>

                    {/* Connectors Section */}
                    <div className="px-3 pb-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-[2px]">
                                Connectors
                            </p>
                            <div className="flex items-center gap-1">
                                {onCreateConnector && (
                                    <button
                                        onClick={openCreateConnectorModal}
                                        className="p-1.5 text-zinc-500 hover:text-[#E50914] transition-colors rounded"
                                        title="Add connector"
                                    >
                                        <Plus size={14} />
                                    </button>
                                )}
                                {onRefreshConnectors && (
                                    <button
                                        onClick={onRefreshConnectors}
                                        className="p-1.5 text-zinc-500 hover:text-[#E50914] transition-colors rounded"
                                        title="Refresh connectors"
                                    >
                                        <Database size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {connectorFeedback && (
                            <div
                                className={`flex items-start gap-2 p-2.5 mb-2 rounded-xl border ${connectorFeedback.kind === 'error'
                                        ? 'border-red-900/40 bg-red-950/20'
                                        : 'border-emerald-900/40 bg-emerald-950/20'
                                    }`}
                            >
                                {connectorFeedback.kind === 'error' ? (
                                    <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                                ) : (
                                    <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                )}
                                <p className="text-[11px] font-semibold text-zinc-300 leading-tight">{connectorFeedback.text}</p>
                            </div>
                        )}

                        <div className="mb-2 rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-[2px]">Configured Sources</p>
                                    <p className="text-[10px] text-zinc-600 mt-1">
                                        {connectors.length > 0 ? `${connectors.length} connector${connectors.length === 1 ? '' : 's'} ready` : 'No live sources configured yet. Add one to pull fresh data into this session.'}
                                    </p>
                                </div>
                                {onCreateConnector && (
                                    <button
                                        onClick={openCreateConnectorModal}
                                        className="px-2.5 py-1.5 rounded-lg border border-[#E50914]/30 bg-[#E50914]/10 text-[9px] font-extrabold uppercase tracking-widest text-[#ff6b6b] hover:text-white transition-colors"
                                    >
                                        <span className="inline-flex items-center gap-1.5">
                                            <Plus size={11} />
                                            {connectors.length > 0 ? 'Add Source' : 'Connect Now'}
                                        </span>
                                    </button>
                                )}
                            </div>

                            {configuredConnectorTypes.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {configuredConnectorTypes.map((type) => (
                                        <span
                                            key={type}
                                            className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-black/40 px-2 py-1 text-[9px] font-bold text-zinc-300"
                                        >
                                            <span>{connectorTypeLabels[type]}</span>
                                            <span className="text-zinc-500">{connectorsByType[type]}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mb-2 rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3 py-2">
                            <input
                                value={connectorSearch}
                                onChange={(e) => setConnectorSearch(e.target.value)}
                                placeholder="Search connectors by name or type"
                                className="w-full bg-transparent text-[11px] text-white placeholder:text-zinc-700 outline-none"
                            />
                        </div>

                        {isLoadingConnectors ? (
                            <div className="flex items-center gap-2 p-3 glass rounded-xl animate-fade-in">
                                <Loader2 size={14} className="animate-spin text-[#E50914]" />
                                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Loading connectors...</span>
                            </div>
                        ) : filteredConnectors.length > 0 ? (
                            <div className="space-y-1.5">
                                {filteredConnectors.map((connector) => (
                                    <div
                                        key={connector.id}
                                        className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/60"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className={`w-2 h-2 rounded-full ${connector.isActive ? 'bg-green-400' : 'bg-zinc-600'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-bold text-white truncate">{connector.name}</p>
                                                <p className="text-[10px] text-zinc-500 uppercase tracking-wide truncate">
                                                    {connectorTypeLabels[connector.type] || connector.type}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                                            <button
                                                onClick={() => onToggleLinkedConnector?.(connector.id)}
                                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors flex items-center justify-center gap-1.5 ${linkedConnectorIds.includes(connector.id)
                                                        ? 'border-[#E50914]/40 bg-[#E50914]/10 text-[#ff6b6b]'
                                                        : 'border-zinc-800 text-zinc-500 hover:text-white'
                                                    }`}
                                            >
                                                {linkedConnectorIds.includes(connector.id) ? <Unlink size={12} /> : <Link2 size={12} />}
                                                {linkedConnectorIds.includes(connector.id) ? 'Unlink' : 'Link'}
                                            </button>

                                            <button
                                                onClick={() => handleTestConnector(connector.id)}
                                                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-zinc-800 text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                                                disabled={activeConnectorActionId === connector.id}
                                            >
                                                {activeConnectorActionId === connector.id ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                                                Test
                                            </button>

                                            <button
                                                onClick={() => handleLoadSources(connector.id)}
                                                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-zinc-800 text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                                                disabled={activeConnectorActionId === connector.id}
                                            >
                                                <List size={12} />
                                                Sources
                                            </button>

                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => openEditConnectorModal(connector)}
                                                    className="flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-zinc-800 text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                                                >
                                                    <Pencil size={12} />
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteConnector(connector.id)}
                                                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                                                    disabled={activeConnectorActionId === connector.id}
                                                    title="Delete connector"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        {expandedSourcesConnectorId === connector.id && (
                                            <div className="mt-2.5 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/70 max-h-32 overflow-y-auto custom-scrollbar">
                                                {(sourcesByConnector[connector.id] || []).length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {(sourcesByConnector[connector.id] || []).slice(0, 12).map((source: any, index: number) => {
                                                            const sourceId = String(source?.id || `source-${index}`);
                                                            const isSelected = (selectedSourceIdsByConnector[connector.id] || []).includes(sourceId);
                                                            const isFileLike = source?.type === 'file' || source?.metadata?.itemId;

                                                            return (
                                                                <label key={`${connector.id}-source-${sourceId}`} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${isFileLike ? 'cursor-pointer hover:bg-zinc-900/60' : 'opacity-70'}`}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="accent-[#E50914]"
                                                                        disabled={!isFileLike}
                                                                        checked={isSelected}
                                                                        onChange={() => toggleSourceSelection(connector.id, sourceId)}
                                                                    />
                                                                    <span className="text-[10px] text-zinc-400 truncate">
                                                                        {source?.name || source?.id || source?.tableName || `Source ${index + 1}`}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}

                                                        {connector.type === 'sharepoint' && (
                                                            <button
                                                                onClick={() => handleImportSelectedSources(connector.id)}
                                                                className="w-full mt-1 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider border border-[#E50914]/40 bg-[#E50914]/10 text-[#ff6b6b] hover:text-white transition-colors disabled:opacity-60"
                                                                disabled={activeConnectorActionId === connector.id || (selectedSourceIdsByConnector[connector.id] || []).length === 0}
                                                            >
                                                                Import Selected To Session
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-zinc-600">No sources returned.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : connectors.length > 0 ? (
                            <div className="p-3 rounded-xl border border-dashed border-zinc-800 text-center space-y-1.5">
                                <p className="text-[11px] font-semibold text-zinc-400">No connectors match this search</p>
                                <p className="text-[10px] text-zinc-600">Try a source type like Snowflake, Sheets, or API.</p>
                            </div>
                        ) : (
                            <div className="p-3 rounded-xl border border-dashed border-zinc-800 text-center space-y-2">
                                <p className="text-[11px] font-semibold text-zinc-400">No connectors configured yet</p>
                                <p className="text-[10px] text-zinc-600 leading-tight">Start with a quick connector for live sources, or upload a file first if you want to analyze static data immediately.</p>
                                <div className="grid grid-cols-3 gap-2 pt-1">
                                    {connectorBrandCards.map((card) => (
                                        <button
                                            key={card.type}
                                            onClick={openCreateConnectorModal}
                                            className={`rounded-xl border px-2 py-2 text-left transition-all hover:-translate-y-[1px] ${card.accent}`}
                                        >
                                            <div className="text-[9px] font-black uppercase tracking-widest">{card.badge}</div>
                                            <div className="mt-1 text-[10px] font-bold">{card.label}</div>
                                        </button>
                                    ))}
                                </div>
                                {onCreateConnector && (
                                    <button
                                        onClick={openCreateConnectorModal}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#E50914]/10 border border-[#E50914]/30 text-[10px] font-extrabold uppercase tracking-widest text-[#ff6b6b] hover:text-white transition-colors"
                                    >
                                        <Plus size={12} /> Connect Now
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sessions */}
                    <div className="px-3 pb-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-[2px]">
                                History
                            </p>
                            <Clock size={10} className="text-zinc-700" />
                        </div>

                        <div className="space-y-3">
                            {groupedSessions.map(group => (
                                <div key={group.label}>
                                    <p className="text-[7px] font-bold text-zinc-700 uppercase tracking-wider px-1 mb-1">
                                        {group.label}
                                    </p>
                                    <div className="space-y-0.5">
                                        {group.sessions.map(s => (
                                            <div
                                                key={s.id}
                                                onClick={() => onSwitchSession(s.id)}
                                                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${currentSessionId === s.id
                                                    ? 'bg-[#E50914]/8 border border-[#E50914]/20'
                                                    : 'hover:bg-zinc-900/50'
                                                    }`}
                                            >
                                                <MessageSquare size={12} className={currentSessionId === s.id ? 'text-[#E50914]' : 'text-zinc-700'} />
                                                <span className={`flex-1 text-[10px] font-semibold truncate ${currentSessionId === s.id ? 'text-white' : 'text-zinc-500'}`}>
                                                    {s.title || 'New Chat'}
                                                </span>
                                                <button
                                                    onClick={(e) => onDeleteSession(s.id, e)}
                                                    className="p-0.5 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* User Footer */}
                <div className="p-3 border-t border-zinc-900/80 shrink-0">
                    <div className="flex items-center gap-2.5 p-2 rounded-xl">
                        <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center text-[10px] font-black text-[#E50914]">
                            {currentUser.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-white truncate">{currentUser.name}</p>
                            <p className="text-[8px] text-zinc-600 font-medium truncate">{currentUser.email}</p>
                        </div>
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="min-h-[44px] min-w-[44px] p-3 text-zinc-600 hover:text-red-400 rounded-xl transition-colors flex items-center justify-center"
                                title="Sign out"
                            >
                                <LogOut size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </aside>

            {isConnectorModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg glass rounded-2xl border border-zinc-800 shadow-2xl">
                        <div className="p-4 border-b border-zinc-900/80 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-extrabold text-white tracking-tight">
                                    {editingConnector ? 'Configure Connector' : 'Add Connector'}
                                </h3>
                                <p className="text-[9px] text-zinc-600 mt-1">
                                    {editingConnector
                                        ? 'Update connector settings. Leave credentials blank to keep existing secrets.'
                                        : 'Provide connector details and credentials JSON.'}
                                </p>
                            </div>
                            <button
                                onClick={closeConnectorModal}
                                className="p-1.5 text-zinc-500 hover:text-white rounded-lg transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Name</label>
                                <input
                                    value={connectorForm.name}
                                    onChange={(e) => setConnectorForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-[11px] text-white"
                                    placeholder="Sales Warehouse"
                                />
                            </div>

                            <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Type</label>
                                <select
                                    value={connectorForm.type}
                                    disabled={Boolean(editingConnector)}
                                    onChange={(e) => {
                                        const nextType = e.target.value as ConnectorType;
                                        setSharepointAuthCode('');
                                        setSharepointOAuthState('');
                                        setSharepointOAuthUrl('');
                                        setConnectorForm((prev) => ({
                                            ...prev,
                                            type: nextType,
                                            credentialsJson: editingConnector
                                                ? prev.credentialsJson
                                                : connectorCredentialTemplates[nextType],
                                        }));
                                    }}
                                    className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-[11px] text-white disabled:opacity-60"
                                >
                                    {availableConnectorTypes.map((type) => (
                                        <option key={type} value={type}>
                                            {connectorTypeLabels[type]}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Description</label>
                                <input
                                    value={connectorForm.description}
                                    onChange={(e) => setConnectorForm((prev) => ({ ...prev, description: e.target.value }))}
                                    className="mt-1 w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-[11px] text-white"
                                    placeholder="Finance dashboards and monthly KPI tables"
                                />
                            </div>

                            <div>
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Credentials JSON</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCredentialHelpOpen((prev) => !prev)}
                                        className="text-zinc-600 hover:text-[#E50914] transition-colors"
                                        title="How to get these credentials"
                                    >
                                        <HelpCircle size={12} />
                                    </button>
                                </div>
                                {isCredentialHelpOpen && (
                                    <div className="mt-1.5 mb-2 p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl text-[10px] text-zinc-400 space-y-2">
                                        <p className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
                                            How to get your {connectorTypeLabels[connectorForm.type]} credentials
                                        </p>
                                        <div className="space-y-1.5">
                                            {connectorCredentialGuides[connectorForm.type].fields.map((field) => (
                                                <div key={field.name}>
                                                    <span className="font-mono text-[#E50914]">{field.name}</span>
                                                    <span className="text-zinc-500"> — </span>
                                                    <span>{field.description}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="pt-1 border-t border-zinc-800">
                                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Steps</p>
                                            <ol className="list-decimal list-inside space-y-0.5 text-zinc-500">
                                                {connectorCredentialGuides[connectorForm.type].steps.map((step, i) => (
                                                    <li key={i}>{step}</li>
                                                ))}
                                            </ol>
                                        </div>
                                    </div>
                                )}
                                <textarea
                                    value={connectorForm.credentialsJson}
                                    onChange={(e) => setConnectorForm((prev) => ({ ...prev, credentialsJson: e.target.value }))}
                                    className="mt-1 w-full min-h-36 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] text-zinc-300 font-mono"
                                    placeholder={connectorCredentialTemplates[connectorForm.type]}
                                />

                                {connectorForm.type === 'sharepoint' && (
                                    <div className="mt-2.5 p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-2">
                                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">SharePoint OAuth Helper</p>
                                        <p className="text-[10px] text-zinc-500">
                                            Use this helper to generate the Microsoft consent URL and exchange the returned code into tokens.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={handleGenerateSharepointOAuthUrl}
                                                disabled={isSharepointOauthBusy}
                                                className="px-2.5 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-widest border border-zinc-700 text-zinc-300 hover:text-white disabled:opacity-60"
                                            >
                                                {isSharepointOauthBusy ? 'Working...' : 'Generate Auth URL'}
                                            </button>
                                            {sharepointOAuthUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => window.open(sharepointOAuthUrl, '_blank', 'popup=yes,width=720,height=760')}
                                                    className="px-2.5 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-widest border border-zinc-700 text-zinc-300 hover:text-white"
                                                >
                                                    Open Consent Page
                                                </button>
                                            )}
                                        </div>
                                        {sharepointOAuthState && (
                                            <p className="text-[9px] text-zinc-600 break-all">State: {sharepointOAuthState}</p>
                                        )}
                                        <div className="flex gap-2">
                                            <input
                                                value={sharepointAuthCode}
                                                onChange={(e) => setSharepointAuthCode(e.target.value)}
                                                className="flex-1 px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] text-zinc-200"
                                                placeholder="Paste authorization code here"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleExchangeSharepointCode}
                                                disabled={isSharepointOauthBusy || !sharepointAuthCode.trim()}
                                                className="px-2.5 py-2 rounded-lg text-[9px] font-extrabold uppercase tracking-widest bg-[#E50914] text-white disabled:opacity-60"
                                            >
                                                Exchange Code
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {editingConnector && (
                                <label className="flex items-center gap-2 text-[10px] font-semibold text-zinc-400">
                                    <input
                                        type="checkbox"
                                        checked={connectorForm.isActive}
                                        onChange={(e) => setConnectorForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                                        className="accent-[#E50914]"
                                    />
                                    Connector active
                                </label>
                            )}
                        </div>

                        <div className="p-4 border-t border-zinc-900/80 flex items-center justify-end gap-2">
                            <button
                                onClick={closeConnectorModal}
                                className="px-3 py-2 rounded-xl text-[9px] font-extrabold uppercase tracking-widest text-zinc-500 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitConnector}
                                className="px-3 py-2 rounded-xl text-[9px] font-extrabold uppercase tracking-widest bg-[#E50914] text-white hover:bg-[#ff1a25] flex items-center gap-1.5"
                            >
                                <Save size={11} />
                                {editingConnector ? 'Save Changes' : 'Create Connector'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
