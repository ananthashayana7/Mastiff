"use client";

import React, { useMemo, useState } from 'react';
import {
    Plus, X, FileUp, Trash2, Settings, Clock, Database,
    FileText, FileSpreadsheet, File, Loader2, MessageSquare,
    LogOut, Link2, Unlink, FlaskConical, List, Pencil,
    Save, CheckCircle2, AlertCircle
} from 'lucide-react';
import { DataFile, User, Session, ConnectorSummary } from '../types';

type ConnectorType = 'sheets' | 'snowflake' | 'bigquery' | 'postgres' | 'api';

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
}

interface SidebarProps {
    files: DataFile[];
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
    onToggleLinkedConnector?: (connectorId: string) => void;
    isSidebarOpen: boolean;
    currentUser: User;
    onClose: () => void;
    onClearMessages: () => void;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onToggleFile: (id: string) => void;
    onInspectFile: (id: string) => void;
    onDeleteFile: (id: string, e: React.MouseEvent) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    sessions: Session[];
    currentSessionId: string | null;
    onSwitchSession: (id: string) => void;
    onDeleteSession: (id: string, e: React.MouseEvent) => void;
    isUploading?: boolean;
    onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    files,
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
    fileInputRef,
    sessions,
    currentSessionId,
    onSwitchSession,
    onDeleteSession,
    isUploading = false,
    isLoadingConnectors = false,
    onRefreshConnectors,
    onCreateConnector,
    onUpdateConnector,
    onDeleteConnector,
    onTestConnector,
    onLoadConnectorSources,
    onToggleLinkedConnector,
    onLogout
}) => {

    const [isConnectorModalOpen, setIsConnectorModalOpen] = useState(false);
    const [editingConnector, setEditingConnector] = useState<ConnectorSummary | null>(null);
    const [activeConnectorActionId, setActiveConnectorActionId] = useState<string | null>(null);
    const [expandedSourcesConnectorId, setExpandedSourcesConnectorId] = useState<string | null>(null);
    const [sourcesByConnector, setSourcesByConnector] = useState<Record<string, any[]>>({});
    const [connectorFeedback, setConnectorFeedback] = useState<{
        kind: 'success' | 'error';
        text: string;
    } | null>(null);
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
        snowflake: '{\n  "account": "",\n  "username": "",\n  "password": "",\n  "database": "",\n  "schema": "",\n  "warehouse": ""\n}',
        bigquery: '{\n  "projectId": "",\n  "datasetId": "",\n  "serviceAccountKey": "{}"\n}',
        postgres: '{\n  "host": "",\n  "port": 5432,\n  "database": "",\n  "username": "",\n  "password": "",\n  "ssl": false\n}',
        api: '{\n  "baseUrl": "https://api.example.com",\n  "authType": "apikey",\n  "apiKey": ""\n}',
    };

    const connectorTypeLabels: Record<string, string> = {
        sheets: 'Google Sheets',
        snowflake: 'Snowflake',
        bigquery: 'BigQuery',
        postgres: 'Postgres',
        api: 'API',
    };
    const availableConnectorTypes: ConnectorType[] = ['sheets', 'snowflake', 'bigquery', 'postgres', 'api'];

    const resetConnectorForm = (type: ConnectorType = 'sheets') => {
        setConnectorForm({
            name: '',
            type,
            description: '',
            credentialsJson: connectorCredentialTemplates[type],
            isActive: true,
        });
    };

    const openCreateConnectorModal = () => {
        setEditingConnector(null);
        resetConnectorForm();
        setConnectorFeedback(null);
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
        setIsConnectorModalOpen(true);
    };

    const closeConnectorModal = () => {
        setIsConnectorModalOpen(false);
        setEditingConnector(null);
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
    const connectorsByType = useMemo(() => {
        const counter: Record<string, number> = {
            sheets: 0,
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
                    accept=".csv,.xlsx,.xls,.json,.pdf,.docx,.doc,.txt"
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
                            <div className="flex items-center gap-2 p-2.5 glass rounded-xl mb-2 animate-fade-in">
                                <Loader2 size={12} className="animate-spin text-[#E50914]" />
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Processing file...</span>
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
                                        onClick={() => onInspectFile(f.id)}
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center shrink-0">
                                            {getFileIcon(f.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-white truncate">{f.name}</p>
                                            <p className="text-[8px] text-zinc-600 font-medium">
                                                {f.metadata?.row_count?.toLocaleString() || '?'} rows • {f.columns.length} cols
                                            </p>
                                        </div>
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
                            </button>
                        )}
                    </div>

                    {/* Connectors Section */}
                    <div className="px-3 pb-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-[2px]">
                                Connectors
                            </p>
                            <div className="flex items-center gap-1">
                                {onCreateConnector && (
                                    <button
                                        onClick={openCreateConnectorModal}
                                        className="p-1 text-zinc-600 hover:text-[#E50914] transition-colors rounded"
                                        title="Add connector"
                                    >
                                        <Plus size={12} />
                                    </button>
                                )}
                                {onRefreshConnectors && (
                                    <button
                                        onClick={onRefreshConnectors}
                                        className="p-1 text-zinc-600 hover:text-[#E50914] transition-colors rounded"
                                        title="Refresh connectors"
                                    >
                                        <Database size={12} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {connectorFeedback && (
                            <div
                                className={`flex items-start gap-2 p-2 mb-2 rounded-xl border ${connectorFeedback.kind === 'error'
                                        ? 'border-red-900/40 bg-red-950/20'
                                        : 'border-emerald-900/40 bg-emerald-950/20'
                                    }`}
                            >
                                {connectorFeedback.kind === 'error' ? (
                                    <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                                ) : (
                                    <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                                )}
                                <p className="text-[9px] font-semibold text-zinc-300 leading-tight">{connectorFeedback.text}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                            {availableConnectorTypes.map((type) => (
                                <div
                                    key={type}
                                    className="px-2 py-1.5 rounded-lg border border-zinc-800/70 bg-zinc-950/40"
                                >
                                    <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-wide truncate">
                                        {connectorTypeLabels[type]}
                                    </p>
                                    <p className="text-[9px] font-extrabold text-white mt-0.5">
                                        {connectorsByType[type]} configured
                                    </p>
                                </div>
                            ))}
                        </div>

                        {isLoadingConnectors ? (
                            <div className="flex items-center gap-2 p-2.5 glass rounded-xl animate-fade-in">
                                <Loader2 size={12} className="animate-spin text-[#E50914]" />
                                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Loading connectors...</span>
                            </div>
                        ) : connectors.length > 0 ? (
                            <div className="space-y-1">
                                {connectors.map((connector) => (
                                    <div
                                        key={connector.id}
                                        className="p-2 rounded-xl bg-zinc-900/30 border border-zinc-800/60"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className={`w-1.5 h-1.5 rounded-full ${connector.isActive ? 'bg-green-400' : 'bg-zinc-600'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold text-white truncate">{connector.name}</p>
                                                <p className="text-[8px] text-zinc-500 uppercase tracking-wide truncate">
                                                    {connectorTypeLabels[connector.type] || connector.type}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-2 grid grid-cols-2 gap-1">
                                            <button
                                                onClick={() => onToggleLinkedConnector?.(connector.id)}
                                                className={`px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest border transition-colors flex items-center justify-center gap-1 ${linkedConnectorIds.includes(connector.id)
                                                        ? 'border-[#E50914]/40 bg-[#E50914]/10 text-[#ff6b6b]'
                                                        : 'border-zinc-800 text-zinc-500 hover:text-white'
                                                    }`}
                                            >
                                                {linkedConnectorIds.includes(connector.id) ? <Unlink size={10} /> : <Link2 size={10} />}
                                                {linkedConnectorIds.includes(connector.id) ? 'Unlink' : 'Link'}
                                            </button>

                                            <button
                                                onClick={() => handleTestConnector(connector.id)}
                                                className="px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1"
                                                disabled={activeConnectorActionId === connector.id}
                                            >
                                                {activeConnectorActionId === connector.id ? <Loader2 size={10} className="animate-spin" /> : <FlaskConical size={10} />}
                                                Test
                                            </button>

                                            <button
                                                onClick={() => handleLoadSources(connector.id)}
                                                className="px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1"
                                                disabled={activeConnectorActionId === connector.id}
                                            >
                                                <List size={10} />
                                                Sources
                                            </button>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => openEditConnectorModal(connector)}
                                                    className="flex-1 px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <Pencil size={10} />
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteConnector(connector.id)}
                                                    className="px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-widest border border-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                                                    disabled={activeConnectorActionId === connector.id}
                                                    title="Delete connector"
                                                >
                                                    <Trash2 size={10} />
                                                </button>
                                            </div>
                                        </div>

                                        {expandedSourcesConnectorId === connector.id && (
                                            <div className="mt-2 p-2 rounded-lg bg-zinc-950/70 border border-zinc-800/70 max-h-28 overflow-y-auto custom-scrollbar">
                                                {(sourcesByConnector[connector.id] || []).length > 0 ? (
                                                    <div className="space-y-1">
                                                        {(sourcesByConnector[connector.id] || []).slice(0, 12).map((source: any, index: number) => (
                                                            <p key={`${connector.id}-source-${index}`} className="text-[8px] text-zinc-400 truncate">
                                                                {source?.name || source?.id || source?.tableName || `Source ${index + 1}`}
                                                            </p>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[8px] text-zinc-600">No sources returned.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-2.5 rounded-xl border border-dashed border-zinc-800 text-center">
                                <p className="text-[9px] font-semibold text-zinc-600">No connectors configured yet</p>
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
                                className="p-1.5 text-zinc-600 hover:text-red-400 rounded-lg transition-colors"
                                title="Sign out"
                            >
                                <LogOut size={13} />
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
                                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Credentials JSON</label>
                                <textarea
                                    value={connectorForm.credentialsJson}
                                    onChange={(e) => setConnectorForm((prev) => ({ ...prev, credentialsJson: e.target.value }))}
                                    className="mt-1 w-full min-h-36 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-[10px] text-zinc-300 font-mono"
                                    placeholder={connectorCredentialTemplates[connectorForm.type]}
                                />
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
