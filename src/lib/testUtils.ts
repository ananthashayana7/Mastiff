/**
 * Test Utilities & Fixtures
 * 
 * Helpers for testing features across the application
 */

import { cryptowithSecurity } from 'crypto';

export const testFixtures = {
    // Test users
    users: {
        testUser: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'test@example.com',
            name: 'Test User',
            password: 'SecurePassword123!@#',
        },
        adminUser: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            email: 'admin@example.com',
            name: 'Admin User',
            password: 'AdminPassword456!@#',
        },
    },

    // CSRF tokens
    csrfToken: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

    // TOTP codes
    totpSecret: 'JBSWY3DPEBLW64TMMQ======',
    totpCode: '123456',

    // File upload
    files: {
        csvFile: {
            name: 'sample.csv',
            type: 'text/csv',
            size: 1024,
            content: 'id,name,value\n1,test,100\n2,data,200',
        },
    },
};

/**
 * Generate random test data
 */
export function generateTestData() {
    return {
        userId: Math.random().toString(36).substr(2, 9),
        sessionId: Math.random().toString(36).substr(2, 9),
        fileId: Math.random().toString(36).substr(2, 9),
        code: 'print("Hello, World!")',
    };
}

/**
 * Mock request creation
 */
export function createMockRequest(options: any = {}) {
    return {
        method: options.method || 'GET',
        headers: {
            'content-type': 'application/json',
            'user-agent': 'test-agent',
            'x-forwarded-for': '127.0.0.1',
            ...options.headers,
        },
        body: options.body,
        ...options,
    };
}

/**
 * Test helper: Wait for async operations
 */
export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
