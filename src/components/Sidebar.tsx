"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Plus, X, FileArrowUp, Trash, GearSix, Clock, Database, Info,
    FileText, FileXls, File, SpinnerGap, ChatTeardropText,
    SignOut, Link, LinkBreak, Flask, List, PencilSimple,
    FloppyDisk, CheckCircle, WarningCircle, Question
} from '@phosphor-icons/react';
import { DataFile, User, Session, ConnectorSummary } from '../types';
import { BrandLockup } from './BrandMark';

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
        sharepoint: '{\n  "tenantId": "",\n  "clientId": "",\n  "clientSecret": "",\n  "refreshToken": "",\n  "siteUrl": "https://prettlcloud.sharepoint.com/sites/example-site",\n  "siteId": "",\n  "driveId": ""\n}',
        snowflake: '{\n  "account": "",\n  "username": "",\n  "password": "",\n  "database": "",\n  "schema": "",\n  "warehouse": ""\n}',
        bigquery: '{\n  "projectId": "",\n  "datasetId": "",\n  "serviceAccountKey": "{}"\n}',
        postgres: '{\n  "host": "",\n  "port": 5432,\n  "database": "",\n  "username": "",\n  "password": "",\n  "ssl": false\n}',
        api: '{\n  "baseUrl": "https://api.example.com",\n  "authType": "apikey",\n  "apiKey": ""\n}',
    };

    const connectorCredentialGuides: Record<ConnectorType, { fields: { name: string; description: string }[]; steps: string[] }> = {
        sheets: {
            fields: [
                { name: 'refreshToken', description: 'A long-lived token that lets SPARTA access your Google Sheets without re-authenticating. It is obtained through the Google OAuth 2.0 consent flow.' },
                { name: 'spreadsheetId', description: 'The unique ID of your Google Sheets spreadsheet. You can find it in the spreadsheet URL: https://docs.google.com/spreadsheets/d/{spreadsheetId}/edit. It is the long string of characters between /d/ and /edit. This field is optional — if omitted, SPARTA will list all accessible spreadsheets.' },
            ],
            steps: [
                'Go to the Google Cloud Console (console.cloud.google.com) and create or select a project.',
                'Enable the Google Sheets API and Google Drive API for your project.',
                'Go to "APIs & Services → Credentials" and create an OAuth 2.0 Client ID (Web application type).',
                'Set the redirect URI to your SPARTA instance URL (e.g. http://localhost:3000/api/auth/callback/google).',
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
                { name: 'siteUrl', description: 'Preferred input. Paste the SharePoint site URL or tenant root, for example https://prettlcloud.sharepoint.com/sites/finance or https://prettlcloud.sharepoint.com/. SPARTA will resolve the Graph site automatically.' },
                { name: 'siteId', description: 'Optional override if you already know the Microsoft Graph Site ID. If siteUrl is present, SPARTA can populate siteId automatically after a successful test.' },
                { name: 'driveId', description: 'Optional specific document library drive ID. If omitted, all site drives are listed.' },
            ],
            steps: [
                'Create an app registration in Azure Portal and grant Microsoft Graph delegated permissions: Files.Read, Sites.Read.All, offline_access.',
                'Create a client secret and copy tenantId, clientId, and clientSecret from the app registration overview.',
                'Run OAuth consent flow to obtain a refresh token for the SharePoint user context.',
                'Paste your SharePoint URL, for example https://prettlcloud.sharepoint.com/sites/finance. You do not need Graph Explorer for the normal setup path.',
                'Test the connector once; SPARTA will resolve and store the Microsoft Graph siteId automatically.',
                'Optionally provide driveId to lock SPARTA to one document library; otherwise all available libraries are listed.',
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
                'Ensure the database allows connections from your SPARTA server IP address.',
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
            if (
                !payload
                || !['sparta:sharepoint-oauth-callback', 'mastiff:sharepoint-oauth-callback'].includes(payload.type)
            ) return;

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
                if (editingConnector.type === 'sharepoint' && credentials && !credentials.siteId && !credentials.siteUrl) {
                    throw new Error('SharePoint connectors require either siteUrl or siteId. Paste a URL like https://prettlcloud.sharepoint.com/sites/finance.');
                }
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
                if (connectorForm.type === 'sharepoint' && !credentials.siteId && !credentials.siteUrl) {
                    throw new Error('SharePoint connectors require either siteUrl or siteId. Paste a URL like https://prettlcloud.sharepoint.com/sites/finance.');
                }
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
            case 'xlsx': case 'xls': return <FileXls size={14} className="text-blue-400" />;
            case 'pdf': return <FileText size={14} className="text-red-400" />;
            case 'docx': case 'doc': return <FileText size={14} className="text-blue-300" />;
            default: return <File size={14} className="text-stone-400" />;
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
        { type: 'sheets', label: 'Sheets', accent: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/[0.08]', badge: 'GS' },
        { type: 'sharepoint', label: 'SharePoint', accent: 'text-sky-300 border-sky-500/20 bg-sky-500/[0.08]', badge: 'SP' },
        { type: 'snowflake', label: 'Snowflake', accent: 'text-cyan-300 border-cyan-500/20 bg-cyan-500/[0.08]', badge: 'SF' },
        { type: 'bigquery', label: 'BigQuery', accent: 'text-amber-300 border-amber-500/20 bg-amber-500/[0.08]', badge: 'BQ' },
        { type: 'postgres', label: 'Postgres', accent: 'text-indigo-300 border-indigo-500/20 bg-indigo-500/[0.08]', badge: 'PG' },
        { type: 'api', label: 'API', accent: 'text-teal-300 border-teal-500/20 bg-teal-500/[0.08]', badge: 'API' },
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
                <div className="fixed inset-0 z-40 bg-stone-950/20 backdrop-blur-sm xl:hidden" onClick={onClose} />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(320px,92vw)] flex-col border-r border-stone-200 bg-[linear-gradient(180deg,rgba(251,250,248,0.96),rgba(245,243,239,0.94))] shadow-[0_18px_48px_rgba(28,25,23,0.08)] transition-transform duration-300 xl:relative xl:w-[296px] 2xl:w-[316px] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0'}`}>
                {/* Header */}
                <div className="shrink-0 border-b border-stone-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                        <BrandLockup size={42} title="SPARTA" />
                        <button onClick={onClose} className="rounded-xl p-2 text-stone-500 transition-colors hover:text-stone-900 xl:hidden">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-stone-200 bg-white/85 px-3 py-2 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-stone-500">Datasets</p>
                            <p className="mt-1 text-base font-black tracking-[-0.04em] text-stone-900">
                                {uploadedFiles.length + stagedFiles.length}
                            </p>
                            <p className="text-[10px] text-stone-500">confirmed + staged</p>
                        </div>
                        <div className="rounded-2xl border border-stone-200 bg-white/85 px-3 py-2 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-stone-500">Sources</p>
                            <p className="mt-1 text-base font-black tracking-[-0.04em] text-stone-900">
                                {connectors.length}
                            </p>
                            <p className="text-[10px] text-stone-500">live connectors</p>
                        </div>
                    </div>
                    {(uploadedFiles.length + stagedFiles.length) > 1 && (
                        <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                            <p className="text-[8px] font-extrabold uppercase tracking-[0.26em] text-sky-700">Cross-File Ready</p>
                            <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
                                Compare multiple sources together and surface line-level variance, common KPIs, and source-to-source anomalies.
                            </p>
                        </div>
                    )}
                </div>

                {/* New Session Button */}
                <div className="p-3 shrink-0">
                    <button
                        onClick={onClearMessages}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.28em] text-stone-900 shadow-[0_8px_24px_rgba(28,25,23,0.06)] transition-all hover:-translate-y-[1px] hover:border-stone-300 hover:bg-stone-50 active:scale-[0.99]"
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
                    accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.doc,.txt,.tsv"
                    onChange={onFileUpload}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Uploaded Files Section */}
                    <div className="px-3 pb-3">
                        <div className="mb-2 flex items-center justify-between px-1">
                            <p className="text-[8px] font-extrabold uppercase tracking-[0.24em] text-stone-500">
                                Data Sources
                            </p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-lg p-1 text-stone-500 transition-colors hover:text-stone-900"
                            >
                                <Plus size={12} />
                            </button>
                        </div>

                        {isUploading && (
                            <div className="mb-2 animate-fade-in space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                                <div className="flex items-center gap-2">
                                    <SpinnerGap size={12} className="animate-spin text-sky-600" />
                                    <span className="text-[9px] font-bold text-stone-900 uppercase tracking-[0.2em]">{uploadStatusLabel}</span>
                                </div>
                                <p className="text-[10px] leading-tight text-stone-600">{uploadStatusDetail}</p>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
                                    <div className="h-full w-2/3 animate-shimmer bg-gradient-to-r from-sky-400 via-teal-300 to-amber-300" />
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
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-stone-200">
                                            {getFileIcon(f.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate text-[10px] font-bold text-stone-900">{f.name}</p>
                                            <p className="text-[8px] font-medium text-stone-500">
                                                {f.metadata?.row_count?.toLocaleString() || '?'} rows • {f.columns.length} cols
                                            </p>
                                            <p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-amber-700">
                                                Review before activation
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onInspectFile(f.id);
                                            }}
                                            className="p-1 text-stone-400 opacity-0 transition-all group-hover:opacity-100 hover:text-stone-900"
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
                                                className="p-1 text-stone-400 opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
                                                title="Remove pending file"
                                            >
                                                <Trash size={11} />
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
                                            ? 'border border-sky-200 bg-sky-50'
                                            : 'border border-transparent hover:bg-stone-100/70'
                                            }`}
                                        onClick={() => onToggleFile(f.id)}
                                    >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white">
                                            {getFileIcon(f.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate text-[10px] font-bold text-stone-900">{f.name}</p>
                                            <p className="text-[8px] font-medium text-stone-500">
                                                {f.metadata?.row_count?.toLocaleString() || '?'} rows • {f.columns.length} cols
                                            </p>
                                            <p className={`mt-1 text-[8px] font-bold uppercase tracking-wide ${activeFileIds.includes(f.id) ? 'text-sky-700' : 'text-stone-500'}`}>
                                                {activeFileIds.includes(f.id) ? 'Active in chat context' : 'Click to include in chat context'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onInspectFile(f.id);
                                            }}
                                            className="p-1 text-stone-400 opacity-0 transition-all group-hover:opacity-100 hover:text-stone-900"
                                            title="Inspect data sample"
                                        >
                                            <Info size={11} />
                                        </button>
                                        <button
                                            onClick={(e) => onDeleteFile(f.id, e)}
                                            className="p-1 text-stone-400 opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
                                        >
                                            <Trash size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="group w-full rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-center transition-all hover:-translate-y-[1px] hover:border-sky-300 hover:bg-sky-50/60"
                                >
                                    <FileArrowUp size={16} className="mx-auto mb-1.5 text-stone-500 transition-colors group-hover:text-sky-700" />
                                    <p className="text-[9px] font-bold text-stone-700 transition-colors group-hover:text-stone-900">Upload files</p>
                                    <p className="mt-1 text-[10px] leading-tight text-stone-500">CSV, Excel, PDF, Word, text, JSON, and TSV are supported. Charts and written analysis start automatically as soon as the data is activated.</p>
                                </button>
                                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5">
                                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-stone-500">Need a live source?</p>
                                    <p className="mt-1 text-[10px] leading-tight text-stone-600">Use the single Connectors section below for Sheets, SharePoint, Snowflake, BigQuery, Postgres, or API sources.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Connectors Section */}
                    <div className="px-3 pb-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-stone-500">
                                Connectors
                            </p>
                            <div className="flex items-center gap-1">
                                {onCreateConnector && (
                                    <button
                                        onClick={openCreateConnectorModal}
                                        className="rounded p-1.5 text-stone-500 transition-colors hover:text-stone-900"
                                        title="Add connector"
                                    >
                                        <Plus size={14} />
                                    </button>
                                )}
                                {onRefreshConnectors && (
                                    <button
                                        onClick={onRefreshConnectors}
                                        className="rounded p-1.5 text-stone-500 transition-colors hover:text-stone-900"
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
                                    <WarningCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                                ) : (
                                    <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                                )}
                                <p className="text-[11px] font-semibold leading-tight text-stone-700">{connectorFeedback.text}</p>
                            </div>
                        )}

                        <div className="mb-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-[9px] font-extrabold uppercase tracking-[2px] text-stone-500">Configured Sources</p>
                                    <p className="mt-1 text-[10px] text-stone-500">
                                        {connectors.length > 0 ? `${connectors.length} connector${connectors.length === 1 ? '' : 's'} ready` : 'No live sources configured yet. Add one to pull fresh data into this session.'}
                                    </p>
                                </div>
                                {onCreateConnector && (
                                    <button
                                        onClick={openCreateConnectorModal}
                                        className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-stone-800 transition-colors hover:bg-stone-100"
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
                                            className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-[9px] font-bold text-stone-600"
                                        >
                                            <span>{connectorTypeLabels[type]}</span>
                                            <span className="text-stone-400">{connectorsByType[type]}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mb-2 rounded-xl border border-stone-200 bg-white px-3 py-2">
                            <input
                                value={connectorSearch}
                                onChange={(e) => setConnectorSearch(e.target.value)}
                                placeholder="Search connectors by name or type"
                                className="w-full bg-transparent text-[11px] text-stone-900 placeholder:text-stone-400 outline-none"
                            />
                        </div>

                        {isLoadingConnectors ? (
                            <div className="flex items-center gap-2 p-3 glass rounded-xl animate-fade-in">
                                <SpinnerGap size={14} className="animate-spin text-sky-300" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Loading connectors...</span>
                            </div>
                        ) : filteredConnectors.length > 0 ? (
                            <div className="space-y-1.5">
                                {filteredConnectors.map((connector) => (
                                    <div
                                        key={connector.id}
                                        className="rounded-xl border border-stone-200 bg-white p-3 shadow-[0_4px_16px_rgba(28,25,23,0.04)]"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className={`h-2 w-2 rounded-full ${connector.isActive ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate text-[12px] font-bold text-stone-900">{connector.name}</p>
                                                <p className="truncate text-[10px] uppercase tracking-wide text-stone-500">
                                                    {connectorTypeLabels[connector.type] || connector.type}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                                            <button
                                                onClick={() => onToggleLinkedConnector?.(connector.id)}
                                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors flex items-center justify-center gap-1.5 ${linkedConnectorIds.includes(connector.id)
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : 'border-stone-200 text-stone-500 hover:text-stone-900'
                                                    }`}
                                            >
                                                {linkedConnectorIds.includes(connector.id) ? <LinkBreak size={12} /> : <Link size={12} />}
                                                {linkedConnectorIds.includes(connector.id) ? 'Unlink' : 'Link'}
                                            </button>

                                            <button
                                                onClick={() => handleTestConnector(connector.id)}
                                                className="flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 transition-colors hover:text-stone-900"
                                                disabled={activeConnectorActionId === connector.id}
                                            >
                                                {activeConnectorActionId === connector.id ? <SpinnerGap size={12} className="animate-spin" /> : <Flask size={12} />}
                                                Test
                                            </button>

                                            <button
                                                onClick={() => handleLoadSources(connector.id)}
                                                className="flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 transition-colors hover:text-stone-900"
                                                disabled={activeConnectorActionId === connector.id}
                                            >
                                                <List size={12} />
                                                Sources
                                            </button>

                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => openEditConnectorModal(connector)}
                                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 transition-colors hover:text-stone-900"
                                                >
                                                    <PencilSimple size={12} />
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteConnector(connector.id)}
                                                    className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 transition-colors hover:text-red-500"
                                                    disabled={activeConnectorActionId === connector.id}
                                                    title="Delete connector"
                                                >
                                                    <Trash size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        {expandedSourcesConnectorId === connector.id && (
                                            <div className="custom-scrollbar mt-2.5 max-h-32 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                                                {(sourcesByConnector[connector.id] || []).length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {(sourcesByConnector[connector.id] || []).slice(0, 12).map((source: any, index: number) => {
                                                            const sourceId = String(source?.id || `source-${index}`);
                                                            const isSelected = (selectedSourceIdsByConnector[connector.id] || []).includes(sourceId);
                                                            const isFileLike = source?.type === 'file' || source?.metadata?.itemId;

                                                            return (
                                                                <label key={`${connector.id}-source-${sourceId}`} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${isFileLike ? 'cursor-pointer hover:bg-white' : 'opacity-70'}`}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="accent-sky-300"
                                                                        disabled={!isFileLike}
                                                                        checked={isSelected}
                                                                        onChange={() => toggleSourceSelection(connector.id, sourceId)}
                                                                    />
                                                                    <span className="truncate text-[10px] text-stone-600">
                                                                        {source?.name || source?.id || source?.tableName || `Source ${index + 1}`}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}

                                                        {connector.type === 'sharepoint' && (
                                                            <button
                                                                onClick={() => handleImportSelectedSources(connector.id)}
                                                                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-stone-800 transition-colors hover:bg-stone-100 disabled:opacity-60"
                                                                disabled={activeConnectorActionId === connector.id || (selectedSourceIdsByConnector[connector.id] || []).length === 0}
                                                            >
                                                                Import Selected To Session
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-stone-500">No sources returned.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : connectors.length > 0 ? (
                            <div className="space-y-1.5 rounded-xl border border-dashed border-stone-300 p-3 text-center">
                                <p className="text-[11px] font-semibold text-stone-700">No connectors match this search</p>
                                <p className="text-[10px] text-stone-500">Try a source type like Snowflake, Sheets, or API.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 rounded-xl border border-dashed border-stone-300 p-3 text-center">
                                <p className="text-[11px] font-semibold text-stone-700">No connectors configured yet</p>
                                <p className="text-[10px] leading-tight text-stone-500">Start with a quick connector for live sources, or upload a file first if you want to analyze static data immediately.</p>
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
                                                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-stone-800 transition-colors hover:bg-stone-100"
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
                            <p className="text-[8px] font-extrabold uppercase tracking-[2px] text-stone-500">
                                History
                            </p>
                            <Clock size={10} className="text-stone-500" />
                        </div>

                        <div className="space-y-3">
                            {groupedSessions.map(group => (
                                <div key={group.label}>
                                    <p className="mb-1 px-1 text-[7px] font-bold uppercase tracking-wider text-stone-500">
                                        {group.label}
                                    </p>
                                    <div className="space-y-0.5">
                                        {group.sessions.map(s => (
                                            <div
                                                key={s.id}
                                                onClick={() => onSwitchSession(s.id)}
                                                className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${currentSessionId === s.id
                                                    ? 'border border-sky-200 bg-sky-50'
                                                    : 'hover:bg-stone-100'
                                                    }`}
                                            >
                                                <ChatTeardropText size={12} className={currentSessionId === s.id ? 'text-sky-700' : 'text-stone-500'} />
                                                <span className={`flex-1 truncate text-[10px] font-semibold ${currentSessionId === s.id ? 'text-stone-900' : 'text-stone-600'}`}>
                                                    {s.title || 'New Chat'}
                                                </span>
                                                <button
                                                    onClick={(e) => onDeleteSession(s.id, e)}
                                                    className="p-0.5 text-stone-400 opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
                                                >
                                                    <Trash size={10} />
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
                <div className="shrink-0 border-t border-stone-200 p-3">
                    <div className="flex items-center gap-2.5 rounded-xl p-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-100 text-[10px] font-black text-stone-800">
                            {currentUser.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="truncate text-[10px] font-bold text-stone-900">{currentUser.name}</p>
                            <p className="truncate text-[8px] font-medium text-stone-500">{currentUser.email}</p>
                        </div>
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-3 text-stone-500 transition-colors hover:text-stone-900"
                                title="Sign out"
                            >
                                <SignOut size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </aside>

            {isConnectorModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/25 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-[0_24px_80px_rgba(28,25,23,0.12)]">
                        <div className="flex items-center justify-between border-b border-stone-200 p-4">
                            <div>
                                <h3 className="text-sm font-extrabold tracking-tight text-stone-900">
                                    {editingConnector ? 'Configure Connector' : 'Add Connector'}
                                </h3>
                                <p className="mt-1 text-[9px] text-stone-500">
                                    {editingConnector
                                        ? 'Update connector settings. Leave credentials blank to keep existing secrets.'
                                        : 'Provide connector details and credentials JSON.'}
                                </p>
                            </div>
                            <button
                                onClick={closeConnectorModal}
                                className="rounded-lg p-1.5 text-stone-500 transition-colors hover:text-stone-900"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest text-stone-500">Name</label>
                                <input
                                    value={connectorForm.name}
                                    onChange={(e) => setConnectorForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] text-stone-900"
                                    placeholder="Sales Warehouse"
                                />
                            </div>

                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest text-stone-500">Type</label>
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
                                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] text-stone-900 disabled:opacity-60"
                                >
                                    {availableConnectorTypes.map((type) => (
                                        <option key={type} value={type}>
                                            {connectorTypeLabels[type]}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="text-[9px] font-bold uppercase tracking-widest text-stone-500">Description</label>
                                <input
                                    value={connectorForm.description}
                                    onChange={(e) => setConnectorForm((prev) => ({ ...prev, description: e.target.value }))}
                                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] text-stone-900"
                                    placeholder="Finance dashboards and monthly KPI tables"
                                />
                            </div>

                            <div>
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[9px] font-bold uppercase tracking-widest text-stone-500">Credentials JSON</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCredentialHelpOpen((prev) => !prev)}
                                        className="text-stone-500 transition-colors hover:text-stone-900"
                                        title="How to get these credentials"
                                    >
                                        <Question size={12} />
                                    </button>
                                </div>
                                {isCredentialHelpOpen && (
                                    <div className="mt-1.5 mb-2 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-[10px] text-stone-600">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-stone-700">
                                            How to get your {connectorTypeLabels[connectorForm.type]} credentials
                                        </p>
                                        <div className="space-y-1.5">
                                            {connectorCredentialGuides[connectorForm.type].fields.map((field) => (
                                                <div key={field.name}>
                                                    <span className="font-mono text-sky-300">{field.name}</span>
                                                    <span className="text-stone-400"> — </span>
                                                    <span>{field.description}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="border-t border-stone-200 pt-1">
                                            <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-stone-500">Steps</p>
                                            <ol className="list-inside list-decimal space-y-0.5 text-stone-500">
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
                                    className="mt-1 min-h-36 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[10px] text-stone-700"
                                    placeholder={connectorCredentialTemplates[connectorForm.type]}
                                />

                                {connectorForm.type === 'sharepoint' && (
                                    <div className="mt-2.5 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-stone-500">SharePoint OAuth Helper</p>
                                        <p className="text-[10px] text-stone-500">
                                            Use this helper to generate the Microsoft consent URL and exchange the returned code into tokens.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={handleGenerateSharepointOAuthUrl}
                                                disabled={isSharepointOauthBusy}
                                                className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-stone-700 hover:bg-white disabled:opacity-60"
                                            >
                                                {isSharepointOauthBusy ? 'Working...' : 'Generate Auth URL'}
                                            </button>
                                            {sharepointOAuthUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => window.open(sharepointOAuthUrl, '_blank', 'popup=yes,width=720,height=760')}
                                                    className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-widest text-stone-700 hover:bg-white"
                                                >
                                                    Open Consent Page
                                                </button>
                                            )}
                                        </div>
                                        {sharepointOAuthState && (
                                            <p className="break-all text-[9px] text-stone-500">State: {sharepointOAuthState}</p>
                                        )}
                                        <div className="flex gap-2">
                                            <input
                                                value={sharepointAuthCode}
                                                onChange={(e) => setSharepointAuthCode(e.target.value)}
                                                className="flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-[10px] text-stone-800"
                                                placeholder="Paste authorization code here"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleExchangeSharepointCode();
                                                }}
                                                disabled={isSharepointOauthBusy || !sharepointAuthCode.trim()}
                                                className="rounded-lg bg-stone-900 px-2.5 py-2 text-[9px] font-extrabold uppercase tracking-widest text-white disabled:opacity-60"
                                            >
                                                Exchange Code
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {editingConnector && (
                                <label className="flex items-center gap-2 text-[10px] font-semibold text-stone-600">
                                    <input
                                        type="checkbox"
                                        checked={connectorForm.isActive}
                                        onChange={(e) => setConnectorForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                                        className="accent-sky-300"
                                    />
                                    Connector active
                                </label>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-stone-200 p-4">
                            <button
                                onClick={closeConnectorModal}
                                className="rounded-xl px-3 py-2 text-[9px] font-extrabold uppercase tracking-widest text-stone-500 hover:text-stone-900"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitConnector}
                                className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-3 py-2 text-[9px] font-extrabold uppercase tracking-widest text-white transition-all hover:bg-stone-800"
                            >
                                <FloppyDisk size={11} />
                                {editingConnector ? 'Save Changes' : 'Create Connector'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
