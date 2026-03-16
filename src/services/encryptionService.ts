/**
 * Encryption Service
 *
 * Provides secure encryption/decryption of sensitive data (API keys, credentials, etc).
 * Uses AES-256-GCM for authenticated encryption with associated data.
 *
 * Requirements:
 * - ENCRYPTION_KEY environment variable must be set (32 bytes base64-encoded)
 * - Generate key with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import crypto from 'crypto';

export interface EncryptedData {
    iv: string;
    ciphertext: string;
    authTag: string;
}

export class EncryptionService {
    private encryptionKey: Buffer = Buffer.alloc(0);
    private algorithm = 'aes-256-gcm';
    private keyLength = 32;
    private ivLength = 16;
    private saltLength = 16;
    private iterations = 100000;

    public ensureInitialized(): void {
        if (this.encryptionKey.length === this.keyLength) {
            return;
        }

        const keyEnv = process.env.ENCRYPTION_KEY;
        if (!keyEnv) {
            throw new Error(
                'ENCRYPTION_KEY environment variable is not set. ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
            );
        }

        let decodedKey: Buffer;
        try {
            decodedKey = Buffer.from(keyEnv, 'base64');
        } catch {
            throw new Error('ENCRYPTION_KEY must be a valid base64-encoded string');
        }

        if (decodedKey.length !== this.keyLength) {
            throw new Error(
                `ENCRYPTION_KEY must be exactly ${this.keyLength} bytes (${this.keyLength * 8} bits). ` +
                `Current length: ${decodedKey.length} bytes`
            );
        }

        this.encryptionKey = decodedKey;
    }

    encrypt(plaintext: string, additionalAuthenticatedData?: string): EncryptedData {
        this.ensureInitialized();

        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

        if (additionalAuthenticatedData) {
            cipher.setAAD(Buffer.from(additionalAuthenticatedData, 'utf-8'));
        }

        let ciphertext = cipher.update(plaintext, 'utf-8', 'hex');
        ciphertext += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        return {
            iv: iv.toString('hex'),
            ciphertext,
            authTag: authTag.toString('hex'),
        };
    }

    decrypt(encrypted: EncryptedData, additionalAuthenticatedData?: string): string {
        this.ensureInitialized();

        const iv = Buffer.from(encrypted.iv, 'hex');
        const authTag = Buffer.from(encrypted.authTag, 'hex');
        const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);

        decipher.setAuthTag(authTag);

        if (additionalAuthenticatedData) {
            decipher.setAAD(Buffer.from(additionalAuthenticatedData, 'utf-8'));
        }

        let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf-8');
        plaintext += decipher.final('utf-8');

        return plaintext;
    }

    encryptToString(plaintext: string, additionalAuthenticatedData?: string): string {
        const encrypted = this.encrypt(plaintext, additionalAuthenticatedData);
        return JSON.stringify(encrypted);
    }

    decryptFromString(encryptedString: string, additionalAuthenticatedData?: string): string {
        try {
            const encrypted = JSON.parse(encryptedString) as EncryptedData;
            return this.decrypt(encrypted, additionalAuthenticatedData);
        } catch (err) {
            throw new Error(`Failed to decrypt data: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    hashPassword(password: string): string {
        const salt = crypto.randomBytes(this.saltLength);
        const hash = crypto.pbkdf2Sync(password, salt, this.iterations, 32, 'sha256');
        return `${salt.toString('hex')}:${hash.toString('hex')}`;
    }

    verifyPassword(password: string, hash: string): boolean {
        try {
            const [saltHex, hashHex] = hash.split(':');
            const salt = Buffer.from(saltHex, 'hex');
            const storedHash = Buffer.from(hashHex, 'hex');
            const computedHash = crypto.pbkdf2Sync(password, salt, this.iterations, 32, 'sha256');
            return crypto.timingSafeEqual(computedHash, storedHash);
        } catch {
            return false;
        }
    }

    generateSecureToken(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }

    hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    createAuditHash(data: string): string {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
}

export const encryptionService = new EncryptionService();

export function checkEncryptionSetup(): { valid: boolean; message: string } {
    try {
        const service = new EncryptionService();
        service.ensureInitialized();
        return {
            valid: true,
            message: 'Encryption service is properly configured',
        };
    } catch (err) {
        return {
            valid: false,
            message: `Encryption service misconfigured: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
