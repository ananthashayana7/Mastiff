import React, { useState, useEffect, useRef } from 'react';
import { DataFile, ChatMessage, AnalysisMode, User as UserType, AnalystPersona, Session } from './types';
import { Sidebar } from './src/components/Sidebar';
import { ChatWindow } from './src/components/ChatWindow';
import { DataInspector } from './src/components/DataInspector';

const PERSONAS: AnalystPersona[] = [
  { id: 'default', name: 'Standard', icon: 'B', description: 'General purpose analysis.', instruction: 'Focus on clarity and facts.' },
  { id: 'statistician', name: 'Scientist', icon: 'S', description: 'Deep statistical validation.', instruction: 'Explain patterns with statistical rigor.' },
  { id: 'business', name: 'Strategist', icon: 'G', description: 'Business & growth focus.', instruction: 'Recommend actions for growth and ROI.' },
];

const SAMPLE_FILES: DataFile[] = [
  {
    id: 'sample-sales',
    name: 'Global_Sales_2024.csv',
    type: 'csv',
    content: '',
    preview: [
      { Date: '2024-01-01', Region: 'North', Sales: 1200, Growth: 5.2 },
      { Date: '2024-01-02', Region: 'South', Sales: 850, Growth: -1.4 },
      { Date: '2024-01-03', Region: 'East', Sales: 2100, Growth: 12.1 }
    ],
    columns: ['Date', 'Region', 'Sales', 'Growth'],
    metadata: {
      row_count: 1250,
      column_count: 4,
      columns: {
        Sales: {
          dtype: 'float64',
          null_count: 0,
          unique_count: 1100,
          sample_values: [1200, 850, 2100],
          stats: { min: 450, max: 5200, mean: 2150.45, median: 1980, std: 850.2, q1: 1200, q3: 3100 }
        }
      },
      sample: []
    }
  }
];

const DEFAULT_USER: UserType = {
  id: 'd34d50c7-5be9-47d3-9af7-b9be6a4ebdc8',
  email: 'admin@beagle.ai',
  name: 'Lead Analyst',
  role: 'Admin',
  twoFactorEnabled: false
};

const App: React.FC = () => {
  const [currentUser] = useState<UserType>(DEFAULT_USER);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [files, setFiles] = useState<DataFile[]>(SAMPLE_FILES);
  const [activeFileIds, setActiveFileIds] = useState<string[]>([]);
  const [inspectingFileId, setInspectingFileId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('standard');
  const [activePersona, setActivePersona] = useState<AnalystPersona>(PERSONAS[0]);
  const [showCodeId, setShowCodeId] = useState<string | null>(null);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log("Beagle App Version 2.1 - Initializing...");
    const initSession = async () => {
      // Cleanup legacy u1 state
      if (localStorage.getItem('beagle_session_id') === 'u1') {
        localStorage.removeItem('beagle_session_id');
      }
      try {
        const sres = await fetch(`/api/sessions?userId=${currentUser.id}`);
        const allSessions = await sres.json();
        setSessions(allSessions.map((s: any) => ({
          ...s,
          createdAt: new Date(s.createdAt).getTime(),
          updatedAt: new Date(s.updatedAt).getTime()
        })));

        let sId = localStorage.getItem('beagle_session_id');
        if (!sId) {
          const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
          });
          const sess = await res.json();
          sId = sess.id;
          if (sId) {
            localStorage.setItem('beagle_session_id', sId);
            setSessions(prev => [sess, ...prev]);
          }
        }
        setSessionId(sId);

        if (sId) {
          const currentSess = allSessions.find((s: any) => s.id === sId);
          if (currentSess) loadSessionData(currentSess);
        }
      } catch (err) {
        console.error("Session init failed", err);
      }
    };
    initSession();
  }, [currentUser.id]);

  const loadSessionData = (session: any) => {
    if (session.messages?.length > 0) {
      setMessages(session.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        code: m.code,
        visualization: m.visualizationUrl,
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
      setFiles(SAMPLE_FILES);
      setActiveFileIds([]);
    }
  };

  const onSwitchSession = async (id: string) => {
    localStorage.setItem('beagle_session_id', id);
    setSessionId(id);
    setIsSidebarOpen(false);

    const sess = sessions.find(s => s.id === id);
    if (sess) {
      loadSessionData(sess);
    } else {
      try {
        const res = await fetch(`/api/sessions?userId=${currentUser.id}`);
        const all = await res.json();
        const found = all.find((s: any) => s.id === id);
        if (found) loadSessionData(found);
      } catch (err) {
        console.error("Switch session error:", err);
      }
    }
  };

  // Bridge for Data Inspector Workbench
  useEffect(() => {
    (window as any).beagleCleanup = (code: string, label: string) => {
      setInputText(`Cleaning Action: ${label}...`);
      handleSend(`Cleaning Action: ${label}\n\n${code}`); // Include the label in the prompt for context
    };
    return () => { delete (window as any).beagleCleanup; };
  }, [sessionId]);

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this analysis?")) return;
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
        if (sessionId === id) createNewSession();
      }
    } catch (err) {
      console.error("Delete session error:", err);
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
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataContext: context })
      });
      const sugs = await res.json();
      setSuggestions(sugs);
    } catch (err) {
      console.error("Failed suggestions", err);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !sessionId) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(fileList)) {
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
            alert(`Upload failed: ${err.error || err.message}`);
          } catch (e) {
            alert(`Upload failed: ${errText.slice(0, 50)}`);
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

        setFiles(prev => [...prev.filter(f => f.id !== 'sample-sales'), newFile]);
        setActiveFileIds(prev => [...prev, newFile.id]);
        setInspectingFileId(dbFile.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
        body: JSON.stringify({ sessionId, content: promptToUse })
      });
      const assistantMsg = await res.json();

      setMessages(prev => [...prev, {
        id: assistantMsg.id || `msg-${Date.now()}`,
        role: assistantMsg.role || 'assistant',
        content: assistantMsg.content,
        code: assistantMsg.code,
        visualization: assistantMsg.visualizationUrl,
        timestamp: Date.now(),
        mode: analysisMode,
        persona: activePersona.name,
        result: assistantMsg.result
      }]);

      // Update local file preview if cleaned data is returned
      if (assistantMsg.result?.updated_df_sample && inspectingFileId) {
        setFiles(prev => prev.map(f => f.id === inspectingFileId ? {
          ...f,
          preview: assistantMsg.result.updated_df_sample,
          metadata: { ...f.metadata, sample: assistantMsg.result.updated_df_sample } as any
        } : f));
      }

      if (messages.length === 0) {
        setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: promptToUse.slice(0, 30) } : s));
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `Synthesis Error: ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createNewSession = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, title: "New Analysis" })
      });
      const sess = await res.json();
      if (sess.id) {
        localStorage.setItem('beagle_session_id', sess.id);
        setSessionId(sess.id);
        setSessions(prev => [sess, ...prev]);
        setMessages([]);
        setFiles(SAMPLE_FILES);
        setActiveFileIds([]);
        setInspectingFileId(null);
        setIsSidebarOpen(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-screen bg-[#0f0f0f] text-[#E5E5E5] font-sans selection:bg-[#E50914] overflow-hidden">
      <Sidebar
        files={files}
        activeFileIds={activeFileIds}
        isSidebarOpen={isSidebarOpen}
        currentUser={currentUser}
        onClose={() => setIsSidebarOpen(false)}
        onClearMessages={createNewSession}
        onFileUpload={handleFileUpload}
        onToggleFile={(id) => setActiveFileIds(prev => prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id])}
        onInspectFile={setInspectingFileId}
        onDeleteFile={(id, e) => {
          e.stopPropagation();
          setFiles(prev => prev.filter(f => f.id !== id));
          setActiveFileIds(prev => prev.filter(fid => fid !== id));
        }}
        fileInputRef={fileInputRef}
        sessions={sessions}
        currentSessionId={sessionId}
        onSwitchSession={onSwitchSession}
        onDeleteSession={deleteSession}
      />

      <ChatWindow
        currentSession={sessions.find(s => s.id === sessionId) || null}
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
        onSetAnalysisMode={setAnalysisMode}
        onTogglePersonaMenu={() => setShowPersonaMenu(!showPersonaMenu)}
        onSelectPersona={setActivePersona}
        onToggleSearch={() => setIsSearchEnabled(!isSearchEnabled)}
        onInputChange={setInputText}
        onSend={handleSend}
        onToggleCode={setShowCodeId}
        onCopy={copyToClipboard}
      />

      <DataInspector
        inspectingFileId={inspectingFileId}
        files={files}
        onClose={() => setInspectingFileId(null)}
      />
    </div>
  );
};

export default App;
