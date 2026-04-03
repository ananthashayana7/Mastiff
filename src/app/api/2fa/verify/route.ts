/**
 * 2FA Verify API
 * 
 * Endpoints for verifying TOTP codes and confirming 2FA setup
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db/index';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { twoFactorAuth } from '@/services/twoFactorAuth';
import { credentialEncryption } from '@/lib/encryptedFields';
import { rateLimiter } from '@/lib/rateLimiting';

const MAX_CODE_LENGTH = 32;
const MAX_SECRET_LENGTH = 512;
const MAX_BACKUP_CODES = 20;

/**
 * POST /api/2fa/verify
 * Verify a TOTP code and confirm 2FA setup
 */
export async function POST(request: NextRequest) {
    try {
        const clientIdForLimit = request.headers.get('x-forwarded-for') || 'unknown';
        await rateLimiter.checkLimit('2fa:verify', clientIdForLimit, 30, 3600);

        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { code, secret, backupCodes } = body;

        if (!code || !secret || !backupCodes) {
            return NextResponse.json(
                { error: 'Missing required fields: code, secret, backupCodes' },
                { status: 400 }
            );
        }

        if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) {
            return NextResponse.json({ error: 'Invalid verification code format' }, { status: 400 });
        }

        if (typeof secret !== 'string' || secret.length > MAX_SECRET_LENGTH) {
            return NextResponse.json({ error: 'Invalid secret format' }, { status: 400 });
        }

        if (!Array.isArray(backupCodes) || backupCodes.length === 0 || backupCodes.length > MAX_BACKUP_CODES) {
            return NextResponse.json({ error: 'Invalid backupCodes format' }, { status: 400 });
        }

        const normalizedBackupCodes = backupCodes.map((value: unknown) => String(value || '').trim()).filter(Boolean);
        if (normalizedBackupCodes.length === 0 || normalizedBackupCodes.length !== backupCodes.length) {
            return NextResponse.json({ error: 'Invalid backupCodes entries' }, { status: 400 });
        }

        // Verify the code
        const verification = twoFactorAuth.verifyToken(code, secret);
        if (!verification.valid) {
            return NextResponse.json(
                { error: verification.error || 'Invalid code' },
                { status: 400 }
            );
        }

        // Hash backup codes
        const hashedBackupCodes = await twoFactorAuth.hashBackupCodes(normalizedBackupCodes);

        // Encrypt secret
        const encryptedSecret = credentialEncryption.encryptCredential(secret, '2fa_totp');

        // Save to database
        await db
            .update(users)
            .set({
                totpEnabled: true,
                totpSecret: encryptedSecret,
                backupCodes: JSON.stringify(hashedBackupCodes),
                totpVerifiedAt: new Date(),
            })
            .where(eq(users.id, user.id));

        return NextResponse.json({
            message: '2FA has been successfully enabled',
            totpEnabled: true,
        });
    } catch (err) {
        console.error('Error verifying 2FA:', err);
        return NextResponse.json(
            { error: 'Failed to verify 2FA' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/2fa/verify-login
 * Verify TOTP code during login
 */
export async function POST_LOGIN(request: NextRequest) {
    try {
        const clientIdForLimit = request.headers.get('x-forwarded-for') || 'unknown';
        await rateLimiter.checkLimit('2fa:verify-login', clientIdForLimit, 60, 3600);

        const body = await request.json();
        const { userId, code, backupCode } = body;

        if (!userId || (!code && !backupCode)) {
            return NextResponse.json(
                { error: 'Missing userId and either code or backupCode' },
                { status: 400 }
            );
        }

        if (typeof userId !== 'string' || userId.length > 128) {
            return NextResponse.json({ error: 'Invalid user identifier' }, { status: 400 });
        }
        if (code && (typeof code !== 'string' || code.length > MAX_CODE_LENGTH)) {
            return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
        }
        if (backupCode && (typeof backupCode !== 'string' || backupCode.length > MAX_CODE_LENGTH)) {
            return NextResponse.json({ error: 'Invalid backup code format' }, { status: 400 });
        }

        // Get user
        const userRecord = await db
            .select()
            .from(users)
            .where(eq(users.id, userId));

        if (!userRecord || userRecord.length === 0) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        if (!userRecord[0].totpEnabled) {
            return NextResponse.json(
                { error: '2FA is not enabled for this account' },
                { status: 400 }
            );
        }

        // Decrypt secret
        const decryptedSecret = credentialEncryption.decryptCredential(
            userRecord[0].totpSecret as any,
            '2fa_totp'
        );

        let verified = false;

        // Try TOTP code
        if (code) {
            const verification = twoFactorAuth.verifyToken(code, decryptedSecret);
            verified = verification.valid;
        }

        // Try backup code
        if (!verified && backupCode) {
            const hashedCodes = JSON.parse(userRecord[0].backupCodes as string || '[]');
            const backupVerification = await twoFactorAuth.verifyBackupCode(
                backupCode,
                hashedCodes
            );

            if (backupVerification.valid && backupVerification.codeIndex !== undefined) {
                verified = true;

                // Remove used backup code
                hashedCodes.splice(backupVerification.codeIndex, 1);
                await db
                    .update(users)
                    .set({
                        backupCodes: JSON.stringify(hashedCodes),
                    })
                    .where(eq(users.id, userId));
            }
        }

        if (!verified) {
            return NextResponse.json(
                { error: 'Invalid code or backup code' },
                { status: 401 }
            );
        }

        return NextResponse.json({
            message: '2FA verification successful',
            verified: true,
        });
    } catch (err) {
        console.error('Error verifying 2FA login:', err);
        return NextResponse.json(
            { error: 'Failed to verify 2FA' },
            { status: 401 }
        );
    }
}

/**
 * POST /api/2fa/disable
 * Disable 2FA for the account
 */
export async function POST_DISABLE(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { password } = body;

        if (!password) {
            return NextResponse.json(
                { error: 'Password required to disable 2FA' },
                { status: 400 }
            );
        }

        // TODO: Verify password here using your auth logic

        // Disable 2FA
        await db
            .update(users)
            .set({
                totpEnabled: false,
                totpSecret: null,
                backupCodes: null,
                totpVerifiedAt: null,
            })
            .where(eq(users.id, user.id));

        return NextResponse.json({
            message: '2FA has been disabled',
            totpEnabled: false,
        });
    } catch (err) {
        console.error('Error disabling 2FA:', err);
        return NextResponse.json(
            { error: 'Failed to disable 2FA' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/2fa/status
 * Get 2FA status for current user
 */
export async function GET(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRecord = await db
            .select()
            .from(users)
            .where(eq(users.id, user.id));

        if (!userRecord || userRecord.length === 0) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        const hashedCodes = userRecord[0].backupCodes
            ? JSON.parse(userRecord[0].backupCodes as string)
            : [];

        return NextResponse.json({
            totpEnabled: userRecord[0].totpEnabled,
            totpVerifiedAt: userRecord[0].totpVerifiedAt,
            backupCodesCount: hashedCodes.length,
        });
    } catch (err) {
        console.error('Error getting 2FA status:', err);
        return NextResponse.json(
            { error: 'Failed to get 2FA status' },
            { status: 500 }
        );
    }
}
