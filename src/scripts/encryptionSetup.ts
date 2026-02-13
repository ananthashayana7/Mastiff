#!/usr/bin/env node

/**
 * Encryption Setup Utility
 * 
 * This script helps set up encryption for the application.
 * Run this once during initial setup.
 * 
 * Usage:
 * - Generate encryption key: npx ts-node src/scripts/encryptionSetup.ts generate-key
 * - Check encryption status: npx ts-node src/scripts/encryptionSetup.ts status
 * - Migrate data to encrypted: npx ts-node src/scripts/encryptionSetup.ts migrate
 */

import crypto from 'crypto';
import { encryptionService, checkEncryptionSetup } from '@/services/encryptionService';
import { encryptionMigration, verifyEncryptionHealth } from '@/lib/dbEncryption';
import path from 'path';
import fs from 'fs';

const command = process.argv[2];

async function generateEncryptionKey(): Promise<void> {
    console.log('\n🔐 Generating encryption key...\n');

    const key = crypto.randomBytes(32); // 256 bits
    const encoded = key.toString('base64');

    console.log('✅ Encryption key generated:\n');
    console.log(`ENCRYPTION_KEY="${encoded}"\n`);
    console.log('Add this to your .env.local file (or production environment variables)\n');
    console.log('💾 Save this key securely! You will need it to decrypt your data.\n');

    // Also try to write to .env.local if it exists
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const currentEnv = fs.readFileSync(envPath, 'utf-8');
        if (!currentEnv.includes('ENCRYPTION_KEY')) {
            fs.appendFileSync(envPath, `\nENCRYPTION_KEY="${encoded}"\n`);
            console.log('✅ Key added to .env.local\n');
        }
    }
}

async function checkStatus(): Promise<void> {
    console.log('\n🔍 Checking encryption status...\n');

    // Check encryption service
    const serviceCheck = checkEncryptionSetup();
    console.log(serviceCheck.message);

    if (serviceCheck.valid) {
        // Check database health
        const dbHealth = await verifyEncryptionHealth();
        if (dbHealth.status === 'ok') {
            console.log('✅ ' + dbHealth.message);
        } else {
            console.log('❌ ' + dbHealth.message);
        }

        // Check migration status
        try {
            const status = await encryptionMigration.getEncryptionStatus();
            console.log(
                `\n📊 Encryption Status:\n   Unencrypted users: ${status.unencryptedUsers}\n   Unencrypted sessions: ${status.unencryptedSessions}\n   Fully encrypted: ${status.allEncrypted ? '✅ Yes' : '❌ No'}`
            );
        } catch (err) {
            console.log('⚠️  Could not check migration status (database may not be initialized)');
        }
    }

    console.log();
}

async function migrateData(): Promise<void> {
    console.log('\n🔄 Migrating data to encrypted format...\n');

    // Check encryption first
    const serviceCheck = checkEncryptionSetup();
    if (!serviceCheck.valid) {
        console.log('❌ Encryption service not properly configured:');
        console.log(serviceCheck.message);
        process.exit(1);
    }

    try {
        console.log('📝 Migrating users...');
        const usersMigration = await encryptionMigration.migrateUsersToEncrypted();
        console.log(
            `✅ Users processed: ${usersMigration.usersProcessed}, Migrated: ${usersMigration.usersMigrated}`
        );

        console.log('📝 Migrating sessions...');
        const sessionsMigration = await encryptionMigration.migrateSessionsToEncrypted();
        console.log(
            `✅ Sessions processed: ${sessionsMigration.sessionsProcessed}, Migrated: ${sessionsMigration.sessionsMigrated}`
        );

        console.log('\n✅ Data migration completed!\n');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

async function main(): Promise<void> {
    switch (command) {
        case 'generate-key':
            await generateEncryptionKey();
            break;
        case 'status':
            await checkStatus();
            break;
        case 'migrate':
            await migrateData();
            break;
        default:
            console.log(`
📚 Encryption Setup Utility

Usage:
  npx ts-node src/scripts/encryptionSetup.ts <command>

Commands:
  generate-key  Generate a new encryption key for environment
  status        Check encryption configuration and migration status
  migrate       Migrate existing data to encrypted format

Examples:
  npx ts-node src/scripts/encryptionSetup.ts generate-key
  npx ts-node src/scripts/encryptionSetup.ts status
  npx ts-node src/scripts/encryptionSetup.ts migrate
        `);
            break;
    }
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
