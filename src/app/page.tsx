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

const PERSONAS: AnalystPersona[] = [
  { id: 'default', name: 'MASTIFF AI', icon: 'M', description: 'Core LLM with Python Sandbox integration.', instruction: 'Focus on comprehensive, logical data analysis.' },
  { id: 'statistician', name: 'Scientist', icon: 'S', description: 'Deep statistical validation.', instruction: 'Explain patterns with statistical rigor.' },
  { id: 'business', name: 'Strategist', icon: 'G', description: 'Business & growth focus.', instruction: 'Recommend actions for growth and ROI.' },
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [files, setFiles] = useState<DataFile[]>([]);
  const [activeFileIds, setActiveFileIds] = useState<string[]>([]);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('analysis');
  const lastUploadTime = useRef<number>(0);

  const handleSetAnalysisMode = (mode: AnalysisMode) => {
    setAnalysisMode(mode);
    // If user changes mode within 10s of an upload, re-trigger auto-analysis
    const now = Date.now();
    if (now - lastUploadTime.current < 10000 && files.length > 0) {
      const lastFiles = files.slice(-1).map(f => f.name);
      const autoPrompt = `Switching to ${mode.toUpperCase()} engine. Re-scanning current data for high-fidelity insights...`;
      handleAutoAnalysis(autoPrompt);
    }
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

  const loadConnectors = useCallback(async (userId: string) => {
    setIsLoadingConnectors(true);
    try {
      const token = localStorage.getItem('mastiff_token');
      const response = await fetch(`/api/connectors?userId=${encodeURIComponent(userId)}&limit=100`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-user-id': userId,
        },
      });

      if (!response.ok) {
        setConnectors([]);
        return;
      }

      const payload = await response.json();
      setConnectors(Array.isArray(payload?.connectors) ? payload.connectors : []);
    } catch (error) {
      console.error('Failed to load connectors:', error);
      setConnectors([]);
    } finally {
      setIsLoadingConnectors(false);
    }
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
    if (session.messages?.length > 0) {
      setMessages(session.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
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
        const autoPrompt = `Upload successful: ${uploadedFileNames.join(', ')}. 
STRICK RULE: DO NOT provide any introductory text, greets, or summaries of your parsing process. 
Begin IMMEDIATELY with:
### 1. Significant Trends & Anomalies
...and provide exactly **3 crisp, professional insights**. 

Focus on:
1. Significant trends, correlations, or high-impact anomalies.
2. Data quality integrity.
3. One boardroom-ready business fact.

MANDATORY: Generate exactly ONE high-fidelity interactive chart (Plotly) with professional styling. Assign it to 'result'.`;
        setTimeout(() => handleAutoAnalysis(autoPrompt), 300);
      }
    }
  };

  const handleAutoAnalysis = async (prompt: string) => {
    if (!sessionId) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content: prompt, mode: analysisMode, silent: true })
      });
      const assistantMsg = await res.json();
      setMessages(prev => [...prev, {
        id: assistantMsg.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: assistantMsg.content,
        code: assistantMsg.code,
        visualization: assistantMsg.visualizationUrl,
        result: assistantMsg.result,
        timestamp: Date.now(),
        persona: 'System Analysis'
      }]);
    } catch (err) {
      console.error("Auto-analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
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
  }, [sessionId]);

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
        })
      });

      const assistantMsg = await res.json();

      setMessages(prev => [...prev, {
        id: assistantMsg.id || `msg-${Date.now()}`,
        role: 'assistant',
        content: assistantMsg.content,
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
        content: `An error occurred: ${err.message}. Please try again.`,
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
        isLoadingConnectors={isLoadingConnectors}
        onRefreshConnectors={() => currentUser && loadConnectors(currentUser.id)}
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
