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
    const datasetIntelligence = metadata?.datasetIntelligence;
    const analysisMemory = metadata?.analysisMemory;

    const renderTagGroup = (label: string, values: string[] | undefined, tone: 'neutral' | 'sky' | 'amber' = 'neutral') => {
        if (!values || values.length === 0) return null;

        const toneClass = tone === 'sky'
            ? 'border-sky-200 bg-sky-50 text-sky-800'
            : tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-stone-200 bg-stone-50 text-stone-700';

        return (
            <div className="space-y-2">
                <p className="text-[7px] font-black uppercase tracking-[0.24em] text-stone-500">{label}</p>
                <div className="flex flex-wrap gap-2">
                    {values.slice(0, 8).map((value) => (
                        <span key={`${label}-${value}`} className={`rounded-full border px-2.5 py-1 text-[9px] font-bold ${toneClass}`}>
                            {value}
                        </span>
                    ))}
                </div>
            </div>
        );
    };

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
        <aside className="fixed inset-y-0 right-0 z-[130] flex w-full max-w-[min(34rem,100vw)] flex-col border-l border-stone-200 bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(247,244,238,0.98))] text-stone-900 shadow-[0_24px_80px_rgba(28,25,23,0.12)] animate-in slide-in-from-right">
            <div className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white/85 p-5 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                    <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
                        <Info size={18} />
                    </div>
                    <div>
                        <h3 className="font-serif text-lg font-semibold tracking-[-0.03em] text-stone-900">Data Inspector</h3>
                        <p className="max-w-[220px] truncate text-[10px] font-bold uppercase tracking-[0.24em] text-stone-500">{activeFile.name}</p>
                    </div>
                </div>
                <button onClick={onClose} className="rounded-xl border border-stone-200 bg-stone-50 p-2 text-stone-500 transition-all hover:bg-stone-100 hover:text-stone-900">
                    <X size={16} />
                </button>
            </div>

            <div className="custom-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-stone-200 bg-stone-50/80 p-3">
                {files.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setInternalFileId(f.id)}
                        className={`flex-none rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] transition-all ${activeFile.id === f.id ? 'border-sky-200 bg-white text-stone-900 shadow-[0_6px_18px_rgba(28,25,23,0.06)]' : 'border-stone-200 bg-white/70 text-stone-500 hover:border-stone-300 hover:text-stone-900'}`}
                    >
                        {f.name}
                    </button>
                ))}
            </div>

            <div className="flex shrink-0 border-b border-stone-200 bg-white p-1.5">
                {(['overview', 'columns', 'stats', 'workbench'] as TabType[]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 rounded-xl px-1 py-2.5 text-[9px] font-black uppercase tracking-[0.18em] transition-all ${activeTab === tab ? 'bg-stone-900 text-white shadow-lg' : 'text-stone-500 hover:text-stone-900'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-5 space-y-8">
                {isPending && (
                    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-[8px] font-black uppercase tracking-[0.28em] text-amber-700">Pending Activation</p>
                        <p className="text-[12px] leading-relaxed text-stone-700">
                            Review the normalized sample before Mastiff uses this file in chat. The detected schema is inferred from the upload parser.
                        </p>
                        <p className="text-[11px] leading-relaxed text-stone-500">
                            Data types, inferred header row, and sheet selection are already applied. Confirm the useful columns and Mastiff will activate the file immediately.
                        </p>
                    </div>
                )}

                {(metadata?.extraction_warning || likelyMergedCellIssue) && (
                    <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4">
                        <p className="text-[8px] font-black uppercase tracking-[0.28em] text-red-600">Parsing Warning</p>
                        {metadata?.extraction_warning && (
                            <p className="text-[12px] leading-relaxed text-stone-700">
                                {metadata.extraction_warning}
                            </p>
                        )}
                        {likelyMergedCellIssue && (
                            <p className="text-[12px] leading-relaxed text-stone-700">
                                This spreadsheet looks like it may contain merged headers or formatting rows. Mastiff detected placeholder headers or very sparse columns after flattening. Review the sample carefully before activation.
                            </p>
                        )}
                        {suspiciousHeaderColumns.length > 0 && (
                            <p className="text-[11px] leading-relaxed text-stone-500">
                                Suspicious headers: {suspiciousHeaderColumns.slice(0, 4).join(', ')}{suspiciousHeaderColumns.length > 4 ? '...' : ''}
                            </p>
                        )}
                    </div>
                )}

                {schemaReviewNotes.length > 0 && (
                    <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                        <p className="text-[8px] font-black uppercase tracking-[0.28em] text-sky-700">Schema Review Notes</p>
                        <div className="space-y-1.5">
                            {schemaReviewNotes.slice(0, 4).map((note, index) => (
                                <p key={`${activeFile.id}-schema-note-${index}`} className="text-[12px] leading-relaxed text-stone-700">
                                    {note}
                                </p>
                            ))}
                        </div>
                    </div>
                )}

                {normalizedFocusTerm && (
                    <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                        <p className="text-[8px] font-black uppercase tracking-[0.28em] text-sky-700">Focused Inspection</p>
                        <p className="text-[12px] leading-relaxed text-stone-700">
                            Filtering the sample for matches related to <span className="font-mono text-stone-900">{focusTerm}</span>.
                        </p>
                        <p className="text-[11px] leading-relaxed text-stone-500">
                            Showing {previewRows.length} matching preview row{previewRows.length === 1 ? '' : 's'} from the current sample.
                        </p>
                    </div>
                )}

                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1 rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                                <p className="text-[8px] font-black uppercase tracking-[0.24em] text-stone-500">Total Rows</p>
                                <p className="text-2xl font-black tracking-[-0.04em] text-stone-900">{metadata?.row_count.toLocaleString() || activeFile.preview.length}+</p>
                                <Database size={12} className="mx-auto text-sky-700 opacity-70" />
                            </div>
                            <div className="space-y-1 rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                                <p className="text-[8px] font-black uppercase tracking-[0.24em] text-stone-500">Columns</p>
                                <p className="text-2xl font-black tracking-[-0.04em] text-stone-900">{metadata?.column_count || activeFile.columns.length}</p>
                                <Table size={12} className="mx-auto text-emerald-700 opacity-70" />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[8px] font-black uppercase tracking-[0.28em] text-stone-500">Entity Metadata</p>
                            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white divide-y divide-stone-200">
                                <div className="flex items-center justify-between p-3 text-[11px] font-bold">
                                    <span className="text-stone-500">Schema Type</span>
                                    <span className="rounded-full bg-stone-100 px-2.5 py-1 uppercase text-stone-900">{activeFile.type}</span>
                                </div>
                                <div className="flex items-center justify-between p-3 text-[11px] font-bold">
                                    <span className="text-stone-500">Size</span>
                                    <span className="text-stone-900">{(activeFile.preview.length * activeFile.columns.length * 10).toLocaleString()} bytes (Est)</span>
                                </div>
                                {metadata?.sheet_name && (
                                    <div className="flex items-center justify-between p-3 text-[11px] font-bold">
                                        <span className="text-stone-500">Active Sheet</span>
                                        <span className="text-stone-900">{metadata.sheet_name}</span>
                                    </div>
                                )}
                                {(metadata?.dropped_empty_rows || metadata?.dropped_empty_columns) ? (
                                    <div className="flex items-center justify-between p-3 text-[11px] font-bold">
                                        <span className="text-stone-500">Normalization</span>
                                        <span className="text-stone-900">
                                            -{metadata?.dropped_empty_rows || 0} empty rows • -{metadata?.dropped_empty_columns || 0} empty cols
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {datasetIntelligence && (
                            <div className="space-y-3">
                                <p className="text-[8px] font-black uppercase tracking-[0.28em] text-stone-500">Persistent Dataset Intelligence</p>
                                <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                                    <div className="space-y-2">
                                        {datasetIntelligence.summary.slice(0, 4).map((line, index) => (
                                            <p key={`${activeFile.id}-memory-summary-${index}`} className="text-[12px] leading-relaxed text-stone-700">
                                                {line}
                                            </p>
                                        ))}
                                    </div>

                                    {renderTagGroup('Candidate KPIs', datasetIntelligence.candidateKpis, 'sky')}
                                    {renderTagGroup('Dimensions', datasetIntelligence.dimensions)}
                                    {renderTagGroup('Date Fields', datasetIntelligence.dateFields)}
                                    {renderTagGroup('Key Candidates', datasetIntelligence.keyCandidates)}
                                    {renderTagGroup('Known Anomalies', datasetIntelligence.anomalies, 'amber')}

                                    {analysisMemory && (
                                        <div className="space-y-3 border-t border-stone-200 pt-4">
                                            <p className="text-[7px] font-black uppercase tracking-[0.24em] text-stone-500">Derived Analysis Memory</p>
                                            {renderTagGroup('Top Findings', analysisMemory.topFindings)}
                                            {renderTagGroup('Common Filters', analysisMemory.commonFilters)}
                                            {renderTagGroup('Previous Charts', analysisMemory.previousCharts)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {previewRows.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-[8px] font-black uppercase tracking-[0.28em] text-stone-500">{normalizedFocusTerm ? 'Matching Sample Rows' : 'Data Sample'}</p>
                                <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-stone-50">
                                                {previewColumns.map(col => (
                                                    <th key={col} className="border-b border-stone-200 px-3 py-2 text-[8px] font-black uppercase tracking-[0.24em] text-stone-500">{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewRows.slice(0, 5).map((row, i) => (
                                                <tr key={i} className="border-b border-stone-100 last:border-0">
                                                    {previewColumns.map(col => (
                                                        <td key={col} className="max-w-[120px] truncate px-3 py-2 text-[10px] font-medium text-stone-700">{renderCellValue(row[col])}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {normalizedFocusTerm && previewRows.length === 0 && (
                            <div className="rounded-2xl border border-stone-200 bg-white p-4">
                                <p className="text-[11px] font-semibold text-stone-700">No preview rows matched this concern in the current sample.</p>
                                <p className="mt-1 text-[10px] text-stone-500">Try a narrower follow-up in chat or inspect a different active dataset.</p>
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
                                <div key={col} className={`group space-y-3 rounded-2xl border p-4 transition-all ${isPending && !isSelected ? 'border-stone-200 bg-stone-50 opacity-60' : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-[0_8px_24px_rgba(28,25,23,0.05)]'}`}>
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
                                            <div className="rounded-lg bg-stone-100 p-1.5 text-stone-500 transition-colors group-hover:text-stone-900">
                                                {info?.dtype.includes('int') || info?.dtype.includes('float') ? <Hash size={12} /> : <List size={12} />}
                                            </div>
                                            <span className="max-w-[160px] truncate text-[11px] font-black text-stone-900">{col}</span>
                                        </div>
                                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest text-stone-500">{info?.dtype || 'unknown'}</span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 space-y-1">
                                            <div className="flex justify-between text-[7px] font-black uppercase text-stone-500">
                                                <span>Fill Rate</span>
                                                <span className={info && info.null_percentage > 10 ? 'text-red-500' : 'text-green-500'}>
                                                    {info ? (100 - info.null_percentage).toFixed(1) : '100'}%
                                                </span>
                                            </div>
                                            <div className="h-1 w-full overflow-hidden rounded-full bg-stone-200">
                                                <div className={`h-full ${info && info.null_percentage > 10 ? 'bg-red-500' : 'bg-sky-400'}`} style={{ width: `${info ? (100 - info.null_percentage) : 100}%` }} />
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[7px] font-black uppercase tracking-widest text-stone-500">Uniqueness</p>
                                            <p className="text-[10px] font-black text-stone-900">{info?.unique_count || '?'}</p>
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
                                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-900">{col}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="rounded-2xl border border-stone-200 bg-white p-3">
                                                <p className="mb-1 text-[7px] font-black uppercase text-stone-500">Central Tendency</p>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-stone-500">Mean</span><span className="text-stone-900">{stats.mean.toFixed(2)}</span></div>
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-stone-500">Median</span><span className="text-stone-900">{stats.median.toFixed(2)}</span></div>
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-stone-200 bg-white p-3">
                                                <p className="mb-1 text-[7px] font-black uppercase text-stone-500">Dispersion</p>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-stone-500">Std Dev</span><span className="text-stone-900">{stats.std.toFixed(2)}</span></div>
                                                    <div className="flex justify-between text-[9px] font-bold"><span className="text-stone-500">Range</span><span className="text-stone-900">{(stats.max - stats.min).toFixed(0)}</span></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-stone-500">
                                                <span>Distribution</span>
                                                <span className="text-stone-900">Q1: {stats.q1.toFixed(1)} | Q3: {stats.q3.toFixed(1)}</span>
                                            </div>
                                            <div className="relative h-6 flex items-center">
                                                <div className="absolute inset-x-0 h-0.5 rounded-full bg-stone-200" />
                                                <div className="absolute h-3 rounded-sm border-x border-sky-300 bg-sky-300/25"
                                                    style={{
                                                        left: `${((stats.q1 - stats.min) / (stats.max - stats.min)) * 100}%`,
                                                        right: `${100 - ((stats.q3 - stats.min) / (stats.max - stats.min)) * 100}%`
                                                    }}
                                                />
                                                <div className="absolute h-4 w-0.5 bg-stone-900"
                                                    style={{ left: `${((stats.median - stats.min) / (stats.max - stats.min)) * 100}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[7px] font-black uppercase text-stone-500">
                                                <span>{stats.min.toFixed(0)}</span>
                                                <span>{stats.max.toFixed(0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center opacity-60">
                                <WarningCircle size={32} className="text-stone-400" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">No numeric data available for statistics</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'workbench' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-3 rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/70 p-4 text-center">
                            <Sparkle size={24} className="mx-auto text-sky-700" />
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-stone-900">Data Workbench</h4>
                                <p className="mt-1 text-[7px] font-bold uppercase text-stone-500">Direct Manipulation & Cleaning</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-[8px] font-black uppercase tracking-[0.28em] text-stone-500">Quick Actions</p>
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
                                        className="group rounded-xl border border-stone-200 bg-white p-3 text-left transition-all hover:border-stone-300 hover:bg-stone-50"
                                    >
                                        <p className="text-[9px] font-black uppercase text-stone-900 transition-colors group-hover:text-sky-700">{action.label}</p>
                                        <p className="mt-0.5 text-[7px] font-bold text-stone-500">{action.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-stone-200 bg-white p-4">
                            <p className="mb-3 text-[7px] font-black uppercase tracking-widest text-stone-500">Workbench Status</p>
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                                <span className="text-[8px] font-black uppercase tracking-widest text-stone-700">Kernel Connected & Ready</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t border-stone-200 bg-white/90 p-4">
                {isPending ? (
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => onRejectPendingFile?.(activeFile.id)}
                            className="rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-[9px] font-black uppercase tracking-widest text-stone-600 transition-all hover:bg-stone-100 hover:text-stone-900"
                        >
                            Remove
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-xl border border-stone-200 bg-white py-2.5 text-[9px] font-black uppercase tracking-widest text-stone-900 transition-all hover:bg-stone-50"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => onConfirmPendingFile?.(activeFile.id, selectedColumns)}
                            disabled={selectedColumns.length === 0}
                            className="rounded-xl border border-stone-900 bg-stone-900 py-2.5 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Confirm & Analyze
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={onClose}
                        className="w-full rounded-xl border border-stone-900 bg-stone-900 py-2.5 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:bg-stone-800"
                    >
                        Close Inspector
                    </button>
                )}
            </div>
        </aside>
    );
};
