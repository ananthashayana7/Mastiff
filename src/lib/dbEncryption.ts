/**
 * Database Encryption Utilities
 * 
 * Helper functions for working with encrypted fields in database queries
 * Provides transaction support, validation, and bulk operations
 */

import { db } from '@/db/index';
import { users, sessions, files, messages } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import {
    encryptField,
    decryptField,
    piiEncryption,
    apiKeyEncryption,
    credentialEncryption,
    sessionEncryption,
} from '@/lib/encryptedFields';
import { encryptionService } from '@/services/encryptionService';

/**
 * Create or update a user with encrypted PII
 */
export async function createEncryptedUser(data: {
    id?: string;
    email: string;
    name?: string;
    passwordHash?: string;
}) {
    const userId = data.id || '';
    const encryptedData = {
        ...data,
        email: piiEncryption.encryptEmail(data.email, userId),
        ...(data.name && { name: piiEncryption.encryptName(data.name, userId) }),
    };

    return db.insert(users).values(encryptedData).returning();
}

/**
 * Get a user by ID with decrypted PII
 */
export async function getDecryptedUser(userId: string) {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user || user.length === 0) {
        return null;
    }

    const userData = user[0];
    return {
        ...userData,
        email: piiEncryption.decryptEmail(userData.email as any, userId),
        name: userData.name ? piiEncryption.decryptName(userData.name as any, userId) : undefined,
    };
}

/**
 * Get user by decrypted email
 * (Note: This is slower as it requires decrypting all users. Consider adding email hash index instead)
 */
export async function getUserByDecryptedEmail(email: string) {
    const allUsers = await db.select().from(users);

    for (const user of allUsers) {
        try {
            const decrypted = piiEncryption.decryptEmail(user.email as any, user.id);
            if (decrypted === email) {
                return {
                    ...user,
                    email: decrypted,
                    name: user.name
                        ? piiEncryption.decryptName(user.name as any, user.id)
                        : undefined,
                };
            }
        } catch {
            // Decryption failed, skip this user
            continue;
        }
    }

    return null;
}

/**
 * Update user encrypted fields
 */
export async function updateEncryptedUser(
    userId: string,
    updates: {
        email?: string;
        name?: string;
    }
) {
    const encrypted: Record<string, any> = {};

    if (updates.email) {
        encrypted.email = piiEncryption.encryptEmail(updates.email, userId);
    }

    if (updates.name) {
        encrypted.name = piiEncryption.encryptName(updates.name, userId);
    }

    return db.update(users).set(encrypted).where(eq(users.id, userId)).returning();
}

/**
 * Create encrypted session
 */
export async function createEncryptedSession(data: {
    userId: string;
    title?: string;
    id?: string;
}) {
    const sessionId = data.id || '';
    const encryptedData = {
        ...data,
        ...(data.title && { title: sessionEncryption.encryptSessionTitle(data.title, sessionId) }),
    };

    return db.insert(sessions).values(encryptedData).returning();
}

/**
 * Get session with decrypted title
 */
export async function getDecryptedSession(sessionId: string) {
    const session = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

    if (!session || session.length === 0) {
        return null;
    }

    const sessionData = session[0];
    return {
        ...sessionData,
        title: sessionData.title
            ? sessionEncryption.decryptSessionTitle(sessionData.title as any, sessionId)
            : undefined,
    };
}

/**
 * Update session encrypted fields
 */
export async function updateEncryptedSession(
    sessionId: string,
    updates: {
        title?: string;
    }
) {
    const encrypted: Record<string, any> = {};

    if (updates.title) {
        encrypted.title = sessionEncryption.encryptSessionTitle(updates.title, sessionId);
    }

    return db.update(sessions).set(encrypted).where(eq(sessions.id, sessionId)).returning();
}

/**
 * Bulk decrypt user list
 */
export async function decryptUserList(userList: any[]) {
    return userList.map((user) => ({
        ...user,
        email: piiEncryption.decryptEmail(user.email, user.id),
        name: user.name ? piiEncryption.decryptName(user.name, user.id) : undefined,
    }));
}

/**
 * Bulk decrypt session list
 */
export async function decryptSessionList(sessionList: any[]) {
    return sessionList.map((session) => ({
        ...session,
        title: session.title
            ? sessionEncryption.decryptSessionTitle(session.title, session.id)
            : undefined,
    }));
}

/**
 * Verify encryption is working (health check)
 */
export async function verifyEncryptionHealth(): Promise<{
    status: 'ok' | 'error';
    message: string;
}> {
    try {
        // Test encryption/decryption
        const testData = 'test_data_' + Date.now();
        const encrypted = encryptField(testData, 'health_check');
        const decrypted = decryptField(encrypted as any, 'health_check');

        if (decrypted !== testData) {
            return {
                status: 'error',
                message: 'Encryption/decryption roundtrip failed',
            };
        }

        // Test database connectivity
        const userCount = await db.select().from(users).limit(1);

        return {
            status: 'ok',
            message: 'Encryption system is healthy',
        };
    } catch (err) {
        return {
            status: 'error',
            message: `Encryption health check failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

/**
 * Encryption migration utilities
 */
export const encryptionMigration = {
    /**
     * Migrate unencrypted users to encrypted
     * (Run this once during deployment)
     */
    async migrateUsersToEncrypted() {
        const allUsers = await db.select().from(users);
        let migrated = 0;

        for (const user of allUsers) {
            // Check if already encrypted (encrypted data has specific structure)
            const isEncrypted = user.email?.startsWith('{"iv"');

            if (!isEncrypted) {
                const encryptedUser = {
                    email: piiEncryption.encryptEmail(user.email as string, user.id),
                    ...(user.name && {
                        name: piiEncryption.encryptName(user.name as string, user.id),
                    }),
                };

                await db.update(users).set(encryptedUser).where(eq(users.id, user.id));
                migrated++;
            }
        }

        return {
            status: 'completed',
            usersProcessed: allUsers.length,
            usersMigrated: migrated,
        };
    },

    /**
     * Migrate unencrypted sessions to encrypted
     */
    async migrateSessionsToEncrypted() {
        const allSessions = await db.select().from(sessions);
        let migrated = 0;

        for (const session of allSessions) {
            const isEncrypted = session.title?.startsWith('{"iv"');

            if (!isEncrypted && session.title) {
                const encryptedSession = {
                    title: sessionEncryption.encryptSessionTitle(
                        session.title as string,
                        session.id
                    ),
                };

                await db.update(sessions).set(encryptedSession).where(eq(sessions.id, session.id));
                migrated++;
            }
        }

        return {
            status: 'completed',
            sessionsProcessed: allSessions.length,
            sessionsMigrated: migrated,
        };
    },

    /**
     * Check migration status
     */
    async getEncryptionStatus() {
        const unencryptedUsers = await db
            .select()
            .from(users)
            .then((users) =>
                users.filter((u) => u.email && !u.email.startsWith('{"iv"')).length
            );

        const unencryptedSessions = await db
            .select()
            .from(sessions)
            .then((sessions) =>
                sessions.filter((s) => s.title && !s.title.startsWith('{"iv"')).length
            );

        return {
            unencryptedUsers,
            unencryptedSessions,
            allEncrypted: unencryptedUsers === 0 && unencryptedSessions === 0,
        };
    },
};
