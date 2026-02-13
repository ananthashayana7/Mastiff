/**
 * Notebook Service
 * 
 * Handles notebook CRUD operations, cell management, and execution
 */

import { db } from '@/src/db';
import { notebooks, notebookCells, cellExecutionHistory, notebookVariables } from '@/src/db/notebookSchema';
import { eq, and } from 'drizzle-orm';
import { dockerSandbox } from './dockerSandbox';
import { auditLogger } from './auditLogger';
import { AppError } from '@/src/lib/errors';

/**
 * Cell types
 */
export type CellType = 'code' | 'markdown';

/**
 * Cell status
 */
export type CellStatus = 'idle' | 'running' | 'completed' | 'error';

/**
 * Notebook cell representation
 */
export interface NotebookCell {
    id?: string;
    notebookId?: string;
    cellType: CellType;
    cellIndex: number;
    source: string;
    executionCount?: number;
    outputs?: any[];
    status?: CellStatus;
    errorMessage?: string;
    executionTimeMs?: number;
}

/**
 * Notebook representation
 */
export interface Notebook {
    id?: string;
    userId: string;
    sessionId: string;
    title: string;
    description?: string;
    cells: NotebookCell[];
    lastExecutedAt?: Date;
    executionCount?: number;
    tags?: string;
    isPublic?: boolean;
}

/**
 * Cell execution result
 */
export interface CellExecutionResult {
    status: 'success' | 'error' | 'timeout';
    output?: any;
    error?: string;
    executionTimeMs: number;
    memoryUsedMb?: number;
    cpuTimeMs?: number;
}

/**
 * Notebook Service
 */
export class NotebookService {
    /**
     * Create a new notebook
     */
    static async createNotebook(userId: string, sessionId: string, notebook: Notebook): Promise<string> {
        try {
            // Validate inputs
            if (!userId || !sessionId || !notebook.title) {
                throw new AppError('VALIDATION_ERROR', 'Missing required fields');
            }

            // Insert notebook
            const result = await db.insert(notebooks).values({
                userId,
                sessionId,
                title: notebook.title,
                description: notebook.description,
                cells: JSON.stringify(notebook.cells || []),
                tags: notebook.tags,
                isPublic: notebook.isPublic ?? false,
            }).returning({ id: notebooks.id });

            const notebookId = result[0]?.id;
            if (!notebookId) {
                throw new AppError('DATABASE_ERROR', 'Failed to create notebook');
            }

            // Audit log
            await auditLogger.log({
                userId,
                action: 'NOTEBOOK_CREATED',
                resourceType: 'notebook',
                resourceId: notebookId,
                details: { title: notebook.title },
            });

            return notebookId;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to create notebook', error);
        }
    }

    /**
     * Get notebook by ID
     */
    static async getNotebook(notebookId: string, userId: string): Promise<Notebook> {
        try {
            const result = await db.query.notebooks.findFirst({
                where: and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)),
            });

            if (!result) {
                throw new AppError('NOT_FOUND', 'Notebook not found');
            }

            return {
                ...result,
                cells: JSON.parse(result.cells as string) || [],
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to fetch notebook', error);
        }
    }

    /**
     * List notebooks for user
     */
    static async listNotebooks(userId: string, limit: number = 50, offset: number = 0) {
        try {
            const results = await db.query.notebooks.findMany({
                where: eq(notebooks.userId, userId),
                limit,
                offset,
            });

            return results.map(nb => ({
                ...nb,
                cells: JSON.parse(nb.cells as string) || [],
            }));
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to list notebooks', error);
        }
    }

    /**
     * Update notebook
     */
    static async updateNotebook(notebookId: string, userId: string, updates: Partial<Notebook>): Promise<void> {
        try {
            const updateData: any = {
                updatedAt: new Date(),
            };

            if (updates.title) updateData.title = updates.title;
            if (updates.description) updateData.description = updates.description;
            if (updates.cells) updateData.cells = JSON.stringify(updates.cells);
            if (updates.tags !== undefined) updateData.tags = updates.tags;
            if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;

            const result = await db.update(notebooks)
                .set(updateData)
                .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)));

            if (!result.rowCount) {
                throw new AppError('NOT_FOUND', 'Notebook not found');
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

    /**
     * Delete notebook
     */
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

    /**
     * Execute a cell
     */
    static async executeCell(
        notebookId: string,
        cellId: string,
        userId: string,
        code: string,
        variables?: Record<string, any>
    ): Promise<CellExecutionResult> {
        try {
            // Update cell status to running
            await db.update(notebookCells).set({ status: 'running' as any }).where(eq(notebookCells.id, cellId));

            const startTime = Date.now();

            // Execute code in sandbox
            const result = await dockerSandbox.executeCode({
                code,
                variables: variables || {},
                timeout: 30000, // 30 second timeout
            });

            const executionTime = Date.now() - startTime;

            // Determine status
            let status: 'success' | 'error' | 'timeout' = 'success';
            if (result.timedOut) {
                status = 'timeout';
            } else if (result.error) {
                status = 'error';
            }

            // Update cell with results
            const executionCount = await this.getNextExecutionCount(notebookId);
            const outputs = [{
                outputType: 'execute_result',
                data: {
                    'text/plain': result.output,
                },
                executionCount,
            }];

            if (result.error) {
                outputs.push({
                    outputType: 'error',
                    ename: 'Error',
                    evalue: result.error,
                    traceback: [],
                });
            }

            await db.update(notebookCells).set({
                status: status === 'error' ? 'error' : 'completed',
                executionCount,
                outputs: JSON.stringify(outputs),
                errorMessage: result.error || null,
                executionTimeMs: executionTime,
            }).where(eq(notebookCells.id, cellId));

            // Record execution history
            await db.insert(cellExecutionHistory).values({
                cellId,
                code,
                output: JSON.stringify(result.output),
                status,
                error: result.error || null,
                executionTimeMs: executionTime,
                memoryUsedMb: result.memoryUsedMb,
                cpuTimeMs: result.cpuTimeMs,
            });

            // Update notebook execution metadata
            await db.update(notebooks).set({
                lastExecutedAt: new Date(),
                executionCount: (await db.query.notebooks.findFirst({
                    where: eq(notebooks.id, notebookId),
                }))?.executionCount ?? 0 + 1,
            }).where(eq(notebooks.id, notebookId));

            // Audit log
            await auditLogger.log({
                userId,
                action: 'CELL_EXECUTED',
                resourceType: 'notebook_cell',
                resourceId: cellId,
                details: { status, executionTimeMs: executionTime },
            });

            return {
                status,
                output: result.output,
                error: result.error,
                executionTimeMs: executionTime,
                memoryUsedMb: result.memoryUsedMb,
                cpuTimeMs: result.cpuTimeMs,
            };
        } catch (error) {
            // Update cell status to error
            await db.update(notebookCells).set({
                status: 'error',
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
            }).where(eq(notebookCells.id, cellId));

            throw new AppError('EXECUTION_ERROR', 'Failed to execute cell', error);
        }
    }

    /**
     * Get next execution count for notebook
     */
    private static async getNextExecutionCount(notebookId: string): Promise<number> {
        const maxCell = await db.query.notebookCells.findFirst({
            where: eq(notebookCells.notebookId, notebookId),
        });

        return (maxCell?.executionCount ?? 0) + 1;
    }

    /**
     * Set notebook variable
     */
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

    /**
     * Get notebook variables
     */
    static async getVariables(notebookId: string): Promise<Record<string, any>> {
        try {
            const vars = await db.query.notebookVariables.findMany({
                where: eq(notebookVariables.notebookId, notebookId),
            });

            return Object.fromEntries(vars.map(v => [v.varName, JSON.parse(v.varValue as string)]));
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to get variables', error);
        }
    }

    /**
     * Get execution history for cell
     */
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
}

export default NotebookService;
