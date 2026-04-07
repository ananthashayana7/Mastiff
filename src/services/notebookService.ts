/**
 * Notebook Service
 *
 * Handles notebook CRUD operations, cell synchronization, and execution.
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/src/db';
import { files, sessions } from '@/src/db/schema';
import { cellExecutionHistory, notebookCells, notebooks, notebookVariables } from '@/src/db/notebookSchema';
import {
    NotebookCell,
    NotebookCellOutput,
    NotebookDraft,
    normalizeNotebookCells,
} from '@/src/lib/notebookUtils';
import { AppError } from '@/src/lib/errors';
import { auditLogger } from './auditLogger';
import { kernelService } from './kernel';

export type CellType = 'code' | 'markdown';
export type CellStatus = 'idle' | 'running' | 'completed' | 'error';

export interface Notebook extends NotebookDraft {
    id?: string;
    userId: string;
    lastExecutedAt?: Date | null;
    executionCount?: number | null;
}

export interface CellExecutionResult {
    status: 'success' | 'error' | 'timeout';
    output?: string;
    error?: string;
    traceback?: string;
    executionTimeMs: number;
    charts?: string[];
    plotlyCharts?: any[];
    updatedDfSample?: any[];
    outputs: NotebookCellOutput[];
}

function parseJsonField<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch {
            return fallback;
        }
    }

    return value as T;
}

export class NotebookService {
    static async createNotebook(userId: string, notebook: NotebookDraft): Promise<string> {
        try {
            if (!userId || !notebook.title?.trim()) {
                throw new AppError('VALIDATION_ERROR', 'Missing required fields');
            }

            const normalizedCells = normalizeNotebookCells(notebook.cells || []);

            const result = await db.insert(notebooks).values({
                userId,
                sessionId: notebook.sessionId || null,
                title: notebook.title.trim(),
                description: notebook.description,
                cells: normalizedCells as any,
                tags: notebook.tags,
                isPublic: notebook.isPublic ?? false,
            }).returning({ id: notebooks.id });

            const notebookId = result[0]?.id;
            if (!notebookId) {
                throw new AppError('DATABASE_ERROR', 'Failed to create notebook');
            }

            await this.syncNotebookCellsTable(notebookId, normalizedCells);

            await auditLogger.log({
                userId,
                action: 'NOTEBOOK_CREATED',
                resourceType: 'notebook',
                resourceId: notebookId,
                details: {
                    title: notebook.title,
                    sessionId: notebook.sessionId || null,
                    cellCount: normalizedCells.length,
                },
            });

            return notebookId;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to create notebook', error);
        }
    }

    static async getNotebook(notebookId: string, userId: string): Promise<Notebook> {
        try {
            const result = await db.query.notebooks.findFirst({
                where: and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)),
            });

            if (!result) {
                throw new AppError('NOT_FOUND', 'Notebook not found');
            }

            const tableCells = await db.query.notebookCells.findMany({
                where: eq(notebookCells.notebookId, notebookId),
                orderBy: asc(notebookCells.cellIndex),
            });

            const cells = tableCells.length > 0
                ? normalizeNotebookCells(tableCells.map((cell) => ({
                    id: cell.id,
                    cellType: (cell.cellType === 'markdown' ? 'markdown' : 'code') as CellType,
                    cellIndex: cell.cellIndex,
                    source: cell.source,
                    executionCount: cell.executionCount ?? undefined,
                    outputs: parseJsonField(cell.outputs, [] as NotebookCellOutput[]),
                    status: (cell.status || 'idle') as CellStatus,
                    errorMessage: cell.errorMessage || undefined,
                    executionTimeMs: cell.executionTimeMs ?? undefined,
                })))
                : normalizeNotebookCells(parseJsonField(result.cells, [] as Partial<NotebookCell>[]));

            return {
                id: result.id,
                userId: result.userId!,
                sessionId: result.sessionId || null,
                title: result.title || 'Untitled Notebook',
                description: result.description || undefined,
                cells,
                lastExecutedAt: result.lastExecutedAt || null,
                executionCount: result.executionCount ?? 0,
                tags: result.tags || undefined,
                isPublic: result.isPublic ?? false,
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to fetch notebook', error);
        }
    }

    static async listNotebooks(userId: string, limit: number = 50, offset: number = 0) {
        try {
            const results = await db.query.notebooks.findMany({
                where: eq(notebooks.userId, userId),
                limit,
                offset,
            });

            return results.map((notebook) => ({
                ...notebook,
                sessionId: notebook.sessionId || null,
                cells: normalizeNotebookCells(parseJsonField(notebook.cells, [] as Partial<NotebookCell>[])),
            }));
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to list notebooks', error);
        }
    }

    static async updateNotebook(notebookId: string, userId: string, updates: Partial<Notebook>): Promise<void> {
        try {
            const updateData: Record<string, unknown> = {
                updatedAt: new Date(),
            };

            let normalizedCells: NotebookCell[] | null = null;

            if (typeof updates.title === 'string') updateData.title = updates.title.trim();
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.sessionId !== undefined) updateData.sessionId = updates.sessionId || null;
            if (updates.tags !== undefined) updateData.tags = updates.tags;
            if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;
            if (updates.cells) {
                normalizedCells = normalizeNotebookCells(updates.cells);
                updateData.cells = normalizedCells as any;
            }

            const result = await db.update(notebooks)
                .set(updateData)
                .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)));

            if (!result.rowCount) {
                throw new AppError('NOT_FOUND', 'Notebook not found');
            }

            if (normalizedCells) {
                await this.syncNotebookCellsTable(notebookId, normalizedCells);
            }

            await auditLogger.log({
                userId,
                action: 'NOTEBOOK_UPDATED',
                resourceType: 'notebook',
                resourceId: notebookId,
                details: Object.keys(updates),
            });
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to update notebook', error);
        }
    }

    static async deleteNotebook(notebookId: string, userId: string): Promise<void> {
        try {
            const result = await db.delete(notebooks)
                .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)));

            if (!result.rowCount) {
                throw new AppError('NOT_FOUND', 'Notebook not found');
            }

            await auditLogger.log({
                userId,
                action: 'NOTEBOOK_DELETED',
                resourceType: 'notebook',
                resourceId: notebookId,
            });
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to delete notebook', error);
        }
    }

    static async executeCell(
        notebookId: string,
        cellId: string,
        userId: string,
        code: string,
        variables?: Record<string, any>
    ): Promise<CellExecutionResult> {
        try {
            const notebook = await this.getNotebook(notebookId, userId);
            const targetCell = notebook.cells.find((cell) => cell.id === cellId);

            if (!targetCell) {
                throw new AppError('NOT_FOUND', 'Notebook cell not found');
            }

            const pendingCells = notebook.cells.map((cell) => (
                cell.id === cellId
                    ? {
                        ...cell,
                        source: code,
                        status: 'running' as CellStatus,
                        errorMessage: undefined,
                    }
                    : cell
            ));

            await this.persistNotebookState(notebookId, userId, pendingCells, notebook.executionCount ?? 0);

            const executorFiles = await this.getNotebookExecutionFiles(notebook.sessionId, userId);
            const startTime = Date.now();
            const execution = await kernelService.execute(
                notebook.sessionId || notebookId,
                code,
                executorFiles
            );
            const executionTimeMs = Date.now() - startTime;

            const status: 'success' | 'error' | 'timeout' = execution?.error
                ? (/timed out/i.test(String(execution.error)) ? 'timeout' : 'error')
                : 'success';

            const nextExecutionCount = Math.max(
                ...notebook.cells.map((cell) => cell.executionCount || 0),
                0
            ) + 1;

            const outputs = this.buildOutputsFromExecution(execution);
            const updatedCells = notebook.cells.map((cell) => (
                cell.id === cellId
                    ? {
                        ...cell,
                        source: code,
                        status: status === 'success' ? 'completed' as CellStatus : 'error' as CellStatus,
                        executionCount: nextExecutionCount,
                        outputs,
                        errorMessage: execution?.error || undefined,
                        executionTimeMs,
                    }
                    : cell
            ));

            await this.persistNotebookState(
                notebookId,
                userId,
                updatedCells,
                (notebook.executionCount ?? 0) + 1,
                true
            );

            await db.insert(cellExecutionHistory).values({
                cellId,
                code,
                output: (execution?.result ?? execution?.output ?? '') as any,
                status,
                error: execution?.error || null,
                executionTimeMs,
                memoryUsedMb: null,
                cpuTimeMs: null,
            });

            await auditLogger.log({
                userId,
                action: 'CELL_EXECUTED',
                resourceType: 'notebook_cell',
                resourceId: cellId,
                details: {
                    status,
                    executionTimeMs,
                    attachedFiles: executorFiles.map((file) => file.name),
                    hasVariables: Boolean(variables && Object.keys(variables).length > 0),
                },
            });

            return {
                status,
                output: typeof execution?.result === 'string'
                    ? execution.result
                    : execution?.result
                        ? JSON.stringify(execution.result, null, 2)
                        : undefined,
                error: execution?.error || undefined,
                traceback: execution?.traceback || undefined,
                executionTimeMs,
                charts: execution?.charts || [],
                plotlyCharts: execution?.plotly_charts || [],
                updatedDfSample: execution?.updated_df_sample || [],
                outputs,
            };
        } catch (error) {
            throw error instanceof AppError
                ? error
                : new AppError('EXECUTION_ERROR', 'Failed to execute cell', error);
        }
    }

    static async setVariable(notebookId: string, varName: string, varValue: any, varType: string): Promise<void> {
        try {
            const existing = await db.query.notebookVariables.findFirst({
                where: and(eq(notebookVariables.notebookId, notebookId)),
            });

            if (existing) {
                await db.update(notebookVariables).set({
                    varValue: JSON.stringify(varValue),
                    varType,
                }).where(and(
                    eq(notebookVariables.notebookId, notebookId),
                ));
            } else {
                await db.insert(notebookVariables).values({
                    notebookId,
                    varName,
                    varType,
                    varValue: JSON.stringify(varValue),
                });
            }
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to set variable', error);
        }
    }

    static async getVariables(notebookId: string): Promise<Record<string, any>> {
        try {
            const vars = await db.query.notebookVariables.findMany({
                where: eq(notebookVariables.notebookId, notebookId),
            });

            return Object.fromEntries(vars.map(v => [v.varName, parseJsonField(v.varValue, null)]));
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to get variables', error);
        }
    }

    static async getCellHistory(cellId: string, limit: number = 20): Promise<any[]> {
        try {
            return await db.query.cellExecutionHistory.findMany({
                where: eq(cellExecutionHistory.cellId, cellId),
                limit,
            });
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to fetch cell history', error);
        }
    }

    private static async getNotebookExecutionFiles(sessionId: string | null | undefined, userId: string) {
        if (!sessionId) return [];

        const session = await db.query.sessions.findFirst({
            where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
            with: {
                files: true,
            },
        });

        return (session?.files || []).map((file) => ({
            id: file.id,
            name: file.filename,
            path: file.filePath,
        }));
    }

    private static buildOutputsFromExecution(execution: any): NotebookCellOutput[] {
        const outputs: NotebookCellOutput[] = [];

        const resultText = typeof execution?.result === 'string'
            ? execution.result
            : execution?.result
                ? JSON.stringify(execution.result, null, 2)
                : '';

        if (resultText && resultText !== 'Analysis complete' && resultText !== 'Execution successful') {
            outputs.push({
                outputType: 'text',
                label: 'Result',
                text: resultText,
            });
        }

        for (const chart of execution?.plotly_charts || []) {
            outputs.push({
                outputType: 'plotly',
                label: 'Interactive Chart',
                data: chart,
            });
        }

        for (const chart of execution?.charts || []) {
            outputs.push({
                outputType: 'image',
                label: 'Rendered Chart',
                data: chart,
            });
        }

        if (Array.isArray(execution?.updated_df_sample) && execution.updated_df_sample.length > 0) {
            outputs.push({
                outputType: 'table',
                label: 'Updated Sample',
                data: execution.updated_df_sample,
            });
        }

        if (execution?.error) {
            outputs.push({
                outputType: 'error',
                label: 'Execution Error',
                text: [execution.error, execution.traceback].filter(Boolean).join('\n\n'),
            });
        }

        return outputs;
    }

    private static async persistNotebookState(
        notebookId: string,
        userId: string,
        cells: NotebookCell[],
        executionCount: number,
        setLastExecutedAt = false
    ) {
        await db.update(notebooks).set({
            cells: cells as any,
            executionCount,
            updatedAt: new Date(),
            ...(setLastExecutedAt ? { lastExecutedAt: new Date() } : {}),
        }).where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)));

        await this.syncNotebookCellsTable(notebookId, cells);
    }

    private static async syncNotebookCellsTable(notebookId: string, cells: NotebookCell[]) {
        const existingRows = await db.query.notebookCells.findMany({
            where: eq(notebookCells.notebookId, notebookId),
        });

        const existingById = new Map(existingRows.map((row) => [row.id, row]));
        const nextIds = new Set(cells.map((cell) => cell.id));

        for (const cell of cells) {
            const payload = {
                notebookId,
                cellType: cell.cellType,
                cellIndex: cell.cellIndex,
                source: cell.source,
                executionCount: cell.executionCount ?? null,
                outputs: (cell.outputs || []) as any,
                status: cell.status || 'idle',
                errorMessage: cell.errorMessage || null,
                executionTimeMs: cell.executionTimeMs ?? null,
                updatedAt: new Date(),
            };

            if (existingById.has(cell.id)) {
                await db.update(notebookCells)
                    .set(payload)
                    .where(and(eq(notebookCells.notebookId, notebookId), eq(notebookCells.id, cell.id)));
            } else {
                await db.insert(notebookCells).values({
                    id: cell.id,
                    ...payload,
                });
            }
        }

        for (const staleRow of existingRows) {
            if (!nextIds.has(staleRow.id)) {
                await db.delete(notebookCells).where(eq(notebookCells.id, staleRow.id));
            }
        }
    }
}

export default NotebookService;
