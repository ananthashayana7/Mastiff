/**
 * Notebook Component
 * 
 * React component for notebook UI - cell editor, execution, and output display
 */

import React, { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronUp, Play, Trash2, Plus } from 'lucide-react';

interface NotebookCell {
    id?: string;
    cellType: 'code' | 'markdown';
    source: string;
    executionCount?: number;
    outputs?: any[];
    status?: 'idle' | 'running' | 'completed' | 'error';
    errorMessage?: string;
    executionTimeMs?: number;
}

interface NotebookProps {
    notebookId: string;
    initialCells?: NotebookCell[];
    readOnly?: boolean;
    onSave?: (cells: NotebookCell[]) => Promise<void>;
    onExecute?: (cellId: string, code: string) => Promise<any>;
}

interface CellComponentProps {
    cell: NotebookCell;
    index: number;
    onExecute: () => Promise<void>;
    onDelete: () => void;
    onSourceChange: (source: string) => void;
    onCellTypeChange: (type: 'code' | 'markdown') => void;
    readOnly: boolean;
    isExecuting: boolean;
}

/**
 * Single cell component
 */
const Cell: React.FC<CellComponentProps> = ({
    cell,
    index,
    onExecute,
    onDelete,
    onSourceChange,
    onCellTypeChange,
    readOnly,
    isExecuting,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const getCellStatusColor = () => {
        switch (cell.status) {
            case 'running':
                return 'border-yellow-500 bg-yellow-50';
            case 'completed':
                return 'border-green-500 bg-green-50';
            case 'error':
                return 'border-red-500 bg-red-50';
            default:
                return 'border-gray-300 bg-white';
        }
    };

    const renderOutput = (output: any) => {
        if (!output) return null;

        if (typeof output === 'string') {
            return <pre className="text-xs whitespace-pre-wrap break-words">{output}</pre>;
        }

        if (output.outputType === 'execute_result') {
            return (
                <div className="text-xs">
                    <pre className="whitespace-pre-wrap break-words">
                        {JSON.stringify(output.data?.['text/plain'], null, 2)}
                    </pre>
                </div>
            );
        }

        if (output.outputType === 'error') {
            return (
                <div className="text-xs text-red-600">
                    <strong>{output.ename}: {output.evalue}</strong>
                </div>
            );
        }

        return (
            <pre className="text-xs whitespace-pre-wrap break-words">
                {JSON.stringify(output, null, 2)}
            </pre>
        );
    };

    return (
        <div className={`border rounded-lg overflow-hidden ${getCellStatusColor()} transition-all`}>
            {/* Cell Header */}
            <div className="flex items-center justify-between bg-gray-100 px-4 py-2 border-b">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 hover:bg-gray-200 rounded"
                    >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>

                    <select
                        value={cell.cellType}
                        onChange={(e) => onCellTypeChange(e.target.value as 'code' | 'markdown')}
                        disabled={readOnly}
                        className="text-xs bg-transparent font-medium"
                    >
                        <option value="code">Code</option>
                        <option value="markdown">Markdown</option>
                    </select>

                    {cell.executionCount !== undefined && (
                        <span className="text-xs text-gray-600">[{cell.executionCount}]</span>
                    )}

                    {cell.status === 'running' && <span className="text-xs text-yellow-600">Running...</span>}
                    {cell.status === 'completed' && (
                        <span className="text-xs text-green-600">
                            Executed in {cell.executionTimeMs}ms
                        </span>
                    )}
                    {cell.status === 'error' && (
                        <span className="text-xs text-red-600">Error</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {cell.cellType === 'code' && (
                        <button
                            onClick={onExecute}
                            disabled={readOnly || isExecuting}
                            className="p-1 hover:bg-gray-200 rounded disabled:opacity-50"
                            title="Execute cell"
                        >
                            <Play size={16} className="text-blue-600" />
                        </button>
                    )}
                    {!readOnly && (
                        <button
                            onClick={onDelete}
                            className="p-1 hover:bg-gray-200 rounded"
                            title="Delete cell"
                        >
                            <Trash2 size={16} className="text-red-600" />
                        </button>
                    )}
                </div>
            </div>

            {/* Cell Content */}
            {isExpanded && (
                <div className="p-4">
                    {/* Source Editor */}
                    <textarea
                        value={cell.source}
                        onChange={(e) => onSourceChange(e.target.value)}
                        disabled={readOnly}
                        placeholder={cell.cellType === 'code' ? 'Enter Python code...' : 'Enter markdown...'}
                        className="w-full h-32 p-2 font-mono text-sm border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />

                    {/* Output Display */}
                    {cell.outputs && cell.outputs.length > 0 && (
                        <div className="mt-4 border-t pt-4">
                            <div className="text-xs font-medium text-gray-600 mb-2">Output:</div>
                            <div className="bg-gray-900 text-white p-3 rounded overflow-auto max-h-48">
                                {cell.outputs.map((output, i) => (
                                    <div key={i} className="mb-2">
                                        {renderOutput(output)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {cell.errorMessage && (
                        <div className="mt-4 p-3 bg-red-100 border border-red-400 rounded text-xs text-red-700">
                            {cell.errorMessage}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Main Notebook Component
 */
export const Notebook: React.FC<NotebookProps> = ({
    notebookId,
    initialCells = [],
    readOnly = false,
    onSave,
    onExecute,
}) => {
    const [cells, setCells] = useState<NotebookCell[]>(initialCells);
    const [executingCellId, setExecutingCellId] = useState<string | null>(null);

    /**
     * Update cell source
     */
    const updateCellSource = useCallback((index: number, source: string) => {
        setCells((prev) => {
            const updated = [...prev];
            updated[index].source = source;
            return updated;
        });
    }, []);

    /**
     * Update cell type
     */
    const updateCellType = useCallback((index: number, cellType: 'code' | 'markdown') => {
        setCells((prev) => {
            const updated = [...prev];
            updated[index].cellType = cellType;
            return updated;
        });
    }, []);

    /**
     * Delete cell
     */
    const deleteCell = useCallback((index: number) => {
        setCells((prev) => prev.filter((_, i) => i !== index));
    }, []);

    /**
     * Add new cell
     */
    const addCell = useCallback((type: 'code' | 'markdown' = 'code') => {
        setCells((prev) => [
            ...prev,
            {
                cellType: type,
                source: '',
                status: 'idle',
            },
        ]);
    }, []);

    /**
     * Execute cell
     */
    const handleExecuteCell = useCallback(async (index: number) => {
        const cell = cells[index];
        if (!cell.id || !onExecute) return;

        setExecutingCellId(cell.id);

        try {
            // Update cell status
            setCells((prev) => {
                const updated = [...prev];
                updated[index].status = 'running';
                return updated;
            });

            // Execute
            const result = await onExecute(cell.id, cell.source);

            // Update with results
            setCells((prev) => {
                const updated = [...prev];
                updated[index] = {
                    ...updated[index],
                    status: result.status === 'success' ? 'completed' : 'error',
                    outputs: result.output ? [{ outputType: 'execute_result', data: { 'text/plain': result.output } }] : [],
                    errorMessage: result.error,
                    executionTimeMs: result.executionTimeMs,
                    executionCount: (updated[index].executionCount || 0) + 1,
                };
                return updated;
            });
        } catch (error) {
            setCells((prev) => {
                const updated = [...prev];
                updated[index].status = 'error';
                updated[index].errorMessage = error instanceof Error ? error.message : 'Unknown error';
                return updated;
            });
        } finally {
            setExecutingCellId(null);
        }
    }, [cells, onExecute]);

    /**
     * Save notebook
     */
    const handleSave = useCallback(async () => {
        if (onSave && !readOnly) {
            await onSave(cells);
        }
    }, [cells, onSave, readOnly]);

    useEffect(() => {
        const saveInterval = setInterval(handleSave, 30000); // Auto-save every 30 seconds
        return () => clearInterval(saveInterval);
    }, [handleSave]);

    return (
        <div className="w-full max-w-4xl mx-auto p-6">
            {/* Notebook Header */}
            <div className="mb-6 flex justify-between items-center">
                <h1 className="text-3xl font-bold">Notebook</h1>
                {!readOnly && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => addCell('code')}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            <Plus size={16} /> Code Cell
                        </button>
                        <button
                            onClick={() => addCell('markdown')}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                        >
                            <Plus size={16} /> Text Cell
                        </button>
                    </div>
                )}
            </div>

            {/* Cells */}
            <div className="space-y-4">
                {cells.map((cell, index) => (
                    <Cell
                        key={index}
                        cell={cell}
                        index={index}
                        onExecute={() => handleExecuteCell(index)}
                        onDelete={() => deleteCell(index)}
                        onSourceChange={(source) => updateCellSource(index, source)}
                        onCellTypeChange={(type) => updateCellType(index, type)}
                        readOnly={readOnly}
                        isExecuting={executingCellId === cell.id}
                    />
                ))}
            </div>

            {/* Empty state */}
            {cells.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    <p className="mb-4">No cells yet. Create your first cell to get started.</p>
                    {!readOnly && (
                        <button
                            onClick={() => addCell('code')}
                            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Create First Cell
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default Notebook;
