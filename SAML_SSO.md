# SAML/SSO Integration - Phase 3.5

## Overview

The SAML/SSO Integration enables enterprise customers to implement single sign-on (SSO) using SAML 2.0 or OAuth2/OpenID Connect. This allows organizations to authenticate users against their existing identity providers (IdP) such as Okta, Azure AD, Google Workspace, or custom systems.

### Key Features

- **SAML 2.0 Support**: Full SAML 2.0 Service Provider (SP) implementation
- **OAuth2/OpenID Connect**: Support for Google, Microsoft, GitHub, and custom OAuth2 providers
- **Multiple Providers Per Org**: Different workspaces/teams can use different SSO providers
- **Just-In-Time Provisioning**: Auto-create users on first SAML/OAuth2 login
- **Group/Role Mapping**: Map IdP groups to workspace roles (admin/editor/viewer)
- **Attribute Mapping**: Flexible field mapping for email, name, avatar, etc.
- **Audit Logging**: Complete audit trail of all SSO authentication events
- **Enterprise Features**: Enforce SSO requirement, allow email domain restrictions
- **PKCE Support**: OAuth2 Proof Key for Code Exchange for mobile apps

### Architecture

```
User Login Request
    ↓
Check Organization SSO Config
    ├─ SAML Enabled
    │   ├─ Generate AuthnRequest
    │   ├─ Redirect to IdP
    │   └─ IdP authenticates user
    │
    └─ OAuth2 Enabled
        ├─ Generate authorization URL
        ├─ Redirect to OAuth2 provider
        └─ Provider authenticates user
    
Callback from IdP/Provider
    ├─ Validate signature (SAML) / state parameter (OAuth2)
    ├─ Extract attributes
    ├─ Map to user fields & roles
    ├─ Create or update user
    ├─ Assign roles based on mapping
    ├─ Log audit event
    └─ Create session → Redirect to app
```

## Database Schema

### saml_configs Table
SAML provider configuration for each organization.

```sql
CREATE TABLE saml_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    
    -- SAML Provider Identity
    entity_id TEXT NOT NULL UNIQUE (organization_id, entity_id),
    authentication_url TEXT NOT NULL, -- IdP SSO endpoint
    single_logout_url TEXT, -- SLO endpoint
    certificate_url TEXT,
    certificate TEXT, -- X.509 certificate in PEM
    public_certificate TEXT,
    
    -- Configuration
    name_id_format TEXT NOT NULL DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    attribute_mappings JSONB NOT NULL, -- Maps SAML attributes to user fields
    group_mappings JSONB, -- Maps SAML groups to workspace roles
    enforce_sso BOOLEAN DEFAULT false, -- Force SSO for all org users
    allow_just_in_time BOOLEAN DEFAULT true, -- Auto-provision users
    auto_assign_role TEXT DEFAULT 'viewer',
    
    -- Assertion Configuration
    want_assertions_signed BOOLEAN DEFAULT true,
    sign_service_provider_metadata BOOLEAN DEFAULT true,
    want_response_signed BOOLEAN DEFAULT true,
    
    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    tested_at TIMESTAMP,
    last_metadata_sync TIMESTAMP,
    metadata JSONB,
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Key Fields**:
- **entity_id**: Unique identifier for this SP (typically app URL or domain)
- **authentication_url**: IdP's SAML SSO endpoint
- **attribute_mappings**: Maps SAML response attributes to user fields
  ```json
  {
    "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "groups": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/membershipref"
  }
  ```
- **group_mappings**: Maps SAML groups to workspace roles
  ```json
  {
    "saml_admins": "admin",
    "saml_editors": "editor",
    "saml_viewers": "viewer"
  }
  ```

### saml_sessions Table
Track SAML authentication attempts.

```sql
CREATE TABLE saml_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saml_config_id UUID NOT NULL REFERENCES saml_configs(id),
    organization_id UUID NOT NULL,
    
    -- Request tracking
    request_id TEXT NOT NULL UNIQUE,
    relay_state TEXT,
    
    -- Session state
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'authenticated' | 'failed' | 'expired'
    user_id UUID REFERENCES users(id),
    
    -- Response data
    response_data JSONB,
    error_code TEXT,
    error_message TEXT,
    
    -- Timing
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    authenticated_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);
```

### oauth2_configs Table
OAuth2/OpenID Connect provider configurations.

```sql
CREATE TABLE oauth2_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    
    -- Provider info
    provider TEXT NOT NULL, -- 'google' | 'microsoft' | 'github' | 'custom'
    name TEXT NOT NULL,
    description TEXT,
    
    -- OAuth2 Credentials
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL, -- Encrypted
    authorization_url TEXT NOT NULL,
    token_url TEXT NOT NULL,
    user_info_url TEXT NOT NULL,
    discovery_url TEXT, -- OpenID Connect discovery
    
    -- Scope Configuration
    required_scopes TEXT NOT NULL, -- Space-separated scopes
    
    -- Attribute Mappings
    attribute_mappings JSONB NOT NULL,
    group_mappings JSONB,
    
    -- Configuration Options
    auto_create_users BOOLEAN DEFAULT true,
    auto_assign_role TEXT DEFAULT 'viewer',
    allow_email_domains JSONB, -- ['example.com', 'company.com']
    
    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    tested_at TIMESTAMP,
    
    -- Audit
    created_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**OAuth2 Providers Pre-configured**:

Google:
```
authorization_url: https://accounts.google.com/o/oauth2/v2/auth
token_url: https://oauth2.googleapis.com/token
user_info_url: https://www.googleapis.com/oauth2/v2/userinfo
required_scopes: openid email profile
```

Microsoft:
```
authorization_url: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
token_url: https://login.microsoftonline.com/common/oauth2/v2.0/token
user_info_url: https://graph.microsoft.com/v1.0/me
required_scopes: openid email profile
```

GitHub:
```
authorization_url: https://github.com/login/oauth/authorize
token_url: https://github.com/login/oauth/access_token
user_info_url: https://api.github.com/user
required_scopes: user:email
```

### oauth2_sessions Table
Track OAuth2 authentication attempts.

```sql
CREATE TABLE oauth2_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oauth2_config_id UUID NOT NULL REFERENCES oauth2_configs(id),
    organization_id UUID NOT NULL,
    
    -- Session tracking
    state TEXT NOT NULL UNIQUE,
    code_challenge TEXT, -- PKCE
    code_challenge_method TEXT, -- 'S256'
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    
    -- Authentication
    authorization_code TEXT,
    access_token TEXT, -- Encrypted
    refresh_token TEXT, -- Encrypted
    id_token TEXT, -- Encrypted
    
    -- User Data
    user_id UUID REFERENCES users(id),
    user_data JSONB,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending',
    error_code TEXT,
    error_message TEXT
);
```

### sso_audit_log Table
Complete audit trail for all SSO events.

```sql
CREATE TABLE sso_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    
    -- Event details
    event_type TEXT NOT NULL, -- 'saml_login' | 'oauth2_login' | 'sso_logout' | 'config_change'
    provider_type TEXT NOT NULL, -- 'saml' | 'oauth2'
    provider_id UUID,
    
    -- User information
    user_id UUID,
    user_email TEXT,
    external_id TEXT,
    
    -- Status
    status TEXT NOT NULL, -- 'success' | 'failure'
    error_code TEXT,
    error_message TEXT,
    
    -- Request details
    ip_address TEXT,
    user_agent TEXT,
    session_id TEXT,
    
    -- Audit
    metadata JSONB,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## API Endpoints

### SAML Configuration

#### Get SAML Metadata
```http
GET /api/sso/saml/metadata?organizationId=org-123
```

**Response** (application/xml):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" 
  entityID="https://mastiff.example.com/org-123">
  <SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>...</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" 
      Location="https://mastiff.example.com/auth/saml/logout" />
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" 
      Location="https://mastiff.example.com/auth/saml/callback" index="0" isDefault="true" />
  </SPSSODescriptor>
</EntityDescriptor>
```

**Use For**: Configure IdP with SP metadata

#### Create SAML Configuration
```http
POST /api/sso/saml/config
Content-Type: application/json

{
    "organizationId": "org-123",
    "entityId": "https://mastiff.example.com",
    "authenticationUrl": "https://idp.okta.com/app/123/sso/saml",
    "singleLogoutUrl": "https://idp.okta.com/app/123/sso/saml/logout",
    "certificateUrl": "https://idp.okta.com/cert.pem",
    "attributeMappings": {
        "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
    },
    "groupMappings": {
        "okta_admins": "admin",
        "okta_editors": "editor",
        "okta_viewers": "viewer"
    },
    "enforceSSO": false,
    "allowJustInTime": true,
    "autoAssignRole": "viewer"
}
```

**Response** (201):
```json
{
    "config": {
        "id": "saml-123",
        "organizationId": "org-123",
        "entityId": "https://mastiff.example.com",
        "isEnabled": true,
        "createdAt": "2024-01-15T10:00:00Z"
    },
    "message": "SAML configuration created"
}
```

**Permissions Required**:
- `organization:manage_settings`

#### Initiate SAML Authentication
```http
GET /api/sso/saml/initiate?organizationId=org-123
```

**Response**:
```json
{
    "authUrl": "https://idp.okta.com/app/123/sso/saml",
    "samlRequest": "PD94bWwgdmVyc2lvbj0iMS4wIi...",
    "sessionId": "saml-session-456"
}
```

**Flow**:
1. Frontend redirects user to `authUrl` with `samlRequest` parameter
2. IdP authenticates user
3. IdP sends SAML response back to `/auth/saml/callback`

#### SAML Callback
```http
POST /auth/saml/callback
Content-Type: application/x-www-form-urlencoded

SAMLResponse=PD94bWwgdmVyc2lvbj0iMS4wIi4uLg==&RelayState=org-123
```

**Response**:
```json
{
    "success": true,
    "userId": "user-789",
    "email": "user@example.com",
    "attributes": {
        "firstName": "John",
        "lastName": "Doe",
        "groups": ["okta_editors"]
    }
}
```

#### Test SAML Configuration
```http
POST /api/sso/saml/test
Content-Type: application/json

{
    "samlConfigId": "saml-123",
    "organizationId": "org-123"
}
```

**Response**:
```json
{
    "success": true,
    "message": "Configuration is valid",
    "certificateValid": true,
    "endpoints": {
        "auth": "https://idp.okta.com/app/123/sso/saml",
        "slo": "https://idp.okta.com/app/123/sso/saml/logout"
    }
}
```

### OAuth2 Configuration

#### Create OAuth2 Configuration
```http
POST /api/sso/oauth2/config
Content-Type: application/json

{
    "organizationId": "org-123",
    "provider": "google",
    "name": "Google Workspace",
    "clientId": "123456789.apps.googleusercontent.com",
    "clientSecret": "GOCSPX-...",
    "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth",
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "userInfoUrl": "https://www.googleapis.com/oauth2/v2/userinfo",
    "requiredScopes": "openid email profile",
    "attributeMappings": {
        "email": "email",
        "firstName": "given_name",
        "lastName": "family_name",
        "avatar": "picture"
    },
    "groupMappings": {
        "admin@company.com": "admin",
        "editor@company.com": "editor"
    },
    "autoCreateUsers": true,
    "autoAssignRole": "viewer",
    "allowEmailDomains": ["company.com"]
}
```

**Response** (201):
```json
{
    "config": {
        "id": "oauth2-google-123",
        "organizationId": "org-123",
        "provider": "google",
        "isEnabled": true,
        "createdAt": "2024-01-15T10:00:00Z"
    },
    "message": "OAuth2 configuration created"
}
```

**Permissions Required**:
- `organization:manage_settings`

#### Generate Authorization URL
```http
GET /api/sso/oauth2/authorize?oauth2ConfigId=oauth2-google-123&organizationId=org-123
```

**Response**:
```json
{
    "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
    "state": "random-state-string",
    "sessionId": "oauth2-session-456",
    "codeVerifier": "code-verifier-for-pkce"
}
```

**Flow**:
1. Frontend stores `codeVerifier` in session storage
2. Redirect user to `authUrl`
3. Google redirects back to `/auth/oauth2/callback` with `code` and `state`

#### OAuth2 Callback
```http
POST /api/sso/oauth2/callback
Content-Type: application/json

{
    "code": "authorization-code-from-provider",
    "state": "random-state-string",
    "codeVerifier": "code-verifier-for-pkce",
    "oauth2ConfigId": "oauth2-google-123",
    "organizationId": "org-123"
}
```

**Response**:
```json
{
    "success": true,
    "userInfo": {
        "email": "user@company.com",
        "firstName": "John",
        "lastName": "Doe",
        "avatar": "https://...",
        "sub": "google-subject-id"
    },
    "tokens": {
        "accessToken": "ya29.a0AfH6SMBx...",
        "refreshToken": "1//0gK...",
        "expiresIn": 3599
    }
}
```

#### Test OAuth2 Configuration
```http
POST /api/sso/oauth2/test
Content-Type: application/json

{
    "oauth2ConfigId": "oauth2-google-123",
    "organizationId": "org-123"
}
```

**Response**:
```json
{
    "success": true,
    "message": "Configuration is valid",
    "providerReachable": true
}
```

## Service Usage

### Setup SAML
```typescript
import { SAMLService } from '@/src/services/samlService';

// Create configuration
const config = await SAMLService.createConfig({
    organizationId: 'org-123',
    entityId: 'https://mastiff.example.com',
    authenticationUrl: 'https://idp.okta.com/app/123/sso/saml',
    certificateUrl: 'https://idp.okta.com/cert.pem',
    attributeMappings: {
        email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    },
    groupMappings: {
        'okta_admins': 'admin',
        'okta_editors': 'editor',
    },
    createdBy: 'user-123',
});

// Get SP Metadata for IdP configuration
const appUrl = 'https://mastiff.example.com';
const metadata = SAMLService.generateSPMetadata(appUrl, config);
console.log(metadata); // XML metadata
```

### Initiate SAML Login
```typescript
// Start SAML authentication
const { session, authUrl } = await SAMLService.createSession(
    config.id,
    'org-123'
);

// Redirect user to IdP
window.location.href = authUrl;
```

### Handle SAML Callback
```typescript
// In POST /auth/saml/callback handler
const samlXml = Buffer.from(samlResponse, 'base64').toString();
const { userId, email, attributes } = await SAMLService.processSAMLResponse(
    config.id,
    samlResponse
);

// Create user or update existing
// Assign roles based on group_mappings
// Create session

await SAMLService.auditEvent({
    organizationId: 'org-123',
    samlConfigId: config.id,
    eventType: 'saml_login',
    status: 'success',
    userId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
});
```

### Setup OAuth2
```typescript
import { OAuth2Service } from '@/src/services/oauth2Service';

// Create configuration
const config = await OAuth2Service.createConfig({
    organizationId: 'org-123',
    provider: 'google',
    name: 'Google Workspace',
    clientId: '123456789.apps.googleusercontent.com',
    clientSecret: 'GOCSPX-...',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    requiredScopes: 'openid email profile',
    attributeMappings: {
        email: 'email',
        firstName: 'given_name',
        lastName: 'family_name',
    },
    createdBy: 'user-123',
});
```

### OAuth2 Login Flow
```typescript
// 1. Generate authorization URL
const redirectUri = 'https://mastiff.example.com/auth/oauth2/callback';
const { url, state } = await OAuth2Service.generateAuthorizationUrl(
    config.id,
    redirectUri
);

// Redirect user to OAuth2 provider
window.location.href = url;

// 2. Handle callback
const tokens = await OAuth2Service.exchangeCode(
    config.id,
    code,
    redirectUri
);

const userInfo = await OAuth2Service.getUserInfo(config.id, tokens.accessToken);

// Create user, assign roles, create session
await OAuth2Service.auditEvent(
    'org-123',
    config.id,
    'oauth2_login',
    'success',
    undefined,
    userInfo.email
);
```

## Security Best Practices

### SAML Security
1. **Signature Validation**: Always validate SAML response signature
2. **Assertion Encryption**: Encrypt assertions in transit
3. **Certificate Management**: Rotate certificates regularly
4. **NameID**: Use persistent or transient format (not unspecified)
5. **SP Metadata**: Sign SP metadata for integrity

### OAuth2 Security
1. **PKCE**: Always use PKCE for authorization code flow
2. **State Parameter**: Validate state to prevent CSRF
3. **HTTPS Only**: All redirects must be over HTTPS
4. **Secure Storage**: Store tokens securely (encrypted, httponly cookies)
5. **Token Expiry**: Implement token refresh rotation
6. **Client Secret**: Never expose client secret to frontend

### General SSO Security
1. **Audit Logging**: Log all authentication events
2. **Rate Limiting**: Limit login attempts and token requests
3. **Session Management**: Use secure, httponly cookies
4. **Access Control**: Enforce permission checks on all SSO operations
5. **Encryption**: Encrypt sensitive data at rest (certificates, secrets)
6. **Just-In-Time**: Validate provisioned users have appropriate roles
7. **Enforce SSO**: Organizations can enforce SSO-only login

## Roadmap

### Phase 3.5.1: Advanced Features
- [ ] Multi-provider selection per workspace
- [ ] Conditional access rules (time-based, location-based)
- [ ] SSO synchronization (sync user attributes on every login)
- [ ] Group/team auto-provisioning from IdP

### Phase 3.5.2: Security Enhancements
- [ ] Hardware token support (FIDO2/WebAuthn)
- [ ] Step-up authentication for sensitive operations
- [ ] Risk-based authentication (adaptive MFA)
- [ ] Session binding to device fingerprint

### Phase 3.5.3: Integration & Analytics
- [ ] IdP metadata auto-discovery
- [ ] Single Logout (SLO) implementation
- [ ] SSO analytics dashboard
- [ ] IdP compatibility reports

### Phase 3.5.4: Enterprise Features
- [ ] SAML attribute transformation rules
- [ ] Custom consent screens
- [ ] Session lifetime management
- [ ] Workspace-specific SSO policies
