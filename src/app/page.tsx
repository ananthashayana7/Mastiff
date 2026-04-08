"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus, Send, FileUp, Table, X, Database,
  Terminal, Paperclip, RefreshCw, Volume2, Cpu, Sparkles,
  Info, ChevronDown, Lock, Settings, TrendingUp, Trash2, Menu, Copy, Check, Zap, Loader2,
  FileText, FileSpreadsheet, File, Search, Globe, ExternalLink, LogOut
} from 'lucide-react';
import { DataFile, ChatMessage, AnalysisMode, User as UserType, AnalystPersona, Session, ConnectorSummary } from '../types';
import { Sidebar } from '../components/Sidebar';
import { ChatWindow } from '../components/ChatWindow';
import { DataInspector } from '../components/DataInspector';
import { BrandLockup } from '../components/BrandMark';
import { buildUploadAutoPrompt } from '../lib/analysisPrompts';
import { buildSuggestedQuestions, buildSuggestionContext, detectOperationalDomain } from '../lib/dataExplorer';
import { csrfFetch } from '../hooks/useCSRFToken';

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

interface SilentAnalysisOptions {
  targetFileIds?: string[];
  personaLabel?: string;
}

const PERSONAS: AnalystPersona[] = [
  { id: 'default', name: 'MASTIFF AI', icon: 'M', description: 'Core LLM with Python Sandbox integration.', instruction: 'Focus on comprehensive, logical data analysis. Provide well-rounded insights covering trends, patterns, anomalies, and actionable recommendations. Use professional formatting with clear sections.' },
  { id: 'statistician', name: 'Scientist', icon: 'S', description: 'Deep statistical validation & rigor.', instruction: 'Approach every question with statistical rigor. Emphasize significance tests, confidence intervals, effect sizes, distributions, and hypothesis testing. Cite specific statistical methods used. Flag when sample sizes are too small for reliable inference. Always quantify uncertainty.' },
  { id: 'business', name: 'Strategist', icon: 'G', description: 'Business & growth strategy focus.', instruction: 'Frame all analysis through a business strategy lens. Focus on revenue impact, market positioning, competitive advantages, ROI, cost optimization, and growth levers. Provide boardroom-ready executive summaries. Prioritize actionable recommendations with projected business outcomes.' },
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [files, setFiles] = useState<DataFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<DataFile[]>([]);
  const [activeFileIds, setActiveFileIds] = useState<string[]>([]);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [linkedConnectorIds, setLinkedConnectorIds] = useState<string[]>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFileNames, setUploadingFileNames] = useState<string[]>([]);

  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('analysis');
  const lastUploadTime = useRef<number>(0);

  // Unified mode — always analysis. Handler kept for interface compatibility.
  const handleSetAnalysisMode = (_mode: AnalysisMode) => {
    // No-op: unified analysis mode
  };

  const [activePersona, setActivePersona] = useState<AnalystPersona>(PERSONAS[0]);
  const [showCodeId, setShowCodeId] = useState<string | null>(null);
  const [showLogsId, setShowLogsId] = useState<string | null>(null);
  const [inspectingFileId, setInspectingFileId] = useState<string | null>(null);
  const [inspectorFocusTerm, setInspectorFocusTerm] = useState<string>('');
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionCreationPromiseRef = useRef<Promise<string | null> | null>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);

  const buildAuthHeaders = useCallback((userId: string, includeContentType = false): Record<string, string> => {
    return {
      'x-user-id': userId,
      ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    };
  }, []);

  const normalizeSession = useCallback((session: any): Session => ({
    ...session,
    createdAt: new Date(session.createdAt).getTime(),
    updatedAt: new Date(session.updatedAt).getTime(),
  }), []);

  const createSessionRecord = useCallback(async (title = 'New Chat') => {
    if (!currentUser) {
      throw new Error('No authenticated user');
    }

    const res = await csrfFetch('/api/sessions', {
      method: 'POST',
      headers: buildAuthHeaders(currentUser.id, true),
      body: JSON.stringify({ title })
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.id) {
      throw new Error(payload?.error || payload?.message || 'Failed to create session');
    }

    return normalizeSession(payload);
  }, [buildAuthHeaders, currentUser, normalizeSession]);

  const ensureActiveSession = useCallback(async () => {
    if (sessionId) {
      return sessionId;
    }

    if (!currentUser) {
      return null;
    }

    if (sessionCreationPromiseRef.current) {
      return await sessionCreationPromiseRef.current;
    }

    sessionCreationPromiseRef.current = (async () => {
      try {
        const session = await createSessionRecord('New Chat');
        localStorage.setItem('mastiff_session_id', session.id);
        setSessionId(session.id);
        setSessions(prev => prev.some(existing => existing.id === session.id) ? prev : [session, ...prev]);
        return session.id;
      } finally {
        sessionCreationPromiseRef.current = null;
      }
    })();

    return await sessionCreationPromiseRef.current;
  }, [createSessionRecord, currentUser, sessionId]);

  const loadConnectors = useCallback(async (userId: string) => {
    setIsLoadingConnectors(true);
    try {
      const response = await fetch(`/api/connectors?userId=${encodeURIComponent(userId)}&limit=100`, {
        headers: buildAuthHeaders(userId),
      });

      if (!response.ok) {
        setConnectors([]);
        return;
      }

      const payload = await response.json();
      const connectorList = Array.isArray(payload?.connectors) ? payload.connectors : [];
      setConnectors(connectorList);
      setLinkedConnectorIds((prev) => prev.filter((id) => connectorList.some((connector: ConnectorSummary) => connector.id === id)));
    } catch (error) {
      console.error('Failed to load connectors:', error);
      setConnectors([]);
    } finally {
      setIsLoadingConnectors(false);
    }
  }, [buildAuthHeaders]);

  const createConnector = useCallback(async (payload: ConnectorCreatePayload) => {
    if (!currentUser) throw new Error('No authenticated user');

    const response = await csrfFetch('/api/connectors', {
      method: 'POST',
      headers: buildAuthHeaders(currentUser.id, true),
      body: JSON.stringify({
        ...payload,
        userId: currentUser.id,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || data?.message || 'Failed to create connector');
    }

    await loadConnectors(currentUser.id);
    return data;
  }, [buildAuthHeaders, currentUser, loadConnectors]);

  const updateConnector = useCallback(async (connectorId: string, payload: ConnectorUpdatePayload) => {
    if (!currentUser) throw new Error('No authenticated user');

    const response = await csrfFetch(`/api/connectors/${connectorId}`, {
      method: 'PUT',
      headers: buildAuthHeaders(currentUser.id, true),
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || data?.message || 'Failed to update connector');
    }

    await loadConnectors(currentUser.id);
    return data;
  }, [buildAuthHeaders, currentUser, loadConnectors]);

  const deleteConnectorById = useCallback(async (connectorId: string) => {
    if (!currentUser) throw new Error('No authenticated user');

    const response = await csrfFetch(`/api/connectors/${connectorId}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(currentUser.id),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.error || data?.message || 'Failed to delete connector');
    }

    setLinkedConnectorIds((prev) => prev.filter((id) => id !== connectorId));
    await loadConnectors(currentUser.id);
    return data;
  }, [buildAuthHeaders, currentUser, loadConnectors]);

  const testConnector = useCallback(async (connectorId: string) => {
    if (!currentUser) throw new Error('No authenticated user');

    const response = await csrfFetch(`/api/connectors/${connectorId}/test`, {
      method: 'POST',
      headers: buildAuthHeaders(currentUser.id),
    });

    const data = await response.json().catch(() => ({}));
    await loadConnectors(currentUser.id);

    return {
      success: response.ok && data?.success !== false,
      message: data?.message || (response.ok ? 'Connection test successful' : 'Connection test failed'),
      payload: data,
    };
  }, [buildAuthHeaders, currentUser, loadConnectors]);

  const loadConnectorSources = useCallback(async (connectorId: string) => {
    if (!currentUser) throw new Error('No authenticated user');

    const response = await fetch(`/api/connectors/${connectorId}/test`, {
      method: 'GET',
      headers: buildAuthHeaders(currentUser.id),
    });

    const data = await response.json().catch(() => ({}));
    return {
      success: response.ok && data?.success !== false,
      sources: Array.isArray(data?.sources) ? data.sources : [],
      message: data?.message || (response.ok ? 'Sources loaded' : 'Failed to load sources'),
      payload: data,
    };
  }, [buildAuthHeaders, currentUser]);

  const runSilentAnalysis = useCallback(async (prompt: string, options?: SilentAnalysisOptions) => {
    if (!currentUser) return;

    const activeSessionId = await ensureActiveSession();
    if (!activeSessionId) return;

    setIsAnalyzing(true);
    try {
      const res = await csrfFetch('/api/chat', {
        method: 'POST',
        headers: buildAuthHeaders(currentUser.id, true),
        body: JSON.stringify({
          sessionId: activeSessionId,
          content: prompt,
          mode: analysisMode,
          silent: true,
          activeFileIds: options?.targetFileIds ?? activeFileIds,
          linkedConnectorIds,
          persona: activePersona.instruction,
        })
      });

      const assistantMsg = await res.json();
      const responseContent = assistantMsg.content
        || assistantMsg.error
        || 'No response received. Please try again.';

      setMessages(prev => [...prev, {
        id: assistantMsg.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        code: assistantMsg.code,
        visualization: assistantMsg.visualizationUrl,
        result: assistantMsg.result,
        timestamp: Date.now(),
        persona: options?.personaLabel || 'System Analysis'
      }]);
    } catch (err) {
      console.error('Silent analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [activeFileIds, activePersona.instruction, analysisMode, buildAuthHeaders, currentUser, ensureActiveSession, linkedConnectorIds]);

  const importConnectorSources = useCallback(async (connectorId: string, sources: any[]) => {
    if (!currentUser) throw new Error('No authenticated user');
    const activeSessionId = await ensureActiveSession();
    if (!activeSessionId) throw new Error('No active session');

    const response = await csrfFetch(`/api/connectors/${connectorId}/import`, {
      method: 'POST',
      headers: buildAuthHeaders(currentUser.id, true),
      body: JSON.stringify({
        sessionId: activeSessionId,
        sources,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.success === false) {
      return {
        success: false,
        message: data?.error || data?.message || 'Failed to import sources',
      };
    }

    const importedFiles = Array.isArray(data?.files) ? data.files : [];
    if (importedFiles.length > 0) {
      const normalized: DataFile[] = importedFiles.map((dbFile: any) => ({
        id: dbFile.id,
        name: dbFile.filename,
        type: dbFile.fileType,
        content: '',
        preview: dbFile.metadata?.sample || [],
        columns: Object.keys(dbFile.metadata?.columns || {}),
        metadata: dbFile.metadata,
      }));

      setPendingFiles((prev) => {
        const existingIds = new Set([...files, ...prev].map((file) => file.id));
        const deduped = normalized.filter((file) => !existingIds.has(file.id));
        return [...prev, ...deduped];
      });
      setInspectingFileId(importedFiles[0]?.id || null);
    }

    return {
      success: true,
      message: data?.message || `Imported ${importedFiles.length} file(s) from SharePoint for review.`,
      files: importedFiles,
      skipped: data?.skipped || [],
    };
  }, [buildAuthHeaders, currentUser, ensureActiveSession, files, pendingFiles]);

  const toggleLinkedConnector = useCallback((connectorId: string) => {
    setLinkedConnectorIds((prev) => {
      if (prev.includes(connectorId)) {
        return prev.filter((id) => id !== connectorId);
      }
      return [...prev, connectorId];
    });
  }, []);

  // ===== AUTH CHECK =====
  useEffect(() => {
    const userJson = localStorage.getItem('mastiff_user');

    const bootstrapFromStoredUser = () => {
      if (!userJson) {
        window.location.href = '/login';
        return;
      }

      try {
        const user = JSON.parse(userJson);
        setCurrentUser({
          id: user.id,
          email: user.email,
          name: user.name || user.email.split('@')[0],
          role: 'Analyst' as const,
          twoFactorEnabled: false
        });
        setIsAuthChecking(false);
      } catch {
        window.location.href = '/login';
      }
    };

    void (async () => {
      try {
        const response = await fetch('/api/auth/session', {
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          const payload = await response.json();
          const user = payload?.user;
          if (user?.id) {
            const normalizedUser = {
              id: user.id,
              email: user.email,
              name: user.name || user.email?.split('@')[0] || 'User',
              role: 'Analyst' as const,
              twoFactorEnabled: false,
            };
            localStorage.removeItem('mastiff_token');
            localStorage.setItem('mastiff_user', JSON.stringify(user));
            setCurrentUser(normalizedUser);
            setIsAuthChecking(false);
            return;
          }
        }
      } catch (error) {
        console.error('Auth session bootstrap failed:', error);
      }

      bootstrapFromStoredUser();
    })();
  }, []);

  // ===== SESSION INIT =====
  useEffect(() => {
    if (!currentUser) return;

    console.log("Mastiff AI v4.0 — Initializing...");
    const initSession = async () => {
      let availableSessions: Session[] = [];

      try {
        const sres = await fetch('/api/sessions', {
          headers: buildAuthHeaders(currentUser.id),
        });
        const allSessions = await sres.json().catch(() => []);
        availableSessions = Array.isArray(allSessions) ? allSessions.map(normalizeSession) : [];
        setSessions(availableSessions);
      } catch (err) {
        console.error('Session fetch error:', err);
        setSessions([]);
      }

      let sId = localStorage.getItem('mastiff_session_id');
      if (sId === 'null' || sId === 'undefined') sId = null;

      if (sId && !availableSessions.some((session) => session.id === sId)) {
        sId = availableSessions[0]?.id || null;
      }

      if (!sId) {
        try {
          const session = await createSessionRecord('New Chat');
          sId = session.id;
          setSessions(prev => prev.some(existing => existing.id === session.id) ? prev : [session, ...prev]);
        } catch (err) {
          console.error("Session creation error:", err);
        }
      }

      if (sId) {
        localStorage.setItem('mastiff_session_id', sId);
      } else {
        localStorage.removeItem('mastiff_session_id');
      }

      setSessionId(sId);

      if (sId) {
        const session = availableSessions.find((s) => s.id === sId);
        if (session) loadSessionData(session);
      }

      await loadConnectors(currentUser.id);
    };
    initSession();
  }, [buildAuthHeaders, createSessionRecord, currentUser, loadConnectors, normalizeSession]);

  const loadSessionData = (session: any) => {
    setLinkedConnectorIds([]);
    setInspectingFileId(null);
    setPendingFiles([]);

    if (session.messages?.length > 0) {
      setMessages(session.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content || '',
        code: m.code,
        visualization: m.visualizationUrl,
        result: m.result,
        timestamp: new Date(m.createdAt).getTime()
      })));
    } else {
      setMessages([]);
    }

    if (session.files?.length > 0) {
      const normalizedFiles: DataFile[] = session.files.map((f: any) => ({
        id: f.id,
        name: f.filename,
        type: f.fileType,
        content: '',
        preview: f.metadata?.sample || [],
        columns: Object.keys(f.metadata?.columns || {}),
        metadata: f.metadata
      }));

      const reviewedFiles = normalizedFiles.filter((file: DataFile) => file.metadata?.validationStatus !== 'pending');
      const stagedFiles = normalizedFiles.filter((file: DataFile) => file.metadata?.validationStatus === 'pending');

      setFiles(reviewedFiles);
      setPendingFiles(stagedFiles);
      setActiveFileIds(reviewedFiles.map((f: DataFile) => f.id));
    } else {
      setFiles([]);
      setPendingFiles([]);
      setActiveFileIds([]);
    }
  };

  const onSwitchSession = async (id: string) => {
    localStorage.setItem('mastiff_session_id', id);
    setSessionId(id);
    setLinkedConnectorIds([]);
    setInspectingFileId(null);
    const session = sessions.find(s => s.id === id);
    if (session) {
      loadSessionData(session);
    } else if (currentUser) {
      const res = await fetch('/api/sessions', {
        headers: buildAuthHeaders(currentUser.id),
      });
      const all = await res.json();
      const found = Array.isArray(all)
        ? all.map(normalizeSession).find((s: Session) => s.id === id)
        : null;
      if (found) loadSessionData(found);
    }
    setIsSidebarOpen(false);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this analysis session?")) return;

    try {
      if (!currentUser) return;
      const res = await csrfFetch(`/api/sessions/${id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(currentUser.id),
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
        if (sessionId === id) createNewSession();
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isAnalyzing]);

  useEffect(() => {
    const validFileIds = new Set(files.map((file) => file.id));
    setActiveFileIds((prev) => prev.filter((id) => validFileIds.has(id)));
  }, [files]);

  useEffect(() => {
    if ((files.length + pendingFiles.length) === 0) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    if (messages.length === 0) {
      void updateSuggestions();
    }
  }, [files, pendingFiles, messages]);

  const updateSuggestions = useCallback(async () => {
    const suggestionFiles = [...files, ...pendingFiles].filter((file) => file.id !== 'sample-sales');
    if (suggestionFiles.length === 0) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    const localSuggestions = buildSuggestedQuestions(suggestionFiles);
    if (localSuggestions.length > 0) {
      setSuggestions(localSuggestions);
    }

    setIsLoadingSuggestions(true);
    try {
      const context = buildSuggestionContext(suggestionFiles);
      if (!context) return;
      const res = await csrfFetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataContext: context })
      });

      const sugs = await res.json().catch(() => []);
      if (Array.isArray(sugs) && sugs.length > 0) {
        setSuggestions(sugs);
      } else if (localSuggestions.length > 0) {
        setSuggestions(localSuggestions);
      }
    } catch (err) {
      console.error("Failed to fetch suggestions", err);
      if (localSuggestions.length > 0) {
        setSuggestions(localSuggestions);
      }
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [files, pendingFiles]);

  // ===== FILE UPLOAD =====
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) {
      return;
    }

    const activeSessionId = await ensureActiveSession();
    if (!activeSessionId) {
      alert("No active session. Please refresh and try again.");
      return;
    }

    await uploadFiles(Array.from(fileList), activeSessionId);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFilesFromState = useCallback((fileIds: string[]) => {
    if (fileIds.length === 0) {
      return;
    }

    const ids = new Set(fileIds);
    setFiles((prev) => prev.filter((file) => !ids.has(file.id)));
    setPendingFiles((prev) => prev.filter((file) => !ids.has(file.id)));
    setActiveFileIds((prev) => prev.filter((id) => !ids.has(id)));
    setInspectingFileId((prev) => (prev && ids.has(prev) ? null : prev));
  }, []);

  const uploadFiles = async (fileList: File[], targetSessionId?: string) => {
    if (!currentUser) return;
    const activeSessionId = targetSessionId || await ensureActiveSession();
    if (!activeSessionId) return;

    setIsUploading(true);
    setUploadingFileNames(fileList.map((file) => file.name));
    try {
      const existingFiles = [...files, ...pendingFiles];

      for (const file of fileList) {
        const normalizedName = file.name.trim().toLowerCase();
        const duplicates = existingFiles.filter((existing) => existing.name.trim().toLowerCase() === normalizedName);
        const uploadMode = duplicates.length > 0
          ? (window.confirm(`A dataset named "${file.name}" already exists in this session.\n\nPress OK to replace it, or Cancel to keep both and store this upload as a new version.`) ? 'replace' : 'new_version')
          : 'new_version';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', currentUser.id);
        formData.append('sessionId', activeSessionId);
        formData.append('uploadMode', uploadMode);

        const res = await csrfFetch('/api/files/upload', {
          method: 'POST',
          headers: buildAuthHeaders(currentUser.id),
          body: formData
        });

        if (!res.ok) {
          const errText = await res.text();
          let uploadMessage = 'Upload failed due to an unexpected server response.';

          try {
            const err = JSON.parse(errText);
            uploadMessage = err.error || err.message || uploadMessage;
          } catch (e) {
            uploadMessage = errText.slice(0, 180) || uploadMessage;
          }

          setMessages((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Upload failed for ${file.name}: ${uploadMessage}`,
            timestamp: Date.now(),
            persona: 'System Notice',
          }]);
          continue;
        }

        const dbFile = await res.json();
        const replacedFileIds = Array.isArray(dbFile.replacedFileIds)
          ? dbFile.replacedFileIds.filter((value: unknown): value is string => typeof value === 'string')
          : [];
        const duplicateResolution = String(dbFile.duplicateResolution || 'none');

        if (replacedFileIds.length > 0) {
          removeFilesFromState(replacedFileIds);
        }

        const newFile: DataFile = {
          id: dbFile.id,
          name: dbFile.storedFilename || dbFile.filename,
          type: dbFile.fileType,
          content: '',
          preview: dbFile.metadata?.sample || [],
          columns: Object.keys(dbFile.metadata?.columns || {}),
          metadata: dbFile.metadata
        };

        setPendingFiles(prev => [...prev, newFile]);
        setInspectingFileId(dbFile.id);
        setMessages((prev) => ([
          ...prev,
          {
            id: `${Date.now()}-ready-${normalizedName}`,
            role: 'assistant',
            timestamp: Date.now(),
            persona: 'System Notice',
            content: `Ready: ${newFile.name} is staged for schema review. Confirm the inferred columns to activate it and trigger immediate charts, insights, and action suggestions.`,
          }
        ]));

        if (duplicateResolution === 'replaced') {
          const replacedActive = replacedFileIds.some((id: string) => activeFileIds.includes(id));
          setMessages((prev) => ([
            ...prev,
            {
              id: `${Date.now()}-replace-${normalizedName}`,
              role: 'assistant',
              timestamp: Date.now(),
              content: replacedActive
                ? `System Notice: Replaced the previous version of ${file.name}. It has been removed from active analysis context until you confirm the new upload.`
                : `System Notice: Replaced the previous staged version of ${file.name}. Review the new upload before activating it.`
            }
          ]));
        } else if (duplicateResolution === 'versioned' && newFile.name !== file.name) {
          setMessages((prev) => ([
            ...prev,
            {
              id: `${Date.now()}-version-${normalizedName}`,
              role: 'assistant',
              timestamp: Date.now(),
              content: `System Notice: Kept the existing ${file.name} and staged this upload as ${newFile.name}. Confirm it when you're ready to compare versions together.`,
              persona: 'System Notice',
            }
          ]));
        }
      }
    } catch (err) {
      console.error("Upload error:", err);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Upload failed: ${err instanceof Error ? err.message : 'Unexpected network or server error.'}`,
        timestamp: Date.now(),
        persona: 'System Notice',
      }]);
    } finally {
      setIsUploading(false);
      setUploadingFileNames([]);
      lastUploadTime.current = Date.now();
    }
  };

  const handleAutoAnalysis = async (prompt: string) => {
    await runSilentAnalysis(prompt, { personaLabel: 'System Analysis' });
  };

  const buildFilteredFile = useCallback((file: DataFile, selectedColumns: string[]): DataFile => {
    const nextColumns = selectedColumns.length > 0 ? selectedColumns : file.columns;
    const nextMetadataColumns: NonNullable<DataFile['metadata']>['columns'] = {};

    nextColumns.forEach((column) => {
      const value = file.metadata?.columns?.[column];
      if (value) {
        nextMetadataColumns[column] = value;
      }
    });

    return {
      ...file,
      columns: nextColumns,
      preview: file.preview.map((row) => Object.fromEntries(nextColumns.map((column) => [column, row?.[column] ?? null]))),
      metadata: file.metadata ? {
        ...file.metadata,
        column_count: nextColumns.length,
        validationStatus: 'active',
        selectedColumns: nextColumns,
        columns: nextMetadataColumns,
        sample: (file.metadata.sample || []).map((row) => Object.fromEntries(nextColumns.map((column) => [column, row?.[column] ?? null]))),
      } : file.metadata,
    };
  }, []);

  const confirmPendingFile = useCallback(async (fileId: string, selectedColumns: string[]) => {
    const target = pendingFiles.find((file) => file.id === fileId);
    if (!target) return;

    const filteredFile = buildFilteredFile(target, selectedColumns);
    const confirmedFiles = [...files, filteredFile].filter((file) => file.id !== 'sample-sales');
    const confirmedFileIds = confirmedFiles.map((file) => file.id);
    const domain = detectOperationalDomain(confirmedFiles);

    const response = await csrfFetch(`/api/files/${fileId}`, {
      method: 'PATCH',
      headers: buildAuthHeaders(currentUser?.id || '', true),
      body: JSON.stringify({ selectedColumns }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || payload?.message || 'Failed to confirm file review');
    }

    setPendingFiles((prev) => prev.filter((file) => file.id !== fileId));
    setFiles((prev) => [...prev, filteredFile]);
    setActiveFileIds((prev) => prev.includes(fileId) ? prev : [...prev, fileId]);
    setInspectingFileId(null);
    setMessages((prev) => ([
      ...prev,
      {
        id: `${Date.now()}-activate-${fileId}`,
        role: 'assistant',
        timestamp: Date.now(),
        persona: 'System Notice',
        content: `${filteredFile.name} is active. Mastiff is generating an initial analysis with charts, forecast signals, and recommended actions now.`,
      }
    ]));

    const autoPrompt = buildUploadAutoPrompt(
      confirmedFiles.map((file) => file.name),
      {
        domain,
        multiFile: confirmedFiles.length > 1,
      }
    );
    await runSilentAnalysis(autoPrompt, {
      targetFileIds: confirmedFileIds,
      personaLabel: 'System Analysis',
    });
  }, [buildAuthHeaders, buildFilteredFile, currentUser?.id, files, pendingFiles, runSilentAnalysis]);

  const rejectPendingFile = useCallback((fileId: string) => {
    void (async () => {
      await csrfFetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(currentUser?.id || ''),
      }).catch((error) => {
        console.error('Failed to delete pending file:', error);
      });

      removeFilesFromState([fileId]);
    })();
  }, [buildAuthHeaders, currentUser?.id, removeFilesFromState]);

  // ===== DRAG & DROP =====
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      void uploadFiles(droppedFiles);
    }
  }, [uploadFiles]);

  // ===== SEND MESSAGE (with analysis mode) =====
  const handleSend = async (overridePrompt?: string) => {
    if (!currentUser) return;
    if (isAnalyzing) return;

    const promptToUse = overridePrompt || inputText;
    if (!promptToUse.trim()) return;

    const activeSessionId = await ensureActiveSession();
    if (!activeSessionId) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: promptToUse, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsAnalyzing(true);
    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;

    try {
      const res = await csrfFetch('/api/chat', {
        method: 'POST',
        headers: buildAuthHeaders(currentUser.id, true),
        signal: abortController.signal,
        body: JSON.stringify({
          sessionId: activeSessionId,
          content: promptToUse,
          mode: analysisMode,  // ← NOW SENT TO BACKEND
          activeFileIds,
          linkedConnectorIds,
          persona: activePersona.instruction,
        })
      });

      const rawBody = await res.text();
      let assistantMsg: any = {};

      try {
        assistantMsg = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        if (!res.ok) {
          throw new Error(`Server returned ${res.status} ${res.statusText}.`);
        }

        assistantMsg = { content: rawBody };
      }

      if (!res.ok) {
        throw new Error(assistantMsg?.error || assistantMsg?.message || `Server returned ${res.status} ${res.statusText}.`);
      }

      const responseContent = assistantMsg.content
        || assistantMsg.error
        || 'No response received. Please try again.';

      setMessages(prev => [...prev, {
        id: assistantMsg.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        code: assistantMsg.code,
        visualization: assistantMsg.visualizationUrl,
        result: assistantMsg.result,
        timestamp: Date.now(),
        mode: analysisMode,
        sources: assistantMsg.sources
      }]);

      // Update session title if first message
      if (messages.length === 0) {
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, title: promptToUse.slice(0, 50) } : s));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Analysis stopped. You can refine the question, reduce active datasets, or run a narrower follow-up.',
          timestamp: Date.now(),
          persona: 'System Notice',
        }]);
        return;
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `An error occurred: ${err?.message || 'Unknown error'}. Please try again.`,
        timestamp: Date.now()
      }]);
    } finally {
      chatAbortControllerRef.current = null;
      setIsAnalyzing(false);
    }
  };

  const stopAnalysis = useCallback(() => {
    chatAbortControllerRef.current?.abort();

    if (!sessionId || !currentUser) {
      return;
    }

    void csrfFetch('/api/chat/cancel', {
      method: 'POST',
      headers: buildAuthHeaders(currentUser.id, true),
      body: JSON.stringify({ sessionId }),
    }).catch((error) => {
      console.error('Failed to cancel active analysis kernel:', error);
    });
  }, [buildAuthHeaders, currentUser, sessionId]);

  const inspectInsight = useCallback((term: string) => {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) return;

    const activeFiles = files.filter((file) => activeFileIds.includes(file.id));
    const candidate = activeFiles.find((file) => {
      const columnMatch = file.columns.some((column) => column.toLowerCase().includes(normalizedTerm));
      const previewMatch = (file.preview || []).some((row) => Object.values(row || {}).some((value) => String(value ?? '').toLowerCase().includes(normalizedTerm)));
      return columnMatch || previewMatch;
    }) || activeFiles[0] || files[0];

    if (!candidate) {
      return;
    }

    setInspectorFocusTerm(term);
    setInspectingFileId(candidate.id);
  }, [activeFileIds, files]);

  const createNewSession = async () => {
    if (!currentUser) return;
    try {
      const sess = await createSessionRecord('New Chat');
      if (sess.id) {
        localStorage.setItem('mastiff_session_id', sess.id);
        setSessionId(sess.id);
        setSessions(prev => [sess, ...prev.filter(existing => existing.id !== sess.id)]);
        setMessages([]);
        setFiles([]);
        setPendingFiles([]);
        setActiveFileIds([]);
        setLinkedConnectorIds([]);
        setInspectingFileId(null);
        setIsSidebarOpen(false);
      }
    } catch (err) {
      console.error("Create session error:", err);
      alert("Failed to start new analysis. Please try again.");
    }
  };

  const deleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const targetFile = [...files, ...pendingFiles].find((file) => file.id === id);
    const wasActive = activeFileIds.includes(id);

    void (async () => {
      await csrfFetch(`/api/files/${id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(currentUser?.id || ''),
      }).catch((error) => {
        console.error('Failed to delete file:', error);
      });

      removeFilesFromState([id]);

      if (targetFile && wasActive) {
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `${targetFile.name} was removed from this session. Future analysis will no longer include it unless you upload or import it again.`,
          timestamp: Date.now(),
          persona: 'System Notice',
        }]);
      }
    })();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogout = async () => {
    try {
      await csrfFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      localStorage.removeItem('mastiff_token');
      localStorage.removeItem('mastiff_user');
      localStorage.removeItem('mastiff_session_id');
      setConnectors([]);
      setLinkedConnectorIds([]);
      window.location.href = '/login';
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        createNewSession();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, []);

  // Show loading while checking auth
  if (isAuthChecking || !currentUser) {
    return (
      <div className="relative flex h-[100dvh] min-h-[100dvh] items-center justify-center overflow-hidden bg-transparent px-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[12%] top-[14%] h-72 w-72 rounded-full bg-sky-400/[0.12] blur-[120px]" />
          <div className="absolute right-[10%] top-[12%] h-64 w-64 rounded-full bg-amber-300/[0.12] blur-[120px]" />
          <div className="absolute bottom-[10%] left-[40%] h-72 w-72 rounded-full bg-teal-400/10 blur-[140px]" />
        </div>
        <div className="relative glass min-w-[320px] rounded-[32px] px-10 py-12 text-center shadow-[0_30px_100px_rgba(2,6,23,0.42)]">
          <BrandLockup
            align="center"
            size={58}
            subtitle="Launching Mastiff"
            title="Decision Intelligence"
            className="justify-center"
          />
          <p className="mt-4 text-sm text-slate-300/80">
            Restoring your workspaces, connectors, and analysis context.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Loader2 size={20} className="animate-spin text-sky-300" />
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-sky-100/70">
              Warming the cockpit
            </span>
          </div>
        </div>
      </div>
    );
  }

  const currentSession = sessions.find(s => s.id === sessionId) || null;

  return (
    <div
      className={`relative flex h-[100dvh] min-h-[100dvh] overflow-hidden text-slate-100 drop-zone ${isDragging ? 'drop-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-5%] top-[-2%] h-80 w-80 rounded-full bg-sky-400/10 blur-[140px]" />
        <div className="absolute right-[-4%] top-[8%] h-80 w-80 rounded-full bg-teal-400/[0.09] blur-[140px]" />
        <div className="absolute bottom-[-8%] left-[38%] h-96 w-96 rounded-full bg-amber-300/[0.08] blur-[160px]" />
      </div>

      <Sidebar
        files={files}
        pendingFiles={pendingFiles}
        activeFileIds={activeFileIds}
        connectors={connectors}
        linkedConnectorIds={linkedConnectorIds}
        isLoadingConnectors={isLoadingConnectors}
        onRefreshConnectors={() => currentUser && loadConnectors(currentUser.id)}
        onCreateConnector={createConnector}
        onUpdateConnector={updateConnector}
        onDeleteConnector={deleteConnectorById}
        onTestConnector={testConnector}
        onLoadConnectorSources={loadConnectorSources}
        onImportConnectorSources={importConnectorSources}
        onToggleLinkedConnector={toggleLinkedConnector}
        isSidebarOpen={isSidebarOpen}
        currentUser={currentUser}
        onClose={() => setIsSidebarOpen(false)}
        onClearMessages={createNewSession}
        onFileUpload={handleFileUpload}
        onToggleFile={(id) => setActiveFileIds(prev => prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id])}
        onInspectFile={(id) => {
          setInspectorFocusTerm('');
          setInspectingFileId(id);
        }}
        onDeleteFile={deleteFile}
        onDeletePendingFile={rejectPendingFile}
        fileInputRef={fileInputRef}
        sessions={sessions}
        currentSessionId={sessionId}
        onSwitchSession={onSwitchSession}
        onDeleteSession={deleteSession}
        isUploading={isUploading}
        uploadingFileNames={uploadingFileNames}
        onLogout={handleLogout}
      />

      <ChatWindow
        currentSession={currentSession}
        messages={messages}
        isAnalyzing={isAnalyzing}
        isSearchEnabled={isSearchEnabled}
        analysisMode={analysisMode}
        activePersona={activePersona}
        personas={PERSONAS}
        inputText={inputText}
        suggestions={suggestions}
        isLoadingSuggestions={isLoadingSuggestions}
        pendingFiles={pendingFiles}
        files={[...pendingFiles, ...files]}
        activeFiles={files.filter((file) => activeFileIds.includes(file.id))}
        showCodeId={showCodeId}
        showLogsId={showLogsId}
        showPersonaMenu={showPersonaMenu}
        copiedId={copiedId}
        scrollRef={scrollRef}
        fileInputRef={fileInputRef}
        onToggleSidebar={() => setIsSidebarOpen(true)}
        onSetAnalysisMode={handleSetAnalysisMode}
        onTogglePersonaMenu={() => setShowPersonaMenu(!showPersonaMenu)}
        onSelectPersona={(p) => { setActivePersona(p); setShowPersonaMenu(false); }}
        onToggleSearch={() => setIsSearchEnabled(!isSearchEnabled)}
        onInputChange={(text) => setInputText(text)}
        onSend={handleSend}
        onStopAnalysis={stopAnalysis}
        onInspectInsight={inspectInsight}
        onToggleCode={setShowCodeId}
        onToggleLogs={setShowLogsId}
        onCopy={copyToClipboard}
      />

      <DataInspector
        inspectingFileId={inspectingFileId}
        focusTerm={inspectorFocusTerm}
        files={[...pendingFiles, ...files].filter((file) => file.id !== 'sample-sales')}
        pendingFileIds={pendingFiles.map((file) => file.id)}
        onConfirmPendingFile={confirmPendingFile}
        onRejectPendingFile={rejectPendingFile}
        onClose={() => {
          setInspectingFileId(null);
          setInspectorFocusTerm('');
        }}
      />

    </div>
  );
};

export default App;
