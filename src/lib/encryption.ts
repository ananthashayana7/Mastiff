import crypto from 'crypto';

/**
 * Encryption Utility for Sensitive Data
 * 
 * Encrypts/decrypts API keys, database passwords, and other credentials
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

let cachedEncryptionKey: Buffer | null = null;
let warnedAboutEncryptionKey = false;

function resolveEncryptionKey(): Buffer {
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  const configuredKey = process.env.ENCRYPTION_KEY?.trim();
  if (!configuredKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be configured in production.');
    }

    if (!warnedAboutEncryptionKey) {
      warnedAboutEncryptionKey = true;
      console.warn('[encryption] ENCRYPTION_KEY is not set; using an ephemeral development key.');
    }

    cachedEncryptionKey = crypto.randomBytes(32);
    return cachedEncryptionKey;
  }

  const isHexKey = /^[a-fA-F0-9]{64}$/.test(configuredKey);
  const keyBuffer = isHexKey ? Buffer.from(configuredKey, 'hex') : Buffer.from(configuredKey, 'base64');

  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }

  cachedEncryptionKey = keyBuffer;
  return cachedEncryptionKey;
}

/**
 * Encrypt sensitive data
 */
export function encryptData(plaintext: string): string {
  try {
    const key = resolveEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:encryption:authTag (all in hex)
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 */
export function decryptData(ciphertext: string): string {
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivHex, encryptedHex, authTagHex] = parts;
    const key = resolveEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash a password with bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = require('bcrypt');
  return bcrypt.hash(password, 12);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(password, hash);
}

/**
 * Generate a random secure token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate HMAC signature for data integrity
 */
export function generateHMAC(data: string, secret: string | Buffer = resolveEncryptionKey()): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verifyHMAC(data: string, signature: string, secret: string | Buffer = resolveEncryptionKey()): boolean {
  const expected = generateHMAC(data, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
