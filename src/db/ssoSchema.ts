/**
 * SAML/SSO Database Schema
 * Configuration and management for SAML 2.0 and OAuth2 SSO integration
 */

import { pgTable, text, boolean, timestamp, uuid, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * SAML Configurations Table
 * Store SAML provider configurations per organization
 */
export const samlConfigsTable = pgTable(
    'saml_configs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        organizationId: uuid('organization_id').notNull(),

        // SAML Provider Identity
        entityId: text('entity_id').notNull(), // Service provider entity ID
        authenticationUrl: text('authentication_url').notNull(), // IdP SSO URL
        singleLogoutUrl: text('single_logout_url'), // SLO URL
        certificateUrl: text('certificate_url'), // IdP certificate URL
        certificate: text('certificate'), // X.509 certificate in PEM format
        publicCertificate: text('public_certificate'), // SP public certificate

        // Metadata
        nameIdFormat: text('name_id_format').notNull().default('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),
        // name_id_format examples:
        // 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress' (default)
        // 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
        // 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient'

        // Attribute Mappings
        attributeMappings: jsonb('attribute_mappings').notNull(), // Maps SAML attributes to user fields
        // {
        //   "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        //   "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        //   "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        //   "groups": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/membershipref"
        // }

        groupMappings: jsonb('group_mappings'), // Maps SAML groups to workspace roles
        // {
        //   "saml_admins": "admin",
        //   "saml_editors": "editor",
        //   "saml_viewers": "viewer"
        // }

        // Configuration Options
        enforceSSO: boolean('enforce_sso').default(false), // Force SSO for all org users
        allowJustInTime: boolean('allow_just_in_time').default(true), // Auto-provision on first login
        autoAssignRole: text('auto_assign_role').default('viewer'), // Default role for new users

        // Assertion Configuration
        wantAssertionsSigned: boolean('want_assertions_signed').default(true),
        signServiceProviderMetadata: boolean('sign_service_provider_metadata').default(true),
        wantResponseSigned: boolean('want_response_signed').default(true),

        // Status
        isEnabled: boolean('is_enabled').notNull().default(true),
        testedAt: timestamp('tested_at'), // Last successful test connection
        lastMetadataSync: timestamp('last_metadata_sync'),

        // Metadata
        metadata: jsonb('metadata'), // Raw SAML metadata (for reference)

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
        updatedBy: uuid('updated_by'),
    },
    (table) => {
        return {
            organizationIdIdx: index('saml_configs_organization_id_idx').on(table.organizationId),
            entityIdIdx: uniqueIndex('saml_configs_entity_id_idx').on(table.organizationId, table.entityId),
            isEnabledIdx: index('saml_configs_is_enabled_idx').on(table.isEnabled),
        };
    }
);

/**
 * SAML Login Sessions Table
 * Track SAML authentication attempts and sessions
 */
export const samlSessionsTable = pgTable(
    'saml_sessions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        samlConfigId: uuid('saml_config_id').notNull(),
        organizationId: uuid('organization_id').notNull(),

        // Request tracking
        requestId: text('request_id').notNull(), // SAML Request ID
        relayState: text('relay_state'), // Relay state from SP

        // Session state
        status: text('status').notNull().default('pending'), // 'pending' | 'authenticated' | 'failed' | 'expired'
        userId: uuid('user_id'), // Linked user after auth

        // Response data
        responseData: jsonb('response_data'), // SAML response attributes
        // {
        //   "Subject": { "NameID": "user@example.com", "Format": "..." },
        //   "Attributes": { "email": "user@example.com", ... },
        //   "SessionIndex": "...",
        //   "AuthnInstant": "2024-01-15T10:00:00Z"
        // }

        // Error tracking
        errorCode: text('error_code'), // SAML error code if failed
        errorMessage: text('error_message'),

        // Timing
        requestedAt: timestamp('requested_at').notNull().defaultNow(),
        authenticatedAt: timestamp('authenticated_at'),
        expiresAt: timestamp('expires_at').notNull(),

        // Metadata
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
    },
    (table) => {
        return {
            samlConfigIdIdx: index('saml_sessions_saml_config_id_idx').on(table.samlConfigId),
            organizationIdIdx: index('saml_sessions_organization_id_idx').on(table.organizationId),
            userIdIdx: index('saml_sessions_user_id_idx').on(table.userId),
            statusIdx: index('saml_sessions_status_idx').on(table.status),
            requestIdIdx: index('saml_sessions_request_id_idx').on(table.requestId),
            expiresAtIdx: index('saml_sessions_expires_at_idx').on(table.expiresAt),
        };
    }
);

/**
 * OAuth2 Configurations Table
 * Store OAuth2 provider configurations (Google, Microsoft, GitHub, custom)
 */
export const oauth2ConfigsTable = pgTable(
    'oauth2_configs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        organizationId: uuid('organization_id').notNull(),

        // Provider info
        provider: text('provider').notNull(), // 'google' | 'microsoft' | 'github' | 'custom'
        name: text('name').notNull(),
        description: text('description'),

        // OAuth2 Credentials
        clientId: text('client_id').notNull(),
        clientSecret: text('client_secret').notNull(), // Encrypted
        authorizationUrl: text('authorization_url').notNull(),
        tokenUrl: text('token_url').notNull(),
        userInfoUrl: text('user_info_url').notNull(),
        discoveryUrl: text('discovery_url'), // For OpenID Connect discovery

        // Scope Configuration
        requiredScopes: text('required_scopes').notNull(), // Space-separated scopes
        // Examples:
        // 'openid email profile'
        // 'https://www.googleapis.com/auth/userinfo.email'
        // 'user:email'

        // Attribute Mappings
        attributeMappings: jsonb('attribute_mappings').notNull(), // Maps OAuth2 claims to user fields
        // {
        //   "email": "email",
        //   "firstName": "given_name",
        //   "lastName": "family_name",
        //   "avatar": "picture"
        // }

        groupMappings: jsonb('group_mappings'), // Maps OAuth2 groups to workspace roles

        // Configuration Options
        autoCreateUsers: boolean('auto_create_users').default(true),
        autoAssignRole: text('auto_assign_role').default('viewer'),
        allowEmailDomains: jsonb('allow_email_domains'), // ['example.com', 'company.com']

        // Status
        isEnabled: boolean('is_enabled').notNull().default(true),
        testedAt: timestamp('tested_at'),

        // Metadata
        metadata: jsonb('metadata'),

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
        updatedBy: uuid('updated_by'),
    },
    (table) => {
        return {
            organizationIdIdx: index('oauth2_configs_organization_id_idx').on(table.organizationId),
            providerIdx: index('oauth2_configs_provider_idx').on(table.provider),
            isEnabledIdx: index('oauth2_configs_is_enabled_idx').on(table.isEnabled),
        };
    }
);

/**
 * OAuth2 Sessions Table
 * Track OAuth2 authentication attempts and sessions
 */
export const oauth2SessionsTable = pgTable(
    'oauth2_sessions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        oauth2ConfigId: uuid('oauth2_config_id').notNull(),
        organizationId: uuid('organization_id').notNull(),

        // Session tracking
        state: text('state').notNull(), // CSRF state parameter
        codeChallenge: text('code_challenge'), // PKCE code challenge
        codeChallengeMethod: text('code_challenge_method'), // 'S256' | 'plain'
        requestedAt: timestamp('requested_at').notNull().defaultNow(),
        expiresAt: timestamp('expires_at').notNull(),

        // Authentication
        authorizationCode: text('authorization_code'),
        accessToken: text('access_token'), // Encrypted
        refreshToken: text('refresh_token'), // Encrypted
        idToken: text('id_token'), // Encrypted

        // User Data
        userId: uuid('user_id'),
        userData: jsonb('user_data'), // Retrieved user profile
        // {
        //   "email": "user@example.com",
        //   "firstName": "John",
        //   "lastName": "Doe",
        //   "avatar": "https://...",
        //   "sub": "oauth-provider-subject-id"
        // }

        // Status
        status: text('status').notNull().default('pending'), // 'pending' | 'authenticated' | 'failed' | 'cancelled'
        errorCode: text('error_code'),
        errorMessage: text('error_message'),

        // Metadata
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
    },
    (table) => {
        return {
            oauth2ConfigIdIdx: index('oauth2_sessions_oauth2_config_id_idx').on(table.oauth2ConfigId),
            organizationIdIdx: index('oauth2_sessions_organization_id_idx').on(table.organizationId),
            userIdIdx: index('oauth2_sessions_user_id_idx').on(table.userId),
            stateIdx: index('oauth2_sessions_state_idx').on(table.state),
            statusIdx: index('oauth2_sessions_status_idx').on(table.status),
            expiresAtIdx: index('oauth2_sessions_expires_at_idx').on(table.expiresAt),
        };
    }
);

/**
 * SSO Audit Log Table
 * Track all SSO authentication events for compliance
 */
export const ssoAuditLogTable = pgTable(
    'sso_audit_log',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        organizationId: uuid('organization_id').notNull(),

        // Event details
        eventType: text('event_type').notNull(), // 'saml_login' | 'oauth2_login' | 'sso_logout' | 'config_change' | 'mfa_verified'
        providerType: text('provider_type').notNull(), // 'saml' | 'oauth2'
        providerId: uuid('provider_id'), // saml_config_id or oauth2_config_id

        // User information
        userId: uuid('user_id'), // User who performed action
        userEmail: text('user_email'),
        externalId: text('external_id'), // ID from SSO provider

        // Status
        status: text('status').notNull(), // 'success' | 'failure'
        errorCode: text('error_code'),
        errorMessage: text('error_message'),

        // Request details
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        sessionId: text('session_id'),

        // Audit fields
        metadata: jsonb('metadata'), // Additional context
        timestamp: timestamp('timestamp').notNull().defaultNow(),
    },
    (table) => {
        return {
            organizationIdIdx: index('sso_audit_log_organization_id_idx').on(table.organizationId),
            eventTypeIdx: index('sso_audit_log_event_type_idx').on(table.eventType),
            userIdIdx: index('sso_audit_log_user_id_idx').on(table.userId),
            statusIdx: index('sso_audit_log_status_idx').on(table.status),
            timestampIdx: index('sso_audit_log_timestamp_idx').on(table.timestamp),
        };
    }
);

/**
 * Relations
 */
export const samlConfigsRelations = relations(samlConfigsTable, ({ one, many }) => ({
    sessions: many(samlSessionsTable),
}));

export const samlSessionsRelations = relations(samlSessionsTable, ({ one }) => ({
    samlConfig: one(samlConfigsTable, {
        fields: [samlSessionsTable.samlConfigId],
        references: [samlConfigsTable.id],
    }),
}));

export const oauth2ConfigsRelations = relations(oauth2ConfigsTable, ({ one, many }) => ({
    sessions: many(oauth2SessionsTable),
}));

export const oauth2SessionsRelations = relations(oauth2SessionsTable, ({ one }) => ({
    oauth2Config: one(oauth2ConfigsTable, {
        fields: [oauth2SessionsTable.oauth2ConfigId],
        references: [oauth2ConfigsTable.id],
    }),
}));

export const ssoAuditLogRelations = relations(ssoAuditLogTable, ({}) => ({}));
