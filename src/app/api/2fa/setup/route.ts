/**
 * 2FA Setup API
 * 
 * Endpoints for setting up and managing two-factor authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { db } from '@/db/index';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { twoFactorAuth } from '@/services/twoFactorAuth';
import { credentialEncryption } from '@/lib/encryptedFields';

/**
 * POST /api/2fa/setup
 * Generate TOTP secret and QR code for new 2FA setup
 */
export async function POST(request: NextRequest) {
    if (request.nextUrl.pathname.includes('/setup')) {
        try {
            const user = await getSessionUser(request);
            if (!user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // Check if 2FA is already enabled
            const userRecord = await db
                .select()
                .from(users)
                .where(eq(users.id, user.id));

            if (userRecord[0]?.totpEnabled) {
                return NextResponse.json(
                    { error: '2FA is already enabled for this account' },
                    { status: 400 }
                );
            }

            // Generate TOTP setup
            const setupResult = await twoFactorAuth.generateTOTPSecret(user.email || 'user');

            return NextResponse.json({
                secret: setupResult.secret,
                formattedSecret: twoFactorAuth.formatSecret(setupResult.secret),
                qrCode: setupResult.qrCode,
                backupCodes: setupResult.backupCodes,
                message: 'Save your backup codes in a secure location before confirming.',
            });
        } catch (err) {
            console.error('Error setting up 2FA:', err);
            return NextResponse.json(
                { error: 'Failed to set up 2FA' },
                { status: 500 }
            );
        }
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
