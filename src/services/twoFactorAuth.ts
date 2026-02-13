/**
 * 2FA/TOTP Service
 * 
 * Implements Time-Based One-Time Password (TOTP) authentication
 * using RFC 6238 standard (Google Authenticator compatible)
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export interface TOTPSetupResult {
    secret: string;
    qrCode: string;
    backupCodes: string[];
}

export interface TOTPVerifyResult {
    valid: boolean;
    error?: string;
}

/**
 * 2FA/TOTP Service
 */
export class TwoFactorAuthService {
    private appName = 'Mastiff AI'; // App name shown in authenticator
    private codeLength = 6; // Standard 6-digit codes
    private window = 1; // Allow 1 time window before/after (30 second windows)
    private backupCodeLength = 10;
    private backupCodeCount = 10;

    /**
     * Generate TOTP secret for a user
     * @param userEmail - User's email (used in QR code label)
     * @returns Setup data with secret and QR code
     */
    async generateTOTPSecret(userEmail: string): Promise<TOTPSetupResult> {
        // Generate secret
        const secret = speakeasy.generateSecret({
            name: `${this.appName} (${userEmail})`,
            issuer: this.appName,
            length: 32, // 256 bits
        });

        if (!secret.otpauth_url) {
            throw new Error('Failed to generate TOTP secret');
        }

        // Generate QR code
        const qrCode = await QRCode.toDataURL(secret.otpauth_url);

        // Generate backup codes
        const backupCodes = this.generateBackupCodes();

        return {
            secret: secret.base32,
            qrCode,
            backupCodes,
        };
    }

    /**
     * Verify a TOTP code
     * @param token - 6-digit code from authenticator
     * @param secret - Base32-encoded secret
     * @returns Verification result
     */
    verifyToken(token: string, secret: string): TOTPVerifyResult {
        try {
            const verified = speakeasy.totp.verify({
                secret,
                encoding: 'base32',
                token,
                window: this.window,
            });

            if (verified) {
                return { valid: true };
            } else {
                return {
                    valid: false,
                    error: 'Invalid or expired code',
                };
            }
        } catch (err) {
            return {
                valid: false,
                error: `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    /**
     * Verify a backup code
     * @param code - Backup code to verify
     * @param hashedCodes - Array of hashed backup codes from database
     * @returns Object with whether code is valid and remaining codes
     */
    async verifyBackupCode(
        code: string,
        hashedCodes: string[]
    ): Promise<{
        valid: boolean;
        remainingCodes: number;
        codeIndex?: number;
    }> {
        const { encryptionService } = await import('@/services/encryptionService');

        for (let i = 0; i < hashedCodes.length; i++) {
            const hash = hashedCodes[i];

            try {
                const codeValid = encryptionService.verifyPassword(code, hash);
                if (codeValid) {
                    return {
                        valid: true,
                        remainingCodes: hashedCodes.length - 1,
                        codeIndex: i,
                    };
                }
            } catch {
                continue;
            }
        }

        return {
            valid: false,
            remainingCodes: hashedCodes.length,
        };
    }

    /**
     * Generate backup codes
     * 10 codes of 10 characters each (e.g., "ABC123-DEF456")
     */
    private generateBackupCodes(): string[] {
        const codes: string[] = [];

        for (let i = 0; i < this.backupCodeCount; i++) {
            const code = this.generateRandomCode(this.backupCodeLength);
            codes.push(code);
        }

        return codes;
    }

    /**
     * Generate a random alphanumeric code
     */
    private generateRandomCode(length: number): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * chars.length);
            code += chars[randomIndex];
        }

        // Format as XXX-XXX-XXX for readability
        if (code.length === 10) {
            return code.slice(0, 3) + '-' + code.slice(3, 6) + '-' + code.slice(6, 10);
        }

        return code;
    }

    /**
     * Hash backup codes for storage
     * @param codes - Unhashed backup codes
     * @returns Array of hashed codes ready for database storage
     */
    async hashBackupCodes(codes: string[]): Promise<string[]> {
        const { encryptionService } = await import('@/services/encryptionService');
        return codes.map((code) => encryptionService.hashPassword(code));
    }

    /**
     * Generate current TOTP code (for testing)
     * @param secret - Base32-encoded secret
     * @returns Current valid code
     */
    getCurrentToken(secret: string): string {
        const token = speakeasy.totp({
            secret,
            encoding: 'base32',
        });
        return token;
    }

    /**
     * Format secret for display (groups of 4)
     * @param secret - Base32 secret
     * @returns Formatted secret
     */
    formatSecret(secret: string): string {
        return secret.replace(/(.{4})/g, '$1 ').trim();
    }
}

export const twoFactorAuth = new TwoFactorAuthService();
