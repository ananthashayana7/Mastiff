/**
 * Notebook Schema
 * 
 * Database schema for notebook cells, execution history, and state
 */

import { pgTable, uuid, text, integer, timestamp, jsonb, index, varchar, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users, sessions } from './schema';

/**
 * Notebooks table - stores notebook metadata
 */
export const notebooks = pgTable(
    'notebooks',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => users.id),
        sessionId: uuid('session_id').references(() => sessions.id),
        
        title: varchar('title', { length: 255 }),
        description: text('description'),
        
        // Notebook state
        cells: jsonb('cells'), // Array of cells (serialized)
        
        // Execution tracking
        lastExecutedAt: timestamp('last_executed_at'),
        executionCount: integer('execution_count').default(0),
        
        // Metadata
        tags: text('tags'), // Comma-separated tags
        isPublic: boolean('is_public').default(false),
        
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (table) => ({
        userIdIdx: index('idx_notebooks_user_id').on(table.userId),
        sessionIdIdx: index('idx_notebooks_session_id').on(table.sessionId),
    })
);

/**
 * Notebook cells - individual cells with execution history
 */
export const notebookCells = pgTable(
    'notebook_cells',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        notebookId: uuid('notebook_id').references(() => notebooks.id),
        
        // Cell properties
        cellType: varchar('cell_type', { length: 50 }).notNull(), // 'code', 'markdown'
        cellIndex: integer('cell_index').notNull(), // Order in notebook
        
        // Content
        source: text('source').notNull(), // Code or markdown source
        
        // Execution state
        executionCount: integer('execution_count'), // Null if not executed
        
        // Output
        outputs: jsonb('outputs'), // Array of output objects
        
        // Status
        status: varchar('status', { length: 50 }).default('idle'), // 'idle', 'running', 'completed', 'error'
        errorMessage: text('error_message'),
        
        // Performance
        executionTimeMs: integer('execution_time_ms'),
        
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (table) => ({
        notebookIdIdx: index('idx_notebook_cells_notebook_id').on(table.notebookId),
        cellTypeIdx: index('idx_notebook_cells_cell_type').on(table.cellType),
    })
);

/**
 * Cell execution history - for audit and debugging
 */
export const cellExecutionHistory = pgTable(
    'cell_execution_history',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        cellId: uuid('cell_id').references(() => notebookCells.id),
        
        // Inputs
        code: text('code').notNull(),
        
        // Outputs
        output: jsonb('output'), // Execution output
        
        // Execution info
        status: varchar('status', { length: 50 }).notNull(), // 'success', 'error', 'timeout'
        error: text('error'),
        executionTimeMs: integer('execution_time_ms'),
        
        // Resources used
        memoryUsedMb: integer('memory_used_mb'),
        cpuTimeMs: integer('cpu_time_ms'),
        
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        cellIdIdx: index('idx_cell_execution_history_cell_id').on(table.cellId),
        statusIdx: index('idx_cell_execution_history_status').on(table.status),
    })
);

/**
 * Notebook variables - track notebook global variables
 */
export const notebookVariables = pgTable(
    'notebook_variables',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        notebookId: uuid('notebook_id').references(() => notebooks.id),
        
        varName: varchar('var_name', { length: 255 }).notNull(),
        varType: varchar('var_type', { length: 100 }).notNull(), // 'int', 'float', 'str', 'array', 'object', etc.
        varValue: jsonb('var_value'), // Serialized value
        
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (table) => ({
        notebookIdIdx: index('idx_notebook_variables_notebook_id').on(table.notebookId),
    })
);

// Relations
export const notebooksRelations = relations(notebooks, ({ one, many }) => ({
    user: one(users, { fields: [notebooks.userId], references: [users.id] }),
    session: one(sessions, { fields: [notebooks.sessionId], references: [sessions.id] }),
    cells: many(notebookCells),
    variables: many(notebookVariables),
}));

export const notebookCellsRelations = relations(notebookCells, ({ one, many }) => ({
    notebook: one(notebooks, { fields: [notebookCells.notebookId], references: [notebooks.id] }),
    executionHistory: many(cellExecutionHistory),
}));

export const cellExecutionHistoryRelations = relations(cellExecutionHistory, ({ one }) => ({
    cell: one(notebookCells, { fields: [cellExecutionHistory.cellId], references: [notebookCells.id] }),
}));

export const notebookVariablesRelations = relations(notebookVariables, ({ one }) => ({
    notebook: one(notebooks, { fields: [notebookVariables.notebookId], references: [notebooks.id] }),
}));
