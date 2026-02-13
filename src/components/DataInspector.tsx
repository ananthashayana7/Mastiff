"use client";

import React, { useState } from 'react';
import { X, Info, Table, BarChart2, List, Hash, Database, AlertCircle, Sparkles } from 'lucide-react';
import { DataFile } from '../types';

interface DataInspectorProps {
    inspectingFileId: string | null;
    files: DataFile[];
    onClose: () => void;
}

type TabType = 'overview' | 'columns' | 'stats' | 'workbench';

export const DataInspector: React.FC<DataInspectorProps> = ({
    inspectingFileId,
    files,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [internalFileId, setInternalFileId] = useState<string | null>(null);

    const currentFileId = internalFileId || inspectingFileId;
    const activeFile = files.find(f => f.id === currentFileId);

    if (!activeFile) return null;

    const metadata = activeFile.metadata;
    console.log("Inspecting File:", activeFile.name, "Metadata:", metadata);

    return (
        <aside className="fixed inset-y-0 right-0 w-85 bg-black border-l border-zinc-900 flex flex-col z-[130] animate-in slide-in-from-right shadow-2xl">
            <div className="p-5 flex items-center justify-between border-b border-zinc-900 bg-black/50 backdrop-blur-md shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#E50914]/10 rounded-lg text-[#E50914]">
                        <Info size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase italic tracking-tighter">Data Inspector</h3>
                        <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest truncate max-w-[150px]">{activeFile.name}</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 bg-zinc-900/50 hover:bg-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all">
                    <X size={16} />
                </button>
            </div>

            <div className="p-3 bg-zinc-950/50 border-b border-zinc-900 overflow-x-auto flex gap-2 shrink-0 custom-scrollbar">
                {files.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setInternalFileId(f.id)}
                        className={`flex-none px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${activeFile.id === f.id ? 'bg-[#E50914] border-[#E50914] text-white shadow-[0_0_10px_rgba(229,9,20,0.3)]' : 'bg-black border-zinc-800 text-zinc-500 hover:text-white'}`}
                    >
                        {f.name}
                    </button>
                ))}
            </div>

            <div className="flex p-1.5 bg-zinc-950 border-b border-zinc-900 shrink-0">
                {(['overview', 'columns', 'stats', 'workbench'] as TabType[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 py-2 px-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[#E50914] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-8">
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 text-center space-y-1">
                                <p className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Total Rows</p>
                                <p className="text-lg font-black text-white">{metadata?.row_count.toLocaleString() || activeFile.preview.length}+</p>
                                <Database size={12} className="mx-auto text-[#E50914] opacity-50" />
                            </div>
                            <div className="p-3 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 text-center space-y-1">
                                <p className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Columns</p>
                                <p className="text-lg font-black text-white">{metadata?.column_count || activeFile.columns.length}</p>
                                <Table size={12} className="mx-auto text-[#E50914] opacity-50" />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-[3px]">Entity Metadata</p>
                            <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl divide-y divide-zinc-900 overflow-hidden">
                                <div className="p-3 flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-zinc-500">Schema Type</span>
                                    <span className="text-white uppercase px-2 py-0.5 bg-zinc-800 rounded">{activeFile.type}</span>
                                </div>
                                <div className="p-3 flex justify-between items-center text-[10px] font-bold">
                                    <span className="text-zinc-500">Size</span>
                                    <span className="text-white">{(activeFile.preview.length * activeFile.columns.length * 10).toLocaleString()} bytes (Est)</span>
                                </div>
                            </div>
                        </div>

                        {activeFile.preview.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-[3px]">Data Sample</p>
                                <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/20">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-900/50">
                                                {activeFile.columns.slice(0, 3).map(col => (
                                                    <th key={col} className="px-3 py-2 text-[8px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800">{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeFile.preview.slice(0, 3).map((row, i) => (
                                                <tr key={i} className="border-b border-zinc-900/50 last:border-0">
                                                    {activeFile.columns.slice(0, 3).map(col => (
                                                        <td key={col} className="px-3 py-2 text-[9px] font-bold text-zinc-400 truncate max-w-[80px]">{String(row[col])}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'columns' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {activeFile.columns.map(col => {
                            const info = metadata?.columns[col];
                            return (
                                <div key={col} className="group p-4 bg-zinc-900/40 border border-zinc-800 hover:border-[#E50914]/50 rounded-2xl transition-all space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-zinc-800 rounded-lg text-zinc-400 group-hover:text-white transition-colors">
                                                {info?.dtype.includes('int') || info?.dtype.includes('float') ? <Hash size={12} /> : <List size={12} />}
                                            </div>
                                            <span className="text-[11px] font-black text-white truncate max-w-[120px]">{col}</span>
                                        </div>
                                        <span className="text-[7px] font-black text-zinc-600 uppercase tracking-widest bg-zinc-950 px-2 py-0.5 rounded-full">{info?.dtype || 'unknown'}</span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex justify-between text-[7px] font-black uppercase text-zinc-500">
                                                <span>Fill Rate</span>
                                                <span className={info && info.null_percentage > 10 ? 'text-red-500' : 'text-green-500'}>
                                                    {info ? (100 - info.null_percentage).toFixed(1) : '100'}%
                                                </span>
                                            </div>
                                            <div className="h-1 w-full bg-zinc-950 rounded-full overflow-hidden">
                                                <div className={`h-full ${info && info.null_percentage > 10 ? 'bg-red-500' : 'bg-[#E50914]'}`} style={{ width: `${info ? (100 - info.null_percentage) : 100}%` }} />
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-widest">Uniqueness</p>
                                            <p className="text-[10px] font-black text-white">{info?.unique_count || '?'}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        {activeFile.columns.filter(c => metadata?.columns[c]?.stats).length > 0 ? (
                            activeFile.columns.filter(c => metadata?.columns[c]?.stats).map(col => {
                                const stats = metadata?.columns[col].stats!;
                                return (
                                    <div key={col} className="space-y-3">
                                        <div className="flex items-center gap-2 px-1">
                                            <BarChart2 size={12} className="text-[#E50914]" />
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest">{col}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
                                                <p className="text-[7px] font-black text-zinc-600 uppercase mb-1">Central Tendency</p>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-zinc-500">Mean</span><span className="text-white">{stats.mean.toFixed(2)}</span></div>
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-zinc-500">Median</span><span className="text-white">{stats.median.toFixed(2)}</span></div>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-zinc-900/60 rounded-2xl border border-zinc-800">
                                                <p className="text-[7px] font-black text-zinc-600 uppercase mb-1">Dispersion</p>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-zinc-500">Std Dev</span><span className="text-white">{stats.std.toFixed(2)}</span></div>
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-zinc-500">Range</span><span className="text-white">{(stats.max - stats.min).toFixed(0)}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl space-y-3">
                                            <div className="flex justify-between text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                                                <span>Distribution</span>
                                                <span className="text-white">Q1: {stats.q1.toFixed(1)} | Q3: {stats.q3.toFixed(1)}</span>
                                            </div>
                                            <div className="relative h-6 flex items-center">
                                                <div className="absolute inset-x-0 h-0.5 bg-zinc-800 rounded-full" />
                                                <div className="absolute h-3 bg-[#E50914]/30 border-x border-[#E50914] rounded-sm"
                                                    style={{
                                                        left: `${((stats.q1 - stats.min) / (stats.max - stats.min)) * 100}%`,
                                                        right: `${100 - ((stats.q3 - stats.min) / (stats.max - stats.min)) * 100}%`
                                                    }}
                                                />
                                                <div className="absolute w-0.5 h-4 bg-white"
                                                    style={{ left: `${((stats.median - stats.min) / (stats.max - stats.min)) * 100}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[7px] font-black text-zinc-700 uppercase">
                                                <span>{stats.min.toFixed(0)}</span>
                                                <span>{stats.max.toFixed(0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-50">
                                <AlertCircle size={32} className="text-zinc-700" />
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">No numeric data available for statistics</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'workbench' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="p-4 bg-zinc-900/60 rounded-2xl border-2 border-dashed border-[#E50914]/20 text-center space-y-3">
                            <Sparkles size={24} className="mx-auto text-[#E50914]" />
                            <div>
                                <h4 className="text-[10px] font-black text-white uppercase tracking-widest">Data Workbench</h4>
                                <p className="text-[7px] text-zinc-500 font-bold uppercase mt-1">Direct Manipulation & Cleaning</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-[3px]">Quick Actions</p>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { label: 'Drop Empty Rows', desc: 'Remove all rows with missing values', code: `dfs['${activeFile.name}'] = dfs['${activeFile.name}'].dropna()` },
                                    { label: 'Fill Missing Values', desc: 'Replace NaNs with median/mode', code: `dfs['${activeFile.name}'] = dfs['${activeFile.name}'].fillna(dfs['${activeFile.name}'].median() if not dfs['${activeFile.name}'].select_dtypes('number').empty else 0)` },
                                    { label: 'Normalize Case', desc: 'Lower case all text columns', code: `for col in dfs['${activeFile.name}'].select_dtypes('object'): dfs['${activeFile.name}'][col] = dfs['${activeFile.name}'][col].str.lower()` },
                                ].map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            // Call global handleSend with the cleaning code
                                            (window as any).beagleCleanup?.(action.code, action.label);
                                        }}
                                        className="p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl hover:border-[#E50914] hover:bg-zinc-900/60 text-left transition-all group"
                                    >
                                        <p className="text-[9px] font-black text-white uppercase group-hover:text-[#E50914] transition-colors">{action.label}</p>
                                        <p className="text-[7px] text-zinc-600 font-bold mt-0.5">{action.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl">
                            <p className="text-[7px] font-black text-zinc-500 uppercase tracking-widest mb-3">Workbench Status</p>
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[8px] font-black text-zinc-300 uppercase tracking-widest">Kernel Connected & Ready</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-black border-t border-zinc-900">
                <button
                    onClick={onClose}
                    className="w-full py-2.5 bg-zinc-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-zinc-800 transition-all border border-zinc-800"
                >
                    Close Inspector
                </button>
            </div>
        </aside>
    );
};
