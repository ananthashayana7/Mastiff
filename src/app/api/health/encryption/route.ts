/**
 * Encryption Health Check Middleware
 * 
 * Verifies encryption is properly configured on application startup
 * and provides health check endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkEncryptionSetup } from '@/services/encryptionService';
import { verifyEncryptionHealth } from '@/lib/dbEncryption';

/**
 * GET /api/health/encryption
 * Check encryption system health
 */
export async function GET(request: NextRequest) {
    // Check if this is a health check request
    if (!request.nextUrl.pathname.includes('/health/encryption')) {
        return NextResponse.next();
    }

    const checks = {
        service: checkEncryptionSetup(),
        database: { status: 'pending' as const, message: '' },
    };

    try {
        const dbHealth = await verifyEncryptionHealth();
        checks.database = dbHealth;
    } catch (err) {
        checks.database = {
            status: 'error' as const,
            message: `Database health check failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    const allHealthy =
        checks.service.valid && checks.database.status === 'ok';

    return NextResponse.json(
        {
            status: allHealthy ? 'healthy' : 'degraded',
            checks,
        },
        {
            status: allHealthy ? 200 : 503,
        }
    );
}

/**
 * Initialization hook
 * Call this during application startup to verify encryption is ready
 */
export async function initializeEncryption(): Promise<{
    ready: boolean;
    errors: string[];
}> {
    const errors: string[] = [];

    // Check encryption service
    const serviceCheck = checkEncryptionSetup();
    if (!serviceCheck.valid) {
        errors.push(serviceCheck.message);
    } else {
        console.log('✅ Encryption service initialized');
    }

    // Check database
    try {
        const dbHealth = await verifyEncryptionHealth();
        if (dbHealth.status !== 'ok') {
            errors.push(dbHealth.message);
        } else {
            console.log('✅ Database encryption verified');
        }
    } catch (err) {
        // Database might not be ready yet, this is not critical
        console.warn('⚠️  Database health check skipped (may not be ready)');
    }

    return {
        ready: errors.length === 0,
        errors,
    };
}
