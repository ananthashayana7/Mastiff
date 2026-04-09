"use client";

import React, { useEffect, useState } from 'react';
import { X, Info, Table, ChartBar, List, Hash, Database, WarningCircle, Sparkle } from '@phosphor-icons/react';
import { DataFile } from '../types';

interface DataInspectorProps {
    inspectingFileId: string | null;
    focusTerm?: string;
    files: DataFile[];
    pendingFileIds?: string[];
    onConfirmPendingFile?: (fileId: string, selectedColumns: string[]) => void | Promise<void>;
    onRejectPendingFile?: (fileId: string) => void;
    onClose: () => void;
}

type TabType = 'overview' | 'columns' | 'stats' | 'workbench';

export const DataInspector: React.FC<DataInspectorProps> = ({
    inspectingFileId,
    focusTerm = '',
    files,
    pendingFileIds = [],
    onConfirmPendingFile,
    onRejectPendingFile,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [internalFileId, setInternalFileId] = useState<string | null>(null);
    const [selectedColumnsByFile, setSelectedColumnsByFile] = useState<Record<string, string[]>>({});

    const currentFileId = internalFileId || inspectingFileId;
    const activeFile = files.find(f => f.id === currentFileId);

    useEffect(() => {
        setInternalFileId(null);
    }, [inspectingFileId]);

    useEffect(() => {
        if (!activeFile) return;

        setSelectedColumnsByFile((prev) => {
            if (prev[activeFile.id]?.length) {
                return prev;
            }

            return {
                ...prev,
                [activeFile.id]: activeFile.columns,
            };
        });
    }, [activeFile]);

    if (!activeFile) return null;

    const metadata = activeFile.metadata;
    const isPending = pendingFileIds.includes(activeFile.id);
    const selectedColumns = selectedColumnsByFile[activeFile.id] || activeFile.columns;
    const previewColumns = (selectedColumns.length > 0 ? selectedColumns : activeFile.columns).slice(0, 6);
    const normalizedFocusTerm = focusTerm.trim().toLowerCase();
    const filteredPreviewRows = normalizedFocusTerm
        ? (activeFile.preview || []).filter((row) => Object.entries(row || {}).some(([key, value]) => {
            return key.toLowerCase().includes(normalizedFocusTerm) || String(value ?? '').toLowerCase().includes(normalizedFocusTerm);
        }))
        : (activeFile.preview || []);
    const previewRows = filteredPreviewRows.slice(0, 10);
    const suspiciousHeaderColumns = activeFile.columns.filter((column) => /^(column_\d+|unnamed:?\s*\d*)$/i.test(column));
    const sparseColumns = activeFile.columns.filter((column) => (metadata?.columns?.[column]?.null_percentage || 0) >= 60);
    const likelyMergedCellIssue = (activeFile.type === 'xlsx' || activeFile.type === 'xls')
        && (suspiciousHeaderColumns.length > 0 || sparseColumns.length >= Math.ceil(Math.max(activeFile.columns.length, 1) / 3));
    const schemaReviewNotes = metadata?.schema_review_notes || [];

    const toggleColumn = (columnName: string) => {
        if (!isPending) return;

        setSelectedColumnsByFile((prev) => {
            const current = prev[activeFile.id] || activeFile.columns;
            const next = current.includes(columnName)
                ? current.filter((column) => column !== columnName)
                : [...current, columnName];

            return {
                ...prev,
                [activeFile.id]: next,
            };
        });
    };

    const renderCellValue = (value: unknown) => {
        const stringValue = String(value ?? '');

        if (!normalizedFocusTerm || !stringValue.toLowerCase().includes(normalizedFocusTerm)) {
            return stringValue;
        }

        const lower = stringValue.toLowerCase();
        const matchIndex = lower.indexOf(normalizedFocusTerm);

        return (
            <>
                {stringValue.slice(0, matchIndex)}
                <mark className="bg-amber-400/20 text-amber-200 px-0.5 rounded-sm">{stringValue.slice(matchIndex, matchIndex + focusTerm.length)}</mark>
                {stringValue.slice(matchIndex + focusTerm.length)}
            </>
        );
    };

    return (
        <aside className="fixed inset-y-0 right-0 z-[130] flex w-full max-w-[min(30rem,100vw)] flex-col border-l border-white/10 bg-[linear-gradient(180deg,rgba(8,14,25,0.98),rgba(5,10,18,0.96))] shadow-2xl animate-in slide-in-from-right">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/50 p-5 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                    <div className="rounded-lg bg-sky-400/10 p-2 text-sky-300">
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
                        className={`flex-none rounded-lg border px-3 py-1.5 text-[8px] font-black uppercase tracking-widest transition-all ${activeFile.id === f.id ? 'border-sky-300/35 bg-[linear-gradient(135deg,rgba(56,189,248,0.18),rgba(20,184,166,0.16),rgba(245,158,11,0.14))] text-white shadow-[0_0_10px_rgba(56,189,248,0.18)]' : 'border-zinc-800 bg-black text-zinc-500 hover:text-white'}`}
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
                        className={`flex-1 rounded-lg px-1 py-2 text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(20,184,166,0.88))] text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-8">
                {isPending && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                        <p className="text-[8px] font-black text-amber-400 uppercase tracking-[3px]">Pending Activation</p>
                        <p className="text-[11px] text-zinc-300 leading-relaxed">
                            Review the normalized sample before Mastiff uses this file in chat. The detected schema is inferred from the upload parser.
                        </p>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                            Data types, inferred header row, and sheet selection are already applied. Confirm the useful columns and Mastiff will activate the file immediately.
                        </p>
                    </div>
                )}

                {(metadata?.extraction_warning || likelyMergedCellIssue) && (
                    <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-4 space-y-2">
                        <p className="text-[8px] font-black text-red-400 uppercase tracking-[3px]">Parsing Warning</p>
                        {metadata?.extraction_warning && (
                            <p className="text-[11px] text-zinc-300 leading-relaxed">
                                {metadata.extraction_warning}
                            </p>
                        )}
                        {likelyMergedCellIssue && (
                            <p className="text-[11px] text-zinc-300 leading-relaxed">
                                This spreadsheet looks like it may contain merged headers or formatting rows. Mastiff detected placeholder headers or very sparse columns after flattening. Review the sample carefully before activation.
                            </p>
                        )}
                        {suspiciousHeaderColumns.length > 0 && (
                            <p className="text-[10px] text-zinc-500 leading-relaxed">
                                Suspicious headers: {suspiciousHeaderColumns.slice(0, 4).join(', ')}{suspiciousHeaderColumns.length > 4 ? '...' : ''}
                            </p>
                        )}
                    </div>
                )}

                {schemaReviewNotes.length > 0 && (
                    <div className="rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-4 space-y-2">
                        <p className="text-[8px] font-black text-sky-200 uppercase tracking-[3px]">Schema Review Notes</p>
                        <div className="space-y-1.5">
                            {schemaReviewNotes.slice(0, 4).map((note, index) => (
                                <p key={`${activeFile.id}-schema-note-${index}`} className="text-[11px] leading-relaxed text-zinc-300">
                                    {note}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {normalizedFocusTerm && (
                    <div className="rounded-2xl border border-sky-300/20 bg-sky-400/[0.06] p-4 space-y-2">
                        <p className="text-[8px] font-black text-sky-200 uppercase tracking-[3px]">Focused Inspection</p>
                        <p className="text-[11px] text-zinc-300 leading-relaxed">
                            Filtering the sample for matches related to <span className="font-mono text-zinc-100">{focusTerm}</span>.
                        </p>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                            Showing {previewRows.length} matching preview row{previewRows.length === 1 ? '' : 's'} from the current sample.
                        </p>
                    </div>
                )}

                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 text-center space-y-1">
                                <p className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Total Rows</p>
                                <p className="text-lg font-black text-white">{metadata?.row_count.toLocaleString() || activeFile.preview.length}+</p>
                                <Database size={12} className="mx-auto text-sky-300 opacity-60" />
                            </div>
                            <div className="p-3 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 text-center space-y-1">
                                <p className="text-[7px] font-black text-zinc-500 uppercase tracking-widest">Columns</p>
                                <p className="text-lg font-black text-white">{metadata?.column_count || activeFile.columns.length}</p>
                                <Table size={12} className="mx-auto text-teal-300 opacity-60" />
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
                                {metadata?.sheet_name && (
                                    <div className="p-3 flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-zinc-500">Active Sheet</span>
                                        <span className="text-white">{metadata.sheet_name}</span>
                                    </div>
                                )}
                                {(metadata?.dropped_empty_rows || metadata?.dropped_empty_columns) ? (
                                    <div className="p-3 flex justify-between items-center text-[10px] font-bold">
                                        <span className="text-zinc-500">Normalization</span>
                                        <span className="text-white">
                                            -{metadata?.dropped_empty_rows || 0} empty rows • -{metadata?.dropped_empty_columns || 0} empty cols
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {previewRows.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-[3px]">{normalizedFocusTerm ? 'Matching Sample Rows' : 'Data Sample'}</p>
                                <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/20">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-900/50">
                                                {previewColumns.map(col => (
                                                    <th key={col} className="px-3 py-2 text-[8px] font-black text-zinc-500 uppercase tracking-widest border-b border-zinc-800">{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewRows.slice(0, 5).map((row, i) => (
                                                <tr key={i} className="border-b border-zinc-900/50 last:border-0">
                                                    {previewColumns.map(col => (
                                                        <td key={col} className="px-3 py-2 text-[9px] font-bold text-zinc-400 truncate max-w-[80px]">{renderCellValue(row[col])}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {normalizedFocusTerm && previewRows.length === 0 && (
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
                                <p className="text-[10px] font-bold text-zinc-400">No preview rows matched this concern in the current sample.</p>
                                <p className="text-[9px] text-zinc-600 mt-1">Try a narrower follow-up in chat or inspect a different active dataset.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'columns' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {activeFile.columns.map(col => {
                            const info = metadata?.columns[col];
                            const isSelected = selectedColumns.includes(col);
                            return (
                                <div key={col} className={`group space-y-3 rounded-2xl border p-4 transition-all ${isPending && !isSelected ? 'border-zinc-900 bg-zinc-950/40 opacity-60' : 'border-zinc-800 bg-zinc-900/40 hover:border-sky-300/40'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {isPending && (
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleColumn(col)}
                                                    className="accent-sky-300"
                                                />
                                            )}
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
                                                <div className={`h-full ${info && info.null_percentage > 10 ? 'bg-red-500' : 'bg-sky-400'}`} style={{ width: `${info ? (100 - info.null_percentage) : 100}%` }} />
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
                                            <ChartBar size={12} className="text-sky-300" />
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
                                                <div className="absolute h-3 rounded-sm border-x border-sky-300 bg-sky-300/25"
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
                                <WarningCircle size={32} className="text-zinc-700" />
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">No numeric data available for statistics</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'workbench' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-3 rounded-2xl border-2 border-dashed border-sky-300/20 bg-zinc-900/60 p-4 text-center">
                            <Sparkle size={24} className="mx-auto text-sky-300" />
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
                                        className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left transition-all hover:border-sky-300/40 hover:bg-zinc-900/60"
                                    >
                                        <p className="text-[9px] font-black uppercase text-white transition-colors group-hover:text-sky-200">{action.label}</p>
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

            <div className="border-t border-white/10 bg-slate-950/70 p-4">
                {isPending ? (
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => onRejectPendingFile?.(activeFile.id)}
                            className="py-2.5 bg-zinc-950 text-zinc-300 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-zinc-900 transition-all border border-zinc-800"
                        >
                            Remove
                        </button>
                        <button
                            onClick={onClose}
                            className="py-2.5 bg-zinc-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-zinc-800 transition-all border border-zinc-800"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => onConfirmPendingFile?.(activeFile.id, selectedColumns)}
                            disabled={selectedColumns.length === 0}
                            className="rounded-xl border border-sky-300/30 bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(20,184,166,0.88),rgba(245,158,11,0.82))] py-2.5 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Confirm & Analyze
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 bg-zinc-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-zinc-800 transition-all border border-zinc-800"
                    >
                        Close Inspector
                    </button>
                )}
            </div>
        </aside>
    );
};
