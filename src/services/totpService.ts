import crypto from 'crypto';
import { db } from '@/db';
import { usersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { encryptData, decryptData } from '@/lib/encryption';

/**
 * 2FA (TOTP) Service
 * 
 * Two-factor authentication using Time-based One-Time Passwords (TOTP)
 * Compatible with Google Authenticator, Authy, Microsoft Authenticator
 */

const TOTP_WINDOW = 30; // 30-second time step
const TOTP_DIGITS = 6; // 6-digit code
const TOTP_WINDOW_SIZE = 1; // Accept +/- 1 window

/**
 * Generate a secret for TOTP
 */
export function generateTOTPSecret(): string {
  return crypto.randomBytes(20).toString('base32');
}

/**
 * Convert secret to Base32 (if not already)
 */
function base32encode(buffer: Buffer): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Generate TOTP provisioning URI (for QR code)
 */
export function generateTOTPUri(secret: string, email: string, issuer: string = 'Mastiff'): string {
  const encodedEmail = encodeURIComponent(email);
  const encodedIssuer = encodeURIComponent(issuer);

  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}`;
}

/**
 * Generate current TOTP code
 */
export function generateTOTPCode(secret: string): string {
  const buffer = Buffer.alloc(8);
  let counter = Math.floor(Date.now() / 1000 / TOTP_WINDOW);

  for (let i = 7; i >= 0; --i) {
    buffer[i] = counter & 0xff;
    counter = counter >> 8;
  }

  // Decode Base32 secret to get the key
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (code % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Verify TOTP code with window
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
  const currentTime = Math.floor(Date.now() / 1000);

  for (let i = -TOTP_WINDOW_SIZE; i <= TOTP_WINDOW_SIZE; i++) {
    const counter = Math.floor(currentTime / TOTP_WINDOW) + i;
    const buffer = Buffer.alloc(8);

    for (let j = 7; j >= 0; --j) {
      buffer[j] = counter & 0xff;
      counter = counter >> 8;
    }

    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0xf;
    const generatedCode =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const expected = (generatedCode % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');

    if (expected === code) {
      return true;
    }
  }

  return false;
}

/**
 * Enable 2FA for a user
 */
export async function enable2FA(userId: string): Promise<{ secret: string; uri: string }> {
  const secret = generateTOTPSecret();

  // Get user email
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user.length) {
    throw new Error('User not found');
  }

  const uri = generateTOTPUri(secret, user[0].email || '');

  // Store encrypted secret (not yet verified - only verified after user confirms)
  // This is handled in the 2FA verification step

  return { secret, uri };
}

/**
 * Verify and confirm 2FA setup
 */
export async function confirm2FA(userId: string, secret: string, code: string): Promise<void> {
  // Verify the code first
  if (!verifyTOTPCode(secret, code)) {
    throw new Error('Invalid 2FA code');
  }

  // Encrypt and save secret
  const encryptedSecret = encryptData(secret);

  await db
    .update(usersTable)
    .set({
      twoFactorSecret: encryptedSecret,
      twoFactorEnabled: true,
    })
    .where(eq(usersTable.id, userId));
}

/**
 * Verify 2FA code during login
 */
export async function verify2FACode(userId: string, code: string): Promise<boolean> {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user.length || !user[0].twoFactorSecret) {
    return false;
  }

  try {
    const secret = decryptData(user[0].twoFactorSecret);
    return verifyTOTPCode(secret, code);
  } catch (error) {
    console.error('Failed to verify 2FA code:', error);
    return false;
  }
}

/**
 * Disable 2FA for a user
 */
export async function disable2FA(userId: string): Promise<void> {
  await db
    .update(usersTable)
    .set({
      twoFactorSecret: null,
      twoFactorEnabled: false,
    })
    .where(eq(usersTable.id, userId));
}

/**
 * Helper: Decode Base32 to Buffer
 */
function base32Decode(encoded: string): Buffer {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const result: number[] = [];

  for (let i = 0; i < encoded.length; i++) {
    const charIndex = ALPHABET.indexOf(encoded[i].toUpperCase());
    if (charIndex === -1) throw new Error('Invalid Base32 character');

    value = (value << 5) | charIndex;
    bits += 5;

    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(result);
}

/**
 * Generate backup codes (for account recovery)
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}
