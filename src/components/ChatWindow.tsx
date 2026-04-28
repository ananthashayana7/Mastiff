"use client";

import React, { useEffect, useState } from 'react';
import {
    List, Globe, Cpu, MagnifyingGlass, Paperclip, PaperPlaneTilt,
    Lightning, SpinnerGap, FileArrowUp, Terminal, SpeakerHigh, Copy, Check, ArrowSquareOut, Sparkle, DownloadSimple,
    ChartBar, Code, UploadSimple, ArrowRight, Table, PlayCircle, Scroll,
    Square, Scan, ChartLine, ArrowClockwise
} from '@phosphor-icons/react';
import { ChatMessage, AnalysisMode, AnalystPersona, DataFile, ExecutionMode, Session } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { PlotlyRenderer } from './PlotlyRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AutoChartSuggestion } from './AutoChartSuggestion';
import { exportExecutiveBriefToPDF } from '../services/ExecutiveBriefExporter';
import { BrandLockup, BrandMark } from './BrandMark';
import { hasAutoChartableData } from '../lib/autoChart';
import { buildAnalysisBodyContent } from '../lib/chatResponseEnvelope';

interface ChatWindowProps {
    currentSession: Session | null;
    messages: ChatMessage[];
    isAnalyzing: boolean;
    isSearchEnabled: boolean;
    analysisMode: AnalysisMode;
    executionMode: ExecutionMode;
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
    onSetExecutionMode: (mode: ExecutionMode) => void;
    onInputChange: (text: string) => void;
    onSend: (overridePrompt?: string) => void;
    onStopAnalysis: () => void;
    onInspectInsight: (term: string) => void;
    onToggleCode: (id: string | null) => void;
    onToggleLogs: (id: string | null) => void;
    onCopy: (text: string, id: string) => void;
}

type MessageResultEnvelope = NonNullable<NonNullable<ChatMessage['result']>['responseEnvelope']>;
type MessageResultProvenance = NonNullable<NonNullable<ChatMessage['result']>['provenance']>;

// Unified analysis mode — Chat and Deep Analysis buttons removed per management directive.
const MODE_CONFIG: Record<string, { label: string; desc: string; icon: string }> = {
    analysis: { label: 'ANALYSIS', desc: 'Agentic Data Science & Visualization', icon: '🧠' },
};

const ACTION_LANE_LABELS = ['Immediate Move', 'Structural Move', 'Risk Control'];
const EXECUTION_MODE_OPTIONS: Array<{
    mode: ExecutionMode;
    label: string;
    helper: string;
    icon: React.ReactNode;
}> = [
    {
        mode: 'preview',
        label: 'Insights Only',
        helper: 'Skip Python. Faster, cheaper, and much less brittle.',
        icon: <Sparkle size={12} weight="bold" />,
    },
    {
        mode: 'sandbox',
        label: 'Python Sandbox',
        helper: 'Run full code, computed metrics, and supporting visuals.',
        icon: <Terminal size={12} weight="bold" />,
    },
];

export const ChatWindow: React.FC<ChatWindowProps> = ({
    currentSession,
    messages,
    isAnalyzing,
    isSearchEnabled,
    analysisMode,
    executionMode,
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
    onSetExecutionMode,
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
    const [isExporting, setIsExporting] = useState(false);

    const starterPrompts = [
        'Give me the sharpest management summary from these active datasets.',
        'Show the top anomalies, risks, and the actions I should take next.',
        'Compare the active files and tell me where performance or rejection differs most.',
        'Tell me which KPI and slice I should inspect first, and why.',
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
            <div className="inline-flex max-w-[520px] items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(28,25,23,0.05)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-100 text-sky-700 shadow-sm">
                    {isSearchEnabled ? <Globe size={16} className="animate-pulse" /> : <SpinnerGap size={16} className="animate-spin" />}
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-stone-800">
                        {isSearchEnabled ? 'Research + Analysis Running' : 'Analysis Running'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
                        Profiling active data and assembling the strongest decision-ready insight brief.
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
            .slice(0, 6);
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
                <span key={`${segment}-${index}`} className="font-mono text-stone-900 tracking-tight">
                    {segment}
                </span>
            ) : (
                <React.Fragment key={`${segment}-${index}`}>{segment}</React.Fragment>
            );
        });
    };

    const getConfidenceTone = (label?: MessageResultEnvelope['confidence']['label']) => {
        if (label === 'High') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        if (label === 'Low') return 'border-amber-200 bg-amber-50 text-amber-700';
        return 'border-sky-200 bg-sky-50 text-sky-700';
    };

    const getDecisionGradeTone = (grade?: MessageResultEnvelope['decisionGrade']) => {
        if (grade === 'Decision-grade') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        if (grade === 'Needs review') return 'border-amber-200 bg-amber-50 text-amber-700';
        return 'border-sky-200 bg-sky-50 text-sky-700';
    };

    const buildCoverageFallback = (provenance?: MessageResultProvenance) => {
        if (!provenance) return '';

        const segments = [
            provenance.sourceFiles?.length ? `${provenance.sourceFiles.length} source${provenance.sourceFiles.length === 1 ? '' : 's'}` : '',
            provenance.rowsAnalyzed ? `${provenance.rowsAnalyzed.toLocaleString()} rows` : '',
            provenance.columnsConsidered?.length ? `${provenance.columnsConsidered.length} active columns` : '',
        ].filter(Boolean);

        if (segments.length === 0) return '';

        const dateSuffix = provenance.dateRange
            ? ` across ${provenance.dateRange.field} from ${provenance.dateRange.min} to ${provenance.dateRange.max}`
            : '';

        return `Coverage spans ${segments.join(', ')}${dateSuffix}.`;
    };

    return (
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent text-stone-900">
            {/* Header */}
            <header className="z-20 mx-3 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[26px] border border-stone-200 bg-white/88 px-3 py-3 shadow-[0_8px_24px_rgba(28,25,23,0.05)] backdrop-blur-xl sm:px-4 xl:mx-4 2xl:mx-5">
                <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                    <button className="rounded-xl p-2 text-stone-500 transition-colors hover:text-stone-900 2xl:hidden" onClick={onToggleSidebar}>
                        <List size={18} />
                    </button>
                    <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-stone-500">Workspace Report</p>
                        <p className="truncate text-sm font-semibold text-stone-900">
                            {currentSession?.title || 'Current analysis'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Live Search Toggle */}
                    <button
                        onClick={onToggleSearch}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-2 transition-all duration-200 ${isSearchEnabled
                            ? 'border-sky-200 bg-sky-50 text-sky-800'
                            : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:text-stone-900'
                            }`}
                    >
                        <Globe size={13} className={isSearchEnabled ? 'animate-pulse' : ''} />
                        <span className="text-[8px] font-extrabold uppercase tracking-widest hidden sm:inline">Search</span>
                    </button>

                    {/* Export */}
                    <button
                        onClick={async () => {
                            if (isExporting) return;
                            setIsExporting(true);
                            try {
                                await exportExecutiveBriefToPDF({
                                    sessionTitle: currentSession?.title || 'Analysis',
                                    messages,
                                    activeFiles,
                                });
                            } finally {
                                setIsExporting(false);
                            }
                        }}
                        disabled={isExporting || messages.length === 0}
                        className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-stone-600 transition-all hover:border-stone-300 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isExporting ? <SpinnerGap size={13} className="animate-spin" /> : <DownloadSimple size={13} />}
                        <span className="text-[8px] font-extrabold uppercase tracking-widest hidden sm:inline">{isExporting ? 'Preparing' : 'Export'}</span>
                    </button>
                </div>
            </header>

            {/* Messages Area */}
            <div ref={scrollRef} className="messages-container flex-1 space-y-6 overflow-y-auto px-4 py-5 custom-scrollbar sm:px-5 xl:px-8 2xl:px-10">
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
                                        title="SPARTA"
                                        className="justify-center"
                                    />
                                    <p className="mx-auto max-w-2xl text-base font-medium leading-relaxed text-stone-600">
                                        Ask a question or upload data. SPARTA returns evidence-backed insights, a sharper operating call, and clear next actions without the noise.
                                    </p>
                                </div>

                                {/* Upload Zone */}
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="group mx-auto max-w-2xl cursor-pointer rounded-[28px] border border-dashed border-stone-300 bg-white/80 p-6 transition-all duration-300 hover:-translate-y-[1px] hover:border-sky-300 hover:bg-white"
                                >
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 transition-all group-hover:bg-sky-50">
                                            <UploadSimple size={22} className="text-stone-500 transition-colors group-hover:text-sky-700" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-[0.26em] text-stone-900 transition-colors group-hover:text-stone-900">
                                                Drop files here or click to upload
                                            </p>
                                            <p className="mt-2 text-[11px] font-medium text-stone-500">
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
                                            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-600 transition-all hover:border-stone-300 hover:text-stone-900"
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
                                        <p className="mt-1 text-[11px] text-stone-600 leading-relaxed">
                                            {pendingFiles.length} staged file{pendingFiles.length === 1 ? '' : 's'} detected. Suggestions are ready immediately, and you can still review the schema in the inspector before drilling deeper.
                                        </p>
                                    </div>
                                )}
                                <div className="flex items-center justify-center gap-2">
                                    <Lightning size={16} className="text-teal-300" />
                                    <h3 className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-stone-500">Suggested Analyses</h3>
                                </div>
                                {isLoadingSuggestions ? (
                                    <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 shadow-[0_8px_24px_rgba(28,25,23,0.05)]">
                                        <div className="absolute inset-0 animate-neural-scan bg-gradient-to-r from-transparent via-sky-400/[0.08] to-transparent -translate-x-full" />
                                        <div className="relative flex flex-col items-center gap-4">
                                            <div className="flex items-center gap-3">
                                                <SpinnerGap size={16} className="animate-spin text-sky-300" />
                                                <span className="text-[10px] font-extrabold uppercase tracking-[2px] text-stone-700">Analyzing your data...</span>
                                            </div>
                                            <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-stone-200">
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
                                                className="group rounded-2xl border border-stone-200 bg-white p-4 text-left transition-all hover:-translate-y-[1px] hover:border-stone-300 hover:bg-stone-50"
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <ArrowRight size={12} className="mt-0.5 shrink-0 text-teal-300 transition-colors group-hover:text-amber-200" />
                                                    <p className="text-sm font-semibold leading-snug text-stone-700 transition-colors group-hover:text-stone-900">{s}</p>
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
                            <div className="max-w-[min(100%,52rem)] rounded-[26px] border border-sky-200 bg-sky-50 px-5 py-3.5 text-stone-900 shadow-[0_6px_20px_rgba(28,25,23,0.04)]">
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
                                    const dataQualityVerdict = m.result?.responseEnvelope?.dataQuality || '';
                                    const provenance = m.result?.provenance;
                                    const analysisBody = buildAnalysisBodyContent(m.content, m.result?.responseEnvelope);
                                    const coverageSummary = m.result?.responseEnvelope?.coverage || buildCoverageFallback(provenance);
                                    const confidenceLabel = m.result?.responseEnvelope?.confidence?.label || provenance?.reliability.label || 'Moderate';
                                    const confidenceSummary = m.result?.responseEnvelope?.confidence?.summary
                                        || dataQualityVerdict.replace(/^Data Quality:\s*/i, '')
                                        || 'Confidence is directional until the next deeper validation pass.';
                                    const decisionGrade = m.result?.responseEnvelope?.decisionGrade
                                        || (confidenceLabel === 'High' && hasVisualOutput && Boolean(m.code) ? 'Decision-grade' : confidenceLabel === 'Low' ? 'Needs review' : 'Directional');
                                    const decisionSummary = m.result?.responseEnvelope?.decisionSummary
                                        || (actionItems[0]
                                            ? `Working call: ${actionItems[0]}`
                                            : 'Use this analysis to focus the next decision, then validate the biggest risk before scaling.');
                                    const watchouts = m.result?.responseEnvelope?.watchouts?.filter(Boolean)?.length
                                        ? (m.result?.responseEnvelope?.watchouts || [])
                                        : (provenance?.reliability.notes?.slice(0, 3) || []);
                                    const visualRecoveryPrompt = activeFiles.length > 0
                                        ? `Use only these active datasets: ${activeFiles.map((file) => file.name).join(', ')}. Build an executive chart pack with an overview chart, a trend chart, and a driver breakdown.`
                                        : 'Build an executive chart pack from the current analysis context with an overview chart, a trend chart, and a driver breakdown.';
                                    const showChartsSection = m.executionMode !== 'preview' && (hasVisualOutput || hasAutoChartData || isEmptyDataNotice);

                                    return (
                                        <>
                                <div data-export-message={m.id} className="w-full overflow-hidden rounded-[30px] border border-stone-200 bg-[linear-gradient(180deg,#fffefc,#fbfaf7)] shadow-[0_12px_36px_rgba(28,25,23,0.06)]">
                                    <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4 sm:px-6">
                                        <BrandMark size={22} />
                                        <span className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-stone-500">SPARTA</span>
                                        {m.persona && <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{m.persona}</span>}
                                        <span className="ml-auto text-[10px] font-medium tabular-nums text-stone-400">
                                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    <div className="space-y-5 px-5 py-5 sm:px-6">
                                        {executiveHeadline && (
                                            <section className="space-y-2">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Executive Signal</p>
                                                <p className="font-serif text-[1.35rem] font-semibold leading-relaxed text-stone-900 xl:text-[1.5rem]">{renderInsightText(executiveHeadline)}</p>
                                            </section>
                                        )}

                                        {(decisionSummary || confidenceSummary || coverageSummary || watchouts.length > 0) && (
                                            <section className="space-y-4 rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,rgba(248,246,241,0.94),rgba(255,255,255,0.98))] p-4 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Decision Brief</p>
                                                        <p className="mt-1 text-xs leading-relaxed text-stone-600">Make the operating call, check the confidence, and pressure-test the parts most likely to break it.</p>
                                                    </div>
                                                    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getDecisionGradeTone(decisionGrade)}`}>
                                                        {decisionGrade}
                                                    </span>
                                                </div>

                                                <div className="grid gap-3 lg:grid-cols-3">
                                                    <div className="rounded-2xl border border-stone-200 bg-white p-4">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Decision</p>
                                                            <Lightning size={12} className="text-stone-500" />
                                                        </div>
                                                        <p className="mt-3 text-sm leading-relaxed text-stone-700 xl:text-[15px]">{renderInsightText(decisionSummary)}</p>
                                                    </div>

                                                    <div className="rounded-2xl border border-stone-200 bg-white p-4">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Confidence</p>
                                                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${getConfidenceTone(confidenceLabel)}`}>
                                                                {confidenceLabel}
                                                            </span>
                                                        </div>
                                                        <p className="mt-3 text-sm leading-relaxed text-stone-700 xl:text-[15px]">{renderInsightText(confidenceSummary)}</p>
                                                    </div>

                                                    <div className="rounded-2xl border border-stone-200 bg-white p-4">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Coverage</p>
                                                            <ChartLine size={12} className="text-stone-500" />
                                                        </div>
                                                        <p className="mt-3 text-sm leading-relaxed text-stone-700 xl:text-[15px]">{renderInsightText(coverageSummary)}</p>
                                                    </div>
                                                </div>

                                                {watchouts.length > 0 && (
                                                    <div className="space-y-3">
                                                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Watchouts To Pressure-Test</p>
                                                        <div className="grid gap-3 lg:grid-cols-3">
                                                            {watchouts.slice(0, 3).map((watchout, index) => (
                                                                <button
                                                                    key={`${m.id}-watchout-${index}`}
                                                                    onClick={() => onSend(buildConcernPrompt(watchout))}
                                                                    className="rounded-2xl border border-stone-200 bg-white p-4 text-left transition-all hover:border-stone-300 hover:bg-stone-50"
                                                                >
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Watchout {index + 1}</span>
                                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700">
                                                                            <Scan size={12} /> Test
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-3 text-sm leading-relaxed text-stone-700 xl:text-[15px]">{renderInsightText(watchout)}</p>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {executiveInsights.length > 0 && (
                                            <section className="space-y-3">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Key Insights</p>
                                                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                                                    {executiveInsights.slice(0, 6).map((insight, index) => (
                                                        <button
                                                            key={`${m.id}-insight-card-${index}`}
                                                            onClick={() => onSend(buildConcernPrompt(insight))}
                                                            className="rounded-2xl border border-stone-200 bg-stone-50/75 p-4 text-left transition-all hover:border-stone-300 hover:bg-white"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Insight {index + 1}</span>
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700">
                                                                    <Scan size={12} /> Explore
                                                                </span>
                                                            </div>
                                                            <p className="mt-3 text-sm leading-relaxed text-stone-700 xl:text-[15px]">{renderInsightText(insight)}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {actionItems.length > 0 && (
                                            <section className="space-y-3">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Recommendations And Actions</p>
                                                <div className="grid gap-3 lg:grid-cols-3">
                                                    {actionItems.slice(0, 4).map((action, index) => (
                                                        <button
                                                            key={`${m.id}-${action}-${index}`}
                                                            onClick={() => onSend(buildActionPrompt(action))}
                                                            className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-left transition-all hover:border-stone-300 hover:bg-white"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">
                                                                    {ACTION_LANE_LABELS[index] || `Action ${index + 1}`}
                                                                </span>
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700">
                                                                    <ArrowRight size={12} /> Drill down
                                                                </span>
                                                            </div>
                                                            <p className="mt-3 text-sm font-semibold leading-relaxed text-stone-700 xl:text-[15px]">
                                                                {action}
                                                            </p>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {showChartsSection && (
                                            <section id={`export-chart-${m.id}`} className="space-y-4 rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,rgba(248,246,241,0.94),rgba(255,255,255,0.98))] p-4 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Supporting Visuals</p>
                                                        <p className="mt-1 text-xs leading-relaxed text-stone-600">Use the visuals to validate the written call after the insights are already clear.</p>
                                                    </div>
                                                    {chartCount > 0 && (
                                                        <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[10px] font-bold text-stone-700">
                                                            {chartCount} chart{chartCount === 1 ? '' : 's'}
                                                        </span>
                                                    )}
                                                </div>
                                                {hasVisualOutput ? (
                                                    <div className="space-y-4">
                                                        {m.result?.plotly_charts?.map((pChart, idx) => (
                                                            <div key={`${m.id}-plotly-${idx}`} className="w-full overflow-visible rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
                                                                <PlotlyRenderer data={pChart} />
                                                            </div>
                                                        ))}
                                                        {m.result?.charts?.map((chart, idx) => (
                                                            <div
                                                                key={`${m.id}-chart-${idx}`}
                                                                className="w-full overflow-hidden rounded-2xl border border-stone-200 bg-white p-3 sm:p-4"
                                                            >
                                                                <img src={`data:image/png;base64,${chart}`} alt={`Analysis Chart ${idx + 1}`} className="h-auto w-full rounded-xl" />
                                                            </div>
                                                        ))}
                                                        {plotlyChartCount === 0 && imageChartCount === 0 && hasVisualizationCard && (
                                                            <div className="w-full overflow-hidden rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
                                                                {typeof m.visualization === 'string' ? (
                                                                    <img src={m.visualization} alt="Visual Analysis" className="h-auto w-full rounded-xl" />
                                                                ) : m.visualization ? (
                                                                    <ChartRenderer viz={m.visualization} onDrillDown={onSend} />
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : hasAutoChartData ? (
                                                    <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
                                                        <AutoChartSuggestion data={autoChartRows} title="Auto-Rendered Chart" />
                                                    </div>
                                                ) : (
                                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                                        <p className="text-sm leading-relaxed text-stone-700">
                                                            {isEmptyDataNotice
                                                                ? 'This run did not leave behind chartable rows after processing, so the visual recovery pass could not auto-render a chart.'
                                                                : 'This answer returned numeric findings but no renderable chart payload. Run the visual recovery pass to force a chart artifact.'}
                                                        </p>
                                                        <button
                                                            onClick={() => onSend(visualRecoveryPrompt)}
                                                            className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-stone-900 transition-all hover:bg-stone-50"
                                                        >
                                                            <ChartBar size={13} />
                                                            Run visual recovery
                                                        </button>
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {dataQualityVerdict && (
                                            <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Data Quality</p>
                                                <p className="text-sm leading-relaxed text-stone-700 xl:text-[15px]">{renderInsightText(dataQualityVerdict.replace(/^Data Quality:\s*/i, ''))}</p>
                                            </section>
                                        )}

                                        {provenance && (
                                            <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Provenance And Reliability</p>
                                                    <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[10px] font-bold text-stone-700">
                                                        {provenance.rowsAnalyzed.toLocaleString()} rows
                                                    </span>
                                                    <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[10px] font-bold text-stone-700">
                                                        {provenance.sourceFiles.length} source{provenance.sourceFiles.length === 1 ? '' : 's'}
                                                    </span>
                                                    <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${provenance.reliability.label === 'High'
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : provenance.reliability.label === 'Moderate'
                                                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                                                            : 'border-amber-200 bg-amber-50 text-amber-700'
                                                        }`}>
                                                        {provenance.reliability.label} reliability
                                                    </span>
                                                </div>

                                                <div className="grid gap-3 lg:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Data Used</p>
                                                        <div className="space-y-2">
                                                            {provenance.sourceFiles.map((source) => (
                                                                <div key={`${m.id}-${source.name}`} className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-[12px] leading-relaxed text-stone-700">
                                                                    <span className="font-bold text-stone-900">{source.name}</span>
                                                                    {` • ${source.rowCount.toLocaleString()} rows • ${source.columnCount} columns`}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        {provenance.dateRange && (
                                                            <p className="text-[12px] leading-relaxed text-stone-600">
                                                                Time coverage: <span className="font-semibold text-stone-900">{provenance.dateRange.field}</span> from {provenance.dateRange.min} to {provenance.dateRange.max}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-stone-500">Reliability Notes</p>
                                                        <div className="space-y-2">
                                                            {(provenance.reliability.notes.length > 0 ? provenance.reliability.notes : ['No major reliability caveats were recorded for this run.']).slice(0, 3).map((note, index) => (
                                                                <p key={`${m.id}-reliability-note-${index}`} className="rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-[12px] leading-relaxed text-stone-700">
                                                                    {note}
                                                                </p>
                                                            ))}
                                                        </div>
                                                        {provenance.ignoredColumns.length > 0 && (
                                                            <p className="text-[12px] leading-relaxed text-stone-600">
                                                                Ignored columns: {provenance.ignoredColumns.slice(0, 5).join(', ')}{provenance.ignoredColumns.length > 5 ? '...' : ''}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </section>
                                        )}

                                        {analysisBody && (
                                            <section className="space-y-3 border-t border-stone-200 pt-5">
                                                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">Analysis</p>
                                                <MarkdownRenderer content={analysisBody} className="text-[15px] leading-8 text-stone-700 xl:text-base" />
                                            </section>
                                        )}

                                        {m.sources && m.sources.length > 0 && (
                                            <section className="space-y-2 border-t border-stone-200 pt-5">
                                                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">
                                                    <Globe size={10} /> Sources
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {m.sources.map((src, i) => (
                                                        <a key={`src-${m.id}-${i}`} href={src.uri} target="_blank" rel="noopener noreferrer"
                                                            className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-semibold text-stone-600 hover:text-stone-900 transition-all">
                                                            <span className="truncate max-w-[220px]">{src.title}</span>
                                                            <ArrowSquareOut size={10} />
                                                        </a>
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {shouldShowExecutionResult && (
                                            <section className="space-y-2 border-t border-stone-200 pt-5">
                                                <p className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-stone-500">
                                                    <Table size={10} /> Result
                                                </p>
                                                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                                                    <pre className="custom-scrollbar overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-stone-700">{m.result?.output}</pre>
                                                </div>
                                            </section>
                                        )}

                                        <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-5">
                                            <button onClick={() => onCopy(m.content, m.id)}
                                                className="flex items-center gap-2 text-[11px] font-bold text-stone-500 hover:text-stone-900 uppercase tracking-[0.14em] transition-colors">
                                                {copiedId === m.id ? <Check size={10} /> : <Copy size={10} />}
                                                {copiedId === m.id ? 'Copied' : 'Copy'}
                                            </button>
                                            {hasLogs && (
                                                <button onClick={() => onToggleLogs(showLogsId === m.id ? null : m.id)}
                                                    className="flex items-center gap-2 text-[11px] font-bold text-stone-500 hover:text-stone-900 uppercase tracking-[0.14em] transition-colors">
                                                    <Scroll size={10} />
                                                    {showLogsId === m.id ? 'Hide Logs' : 'Show Logs'}
                                                </button>
                                            )}
                                            {m.code && (
                                                <button onClick={() => onToggleCode(showCodeId === m.id ? null : m.id)}
                                                    className="flex items-center gap-2 text-[11px] font-bold text-stone-500 hover:text-stone-900 uppercase tracking-[0.14em] transition-colors">
                                                    <Terminal size={10} />
                                                    {showCodeId === m.id ? 'Hide Code' : 'Show Code'}
                                                </button>
                                            )}
                                            {chartCount > 0 && (
                                                <span className="ml-auto text-[11px] font-bold text-stone-400 uppercase tracking-[0.14em]">
                                                    {chartCount} chart{chartCount === 1 ? '' : 's'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* ── CODE BLOCK (collapsible, outside main card) ── */}
                                {m.code && showCodeId === m.id && (
                                    <div className="w-full overflow-hidden rounded-2xl border border-stone-200 animate-scale-in">
                                        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3">
                                            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
                                                <Code size={12} /> Python Code
                                            </span>
                                            <button onClick={() => onCopy(m.code || '', `code-${m.id}`)}
                                                className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-bold text-stone-500 hover:text-stone-900 transition-colors">
                                                {copiedId === `code-${m.id}` ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre className="custom-scrollbar max-h-[60vh] overflow-y-auto overflow-x-auto break-words whitespace-pre-wrap bg-white p-4 font-mono text-[12px] leading-relaxed text-stone-700">
                                            {m.code}
                                        </pre>
                                        {m.result?.error && (
                                            <pre className="overflow-x-auto bg-white px-4 pb-4 font-mono text-[12px] text-red-500">
                                                {m.result.error}{m.result.traceback ? `\n\n${m.result.traceback}` : ''}
                                            </pre>
                                        )}
                                    </div>
                                )}

                                {hasLogs && showLogsId === m.id && (
                                    <div className="w-full overflow-hidden rounded-2xl border border-stone-200 animate-scale-in bg-white">
                                        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3">
                                            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
                                                <Scroll size={12} /> Execution Logs
                                            </span>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            {m.result?.output && (
                                                <div>
                                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Output</p>
                                                    <pre className="custom-scrollbar overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-stone-700">{m.result.output}</pre>
                                                </div>
                                            )}
                                            {m.result?.error && (
                                                <div>
                                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-red-500">Error</p>
                                                    <pre className="font-mono text-[12px] text-red-400 whitespace-pre-wrap leading-relaxed overflow-x-auto custom-scrollbar">{m.result.error}</pre>
                                                </div>
                                            )}
                                            {m.result?.traceback && (
                                                <div>
                                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Traceback</p>
                                                    <pre className="custom-scrollbar overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-amber-700">{m.result.traceback}</pre>
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
            <div className="shrink-0 border-t border-stone-200 bg-[linear-gradient(180deg,rgba(250,248,244,0.94),rgba(255,255,255,0.98))] p-3 sm:p-4">
                <div className="relative mx-auto max-w-5xl space-y-2.5">
                    <div className="space-y-2">
                        {suggestions.length > 0 && hasLoadedDatasets && (
                            <div className="overflow-x-auto custom-scrollbar">
                                <div className="flex min-w-max items-center gap-2 pb-1">
                                <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-stone-500">{messages.length > 0 ? 'Next Prompts' : 'Suggested Questions'}</span>
                                {isLoadingSuggestions && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-stone-500">
                                        <SpinnerGap size={11} className="animate-spin" />
                                        Refreshing
                                    </span>
                                )}
                                {suggestions.slice(0, isCompactViewport ? 4 : 6).map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => onSend(prompt)}
                                        className="rounded-full border border-stone-200 bg-white px-3.5 py-2 text-[11px] font-semibold text-stone-600 transition-all hover:border-stone-300 hover:text-stone-900"
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
                                                className="rounded-full border border-stone-200 bg-white px-3.5 py-2 text-[11px] font-semibold text-stone-600 transition-all hover:border-stone-300 hover:text-stone-900"
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
                            <div className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[8px] font-extrabold uppercase tracking-[0.24em] text-sky-800 shadow-sm">
                                <MagnifyingGlass size={10} /> Web Search Active
                            </div>
                        </div>
                    )}
                    <div className={`rounded-[28px] border bg-white transition-all duration-300 ${inputText ? 'border-sky-200 shadow-[0_10px_30px_rgba(31,111,235,0.08)]' : 'border-stone-200 shadow-[0_8px_24px_rgba(28,25,23,0.04)]'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-3.5 py-3">
                            <div>
                                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-stone-500">Execution Mode</p>
                                    <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                                        {executionMode === 'sandbox'
                                            ? 'SPARTA will use the Python sandbox for computed analysis and supporting visuals when they materially help.'
                                            : 'SPARTA will answer in preview mode without writing or running Python.'}
                                    </p>
                                </div>
                            <div className="flex flex-wrap gap-2">
                                {EXECUTION_MODE_OPTIONS.map((option) => (
                                    <button
                                        key={option.mode}
                                        onClick={() => onSetExecutionMode(option.mode)}
                                        className={`rounded-2xl border px-3 py-2 text-left transition-all ${executionMode === option.mode
                                            ? option.mode === 'sandbox'
                                                ? 'border-sky-200 bg-sky-50 text-sky-900 shadow-sm'
                                                : 'border-emerald-200 bg-emerald-50 text-emerald-900 shadow-sm'
                                            : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:bg-white hover:text-stone-900'
                                            }`}
                                    >
                                        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em]">
                                            {option.icon}
                                            {option.label}
                                        </span>
                                        <span className="mt-1 block max-w-[15rem] text-[10px] font-medium leading-relaxed text-current/80">
                                            {option.helper}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-end gap-2 rounded-[27px] bg-white p-2.5 backdrop-blur-xl">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-2xl border border-stone-200 bg-stone-50 p-2.5 text-stone-500 transition-all hover:border-stone-300 hover:text-stone-900"
                            >
                                <Paperclip size={17} />
                            </button>
                            <textarea
                                value={inputText}
                                onChange={e => onInputChange(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                                placeholder={isSearchEnabled
                                    ? "Search the web and your data..."
                                    : executionMode === 'sandbox'
                                        ? "Ask SPARTA to analyze with Python, compute metrics, or build supporting visuals..."
                                        : "Ask SPARTA for quick insights, schema-backed analysis, or a no-code preview..."}
                                className="custom-scrollbar max-h-28 flex-1 resize-none border-none bg-transparent py-2 text-sm font-medium text-stone-900 placeholder:text-stone-400 focus:ring-0"
                                rows={1}
                            />
                            <button
                                onClick={() => isAnalyzing ? onStopAnalysis() : onSend()}
                                disabled={isAnalyzing ? false : !inputText.trim()}
                                className={`rounded-2xl p-2.5 transition-all duration-200 ${isAnalyzing
                                    ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : inputText.trim()
                                        ? 'bg-stone-900 text-white shadow-lg hover:bg-stone-800 active:scale-95'
                                        : 'bg-stone-100 text-stone-400'
                                    }`}
                            >
                                {isAnalyzing ? <Square size={17} /> : <PaperPlaneTilt size={17} />}
                            </button>
                        </div>
                    </div>
                    <p className="mt-1.5 px-1 text-[8px] font-medium text-stone-500">
                        {executionMode === 'sandbox'
                            ? 'SPARTA can make mistakes. Verify important analyses, and open View Code on any answer to inspect the generated Python.'
                            : 'Preview mode skips Python entirely. Switch to Python Sandbox only when you want computed metrics or visuals that materially sharpen the call.'}
                    </p>
                </div>
            </div>
        </main>
    );
};
