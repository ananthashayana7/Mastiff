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
import { buildSharePointImportAutoPrompt, buildUploadAutoPrompt } from '../lib/analysisPrompts';

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
  const [activeFileIds, setActiveFileIds] = useState<string[]>([]);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [linkedConnectorIds, setLinkedConnectorIds] = useState<string[]>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildAuthHeaders = useCallback((userId: string, includeContentType = false): Record<string, string> => {
    const token = localStorage.getItem('mastiff_token');
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-user-id': userId,
      ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    };
  }, []);

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

    const response = await fetch('/api/connectors', {
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

    const response = await fetch(`/api/connectors/${connectorId}`, {
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

    const response = await fetch(`/api/connectors/${connectorId}`, {
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

    const response = await fetch(`/api/connectors/${connectorId}/test`, {
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
    if (!sessionId) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
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
  }, [activeFileIds, activePersona.instruction, analysisMode, linkedConnectorIds, sessionId]);

  const importConnectorSources = useCallback(async (connectorId: string, sources: any[]) => {
    if (!currentUser) throw new Error('No authenticated user');
    if (!sessionId) throw new Error('No active session');

    const response = await fetch(`/api/connectors/${connectorId}/import`, {
      method: 'POST',
      headers: buildAuthHeaders(currentUser.id, true),
      body: JSON.stringify({
        sessionId,
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
      const importedFileNames = importedFiles.map((file: any) => String(file?.filename || 'Imported source')).filter(Boolean);

      const normalized: DataFile[] = importedFiles.map((dbFile: any) => ({
        id: dbFile.id,
        name: dbFile.filename,
        type: dbFile.fileType,
        content: '',
        preview: dbFile.metadata?.sample || [],
        columns: Object.keys(dbFile.metadata?.columns || {}),
        metadata: dbFile.metadata,
      }));

      setFiles((prev) => {
        const existingIds = new Set(prev.map((file) => file.id));
        const deduped = normalized.filter((file) => !existingIds.has(file.id));
        return [...prev, ...deduped];
      });

      setActiveFileIds((prev) => {
        const merged = new Set(prev);
        for (const file of normalized) merged.add(file.id);
        return Array.from(merged);
      });

      const autoPrompt = buildSharePointImportAutoPrompt(importedFileNames);

      await runSilentAnalysis(autoPrompt, {
        targetFileIds: importedFiles.map((f: any) => f.id),
        personaLabel: 'SharePoint Auto Analysis',
      });
    }

    return {
      success: true,
      message: data?.message || `Imported ${importedFiles.length} file(s) from SharePoint.`,
      files: importedFiles,
      skipped: data?.skipped || [],
    };
  }, [buildAuthHeaders, currentUser, runSilentAnalysis, sessionId]);

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
    const token = localStorage.getItem('mastiff_token');
    const userJson = localStorage.getItem('mastiff_user');

    if (token && userJson) {
      try {
        const user = JSON.parse(userJson);
        setCurrentUser({
          id: user.id,
          email: user.email,
          name: user.name || user.email.split('@')[0],
          role: 'Analyst' as const,
          twoFactorEnabled: false
        });
      } catch {
        // Invalid stored data, redirect to login
        window.location.href = '/login';
        return;
      }
    } else {
      window.location.href = '/login';
      return;
    }

    setIsAuthChecking(false);
  }, []);

  // ===== SESSION INIT =====
  useEffect(() => {
    if (!currentUser) return;

    console.log("Mastiff AI v4.0 — Initializing...");
    const initSession = async () => {
      const sres = await fetch(`/api/sessions?userId=${currentUser.id}`);
      const allSessions = await sres.json();
      if (Array.isArray(allSessions)) {
        setSessions(allSessions.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt).getTime(),
          updatedAt: new Date(s.updatedAt).getTime()
        })));
      } else {
        setSessions([]);
      }

      let sId = localStorage.getItem('mastiff_session_id');
      if (sId === 'null' || sId === 'undefined') sId = null;

      if (!sId) {
        try {
          const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
          });
          if (res.ok) {
            const sess = await res.json();
            sId = sess.id;
            if (sId) {
              localStorage.setItem('mastiff_session_id', sId);
              setSessions(prev => [sess, ...prev]);
            }
          }
        } catch (err) {
          console.error("Session creation error:", err);
        }
      }

      setSessionId(sId);

      if (sId && Array.isArray(allSessions)) {
        const session = allSessions.find((s: any) => s.id === sId);
        if (session) loadSessionData(session);
      }

      await loadConnectors(currentUser.id);
    };
    initSession();
  }, [currentUser, loadConnectors]);

  const loadSessionData = (session: any) => {
    setLinkedConnectorIds([]);

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
      setFiles(session.files.map((f: any) => ({
        id: f.id,
        name: f.filename,
        type: f.fileType,
        content: '',
        preview: f.metadata?.sample || [],
        columns: Object.keys(f.metadata?.columns || {}),
        metadata: f.metadata
      })));
      setActiveFileIds(session.files.map((f: any) => f.id));
    } else {
      setFiles([]);
      setActiveFileIds([]);
    }
  };

  const onSwitchSession = async (id: string) => {
    localStorage.setItem('mastiff_session_id', id);
    setSessionId(id);
    setLinkedConnectorIds([]);
    const session = sessions.find(s => s.id === id);
    if (session) {
      loadSessionData(session);
    } else if (currentUser) {
      const res = await fetch(`/api/sessions?userId=${currentUser.id}`);
      const all = await res.json();
      const found = all.find((s: any) => s.id === id);
      if (found) loadSessionData(found);
    }
    setIsSidebarOpen(false);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this analysis session?")) return;

    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
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
    if (files.length > 0 && messages.length === 0) {
      updateSuggestions();
    }
  }, [files, messages]);

  const updateSuggestions = async () => {
    setIsLoadingSuggestions(true);
    try {
      const context = files.map(f => `${f.name}: ${f.columns.join(', ')}`).join('\n');
      if (!context) return;
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataContext: context })
      });
      const sugs = await res.json();
      setSuggestions(sugs);
    } catch (err) {
      console.error("Failed to fetch suggestions", err);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // ===== FILE UPLOAD =====
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !sessionId) {
      if (!sessionId) alert("No active session. Please wait or refresh.");
      return;
    }
    await uploadFiles(Array.from(fileList));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFiles = async (fileList: File[]) => {
    if (!sessionId || !currentUser) return;
    setIsUploading(true);
    const uploadedFileNames: string[] = [];
    try {
      for (const file of fileList) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', currentUser.id);
        formData.append('sessionId', sessionId);

        const res = await fetch('/api/files/upload', {
          method: 'POST',
          headers: buildAuthHeaders(currentUser.id),
          body: formData
        });

        if (!res.ok) {
          const errText = await res.text();
          try {
            const err = JSON.parse(errText);
            alert(`Upload failed: ${err.error || err.message || 'Unknown error'}`);
          } catch (e) {
            alert(`Upload failed: ${errText.slice(0, 100)}`);
          }
          continue;
        }

        const dbFile = await res.json();
        const newFile: DataFile = {
          id: dbFile.id,
          name: dbFile.filename,
          type: dbFile.fileType,
          content: '',
          preview: dbFile.metadata?.sample || [],
          columns: Object.keys(dbFile.metadata?.columns || {}),
          metadata: dbFile.metadata
        };

        setFiles(prev => [...prev, newFile]);
        setActiveFileIds(prev => [...prev, newFile.id]);
        uploadedFileNames.push(dbFile.filename);
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setIsUploading(false);
      lastUploadTime.current = Date.now();
      // Auto-trigger initial analysis after upload
      if (uploadedFileNames.length > 0) {
        const autoPrompt = buildUploadAutoPrompt(uploadedFileNames);
        setTimeout(() => handleAutoAnalysis(autoPrompt), 300);
      }
    }
  };

  const handleAutoAnalysis = async (prompt: string) => {
    await runSilentAnalysis(prompt, { personaLabel: 'System Analysis' });
  };

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
      uploadFiles(droppedFiles);
    }
  }, [sessionId, currentUser?.id]);

  // ===== SEND MESSAGE (with analysis mode) =====
  const handleSend = async (overridePrompt?: string) => {
    const promptToUse = overridePrompt || inputText;
    if (!promptToUse.trim() || !sessionId) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: promptToUse, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsAnalyzing(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          content: promptToUse,
          mode: analysisMode,  // ← NOW SENT TO BACKEND
          activeFileIds,
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
        mode: analysisMode,
        sources: assistantMsg.sources
      }]);

      // Update session title if first message
      if (messages.length === 0) {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: promptToUse.slice(0, 50) } : s));
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `An error occurred: ${err?.message || 'Unknown error'}. Please try again.`,
        timestamp: Date.now()
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createNewSession = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, title: "New Chat" })
      });
      if (!res.ok) throw new Error("Failed to create session");

      const sess = await res.json();
      if (sess.id) {
        localStorage.setItem('mastiff_session_id', sess.id);
        setSessionId(sess.id);
        setSessions(prev => [sess, ...prev]);
        setMessages([]);
        setFiles([]);
        setActiveFileIds([]);
        setLinkedConnectorIds([]);
        setIsSidebarOpen(false);
      }
    } catch (err) {
      console.error("Create session error:", err);
      alert("Failed to start new analysis. Please try again.");
    }
  };

  const deleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles(prev => prev.filter(f => f.id !== id));
    setActiveFileIds(prev => prev.filter(fid => fid !== id));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem('mastiff_token');
    localStorage.removeItem('mastiff_user');
    localStorage.removeItem('mastiff_session_id');
    setConnectors([]);
    setLinkedConnectorIds([]);
    window.location.href = '/login';
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
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#E50914] to-[#ff4d4d] rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <span className="text-white text-xl font-black">M</span>
          </div>
          <Loader2 size={20} className="text-[#E50914] animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  const currentSession = sessions.find(s => s.id === sessionId) || null;

  return (
    <div
      className={`flex h-screen bg-[#0a0a0a] text-[#E5E5E5] font-sans selection:bg-[#E50914]/30 selection:text-white overflow-hidden drop-zone ${isDragging ? 'drop-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar
        files={files}
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
        onInspectFile={() => { }}
        onDeleteFile={deleteFile}
        fileInputRef={fileInputRef}
        sessions={sessions}
        currentSessionId={sessionId}
        onSwitchSession={onSwitchSession}
        onDeleteSession={deleteSession}
        isUploading={isUploading}
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
        files={files}
        showCodeId={showCodeId}
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
        onToggleCode={setShowCodeId}
        onCopy={copyToClipboard}
      />

    </div>
  );
};

export default App;
