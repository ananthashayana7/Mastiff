/**
 * Real-time Execution Monitor Component
 * 
 * Displays live execution progress for templates, queries, and notebooks
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useExecutionProgress } from '@/src/hooks/useRealtime';
import { WebSocketMessageType } from '@/src/services/websocketService';

interface ExecutionMonitorProps {
    executionId: string;
    onComplete?: (output: any) => void;
    onError?: (error: string) => void;
}

export function ExecutionMonitor({
    executionId,
    onComplete,
    onError,
}: ExecutionMonitorProps) {
    const { progress, status, currentStep, output, error, duration, connected } =
        useExecutionProgress(executionId);

    useEffect(() => {
        if (status === 'completed' && output) {
            onComplete?.(output);
        }
    }, [status, output, onComplete]);

    useEffect(() => {
        if (status === 'failed' && error) {
            onError?.(error);
        }
    }, [status, error, onError]);

    const getStatusColor = () => {
        switch (status) {
            case 'running':
                return 'text-blue-500';
            case 'completed':
                return 'text-green-500';
            case 'failed':
                return 'text-red-500';
            default:
                return 'text-gray-500';
        }
    };

    const getProgressColor = () => {
        if (progress < 33) return 'bg-red-500';
        if (progress < 67) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <div className="w-full max-w-2xl">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-semibold">Execution Progress</h2>
                    <span className={`text-sm font-medium ${getStatusColor()}`}>
                        {status.toUpperCase()}
                    </span>
                </div>
                <p className="text-sm text-gray-600">
                    {!connected && '🔴 Disconnected'}
                    {connected && status === 'idle' && '⏳ Waiting...'}
                    {connected && status === 'running' && `Running: ${currentStep || 'Starting...'}`}
                    {status === 'completed' && `✓ Completed in ${(duration / 1000).toFixed(2)}s`}
                    {status === 'failed' && `✗ Failed - ${error}`}
                </p>
            </div>

            {/* Progress bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm text-gray-600">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${getProgressColor()} transition-all duration-300`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Step indicator */}
            {currentStep && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm font-medium text-blue-900">Current Step</p>
                    <p className="text-sm text-blue-700 mt-1">{currentStep}</p>
                </div>
            )}

            {/* Error message */}
            {error && status === 'failed' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded">
                    <p className="text-sm font-medium text-red-900">Error</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
            )}

            {/* Output preview */}
            {output && status === 'completed' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded">
                    <p className="text-sm font-medium text-green-900">Execution Output</p>
                    <pre className="text-xs text-green-700 mt-2 overflow-auto max-h-48">
                        {JSON.stringify(output, null, 2)}
                    </pre>
                </div>
            )}

            {/* Status indicator */}
            <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                    {connected
                        ? '✓ Connected to real-time updates'
                        : '⚠ Real-time connection unavailable (polling fallback)'}
                </span>
                {duration > 0 && <span>Execution time: {(duration / 1000).toFixed(2)}s</span>}
            </div>
        </div>
    );
}

/**
 * Execution Steps Tracker Component
 * 
 * Shows detailed step-by-step execution status
 */
interface StepInfo {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    duration?: number;
    error?: string;
}

export function ExecutionStepsTracker({ executionId }: { executionId: string }) {
    const [steps, setSteps] = useState<StepInfo[]>([]);
    const { connected } = useExecutionProgress(executionId);

    // In production, you would connect to the message stream
    // and populate steps based on step events

    return (
        <div className="w-full max-w-2xl">
            <h2 className="text-lg font-semibold mb-4">Execution Steps</h2>
            <div className="space-y-2">
                {steps.length === 0 ? (
                    <p className="text-sm text-gray-500">Waiting for step information...</p>
                ) : (
                    steps.map(step => (
                        <div
                            key={step.id}
                            className="flex items-center gap-4 p-3 border border-gray-200 rounded"
                        >
                            {/* Status indicator */}
                            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                                {step.status === 'pending' && (
                                    <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
                                )}
                                {step.status === 'running' && (
                                    <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                )}
                                {step.status === 'completed' && (
                                    <span className="text-green-500 text-lg">✓</span>
                                )}
                                {step.status === 'failed' && (
                                    <span className="text-red-500 text-lg">✗</span>
                                )}
                            </div>

                            {/* Step info */}
                            <div className="flex-grow">
                                <p className="text-sm font-medium">{step.name}</p>
                                {step.duration && (
                                    <p className="text-xs text-gray-500">
                                        {(step.duration / 1000).toFixed(2)}s
                                    </p>
                                )}
                                {step.error && (
                                    <p className="text-xs text-red-500 mt-1">{step.error}</p>
                                )}
                            </div>

                            {/* Status badge */}
                            <div className="flex-shrink-0">
                                <span
                                    className={`text-xs font-medium px-2 py-1 rounded ${
                                        step.status === 'pending'
                                            ? 'bg-gray-100 text-gray-700'
                                            : step.status === 'running'
                                            ? 'bg-blue-100 text-blue-700'
                                            : step.status === 'completed'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-red-100 text-red-700'
                                    }`}
                                >
                                    {step.status}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

/**
 * Live Query Results Component
 * 
 * Streams query results as they arrive
 */
import { useQueryStreaming } from '@/src/hooks/useRealtime';

interface LiveQueryResultsProps {
    queryId: string;
    maxRows?: number;
}

export function LiveQueryResults({ queryId, maxRows = 100 }: LiveQueryResultsProps) {
    const { rows, totalRows, isLoading, error, connected } = useQueryStreaming(queryId);
    const displayRows = rows.slice(0, maxRows);

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded">
                <p className="text-sm font-medium text-red-900">Query Error</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Results</h3>
                <div className="flex items-center gap-2">
                    {isLoading && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            <span className="text-sm text-blue-600">Loading...</span>
                        </div>
                    )}
                    {!isLoading && rows.length > 0 && (
                        <span className="text-sm text-gray-600">
                            {rows.length} / {totalRows} rows
                        </span>
                    )}
                </div>
            </div>

            {rows.length === 0 ? (
                <p className="text-sm text-gray-500">No results yet...</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 border-b">
                            <tr>
                                {Object.keys(displayRows[0] || {}).map(key => (
                                    <th key={key} className="px-4 py-2 text-left font-medium">
                                        {key}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {displayRows.map((row, idx) => (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                    {Object.values(row).map((val, colIdx) => (
                                        <td key={colIdx} className="px-4 py-2">
                                            {String(val)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {rows.length < totalRows && (
                <p className="text-xs text-gray-500 mt-2">
                    Showing {displayRows.length} of {rows.length} loaded rows (total: {totalRows})
                </p>
            )}
        </div>
    );
}
