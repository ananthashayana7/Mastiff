/**
 * OAuth2 Service - OAuth2/OpenID Connect Authentication
 * Supports multiple providers: Google, Microsoft, GitHub, custom OAuth2
 */

import crypto from 'crypto';
import { db } from '@/src/db/index';
import { oauth2ConfigsTable, oauth2SessionsTable, ssoAuditLogTable } from '@/src/db/ssoSchema';
import { eq, and } from 'drizzle-orm';

export interface OAuth2Config {
    organizationId: string;
    provider: 'google' | 'microsoft' | 'github' | 'custom';
    name: string;
    description?: string;
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    discoveryUrl?: string;
    requiredScopes: string;
    attributeMappings: Record<string, string>;
    groupMappings?: Record<string, string>;
    autoCreateUsers?: boolean;
    autoAssignRole?: string;
    allowEmailDomains?: string[];
}

export interface OAuth2User {
    email: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    sub?: string;
    [key: string]: any;
}

/**
 * OAuth2 Service
 */
export class OAuth2Service {
    private static readonly REDIRECT_PATH = '/auth/oauth2/callback';
    private static readonly STATE_EXPIRY = 10 * 60 * 1000; // 10 minutes

    /**
     * Create OAuth2 configuration
     */
    static async createConfig(
        config: OAuth2Config & { createdBy: string }
    ): Promise<typeof oauth2ConfigsTable.$inferSelect> {
        // Validate URLs
        this.validateUrls(config);

        const oauth2 = await db
            .insert(oauth2ConfigsTable)
            .values({
                organizationId: config.organizationId,
                provider: config.provider,
                name: config.name,
                description: config.description,
                clientId: config.clientId,
                clientSecret: config.clientSecret, // In production, would encrypt
                authorizationUrl: config.authorizationUrl,
                tokenUrl: config.tokenUrl,
                userInfoUrl: config.userInfoUrl,
                discoveryUrl: config.discoveryUrl,
                requiredScopes: config.requiredScopes,
                attributeMappings: config.attributeMappings,
                groupMappings: config.groupMappings,
                autoCreateUsers: config.autoCreateUsers,
                autoAssignRole: config.autoAssignRole,
                allowEmailDomains: config.allowEmailDomains,
                createdBy: config.createdBy,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return oauth2[0];
    }

    /**
     * Get OAuth2 config by organization and provider
     */
    static async getConfig(organizationId: string, provider: string) {
        const configs = await db
            .select()
            .from(oauth2ConfigsTable)
            .where(
                and(
                    eq(oauth2ConfigsTable.organizationId, organizationId),
                    eq(oauth2ConfigsTable.provider, provider)
                )
            )
            .limit(1);

        return configs[0] || null;
    }

    /**
     * List all OAuth2 configs for organization
     */
    static async listConfigs(organizationId: string) {
        return await db
            .select()
            .from(oauth2ConfigsTable)
            .where(
                and(
                    eq(oauth2ConfigsTable.organizationId, organizationId),
                    eq(oauth2ConfigsTable.isEnabled, true)
                )
            );
    }

    /**
     * Generate authorization URL for OAuth2 flow
     */
    static async generateAuthorizationUrl(
        oauth2ConfigId: string,
        redirectUri: string,
        state?: string,
        codeChallenge?: string
    ): Promise<{ url: string; state: string; sessionId: string }> {
        const config = await db
            .select()
            .from(oauth2ConfigsTable)
            .where(eq(oauth2ConfigsTable.id, oauth2ConfigId))
            .limit(1);

        if (!config[0]) {
            throw new Error('OAuth2 config not found');
        }

        const finalState = state || this.generateState();
        const session = await db
            .insert(oauth2SessionsTable)
            .values({
                oauth2ConfigId,
                organizationId: config[0].organizationId,
                state: finalState,
                codeChallenge,
                codeChallengeMethod: codeChallenge ? 'S256' : undefined,
                status: 'pending',
                expiresAt: new Date(Date.now() + this.STATE_EXPIRY),
            })
            .returning();

        const params = new URLSearchParams({
            client_id: config[0].clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: config[0].requiredScopes,
            state: finalState,
            ...(codeChallenge && { code_challenge: codeChallenge, code_challenge_method: 'S256' }),
        });

        return {
            url: `${config[0].authorizationUrl}?${params.toString()}`,
            state: finalState,
            sessionId: session[0].id,
        };
    }

    /**
     * Exchange authorization code for tokens
     */
    static async exchangeCode(
        oauth2ConfigId: string,
        code: string,
        redirectUri: string,
        codeVerifier?: string
    ): Promise<{
        accessToken: string;
        refreshToken?: string;
        idToken?: string;
        expiresIn: number;
    }> {
        const config = await db
            .select()
            .from(oauth2ConfigsTable)
            .where(eq(oauth2ConfigsTable.id, oauth2ConfigId))
            .limit(1);

        if (!config[0]) {
            throw new Error('OAuth2 config not found');
        }

        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config[0].clientId,
            client_secret: config[0].clientSecret,
            code,
            redirect_uri: redirectUri,
            ...(codeVerifier && { code_verifier: codeVerifier }),
        });

        const response = await fetch(config[0].tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.statusText}`);
        }

        const tokenData = await response.json();

        return {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            idToken: tokenData.id_token,
            expiresIn: tokenData.expires_in || 3600,
        };
    }

    /**
     * Get user info from OAuth2 provider
     */
    static async getUserInfo(
        oauth2ConfigId: string,
        accessToken: string
    ): Promise<OAuth2User> {
        const config = await db
            .select()
            .from(oauth2ConfigsTable)
            .where(eq(oauth2ConfigsTable.id, oauth2ConfigId))
            .limit(1);

        if (!config[0]) {
            throw new Error('OAuth2 config not found');
        }

        const response = await fetch(config[0].userInfoUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            throw new Error(`UserInfo request failed: ${response.statusText}`);
        }

        const rawUserInfo = await response.json();

        // Map OAuth2 response to user fields
        const mappedUser: OAuth2User = {
            email: '',
        };

        for (const [field, oauthField] of Object.entries(config[0].attributeMappings)) {
            const value = this.getNestedProperty(rawUserInfo, oauthField as string);
            if (value) {
                (mappedUser as any)[field] = value;
            }
        }

        // Additional extraction
        mappedUser.sub = rawUserInfo.sub || rawUserInfo.id || '';

        return mappedUser;
    }

    /**
     * Complete OAuth2 session
     */
    static async completeSession(
        sessionId: string,
        userId: string,
        userData: OAuth2User,
        tokens: {
            accessToken: string;
            refreshToken?: string;
            idToken?: string;
        }
    ) {
        const updated = await db
            .update(oauth2SessionsTable)
            .set({
                userId,
                userData,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                idToken: tokens.idToken,
                status: 'authenticated',
            })
            .where(eq(oauth2SessionsTable.id, sessionId))
            .returning();

        return updated[0];
    }

    /**
     * Record OAuth2 audit event
     */
    static async auditEvent(
        organizationId: string,
        oauth2ConfigId: string,
        eventType: string,
        status: 'success' | 'failure',
        userId?: string,
        userEmail?: string,
        errorCode?: string,
        errorMessage?: string,
        ipAddress?: string,
        userAgent?: string
    ) {
        await db.insert(ssoAuditLogTable).values({
            organizationId,
            eventType,
            providerType: 'oauth2',
            providerId: oauth2ConfigId,
            userId,
            userEmail,
            status,
            errorCode,
            errorMessage,
            ipAddress,
            userAgent,
            timestamp: new Date(),
        });
    }

    /**
     * Validate OAuth2 configuration
     */
    static async testConfiguration(oauth2ConfigId: string): Promise<{
        success: boolean;
        message: string;
        providerReachable?: boolean;
    }> {
        const config = await db
            .select()
            .from(oauth2ConfigsTable)
            .where(eq(oauth2ConfigsTable.id, oauth2ConfigId))
            .limit(1);

        if (!config[0]) {
            return { success: false, message: 'Configuration not found' };
        }

        try {
            // Validate URLs
            this.validateUrls(config[0]);

            // Test endpoint reachability
            const testUrls = [config[0].authorizationUrl, config[0].tokenUrl, config[0].userInfoUrl];
            let providerReachable = false;

            for (const url of testUrls) {
                try {
                    const response = await fetch(url, { method: 'HEAD' });
                    if (response.ok || response.status === 405) {
                        // 405 means method not allowed, but endpoint exists
                        providerReachable = true;
                        break;
                    }
                } catch (error) {
                    // Continue to next URL
                }
            }

            // Update test time
            await db
                .update(oauth2ConfigsTable)
                .set({ testedAt: new Date() })
                .where(eq(oauth2ConfigsTable.id, oauth2ConfigId));

            return {
                success: true,
                message: 'Configuration is valid',
                providerReachable,
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Configuration test failed',
            };
        }
    }

    /**
     * Refresh access token
     */
    static async refreshAccessToken(
        oauth2ConfigId: string,
        refreshToken: string
    ): Promise<{
        accessToken: string;
        expiresIn: number;
    }> {
        const config = await db
            .select()
            .from(oauth2ConfigsTable)
            .where(eq(oauth2ConfigsTable.id, oauth2ConfigId))
            .limit(1);

        if (!config[0]) {
            throw new Error('OAuth2 config not found');
        }

        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: config[0].clientId,
            client_secret: config[0].clientSecret,
            refresh_token: refreshToken,
        });

        const response = await fetch(config[0].tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!response.ok) {
            throw new Error(`Token refresh failed: ${response.statusText}`);
        }

        const tokenData = await response.json();

        return {
            accessToken: tokenData.access_token,
            expiresIn: tokenData.expires_in || 3600,
        };
    }

    // Helper methods

    private static generateState(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    private static validateUrls(config: any) {
        try {
            new URL(config.authorizationUrl);
            new URL(config.tokenUrl);
            new URL(config.userInfoUrl);
            if (config.discoveryUrl) {
                new URL(config.discoveryUrl);
            }
        } catch (error) {
            throw new Error(`Invalid URL in configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private static getNestedProperty(obj: any, path: string): any {
        return path.split('.').reduce((current, prop) => current?.[prop], obj);
    }
}
