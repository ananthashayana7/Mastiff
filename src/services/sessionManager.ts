/**
 * Session Management Service
 *
 * Handles user session lifecycle, token management, and validation
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export interface Session {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
    lastActivityAt: Date;
    ipAddress?: string;
    userAgent?: string;
}

export interface SessionRecord extends Session {
    isAdmin?: boolean;
}

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hour

export class SessionManager {
    /**
     * Create a new random session token.
     */
    static generateSessionToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create session metadata.
     */
    static async createSession(
        userId: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<SessionRecord> {
        const token = this.generateSessionToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + SESSION_DURATION);

        return {
            id: crypto.randomUUID(),
            userId,
            token,
            expiresAt,
            createdAt: now,
            lastActivityAt: now,
            ipAddress,
            userAgent,
            isAdmin: false,
        };
    }

    /**
     * Validate session token and return normalized session info.
     */
    static async validateSession(token: string): Promise<SessionRecord | null> {
        try {
            if (!token) return null;

            const secret = process.env.JWT_SECRET || 'mastiff-ai-secret-key-change-in-production';
            const payload = jwt.verify(token, secret) as {
                userId?: string;
                id?: string;
                sub?: string;
                exp?: number;
                iat?: number;
                isAdmin?: boolean;
            };

            const userId = payload.userId || payload.id || payload.sub;
            if (!userId) return null;

            const now = new Date();
            const createdAt = payload.iat ? new Date(payload.iat * 1000) : now;
            const expiresAt = payload.exp
                ? new Date(payload.exp * 1000)
                : new Date(createdAt.getTime() + SESSION_DURATION);

            if (expiresAt.getTime() <= now.getTime()) {
                return null;
            }

            if (now.getTime() - createdAt.getTime() > INACTIVITY_TIMEOUT && payload.exp === undefined) {
                return null;
            }

            return {
                id: `${userId}:${Math.floor(createdAt.getTime() / 1000)}`,
                userId,
                token,
                expiresAt,
                createdAt,
                lastActivityAt: now,
                isAdmin: Boolean(payload.isAdmin),
            };
        } catch (err) {
            return null;
        }
    }

    static async getSession(token: string): Promise<SessionRecord | null> {
        return this.validateSession(token);
    }

    static async invalidateSession(_sessionId: string): Promise<void> {
        // Placeholder for persistent store invalidation.
    }

    static async invalidateAllSessions(_userId: string): Promise<void> {
        // Placeholder for persistent store invalidation.
    }

    static async cleanupExpiredSessions(): Promise<number> {
        return 0;
    }
}

// Compatibility singleton used by route handlers that import `sessionManager`.
export const sessionManager = {
    getSession: (token: string) => SessionManager.getSession(token),
    createSession: (userId: string, ipAddress?: string, userAgent?: string) =>
        SessionManager.createSession(userId, ipAddress, userAgent),
    invalidateSession: (sessionId: string) => SessionManager.invalidateSession(sessionId),
    invalidateAllSessions: (userId: string) => SessionManager.invalidateAllSessions(userId),
    cleanupExpiredSessions: () => SessionManager.cleanupExpiredSessions(),
};

export default SessionManager;
