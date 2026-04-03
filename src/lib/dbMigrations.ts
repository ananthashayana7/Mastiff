/**
 * Database Migration Script
 * 
 * Runs all pending migrations on the database
 * Call this during deployment/initialization
 */

import { db } from '@/db/index';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

/**
 * Run all migrations
 * This uses Drizzle's migration system
 */
export async function runMigrations(): Promise<void> {
    try {
        console.log('🔄 Running database migrations...');

        const migrationsFolder = path.join(process.cwd(), 'drizzle');
        if (fs.existsSync(migrationsFolder)) {
            await migrate(db, { migrationsFolder });
        } else {
            console.warn(`⚠️  Migrations folder not found at ${migrationsFolder}; skipping migrate step.`);
        }

        console.log('✅ Database schema is up to date');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

/**
 * Create indexes for performance optimization
 * These should be run once after schema creation
 */
export async function createIndexes(): Promise<void> {
    try {
        console.log('🔍 Creating database indexes...');

        // Execute independently to isolate failures if specific tables are absent in some environments.
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_files_session_id ON files(session_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);`);

        // Optional index; may not exist in all schemas.
        try {
            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);`);
        } catch (credentialIndexError) {
            console.warn('Skipping credentials index creation:', credentialIndexError);
        }

        console.log('✅ Indexes created or already exist');
    } catch (err) {
        console.error('⚠️  Index creation warning:', err);
        // Don't fail on index errors as they may already exist
    }
}

/**
 * Verify database connectivity
 */
export async function verifyDatabaseConnection(): Promise<boolean> {
    try {
        // Try a simple query
        await db.execute(sql`SELECT 1`);
        console.log('✅ Database connection verified');
        return true;
    } catch (err) {
        console.error('❌ Database connection failed:', err);
        return false;
    }
}

/**
 * Initialization hook - call on app startup
 */
export async function initializeDatabase(): Promise<{
    success: boolean;
    errors: string[];
}> {
    const errors: string[] = [];

    try {
        // Verify connection
        const connected = await verifyDatabaseConnection();
        if (!connected) {
            errors.push('Database connection failed');
            return { success: false, errors };
        }

        // Run migrations
        try {
            await runMigrations();
        } catch (err) {
            errors.push(`Migration error: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Create indexes
        try {
            await createIndexes();
        } catch (err) {
            // Non-fatal
            console.warn('Index creation had warnings');
        }

        return {
            success: errors.length === 0,
            errors,
        };
    } catch (err) {
        errors.push(`Initialization error: ${err instanceof Error ? err.message : String(err)}`);
        return { success: false, errors };
    }
}
