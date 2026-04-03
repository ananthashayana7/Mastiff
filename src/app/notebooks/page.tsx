/**
 * Notebook Page
 * 
 * Page for creating, editing, and executing notebooks
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Notebook from '@/src/components/Notebook';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';

interface NotebookData {
    id: string;
    title: string;
    description?: string;
    cells: any[];
    lastExecutedAt?: Date;
    executionCount?: number;
}

export default function NotebookPage() {
    const router = useRouter();
    const [notebookId, setNotebookId] = useState<string | null>(null);

    const [notebook, setNotebook] = useState<NotebookData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState('Untitled Notebook');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setNotebookId(params.get('id'));
    }, []);

    /**
     * Load notebook
     */
    useEffect(() => {
        const loadNotebook = async () => {
            if (!notebookId) {
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`/api/notebooks/${notebookId}`);
                if (!response.ok) {
                    throw new Error('Failed to load notebook');
                }

                const data = await response.json();
                if (data.notebook) {
                    setNotebook(data.notebook);
                    setTitle(data.notebook.title);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                console.error('Error loading notebook:', err);
            } finally {
                setLoading(false);
            }
        };

        loadNotebook();
    }, [notebookId]);

    /**
     * Save notebook
     */
    const handleSave = async (cells: any[]) => {
        if (!notebookId) {
            // Create new notebook
            try {
                setIsSaving(true);
                const response = await fetch('/api/notebooks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        cells,
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to create notebook');
                }

                const data = await response.json();
                router.push(`/notebooks?id=${data.notebookId}`);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                console.error('Error creating notebook:', err);
            } finally {
                setIsSaving(false);
            }
        } else {
            // Update existing notebook
            try {
                setIsSaving(true);
                const response = await fetch(`/api/notebooks/${notebookId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        cells,
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to update notebook');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                console.error('Error updating notebook:', err);
            } finally {
                setIsSaving(false);
            }
        }
    };

    /**
     * Execute cell
     */
    const handleExecuteCell = async (cellId: string, code: string) => {
        try {
            const response = await fetch(
                `/api/notebooks/${notebookId || 'new'}/execute`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cellId,
                        code,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to execute cell');
            }

            const data = await response.json();
            return data.result;
        } catch (err) {
            console.error('Error executing cell:', err);
            throw err;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-gray-600">Loading notebook...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-red-600">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                            <ArrowLeft size={20} />
                        </Link>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="text-2xl font-bold border-0 hover:border-b-2 hover:border-gray-300 focus:outline-none focus:border-b-2 focus:border-blue-500"
                        />
                    </div>

                    <button
                        onClick={() => handleSave(notebook?.cells || [])}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        <Save size={16} /> {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Notebook */}
            <Notebook
                notebookId={notebookId || ''}
                initialCells={notebook?.cells || []}
                onSave={handleSave}
                onExecute={handleExecuteCell}
            />
        </div>
    );
}
