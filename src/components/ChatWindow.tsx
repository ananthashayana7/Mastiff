"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Menu, Globe, ChevronDown, Cpu, Search, Paperclip, Send,
    Zap, Loader2, Database, FileUp, Terminal, Volume2, Copy, Check, ExternalLink, Sparkles, Download,
    BarChart3, Code2, BrainCircuit, Upload, ArrowRight, MessageSquare, TrendingUp, Table, PlayCircle, ScrollText,
    GripHorizontal, Gauge, AlertTriangle, Square, ScanSearch
} from 'lucide-react';
import { ChatMessage, AnalysisMode, AnalystPersona, DataFile, Session } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { PlotlyRenderer } from './PlotlyRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AutoChartSuggestion } from './AutoChartSuggestion';
import { exportToPDF } from '../services/ReportExporter';
import { BrandLockup, BrandMark } from './BrandMark';

interface ChatWindowProps {
    currentSession: Session | null;
    messages: ChatMessage[];
    isAnalyzing: boolean;
    isSearchEnabled: boolean;
    analysisMode: AnalysisMode;
    activePersona: AnalystPersona;
    personas: AnalystPersona[];
    inputText: string;
    suggestions: string[];
    isLoadingSuggestions: boolean;
    pendingFiles: DataFile[];
    files: DataFile[];
    activeFiles: DataFile[];
    showCodeId: string | null;
    showLogsId: string | null;
    showPersonaMenu: boolean;
    copiedId: string | null;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onToggleSidebar: () => void;
    onSetAnalysisMode: (mode: AnalysisMode) => void;
    onTogglePersonaMenu: () => void;
    onSelectPersona: (p: AnalystPersona) => void;
    onToggleSearch: () => void;
    onInputChange: (text: string) => void;
    onSend: (overridePrompt?: string) => void;
    onStopAnalysis: () => void;
    onInspectInsight: (term: string) => void;
    onToggleCode: (id: string | null) => void;
    onToggleLogs: (id: string | null) => void;
    onCopy: (text: string, id: string) => void;
}

// Unified analysis mode — Chat and Deep Analysis buttons removed per management directive.
const MODE_CONFIG: Record<string, { label: string; desc: string; icon: string }> = {
    analysis: { label: 'ANALYSIS', desc: 'Agentic Data Science & Visualization', icon: '🧠' },
};

export const ChatWindow: React.FC<ChatWindowProps> = ({
    currentSession,
    messages,
    isAnalyzing,
    isSearchEnabled,
    analysisMode,
    activePersona,
    personas,
    inputText,
    suggestions,
    isLoadingSuggestions,
    pendingFiles,
    files,
    activeFiles,
    showCodeId,
    showLogsId,
    showPersonaMenu,
    copiedId,
    scrollRef,
    fileInputRef,
    onToggleSidebar,
    onSetAnalysisMode,
    onTogglePersonaMenu,
    onSelectPersona,
    onToggleSearch,
    onInputChange,
    onSend,
    onStopAnalysis,
    onInspectInsight,
    onToggleCode,
    onToggleLogs,
    onCopy
}) => {
    const [drawerHeight, setDrawerHeight] = useState(192);
    const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(false);
    const [contextChangeNotice, setContextChangeNotice] = useState<string | null>(null);
    const resizeStateRef = useRef<{ startY: number; startHeight: number; pointerId: number } | null>(null);
    const previousActiveFilesRef = useRef<DataFile[]>(activeFiles);

    const starterPrompts = [
        'Profile this dataset and flag data quality issues before analysis.',
        'Summarize the top trends, anomalies, and recommended charts.',
        'Which columns look most predictive, and what should I ask next?',
    ];
    const hasLoadedDatasets = files.some((file) => file.id !== 'sample-sales');
    const hasPendingDatasets = pendingFiles.length > 0;

    const renderAnalysisSteps = () => (
        <div className="flex justify-start animate-fade-in">
            <div className="glass rounded-2xl p-5 shadow-lg min-w-[300px] max-w-[400px] glow-accent">
                <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(251,113,133,0.9),rgba(45,212,191,0.82))] text-white shadow-lg">
                        {isSearchEnabled ? <Globe size={18} className="animate-pulse" /> : <BrainCircuit size={18} className="animate-pulse" />}
                    </div>
                    <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-white">
                            {isSearchEnabled ? 'Autonomous Research' : 'Engine Interrogation'}
                        </p>
                        <p className="text-[7px] font-bold text-zinc-600 uppercase tracking-widest mt-1">
                            {activePersona.name} • {(MODE_CONFIG[analysisMode] || MODE_CONFIG.analysis).label}
                        </p>
                    </div>
                </div>

                <div className="space-y-2.5">
                    {[
                        { label: 'Synthesizing Intelligence', active: true, done: true },
                        { label: `${(MODE_CONFIG[analysisMode] || MODE_CONFIG.analysis).label} Environment Active`, active: true, done: false },
                        { label: 'Interrogating Python Sandbox', active: false, done: false },
                        { label: 'Formatting Forensic Insights', active: false, done: false },
                    ].map((step, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black transition-all ${step.done ? 'bg-green-500/20 text-green-400' : step.active ? 'bg-sky-400/20 text-sky-300' : 'bg-zinc-900 text-zinc-700'}`}>
                                {step.done ? '✓' : step.active ? <Loader2 size={10} className="animate-spin" /> : (i + 1)}
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${step.done ? 'text-green-400' : step.active ? 'text-white' : 'text-zinc-700'}`}>
                                {step.label}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-zinc-600">
                    <p className="text-[7px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Terminal size={10} /> Mode Effect: {analysisMode === 'analysis' ? 'Deep-interrogation / Statistical' : 'Conversational / Heuristic'}
                    </p>
                    <p className="text-[7px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Cpu size={10} /> Kernel: Stateful Python 3.11 Sandbox
                    </p>
                </div>

                <div className="mt-4 h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <div className="h-full animate-shimmer bg-gradient-to-r from-sky-400 via-teal-300 to-amber-300" style={{ width: '40%' }} />
                </div>
            </div>
        </div>
    );

    const extractRecommendedActions = (content: string): string[] => {
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith('→ Action:'))
            .map((line) => line.replace(/^→ Action:\s*/, '').trim())
            .filter(Boolean)
            .slice(0, 4);
    };

    const buildActionPrompt = (action: string): string => {
        const datasetContext = activeFiles.length > 0
            ? `Use only these active datasets: ${activeFiles.map((file) => file.name).join(', ')}.`
            : 'Use the current active context only.';

        return `${datasetContext} Investigate this recommended action in depth: ${action}. Show the specific rows, calculations, and visual checks that support your conclusion.`;
    };

    const buildConcernPrompt = (concern: string): string => {
        const datasetContext = activeFiles.length > 0
            ? `Use only these active datasets: ${activeFiles.map((file) => file.name).join(', ')}.`
            : 'Use the current active context only.';

        return `${datasetContext} Deep dive into this concern: ${concern}. Show the rows and columns driving it, focus on the latest relevant period, and surface the top 3 anomalies or contributors with exact values.`;
    };

    const extractTopConcerns = (content: string): string[] => {
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !line.startsWith('→ Action:'))
            .filter((line) => !/^forecast\s*:/i.test(line))
            .map((line) => line.replace(/^[-*]\s+|^\d+[.)]\s+/, '').trim())
            .filter((line) => line.length > 12)
            .slice(0, 3);
    };

    const renderInsightText = (text: string) => {
        return text.split(/(\$?[-+]?\d[\d,.]*(?:\.\d+)?%?)/g).map((segment, index) => {
            if (!segment) {
                return null;
            }

            const isNumericSegment = /\$?[-+]?\d[\d,.]*(?:\.\d+)?%?/.test(segment);
            return isNumericSegment ? (
                <span key={`${segment}-${index}`} className="font-mono text-zinc-100 tracking-tight">
                    {segment}
                </span>
            ) : (
                <React.Fragment key={`${segment}-${index}`}>{segment}</React.Fragment>
            );
        });
    };

    const latestAssistantMessage = useMemo(() => {
        return [...messages].reverse().find((message) => message.role === 'assistant') || null;
    }, [messages]);

    const latestTopConcerns = useMemo(() => {
        const envelopeInsights = latestAssistantMessage?.result?.responseEnvelope?.insights || [];
        if (envelopeInsights.length > 0) {
            return envelopeInsights.slice(0, 3);
        }

        return latestAssistantMessage ? extractTopConcerns(latestAssistantMessage.content) : [];
    }, [latestAssistantMessage]);

    const latestRecommendedActions = useMemo(() => {
        return latestAssistantMessage ? extractRecommendedActions(latestAssistantMessage.content) : [];
    }, [latestAssistantMessage]);

    const latestForecast = latestAssistantMessage?.result?.responseEnvelope?.forecast || null;
    const isInsightsDrawerVisible = latestTopConcerns.length > 0 || latestRecommendedActions.length > 0 || Boolean(latestForecast);

    const contextMeter = useMemo(() => {
        const totalEstimatedCells = activeFiles.reduce((sum, file) => {
            const rowCount = file.metadata?.row_count || file.preview.length || 0;
            const columnCount = file.metadata?.selectedColumns?.length || file.columns.length || 1;
            return sum + (rowCount * Math.max(columnCount, 1));
        }, 0);

        let status: 'Comfortable' | 'Elevated' | 'Crowded' = 'Comfortable';
        let tone = 'bg-emerald-400';
        let textTone = 'text-emerald-300';

        if (totalEstimatedCells > 180000 || activeFiles.length >= 5) {
            status = 'Crowded';
            tone = 'bg-red-400';
            textTone = 'text-red-300';
        } else if (totalEstimatedCells > 70000 || activeFiles.length >= 3) {
            status = 'Elevated';
            tone = 'bg-amber-400';
            textTone = 'text-amber-300';
        }

        return {
            totalEstimatedCells,
            status,
            tone,
            textTone,
            percent: Math.min(totalEstimatedCells / 220000, 1),
        };
    }, [activeFiles]);

    useEffect(() => {
        if (!isInsightsDrawerVisible) {
            setIsDrawerCollapsed(false);
            return;
        }

        setIsDrawerCollapsed(false);
    }, [latestAssistantMessage?.id, isInsightsDrawerVisible]);

    useEffect(() => {
        const previousActiveFiles = previousActiveFilesRef.current;
        const removedFiles = previousActiveFiles.filter((file) => !activeFiles.some((activeFile) => activeFile.id === file.id));

        previousActiveFilesRef.current = activeFiles;

        if (removedFiles.length === 0) {
            return;
        }

        const removedLabel = removedFiles.slice(0, 2).map((file) => file.name).join(', ');
        setContextChangeNotice(`${removedLabel}${removedFiles.length > 2 ? ` and ${removedFiles.length - 2} more` : ''} removed from active chat context.`);

        const timeout = window.setTimeout(() => setContextChangeNotice(null), 3200);
        return () => window.clearTimeout(timeout);
    }, [activeFiles]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!resizeStateRef.current) {
                return;
            }

            const maxHeight = Math.max(220, Math.floor(window.innerHeight * 0.6));
            const minHeight = 96;
            const delta = resizeStateRef.current.startY - event.clientY;
            const nextHeight = Math.min(maxHeight, Math.max(minHeight, resizeStateRef.current.startHeight + delta));
            setDrawerHeight(nextHeight);
        };

        const handlePointerUp = (event: PointerEvent) => {
            if (!resizeStateRef.current) {
                return;
            }

            if (event.pointerId !== resizeStateRef.current.pointerId) {
                return;
            }

            if (drawerHeight < 132) {
                setIsDrawerCollapsed(true);
            }

            resizeStateRef.current = null;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [drawerHeight]);

    const startDrawerResize = (event: React.PointerEvent<HTMLDivElement>) => {
        setIsDrawerCollapsed(false);
        resizeStateRef.current = {
            startY: event.clientY,
            startHeight: drawerHeight,
            pointerId: event.pointerId,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ns-resize';
    };

    return (
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
            {/* Header */}
            <header className="mx-4 mt-4 flex shrink-0 items-center justify-between rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(11,16,29,0.72))] px-5 py-3 shadow-[0_20px_70px_rgba(2,6,23,0.28)] backdrop-blur-xl sm:mx-6 lg:mx-8 z-20">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button className="rounded-xl p-2 text-slate-400 transition-colors hover:text-white md:hidden" onClick={onToggleSidebar}>
                        <Menu size={18} />
                    </button>

                    <div className="hidden sm:flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        <BrandMark size={34} />
                        <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-sky-200/70">
                                Analysis Cockpit
                            </p>
                            <p className="truncate text-[12px] font-bold text-white">
                                {currentSession?.title || 'New analysis'}
                            </p>
                        </div>
                    </div>

                    {/* Persona Selector */}
                    <div className="relative">
                        <button
                            onClick={onTogglePersonaMenu}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 transition-all hover:border-sky-300/30 hover:bg-white/[0.08]"
                        >
                            <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(56,189,248,0.9),rgba(251,113,133,0.85))] text-[9px] font-black text-white shadow-sm">
                                {activePersona.icon}
                            </span>
                            <span className="hidden text-[9px] font-extrabold uppercase tracking-[0.22em] text-slate-200 sm:inline">
                                {activePersona.name}
                            </span>
                            <ChevronDown size={10} className="text-slate-400" />
                        </button>
                        {showPersonaMenu && (
                            <div className="absolute left-0 top-full z-[50] mt-2 w-56 animate-scale-in rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(10,16,28,0.9))] p-1.5 shadow-[0_30px_80px_rgba(2,6,23,0.4)] backdrop-blur-xl">
                                {personas.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => onSelectPersona(p)}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${activePersona.id === p.id
                                            ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.28),rgba(251,113,133,0.2))] text-white shadow-lg'
                                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                                            }`}
                                    >
                                        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-900/80 text-[9px] font-black">
                                            {p.icon}
                                        </span>
                                        <div>
                                            <p className="text-[9px] font-extrabold uppercase tracking-widest">{p.name}</p>
                                            <p className="mt-0.5 text-[7px] font-medium text-slate-400">{p.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Live Search Toggle */}
                    <button
                        onClick={onToggleSearch}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-2 transition-all duration-200 ${isSearchEnabled
                            ? 'border-sky-300/35 bg-sky-400/[0.18] text-white glow-accent-strong'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-sky-300/30 hover:text-white'
                            }`}
                    >
                        <Globe size={13} className={isSearchEnabled ? 'animate-pulse' : ''} />
                        <span className="text-[8px] font-extrabold uppercase tracking-widest hidden sm:inline">Search</span>
                    </button>

                    {/* Export */}
                    <button
                        onClick={async () => {
                            const container = document.querySelector('.messages-container');
                            if (container) {
                                (container as HTMLElement).id = 'pdf-export-target';
                                await exportToPDF('pdf-export-target', currentSession?.title || 'Analysis');
                            }
                        }}
                        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-slate-300 transition-all hover:border-amber-300/25 hover:text-white"
                    >
                        <Download size={13} />
                        <span className="text-[8px] font-extrabold uppercase tracking-widest hidden sm:inline">Export</span>
                    </button>
                </div>
            </header>

            {/* Messages Area */}
            <div ref={scrollRef} className="messages-container flex-1 space-y-5 overflow-y-auto px-4 py-5 custom-scrollbar sm:px-6 lg:px-8">
                {/* Welcome Screen */}
                {messages.length === 0 && (
                    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center animate-fade-in">
                        {!hasLoadedDatasets ? (
                            <div className="w-full space-y-8">
                                {/* Logo & Title */}
                                <div className="space-y-4">
                                    <BrandLockup
                                        align="center"
                                        size={72}
                                        title="Mastiff"
                                        className="justify-center"
                                    />
                                    <p className="mx-auto max-w-xl text-sm font-medium leading-relaxed text-slate-300/[0.78]">
                                        Forecast-first analysis, drill-down charts, and crisp action points for the teams that need answers quickly.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
                                    <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-4">
                                        <TrendingUp size={18} className="text-sky-300" />
                                        <p className="mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-sky-200/75">Forecast First</p>
                                        <p className="mt-2 text-[13px] leading-relaxed text-slate-200/[0.88]">Lead with the next likely move, risk, and action instead of drowning in narrative.</p>
                                    </div>
                                    <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-4">
                                        <BarChart3 size={18} className="text-amber-300" />
                                        <p className="mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-amber-200/75">Interactive Views</p>
                                        <p className="mt-2 text-[13px] leading-relaxed text-slate-200/[0.88]">Use filters, range controls, and drill-down charts to move from headline to root cause.</p>
                                    </div>
                                    <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-4 py-4">
                                        <Database size={18} className="text-teal-300" />
                                        <p className="mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-teal-200/75">File + Connector Native</p>
                                        <p className="mt-2 text-[13px] leading-relaxed text-slate-200/[0.88]">Blend uploads and live sources without bouncing between tools or losing context.</p>
                                    </div>
                                </div>

                                {/* Upload Zone */}
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="group mx-auto max-w-2xl cursor-pointer rounded-[32px] border border-dashed border-slate-500/[0.45] bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-7 transition-all duration-300 hover:-translate-y-[1px] hover:border-sky-300/[0.45] hover:bg-sky-300/[0.06]"
                                >
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950/70 transition-all group-hover:bg-sky-400/[0.12]">
                                            <Upload size={22} className="text-slate-300 transition-colors group-hover:text-sky-200" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.26em] text-slate-100 transition-colors group-hover:text-white">
                                                Drop files here or click to upload
                                            </p>
                                            <p className="mt-2 text-[11px] font-medium text-slate-300/70">
                                                CSV • Excel • PDF • Word • Text • JSON • SharePoint-ready
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Or type a message */}
                                <p className="text-[9px] font-black uppercase tracking-[0.34em] text-slate-400/70">
                                    Or start with a question below
                                </p>
                            </div>
                        ) : (
                            /* Suggestions when files are loaded */
                            <div className="w-full space-y-5">
                                <div className="flex items-center justify-center gap-2">
                                    <Zap size={16} className="text-sky-300" />
                                    <h3 className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-slate-300/75">Suggested Analyses</h3>
                                </div>
                                {hasPendingDatasets && (
                                    <div className="mx-auto max-w-2xl rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-left">
                                        <p className="text-[9px] font-extrabold uppercase tracking-[2px] text-amber-200">New data staged</p>
                                        <p className="mt-1 text-[11px] text-zinc-300 leading-relaxed">
                                            {pendingFiles.length} staged file{pendingFiles.length === 1 ? '' : 's'} detected. Suggestions are ready immediately, and you can still review the schema in the inspector before drilling deeper.
                                        </p>
                                    </div>
                                )}
                                {isLoadingSuggestions ? (
                                    <div className="w-full max-w-md mx-auto p-6 glass rounded-2xl relative overflow-hidden">
                                        <div className="absolute inset-0 animate-neural-scan bg-gradient-to-r from-transparent via-sky-400/[0.08] to-transparent -translate-x-full" />
                                        <div className="relative flex flex-col items-center gap-4">
                                            <div className="flex items-center gap-3">
                                                <Loader2 size={16} className="animate-spin text-sky-300" />
                                                <span className="text-[10px] font-extrabold uppercase tracking-[2px] text-white/80">Analyzing your data...</span>
                                            </div>
                                            <div className="w-full max-w-xs h-1 bg-zinc-950 rounded-full overflow-hidden">
                                                <div className="h-full animate-shimmer bg-gradient-to-r from-sky-400 via-teal-300 to-amber-300" style={{ width: '60%' }} />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-w-2xl mx-auto">
                                        {suggestions.map((s, i) => (
                                            <button
                                                key={i}
                                                onClick={() => onSend(s)}
                                                className="group rounded-2xl border border-white/10 bg-white/5 p-3.5 text-left transition-all hover:-translate-y-[1px] hover:border-sky-300/35 hover:bg-white/[0.08]"
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <ArrowRight size={12} className="mt-0.5 shrink-0 text-sky-300 transition-colors group-hover:text-amber-200" />
                                                    <p className="text-[11px] font-semibold leading-tight text-slate-200/[0.82] transition-colors group-hover:text-white">{s}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Messages */}
                {messages.map((m) => (
                    <div key={m.id} className={`animate-fade-in ${m.role === 'user' ? 'flex justify-end' : 'w-full'}`}>
                        {m.role === 'user' ? (
                            /* ── USER BUBBLE ── */
                            <div className="max-w-[72%] rounded-[26px] border border-sky-300/18 bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(13,148,136,0.2),rgba(245,158,11,0.14))] px-5 py-3.5 text-white shadow-[0_10px_35px_rgba(8,47,73,0.28)] backdrop-blur-xl">
                                <div className="text-sm leading-relaxed font-medium">{m.content}</div>
                            </div>
                        ) : (
                            /* ── ASSISTANT — Pretext document layout ── */
                            <div className="w-full space-y-3">
                                {(() => {
                                    const actionItems = extractRecommendedActions(m.content);
                                    const hasLogs = Boolean(m.result?.output || m.result?.error || m.result?.traceback);
                                    const plotlyChartCount = m.result?.plotly_charts?.length || 0;
                                    const imageChartCount = m.result?.charts?.length || 0;
                                    const chartCount = plotlyChartCount + imageChartCount;
                                    const hasVisualizationCard = Boolean(m.visualization);
                                    const hasVisualOutput = chartCount > 0 || hasVisualizationCard;
                                    const hasAutoChartData = Array.isArray(m.result?.updated_df_sample) && m.result.updated_df_sample.length > 0;
                                    const executionOutput = m.result?.output?.trim() || '';
                                    const isEmptyDataNotice = /data is empty after loading/i.test(executionOutput);
                                    const shouldShowExecutionResult = Boolean(executionOutput)
                                        && executionOutput !== 'Analysis complete'
                                        && executionOutput !== 'Execution successful'
                                        && !isEmptyDataNotice;
                                    const executiveInsights = m.result?.responseEnvelope?.insights?.filter(Boolean) || [];
                                    const executiveForecast = m.result?.responseEnvelope?.forecast || '';
                                    const visualRecoveryPrompt = activeFiles.length > 0
                                        ? `Use only these active datasets: ${activeFiles.map((file) => file.name).join(', ')}. Build an executive chart pack with an overview chart, a trend chart, and a driver breakdown.`
                                        : 'Build an executive chart pack from the current analysis context with an overview chart, a trend chart, and a driver breakdown.';
                                    const showVisualDashboard = hasVisualOutput || hasAutoChartData || isEmptyDataNotice || executiveInsights.length > 0 || actionItems.length > 0 || Boolean(executiveForecast);

                                    return (
                                        <>
                                {showVisualDashboard && (
                                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_320px]">
                                        <div className="overflow-hidden rounded-[28px] border border-sky-300/15 bg-[linear-gradient(160deg,rgba(14,24,42,0.96),rgba(8,16,31,0.84))] shadow-[0_22px_70px_rgba(2,6,23,0.28)]">
                                            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                                                <div>
                                                    <p className="text-[8px] font-extrabold uppercase tracking-[0.3em] text-sky-200/75">Visual Brief</p>
                                                    <p className="mt-1 text-sm font-semibold text-white">Interactive chart layer</p>
                                                </div>
                                                {chartCount > 0 && (
                                                    <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-2.5 py-1 text-[8px] font-extrabold uppercase tracking-[0.22em] text-sky-100">
                                                        {chartCount} live view{chartCount === 1 ? '' : 's'}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="p-4">
                                                {hasVisualOutput ? (
                                                    <div className="space-y-3">
                                                        {m.result?.plotly_charts?.map((pChart, idx) => (
                                                            <div key={`${m.id}-plotly-${idx}`} className="w-full overflow-visible">
                                                                <PlotlyRenderer data={pChart} />
                                                            </div>
                                                        ))}
                                                        {m.result?.charts?.map((chart, idx) => (
                                                            <div
                                                                key={`${m.id}-chart-${idx}`}
                                                                className="w-full overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-4"
                                                            >
                                                                <img src={`data:image/png;base64,${chart}`} alt={`Analysis Chart ${idx + 1}`} className="h-auto w-full rounded-xl" />
                                                            </div>
                                                        ))}
                                                        {plotlyChartCount === 0 && imageChartCount === 0 && hasVisualizationCard && (
                                                            <div className="w-full overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-4">
                                                                {typeof m.visualization === 'string' ? (
                                                                    <img src={m.visualization} alt="Visual Analysis" className="h-auto w-full rounded-xl" />
                                                                ) : (
                                                                    <ChartRenderer viz={m.visualization} onDrillDown={onSend} />
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : hasAutoChartData ? (
                                                    <AutoChartSuggestion data={m.result?.updated_df_sample || []} title="Executive View" />
                                                ) : (
                                                    <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/[0.08] p-4">
                                                        <p className="text-[8px] font-extrabold uppercase tracking-[0.28em] text-amber-200">Charts need recovery</p>
                                                        <p className="mt-2 text-sm leading-relaxed text-zinc-100">
                                                            {isEmptyDataNotice
                                                                ? 'The last execution lost usable rows before the chart stage, so the visual layer never mounted.'
                                                                : 'This answer returned narrative insight without a usable chart payload, so the dashboard needs a visualization recovery run.'}
                                                        </p>
                                                        <button
                                                            onClick={() => onSend(visualRecoveryPrompt)}
                                                            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,rgba(14,165,233,0.98),rgba(13,148,136,0.94),rgba(245,158,11,0.88))] px-4 py-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-white transition-all hover:brightness-110"
                                                        >
                                                            <BarChart3 size={12} />
                                                            Regenerate chart pack
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {executiveForecast && (
                                                <div className="rounded-[24px] border border-sky-300/15 bg-[linear-gradient(180deg,rgba(13,23,40,0.96),rgba(8,14,25,0.86))] p-4 shadow-[0_16px_50px_rgba(2,6,23,0.22)]">
                                                    <p className="text-[8px] font-extrabold uppercase tracking-[0.26em] text-sky-200/75">Forecast</p>
                                                    <p className="mt-2 text-sm leading-relaxed text-zinc-100">{renderInsightText(executiveForecast)}</p>
                                                </div>
                                            )}

                                            {executiveInsights.length > 0 && (
                                                <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,21,36,0.94),rgba(8,13,24,0.86))] p-4 shadow-[0_16px_50px_rgba(2,6,23,0.18)]">
                                                    <p className="text-[8px] font-extrabold uppercase tracking-[0.26em] text-amber-200/75">Top Signals</p>
                                                    <div className="mt-3 space-y-2">
                                                        {executiveInsights.slice(0, 3).map((insight, index) => (
                                                            <div key={`${m.id}-signal-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
                                                                <p className="text-[8px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Signal {index + 1}</p>
                                                                <p className="mt-1 text-[12px] leading-relaxed text-zinc-100">{renderInsightText(insight)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {actionItems.length > 0 && (
                                                <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,21,36,0.94),rgba(8,13,24,0.86))] p-4 shadow-[0_16px_50px_rgba(2,6,23,0.18)]">
                                                    <p className="text-[8px] font-extrabold uppercase tracking-[0.26em] text-teal-200/75">Action Queue</p>
                                                    <div className="mt-3 space-y-2">
                                                        {actionItems.slice(0, 4).map((action) => (
                                                            <button
                                                                key={`${m.id}-${action}`}
                                                                onClick={() => onSend(buildActionPrompt(action))}
                                                            className="w-full rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-2.5 text-left text-[11px] font-semibold leading-relaxed text-zinc-100 transition-all hover:bg-emerald-400/[0.14]"
                                                            >
                                                                {action}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ── TEXT CARD ── */}
                                <div className="w-full overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,39,0.92),rgba(10,15,27,0.74))] shadow-[0_18px_50px_rgba(2,6,23,0.24)]">

                                    {/* Brand strip */}
                                    <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-3">
                                        <BrandMark size={22} />
                                        <span className="text-[8px] font-extrabold uppercase tracking-[0.3em] text-sky-200/75">Mastiff</span>
                                        {m.persona && <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-slate-400">· {m.persona}</span>}
                                        <span className="ml-auto text-[8px] font-medium tabular-nums text-slate-400">
                                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    {/* Main text content */}
                                    <div className="px-5 py-4">
                                        <MarkdownRenderer content={m.content} className="text-[13px] leading-relaxed text-zinc-200" />
                                    </div>

                                    {!showVisualDashboard && actionItems.length > 0 && (
                                        <div className="px-5 pb-4 space-y-2 border-t border-zinc-800/30 pt-3">
                                            <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                                                <PlayCircle size={10} /> Recommended Actions
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {actionItems.map((action) => (
                                                    <button
                                                        key={`${m.id}-${action}`}
                                                        onClick={() => onSend(buildActionPrompt(action))}
                                                        className="rounded-full border border-emerald-300/25 bg-emerald-400/[0.08] px-3 py-1.5 text-left text-[10px] font-semibold text-zinc-200 transition-all hover:bg-emerald-400/[0.14] hover:text-white"
                                                    >
                                                        {action}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Grounding Sources */}
                                    {m.sources && m.sources.length > 0 && (
                                        <div className="px-5 pb-4 space-y-2">
                                            <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                                                <Globe size={10} /> Sources
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {m.sources.map((src, i) => (
                                                    <a key={`src-${m.id}-${i}`} href={src.uri} target="_blank" rel="noopener noreferrer"
                                                        className="flex items-center gap-1.5 px-2.5 py-1 glass rounded-lg text-[9px] font-bold text-zinc-400 hover:text-white transition-all">
                                                        <span className="truncate max-w-[140px]">{src.title}</span>
                                                        <ExternalLink size={8} />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Execution result output */}
                                    {shouldShowExecutionResult && (
                                        <div className="px-5 pb-4 border-t border-zinc-800/40 pt-3">
                                            <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5 mb-2">
                                                <Table size={10} /> Result
                                            </p>
                                            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800/50">
                                                <pre className="font-mono text-[10px] text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.output}</pre>
                                            </div>
                                        </div>
                                    )}

                                    {/* Footer actions */}
                                    <div className="flex items-center gap-3 px-4 py-2.5 border-t border-zinc-800/30">
                                        <button onClick={() => onCopy(m.content, m.id)}
                                            className="flex items-center gap-1.5 text-[8px] font-extrabold text-zinc-600 hover:text-white uppercase tracking-widest transition-colors">
                                            {copiedId === m.id ? <Check size={10} /> : <Copy size={10} />}
                                            {copiedId === m.id ? 'Copied' : 'Copy'}
                                        </button>
                                        {hasLogs && (
                                            <button onClick={() => onToggleLogs(showLogsId === m.id ? null : m.id)}
                                                className="flex items-center gap-1.5 text-[8px] font-extrabold text-zinc-600 hover:text-white uppercase tracking-widest transition-colors">
                                                <ScrollText size={10} />
                                                {showLogsId === m.id ? 'Hide Logs' : 'View Logs'}
                                            </button>
                                        )}
                                        {m.code && (
                                            <button onClick={() => onToggleCode(showCodeId === m.id ? null : m.id)}
                                                className="flex items-center gap-1.5 text-[8px] font-extrabold text-zinc-600 hover:text-white uppercase tracking-widest transition-colors">
                                                <Terminal size={10} />
                                                {showCodeId === m.id ? 'Hide Code' : 'View Code'}
                                            </button>
                                        )}
                                        {chartCount > 1 && (
                                            <span className="ml-auto text-[8px] font-extrabold text-zinc-700 uppercase tracking-widest">
                                                {chartCount} charts in dashboard
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* ── CODE BLOCK (collapsible, outside main card) ── */}
                                {m.code && showCodeId === m.id && (
                                    <div className="w-full rounded-2xl overflow-hidden border border-zinc-800/60 animate-scale-in">
                                        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/40 bg-zinc-950/60">
                                            <span className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                                                <Code2 size={10} /> Python · Analysis Code
                                            </span>
                                            <button onClick={() => onCopy(m.code || '', `code-${m.id}`)}
                                                className="p-1.5 glass rounded-lg text-zinc-600 hover:text-white transition-colors">
                                                {copiedId === `code-${m.id}` ? <Check size={11} /> : <Copy size={11} />}
                                            </button>
                                        </div>
                                        <pre className="p-4 bg-[#0a0a0a] font-mono text-[10px] text-green-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-words max-h-[80vh] overflow-y-auto custom-scrollbar">
                                            {m.code}
                                        </pre>
                                        {m.result?.error && (
                                            <pre className="px-4 pb-4 bg-[#0a0a0a] font-mono text-[10px] text-red-400 overflow-x-auto">
                                                {m.result.error}{m.result.traceback ? `\n\n${m.result.traceback}` : ''}
                                            </pre>
                                        )}
                                    </div>
                                )}

                                {hasLogs && showLogsId === m.id && (
                                    <div className="w-full rounded-2xl overflow-hidden border border-zinc-800/60 animate-scale-in bg-[#0a0a0a]">
                                        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/40 bg-zinc-950/60">
                                            <span className="text-[8px] font-extrabold text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                                                <ScrollText size={10} /> Execution Logs
                                            </span>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            {m.result?.output && (
                                                <div>
                                                    <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 mb-2">Output</p>
                                                    <pre className="font-mono text-[10px] text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.output}</pre>
                                                </div>
                                            )}
                                            {m.result?.error && (
                                                <div>
                                                    <p className="text-[8px] font-extrabold uppercase tracking-widest text-red-400 mb-2">Error</p>
                                                    <pre className="font-mono text-[10px] text-red-400 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.error}</pre>
                                                </div>
                                            )}
                                            {m.result?.traceback && (
                                                <div>
                                                    <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 mb-2">Traceback</p>
                                                    <pre className="font-mono text-[10px] text-amber-300 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.traceback}</pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ── CHARTS SECTION — full-width, stacked vertically ── */}
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                ))}

                {/* Analysis Progress */}
                {isAnalyzing && renderAnalysisSteps()}
            </div>

            {isInsightsDrawerVisible && (
                <div className="shrink-0 px-4 sm:px-5 pb-2">
                    <div className="max-w-5xl mx-auto rounded-2xl border border-zinc-800/60 bg-zinc-950/75 backdrop-blur-sm overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
                        <div
                            onPointerDown={startDrawerResize}
                            className="h-6 flex items-center justify-center cursor-ns-resize border-b border-zinc-800/40 bg-zinc-950/90 touch-none"
                            title="Drag to resize insights drawer"
                        >
                            <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-black/30 px-3 py-1 text-zinc-600">
                                <GripHorizontal size={12} />
                                <span className="text-[8px] font-extrabold uppercase tracking-[2px]">Top Concerns + Recommended Actions</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/40">
                            <div>
                                <p className="text-[9px] font-extrabold uppercase tracking-[2px] text-zinc-400">Insight Drawer</p>
                                <p className="text-[11px] text-zinc-600 mt-1">Keep it compact as a HUD or drag it open for a deeper review.</p>
                            </div>
                            <button
                                onClick={() => setIsDrawerCollapsed((prev) => !prev)}
                                className="px-3 py-1.5 rounded-lg border border-zinc-800 text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
                            >
                                {isDrawerCollapsed ? 'Expand' : 'Collapse'}
                            </button>
                        </div>

                        {!isDrawerCollapsed && (
                            <div
                                className="overflow-y-auto custom-scrollbar"
                                style={{ height: `${drawerHeight}px` }}
                            >
                                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4 p-4">
                                    <section className="rounded-2xl border border-zinc-800/60 bg-black/20 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <AlertTriangle size={14} className="text-amber-300" />
                                            <p className="text-[9px] font-extrabold uppercase tracking-[2px] text-zinc-400">Top Concerns</p>
                                        </div>
                                        <div className="space-y-2.5">
                                            {latestTopConcerns.length > 0 ? latestTopConcerns.map((insight, index) => (
                                                <button
                                                    key={`${latestAssistantMessage?.id || 'drawer'}-insight-${index}`}
                                                    onClick={() => onSend(buildConcernPrompt(insight))}
                                                    className="w-full rounded-xl border border-zinc-800/50 bg-zinc-900/40 px-3 py-2.5 text-left transition-all hover:border-sky-300/30 hover:bg-zinc-900/70"
                                                >
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-600">Concern {index + 1}</p>
                                                        <div className="flex items-center gap-2">
                                                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-200">
                                                                <PlayCircle size={11} /> Run Deep Dive
                                                            </span>
                                                            <span
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    onInspectInsight(insight);
                                                                }}
                                                                className="inline-flex items-center gap-1 text-[9px] font-bold text-zinc-500 hover:text-white transition-colors"
                                                                role="button"
                                                                tabIndex={0}
                                                                onKeyDown={(event) => {
                                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        onInspectInsight(insight);
                                                                    }
                                                                }}
                                                            >
                                                                <ScanSearch size={11} /> Inspect Rows
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="text-[12px] leading-relaxed text-zinc-200">{renderInsightText(insight)}</p>
                                                </button>
                                            )) : (
                                                isAnalyzing ? (
                                                    <div className="space-y-2 animate-pulse">
                                                        <div className="h-16 rounded-xl bg-zinc-900/50 border border-zinc-800/40" />
                                                        <div className="h-16 rounded-xl bg-zinc-900/50 border border-zinc-800/40" />
                                                    </div>
                                                ) : (
                                                    <p className="text-[11px] text-zinc-600">Run an analysis to populate the highest-priority concerns here.</p>
                                                )
                                            )}

                                            {latestForecast && (
                                                <div className="rounded-xl border border-sky-300/20 bg-sky-400/[0.08] px-3 py-2.5">
                                                    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-sky-200">Forecast</p>
                                                    <p className="text-[12px] leading-relaxed text-zinc-200">{renderInsightText(latestForecast)}</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section className="rounded-2xl border border-zinc-800/60 bg-black/20 p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <PlayCircle size={14} className="text-emerald-200" />
                                            <p className="text-[9px] font-extrabold uppercase tracking-[2px] text-zinc-400">Recommended Actions</p>
                                        </div>
                                        <div className="space-y-2.5">
                                            {latestRecommendedActions.length > 0 ? latestRecommendedActions.map((action) => (
                                                <button
                                                    key={`${latestAssistantMessage?.id || 'drawer'}-action-${action}`}
                                                    onClick={() => onSend(buildActionPrompt(action))}
                                                    className="w-full rounded-xl border border-emerald-300/25 bg-emerald-400/[0.08] px-3 py-3 text-left transition-all hover:border-emerald-300/40 hover:bg-emerald-400/[0.14]"
                                                >
                                                    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-emerald-200">Run This Follow-Up</p>
                                                    <p className="text-[12px] leading-relaxed text-zinc-100">{action}</p>
                                                </button>
                                            )) : isAnalyzing ? (
                                                <div className="space-y-2 animate-pulse">
                                                    <div className="h-14 rounded-xl border border-emerald-300/[0.15] bg-emerald-400/[0.08]" />
                                                    <div className="h-14 rounded-xl border border-emerald-300/[0.15] bg-emerald-400/[0.08]" />
                                                </div>
                                            ) : (
                                                <p className="text-[11px] text-zinc-600">Action prompts will appear here when the agent returns concrete next steps.</p>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="shrink-0 bg-gradient-to-t from-[#07111f] via-[#07111f]/94 to-transparent p-4 sm:p-5">
                <div className="max-w-3xl mx-auto relative">
                    <div className="mb-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[8px] font-extrabold uppercase tracking-[0.24em] text-slate-400">Active Datasets</span>
                            {activeFiles.length > 0 ? activeFiles.slice(0, 4).map((file) => (
                                <span
                                    key={file.id}
                                    className="inline-flex items-center gap-1 rounded-full border border-sky-300/20 bg-sky-400/[0.08] px-2.5 py-1 text-[9px] font-bold text-slate-100 transition-all hover:-translate-y-[1px] hover:border-sky-300/[0.38] hover:bg-sky-400/[0.12]"
                                >
                                    <Database size={10} className="text-sky-200" />
                                    <span className="max-w-[140px] truncate">{file.name}</span>
                                </span>
                            )) : (
                                <span className="text-[10px] text-slate-400/70">No active files selected. Upload a dataset or enable one in the sidebar.</span>
                            )}
                            {activeFiles.length > 4 && (
                                <span className="text-[9px] font-bold text-slate-400">+{activeFiles.length - 4} more</span>
                            )}
                            {hasPendingDatasets && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold text-amber-100">
                                    <Upload size={10} className="text-amber-300" />
                                    {pendingFiles.length} staged
                                </span>
                            )}
                            {activeFiles.length > 1 && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/[0.1] px-2.5 py-1 text-[9px] font-bold text-emerald-100">
                                    <ScanSearch size={10} className="text-emerald-300" />
                                    Cross-file comparison active
                                </span>
                            )}
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Gauge size={13} className="text-sky-300" />
                                    <div>
                                        <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-slate-300">Context Meter</p>
                                        <p className={`text-[10px] font-semibold mt-1 ${contextMeter.textTone}`}>
                                            {contextMeter.status} load • {activeFiles.length} active file{activeFiles.length === 1 ? '' : 's'} • {contextMeter.totalEstimatedCells.toLocaleString()} estimated cells in scope
                                        </p>
                                    </div>
                                </div>
                                {contextMeter.status !== 'Comfortable' && (
                                    <div className="text-right">
                                        <p className="text-[9px] font-bold text-slate-100">Reduce active files or confirm fewer columns.</p>
                                        <p className="text-[9px] text-slate-400/[0.75]">This keeps prompts inside a reliable analysis range.</p>
                                    </div>
                                )}
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950/70">
                                <div className={`h-full ${contextMeter.tone}`} style={{ width: `${Math.max(contextMeter.percent * 100, activeFiles.length > 0 ? 8 : 0)}%` }} />
                            </div>
                        </div>

                        {contextChangeNotice && (
                            <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-[10px] font-semibold text-amber-200 animate-fade-in">
                                {contextChangeNotice}
                            </div>
                        )}

                        {suggestions.length > 0 && hasLoadedDatasets && (
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-slate-300">Suggested Questions</p>
                                        <p className="mt-1 text-[10px] text-slate-400/[0.75]">Use these to move fast from uploaded data to decisions.</p>
                                    </div>
                                    {isLoadingSuggestions && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                            <Loader2 size={11} className="animate-spin" />
                                            Refreshing
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {suggestions.slice(0, 6).map((prompt) => (
                                        <button
                                            key={prompt}
                                            onClick={() => onSend(prompt)}
                                            className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1.5 text-[10px] font-semibold text-slate-200/[0.9] transition-all hover:border-sky-300/35 hover:text-white"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.length === 0 && activeFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {starterPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => onSend(prompt)}
                                            className="rounded-full border border-white/10 bg-slate-950/55 px-3 py-1.5 text-[10px] font-semibold text-slate-300 transition-all hover:border-amber-300/30 hover:text-white"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {isSearchEnabled && (
                        <div className="absolute -top-9 left-0 right-0 flex justify-center animate-fade-in">
                            <div className="flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/[0.16] px-3 py-1 text-[8px] font-extrabold uppercase tracking-[0.24em] text-white shadow-lg glow-accent">
                                <Search size={10} /> Web Search Active
                            </div>
                        </div>
                    )}
                    <div className={`rounded-[30px] border p-[1px] transition-all duration-300 ${inputText ? 'border-sky-300/35 bg-[linear-gradient(135deg,rgba(56,189,248,0.42),rgba(13,148,136,0.24),rgba(245,158,11,0.18))] glow-accent' : 'border-white/10 bg-white/[0.08]'}`}>
                        <div className="flex items-end gap-2.5 rounded-[29px] bg-[linear-gradient(180deg,rgba(15,22,39,0.95),rgba(9,14,24,0.9))] p-2.5 shadow-xl backdrop-blur-xl">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-2xl border border-white/10 bg-slate-950/60 p-2.5 text-slate-300 transition-all hover:border-sky-300/[0.28] hover:text-white"
                            >
                                <Paperclip size={17} />
                            </button>
                            <textarea
                                value={inputText}
                                onChange={e => onInputChange(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                                placeholder={isSearchEnabled ? "Search the web and your data..." : "Ask Mastiff anything — analyze data, generate charts, get insights..."}
                                className="max-h-28 flex-1 resize-none border-none bg-transparent py-2 text-sm font-medium text-white placeholder:text-slate-500 custom-scrollbar focus:ring-0"
                                rows={1}
                            />
                            <button
                                onClick={() => isAnalyzing ? onStopAnalysis() : onSend()}
                                disabled={isAnalyzing ? false : !inputText.trim()}
                                className={`rounded-2xl p-2.5 transition-all duration-200 ${isAnalyzing
                                    ? 'border border-amber-400/20 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                                    : inputText.trim()
                                        ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.98),rgba(251,113,133,0.92))] text-white shadow-lg glow-accent hover:brightness-110 active:scale-95'
                                        : 'bg-slate-950/70 text-slate-600'
                                    }`}
                            >
                                {isAnalyzing ? <Square size={17} /> : <Send size={17} />}
                            </button>
                        </div>
                    </div>
                    <p className="mt-2 text-center text-[8px] font-medium text-slate-400/70">
                        Mastiff can make mistakes. Verify important analyses, and use View Code on any answer to inspect the generated Python.
                    </p>
                </div>
            </div>
        </main>
    );
};
