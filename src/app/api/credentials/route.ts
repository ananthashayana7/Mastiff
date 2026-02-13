/**
 * Credentials API Route
 * 
 * Endpoints for managing encrypted credentials (API keys, tokens, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db/index';
import { credentials } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { apiKeyEncryption, credentialEncryption, encryptField, decryptField } from '@/lib/encryptedFields';
import { encryptionService } from '@/services/encryptionService';

/**
 * GET /api/credentials
 * List all credentials for the current user
 */
export async function GET(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userCredentials = await db
            .select()
            .from(credentials)
            .where(eq(credentials.userId, user.id));

        // Don't send encrypted values in response - just metadata
        const credentialsList = userCredentials.map((cred) => ({
            id: cred.id,
            name: cred.name,
            credentialType: cred.credentialType,
            description: cred.description,
            expiresAt: cred.expiresAt,
            createdAt: cred.createdAt,
            isSet: !!cred.encryptedValue,
        }));

        return NextResponse.json({ credentials: credentialsList });
    } catch (err) {
        console.error('Error fetching credentials:', err);
        return NextResponse.json(
            { error: 'Failed to fetch credentials' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/credentials
 * Create or update a credential
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, value, credentialType, description, expiresAt } = body;

        if (!name || !value || !credentialType) {
            return NextResponse.json(
                { error: 'Missing required fields: name, value, credentialType' },
                { status: 400 }
            );
        }

        // Encrypt the credential value
        let encryptedValue: string;
        if (credentialType === 'api_key') {
            encryptedValue = apiKeyEncryption.encryptApiKey(value, name);
        } else if (credentialType === 'token') {
            encryptedValue = credentialEncryption.encryptCredential(value, name);
        } else {
            encryptedValue = encryptField(value, `${credentialType}:${name}`);
        }

        // Check if credential exists
        const existing = await db
            .select()
            .from(credentials)
            .where(and(eq(credentials.userId, user.id), eq(credentials.name, name)));

        let result;
        if (existing.length > 0) {
            // Update
            result = await db
                .update(credentials)
                .set({
                    encryptedValue,
                    credentialType,
                    description,
                    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
                    updatedAt: new Date(),
                })
                .where(eq(credentials.id, existing[0].id))
                .returning();
        } else {
            // Create
            result = await db
                .insert(credentials)
                .values({
                    userId: user.id,
                    name,
                    encryptedValue,
                    credentialType,
                    description,
                    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
                })
                .returning();
        }

        return NextResponse.json({
            message: existing.length > 0 ? 'Credential updated' : 'Credential created',
            credential: {
                id: result[0].id,
                name: result[0].name,
                credentialType: result[0].credentialType,
                description: result[0].description,
                expiresAt: result[0].expiresAt,
            },
        });
    } catch (err) {
        console.error('Error managing credential:', err);
        return NextResponse.json(
            { error: 'Failed to manage credential' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/credentials?id=<id>
 * Delete a credential
 */
export async function DELETE(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const credentialId = request.nextUrl.searchParams.get('id');
        if (!credentialId) {
            return NextResponse.json(
                { error: 'Missing credential id' },
                { status: 400 }
            );
        }

        // Verify ownership
        const cred = await db
            .select()
            .from(credentials)
            .where(eq(credentials.id, credentialId));

        if (!cred || cred.length === 0 || cred[0].userId !== user.id) {
            return NextResponse.json({
                error: 'Credential not found',
            }, { status: 404 });
        }

        await db.delete(credentials).where(eq(credentials.id, credentialId));

        return NextResponse.json({ message: 'Credential deleted' });
    } catch (err) {
        console.error('Error deleting credential:', err);
        return NextResponse.json(
            { error: 'Failed to delete credential' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/credentials/decrypt?id=<id>
 * Decrypt and return a credential value
 * (Should only be used when needed for actual API calls, not for display)
 */
export async function GET_DECRYPT(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const credentialId = request.nextUrl.searchParams.get('id');
        if (!credentialId) {
            return NextResponse.json(
                { error: 'Missing credential id' },
                { status: 400 }
            );
        }

        // Verify ownership
        const cred = await db
            .select()
            .from(credentials)
            .where(eq(credentials.id, credentialId));

        if (!cred || cred.length === 0 || cred[0].userId !== user.id) {
            return NextResponse.json(
                { error: 'Credential not found' },
                { status: 404 }
            );
        }

        // Decrypt
        let decryptedValue: string;
        if (cred[0].credentialType === 'api_key') {
            decryptedValue = apiKeyEncryption.decryptApiKey(
                cred[0].encryptedValue as any,
                cred[0].name
            );
        } else {
            decryptedValue = decryptField(cred[0].encryptedValue as any, `${cred[0].credentialType}:${cred[0].name}`);
        }

        // Check expiration
        if (cred[0].expiresAt && cred[0].expiresAt < new Date()) {
            return NextResponse.json(
                { error: 'Credential has expired' },
                { status: 410 }
            );
        }

        return NextResponse.json({
            id: cred[0].id,
            name: cred[0].name,
            value: decryptedValue,
            credentialType: cred[0].credentialType,
        });
    } catch (err) {
        console.error('Error decrypting credential:', err);
        return NextResponse.json(
            { error: 'Failed to decrypt credential' },
            { status: 500 }
        );
    }
}
