/**
 * Database Migration - Add Notebook Tables
 * 
 * Migration for adding notebook-related tables to the database
 * Run: npx drizzle-kit migrate
 */

import { db } from '@/src/db';
import { sql } from 'drizzle-orm';

export async function migrateNotebookTables() {
    console.log('🔄 Running notebook migration...');

    try {
        // Create notebooks table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS notebooks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                cells JSONB,
                last_executed_at TIMESTAMP,
                execution_count INTEGER DEFAULT 0,
                tags TEXT,
                is_public BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create index on user_id
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON notebooks(user_id);
        `);

        // Create index on session_id
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_notebooks_session_id ON notebooks(session_id);
        `);

        // Create notebook_cells table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS notebook_cells (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
                cell_type VARCHAR(50) NOT NULL,
                cell_index INTEGER NOT NULL,
                source TEXT NOT NULL,
                execution_count INTEGER,
                outputs JSONB,
                status VARCHAR(50) DEFAULT 'idle',
                error_message TEXT,
                execution_time_ms INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes for notebook_cells
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_notebook_cells_notebook_id ON notebook_cells(notebook_id);
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_notebook_cells_cell_type ON notebook_cells(cell_type);
        `);

        // Create cell_execution_history table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS cell_execution_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cell_id UUID NOT NULL REFERENCES notebook_cells(id) ON DELETE CASCADE,
                code TEXT NOT NULL,
                output JSONB,
                status VARCHAR(50) NOT NULL,
                error TEXT,
                execution_time_ms INTEGER,
                memory_used_mb INTEGER,
                cpu_time_ms INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes for cell_execution_history
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_cell_execution_history_cell_id ON cell_execution_history(cell_id);
        `);

        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_cell_execution_history_status ON cell_execution_history(status);
        `);

        // Create notebook_variables table
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS notebook_variables (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
                var_name VARCHAR(255) NOT NULL,
                var_type VARCHAR(100) NOT NULL,
                var_value JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create index for notebook_variables
        await db.execute(sql`
            CREATE INDEX IF NOT EXISTS idx_notebook_variables_notebook_id ON notebook_variables(notebook_id);
        `);

        console.log('✅ Notebook migration completed successfully');
        return { success: true };
    } catch (error) {
        console.error('❌ Notebook migration failed:', error);
        throw error;
    }
}

export default migrateNotebookTables;
