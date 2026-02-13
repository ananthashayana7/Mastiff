/**
 * Database Seeding Utilities
 * 
 * Helpers for populating database with initial data
 */

import { db } from '@/db/index';
import { users, sessions, files, messages, credentials } from '@/db/schema';
import { piiEncryption } from '@/lib/encryptedFields';
import crypto from 'crypto';

/**
 * Seed result type
 */
export interface SeedResult {
    users: number;
    sessions: number;
    files: number;
    messages: number;
}

/**
 * Clear all data (for testing only)
 */
export async function clearAllData(): Promise<void> {
    console.log('⚠️  Clearing all database data...');

    try {
        // Delete in order of dependencies
        await db.delete(messages);
        await db.delete(files);
        await db.delete(credentials);
        await db.delete(sessions);
        await db.delete(users);

        console.log('✅ Database cleared');
    } catch (err) {
        console.error('❌ Failed to clear database:', err);
        throw err;
    }
}

/**
 * Seed development data
 */
export async function seedDevelopmentData(): Promise<SeedResult> {
    console.log('🌱 Seeding development data...');

    const result: SeedResult = {
        users: 0,
        sessions: 0,
        files: 0,
        messages: 0,
    };

    try {
        // Create test users
        const testUsers = [
            {
                id: crypto.randomUUID(),
                email: 'test@example.com',
                name: 'Test User',
                passwordHash: 'hashed_password_here',
            },
            {
                id: crypto.randomUUID(),
                email: 'admin@example.com',
                name: 'Admin User',
                passwordHash: 'hashed_password_here',
            },
        ];

        for (const user of testUsers) {
            const encryptedUser = {
                ...user,
                email: piiEncryption.encryptEmail(user.email, user.id),
                name: piiEncryption.encryptName(user.name || '', user.id),
            };

            await db.insert(users).values(encryptedUser);
        }
        result.users = testUsers.length;

        // Create test sessions
        for (const user of testUsers) {
            const session1 = {
                id: crypto.randomUUID(),
                userId: user.id,
                title: 'Data Analysis Session',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await db.insert(sessions).values(session1);
            result.sessions++;

            // Create test messages for session
            const testMessages = [
                {
                    id: crypto.randomUUID(),
                    sessionId: session1.id,
                    role: 'user',
                    content: 'How should I analyze this data?',
                    code: null,
                    result: null,
                    visualizationUrl: null,
                    createdAt: new Date(),
                },
                {
                    id: crypto.randomUUID(),
                    sessionId: session1.id,
                    role: 'assistant',
                    content:
                        'I can help you analyze your data using Python with pandas and matplotlib.',
                    code: 'import pandas as pd\n# Your analysis code here',
                    result: { status: 'success', output: 'Analysis complete' },
                    visualizationUrl: null,
                    createdAt: new Date(Date.now() + 1000),
                },
            ];

            for (const msg of testMessages) {
                await db.insert(messages).values(msg);
            }
            result.messages += testMessages.length;
        }

        console.log(`✅ Seeded ${result.users} users, ${result.sessions} sessions, ${result.messages} messages`);
        return result;
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        throw err;
    }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
    userCount: number;
    sessionCount: number;
    messageCount: number;
    fileCount: number;
    credentialCount: number;
}> {
    try {
        const stats = {
            userCount: (await db.select().from(users)).length,
            sessionCount: (await db.select().from(sessions)).length,
            messageCount: (await db.select().from(messages)).length,
            fileCount: (await db.select().from(files)).length,
            credentialCount: (await db.select().from(credentials)).length,
        };

        return stats;
    } catch (err) {
        console.error('Failed to get database stats:', err);
        return {
            userCount: 0,
            sessionCount: 0,
            messageCount: 0,
            fileCount: 0,
            credentialCount: 0,
        };
    }
}
