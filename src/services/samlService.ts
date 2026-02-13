/**
 * SAML Service - SAML 2.0 Authentication Implementation
 * Handles SAML metadata, authentication requests, and response validation
 */

import crypto from 'crypto';
import { db } from '@/src/db/index';
import { samlConfigsTable, samlSessionsTable, ssoAuditLogTable } from '@/src/db/ssoSchema';
import { eq, and } from 'drizzle-orm';

export interface SAMLConfig {
    organizationId: string;
    entityId: string;
    authenticationUrl: string;
    singleLogoutUrl?: string;
    certificateUrl: string;
    certificate?: string;
    nameIdFormat?: string;
    attributeMappings: Record<string, string>;
    groupMappings?: Record<string, string>;
    enforceSSO?: boolean;
    allowJustInTime?: boolean;
    autoAssignRole?: string;
}

export interface SAMLAuthAction {
    organizationId: string;
    samlConfigId: string;
    userId?: string;
    eventType: string;
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
}

/**
 * SAML Service
 */
export class SAMLService {
    private static readonly ASSERTION_CONSUMER_SERVICE_PATH = '/auth/saml/callback';
    private static readonly ENTITY_ID_PATTERN = /^[a-z0-9\-._:]+$/i;

    /**
     * Generate Service Provider metadata XML
     */
    static generateSPMetadata(
        appUrl: string,
        samlConfig: (typeof samlConfigsTable.$inferSelect) & { organizationId?: string }
    ): string {
        const acsUrl = `${appUrl}${this.ASSERTION_CONSUMER_SERVICE_PATH}`;
        const sloUrl = `${appUrl}/auth/saml/logout`;

        const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${this.escapeXml(samlConfig.entityId || appUrl)}">
  <SPSSODescriptor AuthnRequestsSigned="${samlConfig.signServiceProviderMetadata ? 'true' : 'false'}" WantAssertionsSigned="${samlConfig.wantAssertionsSigned ? 'true' : 'false'}" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${this.generateCertificate()}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${this.escapeXml(sloUrl)}" />
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${this.escapeXml(acsUrl)}" index="0" isDefault="true" />
  </SPSSODescriptor>
</EntityDescriptor>`;

        return metadata;
    }

    /**
     * Create a SAML configuration
     */
    static async createConfig(config: SAMLConfig & { createdBy: string }): Promise<typeof samlConfigsTable.$inferSelect> {
        // Validate entity ID format
        if (!this.ENTITY_ID_PATTERN.test(config.entityId)) {
            throw new Error('Invalid entity ID format');
        }

        const attribute = await db
            .insert(samlConfigsTable)
            .values({
                organizationId: config.organizationId,
                entityId: config.entityId,
                authenticationUrl: config.authenticationUrl,
                singleLogoutUrl: config.singleLogoutUrl,
                certificateUrl: config.certificateUrl,
                certificate: config.certificate,
                attributeMappings: config.attributeMappings,
                groupMappings: config.groupMappings,
                enforceSSO: config.enforceSSO,
                allowJustInTime: config.allowJustInTime,
                autoAssignRole: config.autoAssignRole,
                createdBy: config.createdBy,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return attribute[0];
    }

    /**
     * Get SAML config by organization
     */
    static async getConfigByOrganization(organizationId: string) {
        const configs = await db
            .select()
            .from(samlConfigsTable)
            .where(eq(samlConfigsTable.organizationId, organizationId))
            .limit(1);

        return configs[0] || null;
    }

    /**
     * Update SAML configuration
     */
    static async updateConfig(
        samlConfigId: string,
        updates: Partial<SAMLConfig> & { updatedBy: string }
    ) {
        const { updatedBy, ...data } = updates;

        const updated = await db
            .update(samlConfigsTable)
            .set({
                ...data,
                updatedBy,
                updatedAt: new Date(),
            })
            .where(eq(samlConfigsTable.id, samlConfigId))
            .returning();

        return updated[0];
    }

    /**
     * Create SAML authentication session
     */
    static async createSession(
        samlConfigId: string,
        organizationId: string,
        relayState?: string
    ) {
        const requestId = this.generateId();

        const session = await db
            .insert(samlSessionsTable)
            .values({
                samlConfigId,
                organizationId,
                requestId,
                relayState,
                status: 'pending',
                expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
            })
            .returning();

        return {
            session: session[0],
            requestId,
            authUrl: await this.generateAuthRequest(samlConfigId, requestId),
        };
    }

    /**
     * Generate SAML Authentication Request
     */
    static async generateAuthRequest(samlConfigId: string, requestId: string): Promise<string> {
        const config = await db
            .select()
            .from(samlConfigsTable)
            .where(eq(samlConfigsTable.id, samlConfigId))
            .limit(1);

        if (!config[0]) {
            throw new Error('SAML config not found');
        }

        const samlConfig = config[0];
        const acsUrl = `${process.env.APP_URL || 'http://localhost:3000'}/auth/saml/callback`;

        const authRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${this.escapeXml(requestId)}"
  Version="2.0"
  IssueInstant="${new Date().toISOString()}"
  Destination="${this.escapeXml(samlConfig.authenticationUrl)}"
  AssertionConsumerServiceURL="${this.escapeXml(acsUrl)}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${this.escapeXml(samlConfig.entityId)}</saml:Issuer>
  <samlp:NameIDPolicy Format="${this.escapeXml(samlConfig.nameIdFormat)}" AllowCreate="true" />
</samlp:AuthnRequest>`;

        // In production, would sign the request
        return Buffer.from(authRequest).toString('base64');
    }

    /**
     * Process SAML Response and extract attributes
     */
    static async processSAMLResponse(
        samlConfigId: string,
        samlResponse: string,
        relayState?: string
    ): Promise<{
        userId: string;
        email: string;
        attributes: Record<string, string>;
    }> {
        const config = await db
            .select()
            .from(samlConfigsTable)
            .where(eq(samlConfigsTable.id, samlConfigId))
            .limit(1);

        if (!config[0]) {
            throw new Error('SAML config not found');
        }

        // Decode SAML response
        const decodedResponse = Buffer.from(samlResponse, 'base64').toString('utf-8');

        // In production, would validate signature and decrypt assertions
        const attributes = this.parseAttributes(decodedResponse, config[0].attributeMappings);

        return {
            userId: attributes.email || attributes.subject || '',
            email: attributes.email || '',
            attributes,
        };
    }

    /**
     * Parse SAML attributes from response
     */
    private static parseAttributes(
        samlXml: string,
        mappings: Record<string, string>
    ): Record<string, string> {
        const attributes: Record<string, string> = {};

        for (const [field, samlAttribute] of Object.entries(mappings)) {
            const regex = new RegExp(
                `<saml:Attribute Name="${this.escapeRegex(samlAttribute)}"[^>]*>\\s*<saml:AttributeValue[^>]*>([^<]*)<\\/saml:AttributeValue>`,
                'i'
            );
            const match = samlXml.match(regex);
            if (match) {
                attributes[field] = match[1];
            }
        }

        return attributes;
    }

    /**
     * Complete SAML authentication session
     */
    static async completeSession(
        sessionId: string,
        userId: string,
        responseData: Record<string, any>
    ) {
        const updated = await db
            .update(samlSessionsTable)
            .set({
                userId,
                responseData,
                status: 'authenticated',
                authenticatedAt: new Date(),
            })
            .where(eq(samlSessionsTable.id, sessionId))
            .returning();

        return updated[0];
    }

    /**
     * Record SSO audit event
     */
    static async auditEvent(action: SAMLAuthAction) {
        await db.insert(ssoAuditLogTable).values({
            organizationId: action.organizationId,
            eventType: action.eventType,
            providerType: 'saml',
            providerId: action.samlConfigId,
            userId: action.userId,
            status: action.status,
            errorCode: action.errorCode,
            errorMessage: action.errorMessage,
            ipAddress: action.ipAddress,
            userAgent: action.userAgent,
            metadata: action.metadata,
            timestamp: new Date(),
        });
    }

    /**
     * Test SAML configuration
     */
    static async testConfiguration(samlConfigId: string): Promise<{
        success: boolean;
        message: string;
        certificateValid?: boolean;
        endpoints?: { auth: string; slo?: string };
    }> {
        const config = await db
            .select()
            .from(samlConfigsTable)
            .where(eq(samlConfigsTable.id, samlConfigId))
            .limit(1);

        if (!config[0]) {
            return { success: false, message: 'Configuration not found' };
        }

        try {
            // Validate entity ID format
            if (!this.ENTITY_ID_PATTERN.test(config[0].entityId)) {
                return { success: false, message: 'Invalid entity ID format' };
            }

            // Validate URLs
            new URL(config[0].authenticationUrl);
            if (config[0].singleLogoutUrl) {
                new URL(config[0].singleLogoutUrl);
            }

            // Update test time
            await db
                .update(samlConfigsTable)
                .set({ testedAt: new Date() })
                .where(eq(samlConfigsTable.id, samlConfigId));

            return {
                success: true,
                message: 'Configuration is valid',
                certificateValid: config[0].certificate ? true : false,
                endpoints: {
                    auth: config[0].authenticationUrl,
                    slo: config[0].singleLogoutUrl || undefined,
                },
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Configuration test failed',
            };
        }
    }

    // Helper methods

    private static generateId(): string {
        return `_${crypto.randomBytes(16).toString('hex')}`;
    }

    private static generateCertificate(): string {
        // Placeholder: In production, would use actual certificate
        return 'MIICXDCCAYU...'; // Truncated for demo
    }

    private static escapeXml(text: string): string {
        return text.replace(/[<>&'"]/g, (char) => {
            const entities: Record<string, string> = {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                "'": '&apos;',
                '"': '&quot;',
            };
            return entities[char] || char;
        });
    }

    private static escapeRegex(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
