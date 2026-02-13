/**
 * Encrypted Fields Integration
 * 
 * Provides utilities for encrypting/decrypting sensitive database fields
 * Works seamlessly with Drizzle ORM
 */

import { encryptionService, EncryptedData } from '@/services/encryptionService';

/**
 * Type for database-stored encrypted data
 */
export type EncryptedField = string; // JSON stringified EncryptedData

/**
 * Encrypt a sensitive value for database storage
 * @param value - The plaintext value to encrypt
 * @param context - Additional context for integrity checking (e.g., user_id)
 * @returns Database-storable encrypted string
 */
export function encryptField(value: string, context?: string): EncryptedField {
    return encryptionService.encryptToString(value, context);
}

/**
 * Decrypt a field retrieved from the database
 * @param encryptedValue - The encrypted field from database
 * @param context - The same context used during encryption
 * @returns Decrypted plaintext
 */
export function decryptField(encryptedValue: EncryptedField, context?: string): string {
    return encryptionService.decryptFromString(encryptedValue, context);
}

/**
 * Batch encrypt multiple fields
 * @param fields - Object with field names and values
 * @param context - Optional context for AAD
 * @returns Object with same keys but encrypted values
 */
export function encryptFields(
    fields: Record<string, string>,
    context?: string
): Record<string, EncryptedField> {
    const encrypted: Record<string, EncryptedField> = {};
    for (const [key, value] of Object.entries(fields)) {
        encrypted[key] = encryptField(value, context);
    }
    return encrypted;
}

/**
 * Batch decrypt multiple fields
 * @param fields - Object with field names and encrypted values
 * @param context - Optional context for AAD
 * @returns Object with same keys but decrypted values
 */
export function decryptFields(
    fields: Record<string, EncryptedField>,
    context?: string
): Record<string, string> {
    const decrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
        try {
            decrypted[key] = decryptField(value, context);
        } catch (err) {
            console.error(`Failed to decrypt field ${key}:`, err);
            decrypted[key] = ''; // Fallback to empty string
        }
    }
    return decrypted;
}

/**
 * Wrapper for database model with sensitive fields
 * Automatically encrypts on write and decrypts on read
 */
export class EncryptedModel {
    constructor(
        private sensitiveFields: string[] = [],
        public context?: string
    ) {}

    /**
     * Prepare data for database insert/update
     * @param data - Raw data with plaintext sensitive fields
     * @returns Data with encrypted sensitive fields
     */
    prepareForStorage(data: Record<string, any>): Record<string, any> {
        const prepared = { ...data };
        for (const field of this.sensitiveFields) {
            if (field in prepared && typeof prepared[field] === 'string') {
                prepared[field] = encryptField(prepared[field], this.context);
            }
        }
        return prepared;
    }

    /**
     * Prepare data after database retrieval
     * @param data - Raw database row with encrypted fields
     * @returns Data with decrypted sensitive fields
     */
    prepareAfterRetrieval(data: Record<string, any>): Record<string, any> {
        const prepared = { ...data };
        for (const field of this.sensitiveFields) {
            if (field in prepared && prepared[field]) {
                try {
                    prepared[field] = decryptField(prepared[field], this.context);
                } catch (err) {
                    console.error(`Failed to decrypt field ${field}:`, err);
                    prepared[field] = null;
                }
            }
        }
        return prepared;
    }
}

/**
 * PII (Personally Identifiable Information) encryption
 * Specifically for user data like email, names, phone numbers, etc.
 */
export const piiEncryption = {
    /**
     * Encrypt user email for storage
     * @param email - User email address
     * @param userId - User ID for context
     * @returns Encrypted email field
     */
    encryptEmail(email: string, userId: string): EncryptedField {
        return encryptField(email, `email:${userId}`);
    },

    /**
     * Decrypt user email
     * @param encrypted - Encrypted email field
     * @param userId - User ID for context
     * @returns Plaintext email
     */
    decryptEmail(encrypted: EncryptedField, userId: string): string {
        return decryptField(encrypted, `email:${userId}`);
    },

    /**
     * Encrypt user name
     * @param name - User name
     * @param userId - User ID for context
     * @returns Encrypted name field
     */
    encryptName(name: string, userId: string): EncryptedField {
        return encryptField(name, `name:${userId}`);
    },

    /**
     * Decrypt user name
     * @param encrypted - Encrypted name field
     * @param userId - User ID for context
     * @returns Plaintext name
     */
    decryptName(encrypted: EncryptedField, userId: string): string {
        return decryptField(encrypted, `name:${userId}`);
    },
};

/**
 * API Key encryption
 * For storing API keys and credentials securely
 */
export const apiKeyEncryption = {
    /**
     * Encrypt an API key
     * @param apiKey - The API key to encrypt
     * @param keyName - Name of the API key (e.g., 'GEMINI_API_KEY')
     * @returns Encrypted key field
     */
    encryptApiKey(apiKey: string, keyName: string): EncryptedField {
        return encryptField(apiKey, `apikey:${keyName}`);
    },

    /**
     * Decrypt an API key
     * @param encrypted - Encrypted API key
     * @param keyName - Name of the API key
     * @returns Plaintext API key
     */
    decryptApiKey(encrypted: EncryptedField, keyName: string): string {
        return decryptField(encrypted, `apikey:${keyName}`);
    },
};

/**
 * Credentials encryption
 * For storing database credentials, tokens, etc.
 */
export const credentialEncryption = {
    /**
     * Encrypt a credential
     * @param credential - The credential value
     * @param credentialType - Type of credential (e.g., 'db_password', 'jwt_secret')
     * @returns Encrypted credential field
     */
    encryptCredential(credential: string, credentialType: string): EncryptedField {
        return encryptField(credential, `cred:${credentialType}`);
    },

    /**
     * Decrypt a credential
     * @param encrypted - Encrypted credential
     * @param credentialType - Type of credential
     * @returns Plaintext credential
     */
    decryptCredential(encrypted: EncryptedField, credentialType: string): string {
        return decryptField(encrypted, `cred:${credentialType}`);
    },
};

/**
 * Session data encryption
 * For encrypting session metadata and tokens
 */
export const sessionEncryption = {
    /**
     * Encrypt session title
     * @param title - Session title
     * @param sessionId - Session ID for context
     * @returns Encrypted title
     */
    encryptSessionTitle(title: string, sessionId: string): EncryptedField {
        return encryptField(title, `session:${sessionId}`);
    },

    /**
     * Decrypt session title
     * @param encrypted - Encrypted title
     * @param sessionId - Session ID for context
     * @returns Plaintext title
     */
    decryptSessionTitle(encrypted: EncryptedField, sessionId: string): string {
        return decryptField(encrypted, `session:${sessionId}`);
    },
};
