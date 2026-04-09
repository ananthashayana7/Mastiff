"use client";

import React, { useEffect, useState } from 'react';
import {
    List, Globe, CaretDown, Cpu, MagnifyingGlass, Paperclip, PaperPlaneTilt,
    Lightning, SpinnerGap, FileArrowUp, Terminal, SpeakerHigh, Copy, Check, ArrowSquareOut, Sparkle, DownloadSimple,
    ChartBar, Code, UploadSimple, ArrowRight, Table, PlayCircle, Scroll,
    Square, Scan, TrendUp, ChartLine, ArrowClockwise
} from '@phosphor-icons/react';
import { ChatMessage, AnalysisMode, AnalystPersona, DataFile, Session } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { PlotlyRenderer } from './PlotlyRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AutoChartSuggestion } from './AutoChartSuggestion';
import { exportToPDF } from '../services/ReportExporter';
import { BrandLockup, BrandMark } from './BrandMark';
import { hasAutoChartableData } from '../lib/autoChart';

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
    const [isCompactViewport, setIsCompactViewport] = useState(() => (
        typeof window !== 'undefined' && (window.innerHeight < 920 || window.innerWidth < 1440)
    ));

    const starterPrompts = [
        'Give me the sharpest management summary from these active datasets.',
        'Show the top anomalies, forecast signals, and the actions I should take next.',
        'Compare the active files and tell me where performance or rejection differs most.',
        'Run a comprehensive forecasting analysis on the active datasets with trend projections and confidence intervals.',
    ];
    const hasLoadedDatasets = files.some((file) => file.id !== 'sample-sales');
    const hasPendingDatasets = pendingFiles.length > 0;

    useEffect(() => {
        const handleViewportResize = () => {
            const compact = window.innerHeight < 920 || window.innerWidth < 1440;
            setIsCompactViewport(compact);
        };

        handleViewportResize();
        window.addEventListener('resize', handleViewportResize);
        return () => window.removeEventListener('resize', handleViewportResize);
    }, []);

    const renderAnalysisSteps = () => (
        <div className="mx-auto flex max-w-6xl justify-start animate-fade-in">
            <div className="inline-flex max-w-[520px] items-center gap-3 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(14,22,35,0.96),rgba(9,15,25,0.86))] px-4 py-3 shadow-[0_16px_50px_rgba(2,6,23,0.24)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.96),rgba(13,148,136,0.88),rgba(245,158,11,0.82))] text-white shadow-lg">
                    {isSearchEnabled ? <Globe size={16} className="animate-pulse" /> : <SpinnerGap size={16} className="animate-spin" />}
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-slate-100">
                        {isSearchEnabled ? 'Research + Analysis Running' : 'Analysis Running'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-300/75">
                        Profiling active data, generating Python, and preparing charts plus actions.
                    </p>
                </div>
            </div>
        </div>
    );

    const extractRecommendedActions = (content: string): string[] => {
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => /^→\s*Action:|^Action:/i.test(line))
            .map((line) => line.replace(/^→\s*Action:\s*|^Action:\s*/i, '').trim())
            .filter(Boolean)
            .slice(0, 4);
    };

    const extractExecutiveHeadline = (content: string): string => {
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => Boolean(line)
                && !/^\d+[.)]\s+/.test(line)
                && !/^→\s*Action:/i.test(line)
                && !/^Forecast:/i.test(line)
                && !/^Data Quality:/i.test(line))
            ?.replace(/^\*\*Executive Signal\*\*\s*/i, '')
            ?.replace(/^Executive Signal:\s*/i, '')
            || '';
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

    const buildForecastPrompt = (existingContent: string): string => {
        const datasetContext = activeFiles.length > 0
            ? `Active datasets: ${activeFiles.map((f) => f.name).join(', ')}.`
            : 'Current analysis context.';
        return `${datasetContext} Run a comprehensive forecasting analysis: (1) Detect all time-series or sequential columns automatically; (2) Apply linear trend + exponential smoothing for a short-term forecast (next 3–6 periods); (3) Plot observed values as a solid line, forecast as a dashed line, and a shaded 80% confidence interval band; (4) If finance data is present (revenue, profit, cost, margin), add YoY/MoM growth rates and project next quarter; (5) List the top 3 forecast-backed recommendations ranked by financial impact; (6) State assumptions, data quality, and confidence caveats explicitly. Use plotly subplots with multiple panels: main trend+forecast chart, growth rate bar chart, and a summary table.`;
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

    return (
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
            {/* Header */}
            <header className="z-20 mx-2 mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,23,37,0.92),rgba(9,14,24,0.84))] px-3 py-2.5 shadow-[0_18px_55px_rgba(2,6,23,0.24)] backdrop-blur-xl sm:mx-3 sm:px-4 xl:mx-4 2xl:mx-5">
                <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                    <button className="rounded-xl p-2 text-slate-400 transition-colors hover:text-white 2xl:hidden" onClick={onToggleSidebar}>
                        <List size={18} />
                    </button>

                    {/* Persona Selector */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={onTogglePersonaMenu}
                            className="flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 transition-all hover:border-[#d9a066]/35 hover:bg-white/[0.08] hover:shadow-[0_12px_30px_rgba(180,87,52,0.14)] active:scale-[0.99]"
                            aria-haspopup="menu"
                            aria-expanded={showPersonaMenu}
                            title="Change assistant profile"
                        >
                            <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(56,189,248,0.9),rgba(20,184,166,0.85),rgba(245,158,11,0.72))] text-[9px] font-black text-white shadow-sm">
                                {activePersona.icon}
                            </span>
                            <span className="hidden text-[9px] font-extrabold uppercase tracking-[0.22em] text-slate-200 sm:inline">
                                {activePersona.name}
                            </span>
                            <CaretDown size={10} className={`text-slate-400 transition-transform ${showPersonaMenu ? 'rotate-180' : ''}`} />
                        </button>
                        {showPersonaMenu && (
                            <div className="absolute left-0 top-full z-[50] mt-2 w-56 animate-scale-in rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(10,16,28,0.9))] p-1.5 shadow-[0_30px_80px_rgba(2,6,23,0.4)] backdrop-blur-xl">
                                {personas.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => onSelectPersona(p)}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${activePersona.id === p.id
                                            ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.22),rgba(20,184,166,0.16),rgba(245,158,11,0.14))] text-white shadow-lg'
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
                        <DownloadSimple size={13} />
                        <span className="text-[8px] font-extrabold uppercase tracking-widest hidden sm:inline">Export</span>
                    </button>
                </div>
            </header>

            {/* Messages Area */}
            <div ref={scrollRef} className="messages-container flex-1 space-y-5 overflow-y-auto px-3 py-4 custom-scrollbar sm:px-4 xl:px-6 2xl:px-8">
                {/* Welcome Screen */}
                {messages.length === 0 && (
                    <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center text-center animate-fade-in">
                        {!hasLoadedDatasets ? (
                            <div className="w-full space-y-5">
                                {/* Logo & Title */}
                                <div className="space-y-4">
                                    <BrandLockup
                                        align="center"
                                        size={60}
                                        title="Mastiff"
                                        className="justify-center"
                                    />
                                    <p className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-slate-300/[0.82]">
                                        Ask a question or upload data. Mastiff returns evidence-backed analysis with interactive charts, forecast direction, and clear recommended actions.
                                    </p>
                                </div>

                                {/* Upload Zone */}
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="group mx-auto max-w-2xl cursor-pointer rounded-[28px] border border-dashed border-slate-500/[0.38] bg-[linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 transition-all duration-300 hover:-translate-y-[1px] hover:border-emerald-300/[0.4] hover:bg-emerald-300/[0.05]"
                                >
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950/70 transition-all group-hover:bg-teal-400/[0.12]">
                                            <UploadSimple size={22} className="text-slate-300 transition-colors group-hover:text-teal-200" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.26em] text-slate-100 transition-colors group-hover:text-white">
                                                Drop files here or click to upload
                                            </p>
                                            <p className="mt-2 text-[11px] font-medium text-slate-300/70">
                                                CSV, Excel, PDF, Word, text, JSON, TSV, and SharePoint-linked sources
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    {[
                                        'Upload a report, then extract the most important risks and actions.',
                                        'Upload operational data, then compare lines, shifts, or stations.',
                                        'Upload a dataset, then profile it and suggest the best starting charts.',
                                    ].map((prompt) => (
                                        <button
                                            key={prompt}
                                            onClick={() => onInputChange(prompt)}
                                            className="rounded-full border border-white/10 bg-slate-950/45 px-3 py-1.5 text-[10px] font-semibold text-slate-300 transition-all hover:border-amber-300/30 hover:text-white"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* Suggestions when files are loaded */
                            <div className="w-full max-w-4xl space-y-4">
                                {hasPendingDatasets && (
                                    <div className="mx-auto rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-3 text-left">
                                        <p className="text-[9px] font-extrabold uppercase tracking-[2px] text-amber-200">Data ready for schema review</p>
                                        <p className="mt-1 text-[11px] text-zinc-300 leading-relaxed">
                                            {pendingFiles.length} staged file{pendingFiles.length === 1 ? '' : 's'} detected. Suggestions are ready immediately, and you can still review the schema in the inspector before drilling deeper.
                                        </p>
                                    </div>
                                )}
                                <div className="flex items-center justify-center gap-2">
                                    <Lightning size={16} className="text-teal-300" />
                                    <h3 className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-slate-300/75">Suggested Analyses</h3>
                                </div>
                                {isLoadingSuggestions ? (
                                    <div className="w-full max-w-md mx-auto p-6 glass rounded-2xl relative overflow-hidden">
                                        <div className="absolute inset-0 animate-neural-scan bg-gradient-to-r from-transparent via-sky-400/[0.08] to-transparent -translate-x-full" />
                                        <div className="relative flex flex-col items-center gap-4">
                                            <div className="flex items-center gap-3">
                                                <SpinnerGap size={16} className="animate-spin text-sky-300" />
                                                <span className="text-[10px] font-extrabold uppercase tracking-[2px] text-white/80">Analyzing your data...</span>
                                            </div>
                                            <div className="w-full max-w-xs h-1 bg-zinc-950 rounded-full overflow-hidden">
                                                <div className="h-full animate-shimmer bg-gradient-to-r from-sky-400 via-teal-300 to-amber-300" style={{ width: '60%' }} />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                        {suggestions.map((s, i) => (
                                            <button
                                                key={i}
                                                onClick={() => onSend(s)}
                                                className="group rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:-translate-y-[1px] hover:border-teal-300/35 hover:bg-white/[0.08]"
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <ArrowRight size={12} className="mt-0.5 shrink-0 text-teal-300 transition-colors group-hover:text-amber-200" />
                                                    <p className="text-sm font-semibold leading-snug text-slate-200/[0.9] transition-colors group-hover:text-white">{s}</p>
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
                    <div key={m.id} className={`mx-auto max-w-5xl animate-fade-in ${m.role === 'user' ? 'flex justify-end' : 'w-full'}`}>
                        {m.role === 'user' ? (
                            /* ── USER BUBBLE ── */
                            <div className="max-w-[min(100%,52rem)] rounded-[26px] border border-teal-300/18 bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(13,148,136,0.16),rgba(245,158,11,0.1))] px-5 py-3.5 text-white shadow-[0_10px_35px_rgba(8,47,73,0.24)] backdrop-blur-xl">
                                <div className="text-sm leading-relaxed font-medium">{m.content}</div>
                            </div>
                        ) : (
                            /* ── ASSISTANT — Pretext document layout ── */
                            <div className="w-full space-y-3">
                                {(() => {
                                    const executiveHeadline = m.result?.responseEnvelope?.headline || extractExecutiveHeadline(m.content);
                                    const actionItems = m.result?.responseEnvelope?.actions?.filter(Boolean)?.length
                                        ? (m.result?.responseEnvelope?.actions || [])
                                        : extractRecommendedActions(m.content);
                                    const hasLogs = Boolean(m.result?.output || m.result?.error || m.result?.traceback);
                                    const plotlyChartCount = m.result?.plotly_charts?.length || 0;
                                    const imageChartCount = m.result?.charts?.length || 0;
                                    const chartCount = plotlyChartCount + imageChartCount;
                                    const hasVisualizationCard = Boolean(m.visualization);
                                    const hasVisualOutput = chartCount > 0 || hasVisualizationCard;
                                    const autoChartRows = hasAutoChartableData(m.result?.updated_df_sample) ? (m.result?.updated_df_sample || []) : [];
                                    const hasAutoChartData = autoChartRows.length > 0;
                                    const executionOutput = m.result?.output?.trim() || '';
                                    const isEmptyDataNotice = /data is empty after loading/i.test(executionOutput);
                                    const shouldShowExecutionResult = Boolean(executionOutput)
                                        && executionOutput !== 'Analysis complete'
                                        && executionOutput !== 'Execution successful'
                                        && !isEmptyDataNotice;
                                    const executiveInsights = m.result?.responseEnvelope?.insights?.filter(Boolean) || [];
                                    const executiveForecast = m.result?.responseEnvelope?.forecast || '';
                                    const dataQualityVerdict = m.result?.responseEnvelope?.dataQuality || '';
                                    const visualRecoveryPrompt = activeFiles.length > 0
                                        ? `Use only these active datasets: ${activeFiles.map((file) => file.name).join(', ')}. Build an executive chart pack with an overview chart, a trend chart, and a driver breakdown.`
                                        : 'Build an executive chart pack from the current analysis context with an overview chart, a trend chart, and a driver breakdown.';
                                    const showChartsSection = hasVisualOutput || hasAutoChartData || isEmptyDataNotice;

                                    return (
                                        <>
                                <div className="w-full overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,39,0.95),rgba(10,15,27,0.86))] shadow-[0_18px_50px_rgba(2,6,23,0.24)]">
                                    <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4 sm:px-6">
                                        <BrandMark size={22} />
                                        <span className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-sky-200/75">Mastiff</span>
                                        {m.persona && <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{m.persona}</span>}
                                        <span className="ml-auto text-[10px] font-medium tabular-nums text-slate-400">
                                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    <div className="space-y-5 px-5 py-5 sm:px-6">
                                        {showChartsSection && (
                                            <section className="space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-sky-200/80">Charts And Trends</p>
                                                    {chartCount > 0 && (
                                                        <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[10px] font-bold text-sky-100">
                                                            {chartCount} chart{chartCount === 1 ? '' : 's'}
                                                        </span>
                                                    )}
                                                </div>
                                                {hasVisualOutput ? (
                                                    <div className="space-y-4">
                                                        {m.result?.plotly_charts?.map((pChart, idx) => (
                                                            <div key={`${m.id}-plotly-${idx}`} className="w-full overflow-visible rounded-2xl border border-zinc-800/60 bg-zinc-950/45 p-3 sm:p-4">
                                                                <PlotlyRenderer data={pChart} />
                                                            </div>
                                                        ))}
                                                        {m.result?.charts?.map((chart, idx) => (
                                                            <div
                                                                key={`${m.id}-chart-${idx}`}
                                                                className="w-full overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-3 sm:p-4"
                                                            >
                                                                <img src={`data:image/png;base64,${chart}`} alt={`Analysis Chart ${idx + 1}`} className="h-auto w-full rounded-xl" />
                                                            </div>
                                                        ))}
                                                        {plotlyChartCount === 0 && imageChartCount === 0 && hasVisualizationCard && (
                                                            <div className="w-full overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-950/50 p-3 sm:p-4">
                                                                {typeof m.visualization === 'string' ? (
                                                                    <img src={m.visualization} alt="Visual Analysis" className="h-auto w-full rounded-xl" />
                                                                ) : m.visualization ? (
                                                                    <ChartRenderer viz={m.visualization} onDrillDown={onSend} />
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : hasAutoChartData ? (
                                                    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-950/45 p-3 sm:p-4">
                                                        <AutoChartSuggestion data={autoChartRows} title="Auto-Rendered Chart" />
                                                    </div>
                                                ) : (
                                                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] p-4">
                                                        <p className="text-sm leading-relaxed text-zinc-100">
                                                            {isEmptyDataNotice
                                                                ? 'This run did not leave behind chartable rows after processing, so the visual recovery pass could not auto-render a chart.'
                                                                : 'This answer returned numeric findings but no renderable chart payload. Run the visual recovery pass to force a chart artifact.'}
                                                        </p>
                                                        <button
                                                            onClick={() => onSend(visualRecoveryPrompt)}
                                                            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,rgba(14,165,233,0.98),rgba(13,148,136,0.94),rgba(245,158,11,0.88))] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white transition-all hover:brightness-110"
                                                        >
                                                            <ChartBar size={13} />
                                                            Run visual recovery
                                                        </button>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {executiveHeadline && (
                                            <section className="space-y-2">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-200/80">Executive Signal</p>
                                                <p className="text-lg font-semibold leading-relaxed text-white xl:text-xl">{renderInsightText(executiveHeadline)}</p>
                                            </section>
                                        )}

                                        {executiveInsights.length > 0 && (
                                            <section className="space-y-3">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-300">Key Insights</p>
                                                <div className="grid gap-3 lg:grid-cols-2">
                                                    {executiveInsights.slice(0, 4).map((insight, index) => (
                                                        <button
                                                            key={`${m.id}-insight-card-${index}`}
                                                            onClick={() => onSend(buildConcernPrompt(insight))}
                                                            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition-all hover:border-sky-300/28 hover:bg-white/[0.08]"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Insight {index + 1}</span>
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-200">
                                                                    <Scan size={12} /> Explore
                                                                </span>
                                                            </div>
                                                            <p className="mt-3 text-sm leading-relaxed text-zinc-100 xl:text-[15px]">{renderInsightText(insight)}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {executiveForecast && (
                                            <section className="space-y-2 rounded-2xl border border-sky-300/15 bg-sky-400/[0.06] p-4">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-sky-200/80">Forecast</p>
                                                <p className="text-sm leading-relaxed text-zinc-100 xl:text-[15px]">{renderInsightText(executiveForecast)}</p>
                                            </section>
                                        )}

                                        {actionItems.length > 0 && (
                                            <section className="space-y-3">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-200/85">Recommendations And Actions</p>
                                                <div className="space-y-2.5">
                                                    {actionItems.slice(0, 4).map((action) => (
                                                        <button
                                                            key={`${m.id}-${action}`}
                                                            onClick={() => onSend(buildActionPrompt(action))}
                                                            className="w-full rounded-2xl border border-emerald-300/18 bg-emerald-400/[0.08] px-4 py-3.5 text-left text-sm font-semibold leading-relaxed text-zinc-100 transition-all hover:bg-emerald-400/[0.14] xl:text-[15px]"
                                                        >
                                                            {action}
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {dataQualityVerdict && (
                                            <section className="space-y-2 rounded-2xl border border-amber-300/16 bg-amber-400/[0.06] p-4">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-200/85">Data Quality</p>
                                                <p className="text-sm leading-relaxed text-zinc-100 xl:text-[15px]">{renderInsightText(dataQualityVerdict.replace(/^Data Quality:\s*/i, ''))}</p>
                                            </section>
                                        )}

                                        <section className="space-y-3 border-t border-zinc-800/30 pt-5">
                                            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-300">Analysis</p>
                                            <MarkdownRenderer content={m.content} className="text-[15px] leading-8 text-zinc-200 xl:text-base" />
                                        </section>

                                        {m.sources && m.sources.length > 0 && (
                                            <section className="space-y-2 border-t border-zinc-800/30 pt-5">
                                                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">
                                                    <Globe size={10} /> Sources
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {m.sources.map((src, i) => (
                                                        <a key={`src-${m.id}-${i}`} href={src.uri} target="_blank" rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-300 hover:text-white transition-all">
                                                            <span className="truncate max-w-[220px]">{src.title}</span>
                                                            <ArrowSquareOut size={10} />
                                                        </a>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {shouldShowExecutionResult && (
                                            <section className="space-y-2 border-t border-zinc-800/30 pt-5">
                                                <p className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">
                                                    <Table size={10} /> Result
                                                </p>
                                                <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/80 p-4">
                                                    <pre className="font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result?.output}</pre>
                                                </div>
                                            </section>
                                        )}

                                        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800/30 pt-5">
                                            <button onClick={() => onCopy(m.content, m.id)}
                                                className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 hover:text-white uppercase tracking-[0.14em] transition-colors">
                                                {copiedId === m.id ? <Check size={10} /> : <Copy size={10} />}
                                                {copiedId === m.id ? 'Copied' : 'Copy'}
                                            </button>
                                            {m.result && (
                                                <button onClick={() => onSend(buildForecastPrompt(m.content))}
                                                    className="flex items-center gap-2 text-[11px] font-bold text-sky-300 hover:text-white uppercase tracking-[0.14em] transition-colors">
                                                    <TrendUp size={11} weight="bold" />
                                                    Forecast
                                                </button>
                                            )}
                                            {hasLogs && (
                                                <button onClick={() => onToggleLogs(showLogsId === m.id ? null : m.id)}
                                                    className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 hover:text-white uppercase tracking-[0.14em] transition-colors">
                                                    <Scroll size={10} />
                                                    {showLogsId === m.id ? 'Hide Logs' : 'Show Logs'}
                                                </button>
                                            )}
                                            {m.code && (
                                                <button onClick={() => onToggleCode(showCodeId === m.id ? null : m.id)}
                                                    className="flex items-center gap-2 text-[11px] font-bold text-zinc-400 hover:text-white uppercase tracking-[0.14em] transition-colors">
                                                    <Terminal size={10} />
                                                    {showCodeId === m.id ? 'Hide Code' : 'Show Code'}
                                                </button>
                                            )}
                                            {chartCount > 0 && (
                                                <span className="ml-auto text-[11px] font-bold text-zinc-500 uppercase tracking-[0.14em]">
                                                    {chartCount} chart{chartCount === 1 ? '' : 's'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── CODE BLOCK (collapsible, outside main card) ── */}
                                {m.code && showCodeId === m.id && (
                                    <div className="w-full rounded-2xl overflow-hidden border border-zinc-800/60 animate-scale-in">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/40 bg-zinc-950/60">
                                            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.14em] flex items-center gap-2">
                                                <Code size={12} /> Python Code
                                            </span>
                                            <button onClick={() => onCopy(m.code || '', `code-${m.id}`)}
                                                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-bold text-zinc-400 hover:text-white transition-colors">
                                                {copiedId === `code-${m.id}` ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre className="p-4 bg-[#0a0a0a] font-mono text-[12px] text-green-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto custom-scrollbar">
                                            {m.code}
                                        </pre>
                                        {m.result?.error && (
                                            <pre className="px-4 pb-4 bg-[#0a0a0a] font-mono text-[12px] text-red-400 overflow-x-auto">
                                                {m.result.error}{m.result.traceback ? `\n\n${m.result.traceback}` : ''}
                                            </pre>
                                        )}
                                    </div>
                                )}

                                {hasLogs && showLogsId === m.id && (
                                    <div className="w-full rounded-2xl overflow-hidden border border-zinc-800/60 animate-scale-in bg-[#0a0a0a]">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/40 bg-zinc-950/60">
                                            <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.14em] flex items-center gap-2">
                                                <Scroll size={12} /> Execution Logs
                                            </span>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            {m.result?.output && (
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-2">Output</p>
                                                    <pre className="font-mono text-[12px] text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.output}</pre>
                                                </div>
                                            )}
                                            {m.result?.error && (
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-400 mb-2">Error</p>
                                                    <pre className="font-mono text-[12px] text-red-400 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.error}</pre>
                                                </div>
                                            )}
                                            {m.result?.traceback && (
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-2">Traceback</p>
                                                    <pre className="font-mono text-[12px] text-amber-300 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.traceback}</pre>
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

            {/* Input Area */}
            <div className="shrink-0 bg-gradient-to-t from-[#06101c] via-[#07111f]/95 to-transparent p-3 sm:p-4">
                <div className="relative mx-auto max-w-5xl space-y-2.5">
                    <div className="space-y-2">
                        {suggestions.length > 0 && hasLoadedDatasets && (
                            <div className="overflow-x-auto custom-scrollbar">
                                <div className="flex min-w-max items-center gap-2 pb-1">
                                <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-slate-300">{messages.length > 0 ? 'Next Prompts' : 'Suggested Questions'}</span>
                                {isLoadingSuggestions && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-400">
                                        <SpinnerGap size={11} className="animate-spin" />
                                        Refreshing
                                    </span>
                                )}
                                {suggestions.slice(0, isCompactViewport ? 4 : 6).map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => onSend(prompt)}
                                        className="rounded-full border border-white/10 bg-slate-950/50 px-3.5 py-2 text-[11px] font-semibold text-slate-200/[0.95] transition-all hover:border-emerald-300/35 hover:text-white"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                                </div>
                            </div>
                        )}

                        {messages.length === 0 && activeFiles.length > 0 && (
                            <div className="overflow-x-auto custom-scrollbar">
                                <div className="flex min-w-max gap-2 pb-1">
                                {starterPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => onSend(prompt)}
                                            className="rounded-full border border-white/10 bg-slate-950/55 px-3.5 py-2 text-[11px] font-semibold text-slate-300 transition-all hover:border-amber-300/30 hover:text-white"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {isSearchEnabled && (
                        <div className="absolute -top-9 left-0 right-0 flex justify-center animate-fade-in">
                            <div className="flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/[0.16] px-3 py-1 text-[8px] font-extrabold uppercase tracking-[0.24em] text-white shadow-lg glow-accent">
                                <MagnifyingGlass size={10} /> Web Search Active
                            </div>
                        </div>
                    )}
                    <div className={`rounded-[26px] border p-[1px] transition-all duration-300 ${inputText ? 'border-sky-300/35 bg-[linear-gradient(135deg,rgba(59,130,246,0.34),rgba(16,185,129,0.16),rgba(245,158,11,0.12))] glow-accent' : 'border-white/10 bg-white/[0.08]'}`}>
                        <div className="flex items-end gap-2 rounded-[25px] bg-[linear-gradient(180deg,rgba(15,22,39,0.95),rgba(9,14,24,0.9))] p-2 shadow-xl backdrop-blur-xl">
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
                                        ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.98),rgba(20,184,166,0.92),rgba(245,158,11,0.84))] text-white shadow-lg glow-accent hover:brightness-110 active:scale-95'
                                        : 'bg-slate-950/70 text-slate-600'
                                    }`}
                            >
                                {isAnalyzing ? <Square size={17} /> : <PaperPlaneTilt size={17} />}
                            </button>
                        </div>
                    </div>
                    <p className="mt-1.5 px-1 text-[8px] font-medium text-slate-400/70">
                        Mastiff can make mistakes. Verify important analyses, and open View Code on any answer to inspect the generated Python.
                    </p>
                </div>
            </div>
        </main>
    );
};
