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
    private encryptionKey: Buffer;
    private algorithm = 'aes-256-gcm';
    private keyLength = 32; // 256 bits
    private ivLength = 16; // 128 bits
    private saltLength = 16;
    private iterations = 100000; // PBKDF2 iterations

    constructor() {
        const keyEnv = process.env.ENCRYPTION_KEY;

        if (!keyEnv) {
            throw new Error(
                'ENCRYPTION_KEY environment variable is not set. ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
            );
        }

        try {
            this.encryptionKey = Buffer.from(keyEnv, 'base64');
        } catch (err) {
            throw new Error('ENCRYPTION_KEY must be a valid base64-encoded string');
        }

        if (this.encryptionKey.length !== this.keyLength) {
            throw new Error(
                `ENCRYPTION_KEY must be exactly ${this.keyLength} bytes (${this.keyLength * 8} bits). ` +
                `Current length: ${this.encryptionKey.length} bytes`
            );
        }
    }

    /**
     * Encrypt a string value
     * @param plaintext - The data to encrypt
     * @param additionalAuthenticatedData - Optional AAD for integrity checking
     * @returns Encrypted data object (iv, ciphertext, authTag)
     */
    encrypt(plaintext: string, additionalAuthenticatedData?: string): EncryptedData {
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

    /**
     * Decrypt an encrypted value
     * @param encrypted - The encrypted data object
     * @param additionalAuthenticatedData - Optional AAD for integrity checking (must match encryption)
     * @returns Decrypted plaintext
     */
    decrypt(encrypted: EncryptedData, additionalAuthenticatedData?: string): string {
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

    /**
     * Convenience method: encrypt and return as JSON string
     * @param plaintext - The data to encrypt
     * @param additionalAuthenticatedData - Optional AAD
     * @returns JSON string suitable for database storage
     */
    encryptToString(plaintext: string, additionalAuthenticatedData?: string): string {
        const encrypted = this.encrypt(plaintext, additionalAuthenticatedData);
        return JSON.stringify(encrypted);
    }

    /**
     * Convenience method: decrypt from JSON string
     * @param encryptedString - JSON string from database
     * @param additionalAuthenticatedData - Optional AAD (must match)
     * @returns Decrypted plaintext
     */
    decryptFromString(encryptedString: string, additionalAuthenticatedData?: string): string {
        try {
            const encrypted = JSON.parse(encryptedString) as EncryptedData;
            return this.decrypt(encrypted, additionalAuthenticatedData);
        } catch (err) {
            throw new Error(`Failed to decrypt data: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Hash a password for storage (uses PBKDF2)
     * Useful for storing additional password hashes for migration/verification
     * For primary passwords, use bcrypt instead.
     * 
     * @param password - The password to hash
     * @returns Hash string (salt:hash format)
     */
    hashPassword(password: string): string {
        const salt = crypto.randomBytes(this.saltLength);
        const hash = crypto.pbkdf2Sync(password, salt, this.iterations, 32, 'sha256');
        return `${salt.toString('hex')}:${hash.toString('hex')}`;
    }

    /**
     * Verify a password against a hash created by hashPassword
     * @param password - The password to verify
     * @param hash - The hash from hashPassword
     * @returns true if password matches
     */
    verifyPassword(password: string, hash: string): boolean {
        try {
            const [saltHex, hashHex] = hash.split(':');
            const salt = Buffer.from(saltHex, 'hex');
            const storedHash = Buffer.from(hashHex, 'hex');
            const computedHash = crypto.pbkdf2Sync(password, salt, this.iterations, 32, 'sha256');
            return crypto.timingSafeEqual(computedHash, storedHash);
        } catch (err) {
            return false;
        }
    }

    /**
     * Generate a random secure token (useful for reset tokens, etc.)
     * @param length - Number of bytes (default: 32)
     * @returns Hex-encoded random token
     */
    generateSecureToken(length: number = 32): string {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash a token with SHA256 for storage (one-way hash)
     * Use this to store reset tokens securely in the database
     * 
     * @param token - The token to hash
     * @returns Hash hex string
     */
    hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Create a hash of sensitive data for audit trails
     * (Does not allow recovery of original data)
     * 
     * @param data - Data to hash
     * @returns SHA256 hash hex string
     */
    createAuditHash(data: string): string {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
}

// Export singleton instance
export const encryptionService = new EncryptionService();

/**
 * Environment setup helper
 * Call this in your startup code to verify encryption is properly configured
 */
export function checkEncryptionSetup(): { valid: boolean; message: string } {
    try {
        new EncryptionService();
        return {
            valid: true,
            message: '✅ Encryption service is properly configured',
        };
    } catch (err) {
        return {
            valid: false,
            message: `❌ Encryption service misconfigured: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
