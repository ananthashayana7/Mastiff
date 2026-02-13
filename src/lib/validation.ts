/**
 * Input Validation & Sanitization
 * 
 * Helpers for validating and sanitizing user input
 */

import { z } from 'zod';

// Email validation
export const emailSchema = z.string().email('Invalid email address');

// Password validation - strong password requirements
export const passwordSchema = z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letters')
    .regex(/[a-z]/, 'Password must contain lowercase letters')
    .regex(/[0-9]/, 'Password must contain numbers')
    .regex(/[^A-Za-z0-9]/, 'Password must contain special characters');

// Username validation
export const usernameSchema = z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

// File upload validation
export const fileUploadSchema = z.object({
    filename: z.string().max(255),
    fileType: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
    fileSize: z.number().max(100 * 1024 * 1024), // 100MB max
});

// Session title validation
export const sessionTitleSchema = z.string().max(255).optional();

// Code validation
export const codeSchema = z.string().max(50000); // 50KB max code size

// TOTP code validation
export const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Code must be 6 digits');

/**
 * Sanitize HTML input
 */
export function sanitizeHTML(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Validate and sanitize user input
 */
export const validators = {
    email: (email: string) => {
        const result = emailSchema.safeParse(email);
        return { valid: result.success, error: result.error?.issues[0]?.message };
    },

    password: (password: string) => {
        const result = passwordSchema.safeParse(password);
        return { valid: result.success, error: result.error?.issues[0]?.message };
    },

    username: (username: string) => {
        const result = usernameSchema.safeParse(username);
        return { valid: result.success, error: result.error?.issues[0]?.message };
    },

    fileUpload: (file: any) => {
        const result = fileUploadSchema.safeParse(file);
        return { valid: result.success, error: result.error?.issues[0]?.message };
    },

    sessionTitle: (title: string) => {
        const result = sessionTitleSchema.safeParse(title);
        return { valid: result.success, error: result.error?.issues[0]?.message };
    },

    code: (code: string) => {
        const result = codeSchema.safeParse(code);
        return { valid: result.success, error: result.error?.issues[0]?.message };
    },

    totpCode: (code: string) => {
        const result = totpCodeSchema.safeParse(code);
        return { valid: result.success, error: result.error?.issues[0]?.message };
    },
};

/**
 * Rate limiting
 */
export const rateLimitKeys = {
    login: (email: string) => `rate:login:${email}`,
    signup: (ip: string) => `rate:signup:${ip}`,
    apiCall: (userId: string) => `rate:api:${userId}`,
    codeExecution: (userId: string) => `rate:exec:${userId}`,
};
