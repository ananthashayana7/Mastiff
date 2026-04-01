"use client";

import React from 'react';
import {
    Menu, Globe, ChevronDown, Cpu, Search, Paperclip, Send,
    Zap, Loader2, Database, FileUp, Terminal, Volume2, Copy, Check, ExternalLink, Sparkles, Download,
    BarChart3, Code2, BrainCircuit, Upload, ArrowRight, MessageSquare, TrendingUp, Table
} from 'lucide-react';
import { ChatMessage, AnalysisMode, AnalystPersona, DataFile, Session } from '../types';
import { ChartRenderer } from './ChartRenderer';
import { PlotlyRenderer } from './PlotlyRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AutoChartSuggestion } from './AutoChartSuggestion';
import { exportToPDF } from '../services/ReportExporter';

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
    files: DataFile[];
    showCodeId: string | null;
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
    onToggleCode: (id: string | null) => void;
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
    files,
    showCodeId,
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
    onToggleCode,
    onCopy
}) => {

    const renderAnalysisSteps = () => (
        <div className="flex justify-start animate-fade-in">
            <div className="glass rounded-2xl p-5 shadow-lg min-w-[300px] max-w-[400px] glow-accent">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-[#E50914] flex items-center justify-center text-white shadow-lg">
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
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black transition-all ${step.done ? 'bg-green-500/20 text-green-400' : step.active ? 'bg-[#E50914]/20 text-[#E50914]' : 'bg-zinc-900 text-zinc-700'}`}>
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
                    <div className="h-full bg-gradient-to-r from-[#E50914] to-[#ff4d4d] animate-shimmer" style={{ width: '40%' }} />
                </div>
            </div>
        </div>
    );

    return (
        <main className="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden">
            {/* Header */}
            <header className="h-13 border-b border-zinc-900/80 flex items-center justify-between px-5 glass z-20 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button className="md:hidden text-zinc-500 hover:text-white p-1.5 rounded-lg transition-colors" onClick={onToggleSidebar}>
                        <Menu size={18} />
                    </button>

                    {/* Unified Engine Badge */}
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 glass rounded-xl">
                        <span className="w-2 h-2 rounded-full bg-[#E50914] animate-pulse" />
                        <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-300">
                            Mastiff Engine
                        </span>
                    </div>

                    {/* Persona Selector */}
                    <div className="relative">
                        <button
                            onClick={onTogglePersonaMenu}
                            className="flex items-center gap-2 px-3 py-1.5 glass rounded-xl hover:border-zinc-700 transition-all"
                        >
                            <span className="w-5 h-5 bg-[#E50914] text-white rounded-lg flex items-center justify-center text-[9px] font-black shadow-sm">
                                {activePersona.icon}
                            </span>
                            <span className="hidden sm:inline text-[9px] font-extrabold uppercase tracking-widest text-zinc-300">
                                {activePersona.name}
                            </span>
                            <ChevronDown size={10} className="text-zinc-600" />
                        </button>
                        {showPersonaMenu && (
                            <div className="absolute top-full left-0 mt-2 w-52 glass rounded-xl shadow-2xl p-1.5 z-[50] animate-scale-in">
                                {personas.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => onSelectPersona(p)}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${activePersona.id === p.id
                                            ? 'bg-[#E50914] text-white shadow-lg'
                                            : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-white'
                                            }`}
                                    >
                                        <span className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-[9px] font-black">
                                            {p.icon}
                                        </span>
                                        <div>
                                            <p className="text-[9px] font-extrabold uppercase tracking-widest">{p.name}</p>
                                            <p className="text-[7px] font-medium text-zinc-500 mt-0.5">{p.description}</p>
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
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-200 ${isSearchEnabled
                            ? 'bg-[#E50914] border-[#E50914] text-white glow-accent-strong'
                            : 'glass text-zinc-500 hover:text-zinc-300'
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
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass text-zinc-500 hover:text-white hover:border-[#E50914]/50 transition-all"
                    >
                        <Download size={13} />
                        <span className="text-[8px] font-extrabold uppercase tracking-widest hidden sm:inline">Export</span>
                    </button>
                </div>
            </header>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar messages-container">
                {/* Welcome Screen */}
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center animate-fade-in">
                        {files.length === 0 || files.every(f => f.id === 'sample-sales') ? (
                            <div className="space-y-8 w-full">
                                {/* Logo & Title */}
                                <div className="space-y-3">
                                    <div className="w-16 h-16 bg-gradient-to-br from-[#E50914] to-[#ff4d4d] rounded-2xl flex items-center justify-center text-white shadow-2xl mx-auto glow-accent-strong rotate-3 hover:rotate-0 transition-transform duration-500">
                                        <BrainCircuit size={32} />
                                    </div>
                                    <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tighter">
                                        Mastiff<span className="text-[#E50914]">.</span>
                                    </h1>
                                    <p className="text-sm text-zinc-500 font-medium max-w-md mx-auto leading-relaxed">
                                        Agentic Data Science — Upload your datasets and perform high-precision analysis.
                                    </p>
                                </div>

                                {/* Features grid removed for V3.0 */}

                                {/* Upload Zone */}
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="group mx-auto max-w-md p-6 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-[#E50914]/40 bg-zinc-900/20 hover:bg-[#E50914]/5 transition-all duration-300 cursor-pointer"
                                >
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-zinc-900 group-hover:bg-[#E50914]/10 flex items-center justify-center transition-all">
                                            <Upload size={20} className="text-zinc-600 group-hover:text-[#E50914] transition-colors" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-zinc-400 group-hover:text-white transition-colors">
                                                Drop files here or click to upload
                                            </p>
                                            <p className="text-[9px] text-zinc-700 font-medium mt-1">
                                                CSV • Excel • PDF • Word • Text • JSON
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Or type a message */}
                                <p className="text-[9px] text-zinc-700 font-bold uppercase tracking-[3px]">
                                    — or start chatting below —
                                </p>
                            </div>
                        ) : (
                            /* Suggestions when files are loaded */
                            <div className="w-full space-y-5">
                                <div className="flex items-center justify-center gap-2">
                                    <Zap size={16} className="text-[#E50914]" />
                                    <h3 className="text-[10px] font-extrabold uppercase tracking-[3px] text-zinc-500">Suggested Analyses</h3>
                                </div>
                                {isLoadingSuggestions ? (
                                    <div className="w-full max-w-md mx-auto p-6 glass rounded-2xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#E50914]/5 to-transparent animate-neural-scan -translate-x-full" />
                                        <div className="relative flex flex-col items-center gap-4">
                                            <div className="flex items-center gap-3">
                                                <Loader2 size={16} className="animate-spin text-[#E50914]" />
                                                <span className="text-[10px] font-extrabold uppercase tracking-[2px] text-white/80">Analyzing your data...</span>
                                            </div>
                                            <div className="w-full max-w-xs h-1 bg-zinc-950 rounded-full overflow-hidden">
                                                <div className="h-full bg-[#E50914] animate-shimmer" style={{ width: '60%' }} />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-w-2xl mx-auto">
                                        {suggestions.map((s, i) => (
                                            <button
                                                key={i}
                                                onClick={() => onSend(s)}
                                                className="group p-3.5 glass rounded-xl hover:border-[#E50914]/30 transition-all text-left"
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <ArrowRight size={12} className="text-zinc-700 group-hover:text-[#E50914] mt-0.5 transition-colors shrink-0" />
                                                    <p className="text-[11px] text-zinc-400 font-semibold leading-tight group-hover:text-white transition-colors">{s}</p>
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
                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                        <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-lg ${m.role === 'user'
                            ? 'bg-gradient-to-br from-[#E50914] to-[#b20710] text-white shadow-[0_4px_20px_rgba(229,9,20,0.2)]'
                            : 'glass text-zinc-200'
                            }`}>
                            <div className="space-y-4">
                                {/* Message Content with Markdown */}
                                {m.role === 'assistant' ? (
                                    <MarkdownRenderer
                                        content={m.content}
                                        className="text-[13px] leading-relaxed"
                                    />
                                ) : (
                                    <div className="text-sm leading-relaxed font-medium">{m.content}</div>
                                )}

                                {/* Grounding Sources */}
                                {m.sources && m.sources.length > 0 && (
                                    <div className="pt-3 border-t border-white/10 space-y-2">
                                        <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                                            <Globe size={10} /> Sources
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {m.sources.map((src, i) => (
                                                <a
                                                    key={`src-${m.id}-${i}`}
                                                    href={src.uri}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 px-2.5 py-1 glass rounded-lg text-[9px] font-bold text-zinc-400 hover:text-white transition-all"
                                                >
                                                    <span className="truncate max-w-[120px]">{src.title}</span>
                                                    <ExternalLink size={8} />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Execution Result Output */}
                                {m.result?.output && m.result.output !== 'Analysis complete' && m.result.output !== 'Execution successful' && (
                                    <div className="pt-3 border-t border-zinc-800/50">
                                        <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5 mb-2">
                                            <Table size={10} /> Result
                                        </p>
                                        <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800/50">
                                            <pre className="font-mono text-[10px] text-zinc-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">{m.result.output}</pre>
                                        </div>
                                    </div>
                                )}

                                {/* Code Block */}
                                {m.code && (
                                    <div className="space-y-1.5">
                                        <button
                                            onClick={() => onToggleCode(showCodeId === m.id ? null : m.id)}
                                            className="flex items-center gap-2 text-[8px] font-extrabold text-zinc-600 hover:text-white uppercase tracking-widest transition-colors"
                                        >
                                            <Terminal size={11} />
                                            {showCodeId === m.id ? 'Hide Code' : 'View Code'}
                                            <Code2 size={9} className="text-zinc-700" />
                                        </button>
                                        {showCodeId === m.id && (
                                            <div className="space-y-2 animate-scale-in">
                                                <div className="relative">
                                                    <pre className="p-4 bg-[#0a0a0a] rounded-xl border border-zinc-800 font-mono text-[10px] text-green-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-words max-h-[600px] overflow-y-auto custom-scrollbar">
                                                        {m.code}
                                                    </pre>
                                                    <button
                                                        onClick={() => onCopy(m.code || '', `code-${m.id}`)}
                                                        className="absolute top-2 right-2 p-1.5 bg-zinc-900 rounded-lg text-zinc-600 hover:text-white transition-colors"
                                                    >
                                                        {copiedId === `code-${m.id}` ? <Check size={12} /> : <Copy size={12} />}
                                                    </button>
                                                </div>
                                                {m.result?.error && (
                                                    <pre className="p-3 bg-red-950/10 rounded-xl border border-red-900/20 font-mono text-[10px] text-red-400 overflow-x-auto">
                                                        {m.result.error}{m.result.traceback ? `\n\n${m.result.traceback}` : ''}
                                                    </pre>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Charts & Visualizations */}
                                {((m.result?.charts && m.result.charts.length > 0) || (m.result?.plotly_charts && m.result.plotly_charts.length > 0) || m.visualization) && (
                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center justify-between px-1">
                                            <p className="text-[8px] font-extrabold uppercase tracking-widest text-[#E50914] flex items-center gap-1.5">
                                                <Sparkles size={10} /> Visualizations
                                            </p>
                                            {m.result?.charts && m.result.charts.length > 1 && (
                                                <span className="text-[7px] font-extrabold text-zinc-600 uppercase tracking-widest">
                                                    {m.result.charts.length} charts
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex gap-4 overflow-x-auto pb-3 pt-1 snap-x custom-scrollbar">
                                            {m.result?.plotly_charts?.map((pChart, idx) => (
                                                <div key={`${m.id}-plotly-${idx}`} className="flex-none w-[90%] sm:w-[600px] lg:w-[700px] snap-center">
                                                    <PlotlyRenderer data={pChart} />
                                                </div>
                                            ))}

                                            {m.result?.charts?.map((chart, idx) => (
                                                <div
                                                    key={`${m.id}-chart-${idx}`}
                                                    className="flex-none w-[280px] sm:w-[420px] rounded-xl overflow-hidden border border-zinc-800 shadow-2xl bg-zinc-950/50 p-4 snap-center hover:border-zinc-700 transition-all"
                                                >
                                                    <img src={`data:image/png;base64,${chart}`} alt={`Analysis Chart ${idx + 1}`} className="w-full h-auto rounded-lg" />
                                                </div>
                                            ))}

                                            {!m.result?.charts && !m.result?.plotly_charts && m.visualization && (
                                                <div className="flex-none w-[280px] sm:w-[420px] rounded-xl overflow-hidden border border-zinc-800 shadow-2xl bg-zinc-950/50 p-4 snap-center">
                                                    {typeof m.visualization === 'string' ? (
                                                        <img src={m.visualization} alt="Visual Analysis" className="w-full h-auto rounded-lg" />
                                                    ) : (
                                                        <ChartRenderer viz={m.visualization} onDrillDown={onSend} />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Auto-Generated Chart for Tabular Data */}
                                {m.role === 'assistant' && m.result?.updated_df_sample && Array.isArray(m.result.updated_df_sample) && m.result.updated_df_sample.length > 0 && !m.result?.plotly_charts?.length && !m.result?.charts?.length && (
                                    <div className="pt-2">
                                        <AutoChartSuggestion data={m.result.updated_df_sample} title="Data Insight" />
                                    </div>
                                )}

                                {/* Message Footer */}
                                <div className="flex items-center gap-3 pt-3 border-t border-zinc-800/30">
                                    <button
                                        onClick={() => onCopy(m.content, m.id)}
                                        className="flex items-center gap-1 text-[7px] font-extrabold text-zinc-600 hover:text-white uppercase tracking-widest transition-colors"
                                    >
                                        {copiedId === m.id ? <Check size={10} /> : <Copy size={10} />}
                                        {copiedId === m.id ? 'Copied' : 'Copy'}
                                    </button>
                                    {m.persona && (
                                        <span className="text-[7px] font-bold text-zinc-800 uppercase tracking-widest">
                                            {m.persona}
                                        </span>
                                    )}
                                    <span className="ml-auto text-[7px] font-bold text-zinc-800 uppercase tracking-widest">
                                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Analysis Progress */}
                {isAnalyzing && renderAnalysisSteps()}
            </div>

            {/* Input Area */}
            <div className="p-4 sm:p-5 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent shrink-0">
                <div className="max-w-3xl mx-auto relative">
                    {isSearchEnabled && (
                        <div className="absolute -top-9 left-0 right-0 flex justify-center animate-fade-in">
                            <div className="px-3 py-1 bg-[#E50914] text-white text-[8px] font-extrabold uppercase tracking-[2px] rounded-full shadow-lg flex items-center gap-2 glow-accent">
                                <Search size={10} /> Web Search Active
                            </div>
                        </div>
                    )}
                    <div className={`flex items-end gap-2.5 p-2.5 glass rounded-2xl shadow-xl transition-all duration-300 ${inputText ? 'border-[#E50914]/40 glow-accent' : ''}`}>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2.5 text-zinc-600 hover:text-white transition-all bg-zinc-900/50 rounded-xl hover:bg-zinc-800 border border-zinc-800/50"
                        >
                            <Paperclip size={17} />
                        </button>
                        <textarea
                            value={inputText}
                            onChange={e => onInputChange(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                            placeholder={isSearchEnabled ? "Search the web and your data..." : "Ask Mastiff anything — analyze data, generate charts, get insights..."}
                            className="flex-1 bg-transparent border-none focus:ring-0 text-white font-medium text-sm resize-none py-2 max-h-28 custom-scrollbar placeholder:text-zinc-700"
                            rows={1}
                        />
                        <button
                            onClick={() => onSend()}
                            disabled={!inputText.trim() || isAnalyzing}
                            className={`p-2.5 rounded-xl transition-all duration-200 ${inputText.trim() && !isAnalyzing
                                ? 'bg-[#E50914] text-white shadow-lg glow-accent hover:bg-[#ff1a25] active:scale-95'
                                : 'bg-zinc-900 text-zinc-700'
                                }`}
                        >
                            <Send size={17} />
                        </button>
                    </div>
                    <p className="text-center mt-2 text-[8px] text-zinc-800 font-medium">
                        Mastiff can make mistakes. Verify important analyses.
                    </p>
                </div>
            </div>
        </main>
    );
};
