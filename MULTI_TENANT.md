# Multi-Tenant Architecture - Phase 3.7

## Overview

The Multi-Tenant Architecture provides complete logical isolation, compliance, and resource management for enterprise deployments. This enables a single Mastiff instance to serve multiple organizations with guaranteed data isolation, compliance enforcement, and per-tenant customization.

### Key Capabilities

- **Complete Data Isolation**: PostgreSQL Row-Level Security (RLS) for enforced multi-tenancy
- **Compliance & Audit**: HIPAA, GDPR, SOC 2, PCI-DSS support with comprehensive logging
- **Resource Quotas**: Per-tenant rate limits, storage, user, and token quotas
- **Billing & Usage Tracking**: Automated metering and cost calculation per tenant
- **Data Residency**: Regional deployment options with data sovereignty
- **Feature Flags**: Per-tenant feature enablement and customization
- **Tenant Suspension/Termination**: Account lifecycle management
- **Data Export (GDPR)**: Automated data portability for compliance
- **Multi-region Migration**: Zero-downtime tenant migration between regions

### Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│           User Requests / API Gateway                │
├─────────────────────────────────────────────────────┤
│         RBAC + Context Middleware                    │
│    (Adds organizationId to request context)          │
├─────────────────────────────────────────────────────┤
│         Business Logic Services                      │
│    (TenantService, BYOMService, ChatService, etc)    │
├─────────────────────────────────────────────────────┤
│         Row-Level Security (PostgreSQL)              │
│    (RLS policies enforce tenant isolation at DB)     │
├─────────────────────────────────────────────────────┤
│         PostgreSQL Databases                         │
│    (Separate schema per tenant or shared schema)     │
└─────────────────────────────────────────────────────┘
```

## Database Schema

### tenant_registry
Global registry of all tenants with configuration and compliance metadata.

```sql
CREATE TABLE tenant_registry (
    id UUID PRIMARY KEY,
    organization_id UUID UNIQUE NOT NULL,
    
    -- Organization Identity
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    
    -- Tier and Billing
    tier TEXT DEFAULT 'free', -- 'free' | 'pro' | 'enterprise' | 'custom'
    billing_cycle TEXT DEFAULT 'monthly',
    billing_email TEXT NOT NULL,
    stripe_customer_id TEXT,
    billing_status TEXT DEFAULT 'active',
    
    -- Data Residency
    data_region TEXT DEFAULT 'us-east-1', -- AWS region for data storage
    
    -- Compliance Features
    hipaa_enabled BOOLEAN,
    gdpr_enabled BOOLEAN,
    sox_enabled BOOLEAN,
    pci_enabled BOOLEAN,
    compliance_requirements JSONB,
    
    -- Feature Flags
    features JSONB, -- {customAgents: true, byom: true}
    feature_flags JSONB, -- {maxModels: 50}
    
    -- Resource Quotas
    max_users DECIMAL,
    max_workspaces DECIMAL,
    max_models DECIMAL,
    max_daily_tokens DECIMAL,
    max_storage_gb DECIMAL,
    max_agents DECIMAL,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_suspended BOOLEAN DEFAULT false,
    suspension_reason TEXT,
    suspension_date TIMESTAMP,
    
    -- API Access
    has_api_access BOOLEAN DEFAULT false,
    api_rate_limit DECIMAL DEFAULT 1000, -- req/min
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    onboarded_at TIMESTAMP
);
```

**Key Fields**:
- **organization_id**: References the top-level organization
- **tier**: Controls available features and quotas
- **data_region**: AWS region for compliance (data residency)
- **compliance_requirements**: Flags for HIPAA, GDPR, SOC2, PCI
- **feature_flags**: Per-tenant customization
- **max_* quotas**: Resource limits for billing enforcement

### tenant_databases
Track database connections and schema isolation per tenant.

```sql
CREATE TABLE tenant_databases (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Database Configuration
    database_name TEXT NOT NULL,
    schema_name TEXT UNIQUE NOT NULL,
    connection_string TEXT, -- Encrypted
    encryption_key TEXT,
    is_primary BOOLEAN DEFAULT false,
    
    -- Replication
    read_replica_count DECIMAL,
    is_replicated BOOLEAN,
    
    -- Connection Pool
    max_connections DECIMAL DEFAULT 100,
    current_connections DECIMAL,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP
);
```

### tenant_isolation_policies
Define Row-Level Security policies for tenant data enforcement.

```sql
CREATE TABLE tenant_isolation_policies (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Policy Definition
    policy_name TEXT NOT NULL,
    table_name TEXT NOT NULL,
    policy_type TEXT, -- 'organization' | 'workspace' | 'user'
    
    -- RLS Configuration
    rls_expression TEXT NOT NULL, -- PostgreSQL RLS policy
    is_enabled BOOLEAN DEFAULT true,
    
    -- Enforcement
    enforce_on_write BOOLEAN DEFAULT true,
    enforce_on_read BOOLEAN DEFAULT true
);
```

**RLS Policy Examples**:
```sql
-- Organization-level isolation
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON conversations
    FOR ALL USING (organization_id = current_user_organization_id());

-- Workspace isolation
CREATE POLICY workspace_isolation ON documents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workspaces w
            WHERE w.id = documents.workspace_id
                AND w.organization_id = current_user_organization_id()
        )
    );

-- User isolation (personal data)
CREATE POLICY user_isolation ON user_settings
    FOR ALL USING (user_id = current_user_id());
```

### tenant_resources
Track resource usage per tenant for billing and quota enforcement.

```sql
CREATE TABLE tenant_resources (
    id UUID PRIMARY KEY,
    organization_id UUID,
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    
    -- Compute Usage
    total_api_calls DECIMAL,
    total_tokens_processed DECIMAL,
    total_compute_seconds DECIMAL,
    
    -- Storage Usage
    database_size_gb DECIMAL,
    file_storage_gb DECIMAL,
    backup_storage_gb DECIMAL,
    
    -- Peak Metrics
    peak_concurrent_connections DECIMAL,
    peak_daily_api_calls DECIMAL,
    
    -- Cost Calculation
    estimated_cost_usd DECIMAL,
    actual_cost_usd DECIMAL
);
```

### tenant_compliance_logs
Comprehensive audit trail for compliance and security.

```sql
CREATE TABLE tenant_compliance_logs (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Event Information
    event_type TEXT, -- 'data_access' | 'data_export' | 'user_provision'
    resource_type TEXT,
    resource_id UUID,
    
    -- Who and What
    actor_id UUID,
    actor_type TEXT, -- 'user' | 'service'
    action TEXT, -- 'read' | 'write' | 'delete'
    
    -- Compliance Flags
    is_pii_accessed BOOLEAN,
    is_phi_accessed BOOLEAN,
    data_classification TEXT, -- 'public' | 'confidential'
    
    -- Network & Security
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    
    -- Result
    status TEXT, -- 'success' | 'denied'
    timestamp TIMESTAMP DEFAULT NOW()
);
```

### tenant_data_export
Track data exports for GDPR compliance (right to data portability).

```sql
CREATE TABLE tenant_data_export (
    id UUID PRIMARY KEY,
    organization_id UUID,
    user_id UUID,
    
    -- Export Details
    export_type TEXT, -- 'user_data' | 'full_export'
    scope TEXT, -- 'self' | 'organization'
    format TEXT DEFAULT 'json',
    
    -- Processing
    status TEXT DEFAULT 'pending', -- 'ready' | 'expired'
    progress_percent DECIMAL,
    download_url TEXT,
    
    -- Timing
    data_size_bytes DECIMAL,
    processing_time_seconds DECIMAL,
    expires_at TIMESTAMP,
    requested_at TIMESTAMP
);
```

### tenant_suspension_history
Track tenant suspension and termination history.

```sql
CREATE TABLE tenant_suspension_history (
    id UUID PRIMARY KEY,
    organization_id UUID,
    
    -- Suspension Details
    suspension_type TEXT, -- 'automatic' | 'manual' | 'compliance'
    reason_category TEXT, -- 'payment' | 'abuse' | 'compliance'
    reason_details TEXT,
    
    -- Timeline
    suspended_at TIMESTAMP,
    scheduled_deletion_at TIMESTAMP,
    resolved_at TIMESTAMP,
    
    -- Resolution
    was_resolved BOOLEAN DEFAULT false,
    resolution_action TEXT, -- 'reactivated' | 'deleted'
    
    -- Data Handling
    data_backup_created BOOLEAN DEFAULT true,
    backup_retention_days DECIMAL DEFAULT 30
);
```

## API Endpoints

### Tenant Management

#### Onboard New Tenant
```http
POST /api/tenant
Authorization: Bearer admin-token
Content-Type: application/json

{
    "action": "onboard",
    "organizationId": "org-123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "email": "admin@acme.com",
    "billingEmail": "billing@acme.com",
    "tier": "pro",
    "dataRegion": "us-west-2",
    "supportTier": "premium"
}
```

**Response** (201):
```json
{
    "tenant": {
        "id": "tenant-1",
        "organization_id": "org-123",
        "name": "Acme Corp",
        "tier": "pro",
        "is_active": true,
        "max_users": 500,
        "max_workspaces": 20,
        "created_at": "2024-01-15T10:00:00Z"
    },
    "message": "Tenant onboarded successfully"
}
```

#### Get Tenant Configuration
```http
GET /api/tenant?action=get&organizationId=org-123
Authorization: Bearer user-token
```

**Response**:
```json
{
    "tenant": {
        "id": "tenant-1",
        "organization_id": "org-123",
        "name": "Acme Corp",
        "tier": "pro",
        "data_region": "us-west-2",
        "features": {
            "customAgents": true,
            "byom": true,
            "samlSSO": true
        },
        "compliance_requirements": {
            "hipaa": false,
            "gdpr": true,
            "sox": false
        }
    }
}
```

#### Check Resource Quotas
```http
GET /api/tenant?action=quotas&organizationId=org-123
Authorization: Bearer user-token
```

**Response**:
```json
{
    "quotas": {
        "users": { "current": 245, "limit": 500, "percentUsed": 49 },
        "workspaces": { "current": 8, "limit": 20, "percentUsed": 40 },
        "models": { "current": 3, "limit": 50, "percentUsed": 6 },
        "dailyTokens": { "current": 45000000, "limit": 100000000, "percentUsed": 45 },
        "storage": { "current": 32.5, "limit": 100, "percentUsed": 32.5 }
    }
}
```

#### Update Tenant Configuration
```http
PUT /api/tenant
Authorization: Bearer user-token
Content-Type: application/json

{
    "organizationId": "org-123",
    "name": "Acme Corp Updated",
    "supportTier": "enterprise",
    "maxUsers": 1000,
    "maxWorkspaces": 50
}
```

**Response**:
```json
{
    "tenant": { ... }
}
```

### Compliance & Audit

#### Get Audit Trail
```http
GET /api/tenant?action=audit&organizationId=org-123&limit=100
Authorization: Bearer admin-token
```

**Response**:
```json
{
    "auditTrail": [
        {
            "id": "log-1",
            "event_type": "data_access",
            "resource_type": "document",
            "actor_id": "user-456",
            "action": "read",
            "status": "success",
            "is_pii_accessed": false,
            "timestamp": "2024-01-15T10:45:00Z"
        },
        {
            "id": "log-2",
            "event_type": "user_provision",
            "action": "create",
            "status": "success",
            "timestamp": "2024-01-15T10:30:00Z"
        }
    ]
}
```

#### Get Compliance Status
```http
GET /api/tenant?action=compliance&organizationId=org-123
Authorization: Bearer admin-token
```

**Response**:
```json
{
    "compliance": {
        "organization_id": "org-123",
        "compliance_requirements": {
            "hipaa": false,
            "gdpr": true,
            "sox": false,
            "pci": false
        },
        "data_encryption_enabled": true,
        "api_rate_limiting_enabled": true,
        "audit_logging_enabled": true,
        "pii_masking_enabled": true,
        "phi_access_logged": false
    }
}
```

#### Enable Compliance Features
```http
POST /api/tenant
Authorization: Bearer admin-token
Content-Type: application/json

{
    "action": "enable-compliance",
    "organizationId": "org-123",
    "hipaa": true,
    "gdpr": true,
    "sox": false,
    "pci": false
}
```

### Resource Management

#### Get Usage Statistics
```http
GET /api/tenant?action=usage&organizationId=org-123&startDate=2024-01-01&endDate=2024-01-31
Authorization: Bearer admin-token
```

**Response**:
```json
{
    "usage": {
        "totalApiCalls": 1250000,
        "totalTokens": 78500000,
        "totalComputeSeconds": 25000,
        "maxDbSize": 45.3,
        "maxStorageSize": 32.5
    }
}
```

#### Record Usage for Billing
```http
POST /api/tenant
Authorization: Bearer service-token
Content-Type: application/json

{
    "action": "record-usage",
    "organizationId": "org-123",
    "periodStart": "2024-01-01T00:00:00Z",
    "periodEnd": "2024-01-31T23:59:59Z",
    "apiCalls": 1250000,
    "tokensProcessed": 78500000,
    "computeSeconds": 25000,
    "dbSizeGb": 45.3,
    "fileSizeGb": 32.5,
    "peakConcurrentConnections": 250,
    "peakDailyApiCalls": 50000
}
```

**Response** (201):
```json
{
    "resource": {
        "id": "resource-1",
        "organization_id": "org-123",
        "period_start": "2024-01-01T00:00:00Z",
        "total_api_calls": 1250000,
        "total_tokens_processed": 78500000,
        "estimated_cost_usd": 245.50
    }
}
```

### Compliance & Data Portability

#### Request Data Export (GDPR)
```http
POST /api/tenant
Authorization: Bearer user-token
Content-Type: application/json

{
    "action": "export-data",
    "organizationId": "org-123",
    "userId": "user-456",
    "exportType": "user_data",
    "format": "json",
    "scope": "self"
}
```

**Response** (201):
```json
{
    "export": {
        "id": "export-1",
        "status": "pending",
        "exportType": "user_data",
        "requestedAt": "2024-01-15T10:00:00Z"
    },
    "message": "Data export requested"
}
```

#### Log Compliance Event
```http
POST /api/tenant
Authorization: Bearer service-token
Content-Type: application/json

{
    "action": "log-compliance",
    "organizationId": "org-123",
    "eventType": "data_access",
    "resourceType": "document",
    "action": "read",
    "isPiiAccessed": false,
    "isPhiAccessed": false,
    "status": "success",
    "ipAddress": "192.168.1.1",
    "requestId": "req-123"
}
```

### Tenant Lifecycle

#### Suspend Tenant
```http
POST /api/tenant
Authorization: Bearer admin-token
Content-Type: application/json

{
    "action": "suspend",
    "organizationId": "org-123",
    "suspensionType": "manual",
    "reasonCategory": "compliance",
    "reasonDetails": "Failed SOC2 audit",
    "scheduledDeletionDays": 30
}
```

**Response**:
```json
{
    "suspension": {
        "id": "suspension-1",
        "suspension_type": "manual",
        "suspended_at": "2024-01-15T10:00:00Z",
        "scheduled_deletion_at": "2024-02-14T10:00:00Z"
    }
}
```

#### Reactivate Tenant
```http
POST /api/tenant
Authorization: Bearer admin-token
Content-Type: application/json

{
    "action": "reactivate",
    "organizationId": "org-123"
}
```

#### Terminate Account
```http
POST /api/tenant
Authorization: Bearer user-token
Content-Type: application/json

{
    "action": "terminate",
    "organizationId": "org-123",
    "reason": "Company shutting down",
    "dataRetentionDays": 30
}
```

### Migration

#### Schedule Multi-Region Migration
```http
POST /api/tenant
Authorization: Bearer admin-token
Content-Type: application/json

{
    "action": "schedule-migration",
    "organizationId": "org-123",
    "targetRegion": "eu-west-1",
    "migrationDate": "2024-02-01T00:00:00Z"
}
```

**Response** (201):
```json
{
    "migration": {
        "id": "migration-1",
        "source_region": "us-east-1",
        "target_region": "eu-west-1",
        "status": "planned",
        "scheduled_start": "2024-02-01T00:00:00Z"
    }
}
```

## Service Usage

### Onboard and Configure Tenant

```typescript
import { TenantService } from '@/src/services/tenantService';

// Onboard new organization
const tenant = await TenantService.onboardTenant({
  organizationId: 'org-123',
  name: 'Acme Corp',
  slug: 'acme-corp',
  email: 'admin@acme.com',
  billingEmail: 'billing@acme.com',
  tier: 'enterprise',
  dataRegion: 'eu-west-1',
  supportTier: 'premium',
});

// Enable RLS for tenant
await TenantService.enableRLS(tenant.organization_id);

// Enable compliance features
await TenantService.enableCompliance(tenant.organization_id, {
  hipaa: true,
  gdpr: true,
  sox: true,
});
```

### Track Usage and Billing

```typescript
// Record monthly usage for billing
await TenantService.recordUsage('org-123', {
  periodStart: new Date('2024-01-01'),
  periodEnd: new Date('2024-01-31'),
  apiCalls: 1250000,
  tokensProcessed: 78500000,
  computeSeconds: 25000,
  dbSizeGb: 45.3,
  fileSizeGb: 32.5,
  peakConcurrentConnections: 250,
  peakDailyApiCalls: 50000,
});

// Get usage statistics and cost
const stats = await TenantService.getUsageStats(
  'org-123',
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

console.log(stats);
// {
//   totalApiCalls: 1250000,
//   totalTokens: 78500000,
//   totalComputeSeconds: 25000,
// }
```

### Compliance and Audit

```typescript
// Log data access event
await TenantService.logComplianceEvent('org-123', {
  eventType: 'data_access',
  resourceType: 'document',
  resourceId: 'doc-456',
  actorId: 'user-789',
  action: 'read',
  isPiiAccessed: true,
  isPhiAccessed: false,
  status: 'success',
  ipAddress: '192.168.1.1',
  requestId: 'req-123',
});

// Get audit trail with filters
const auditLog = await TenantService.getAuditTrail('org-123', {
  isPiiAccessed: true,
  dateRange: {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31'),
  },
  limit: 100,
});
```

### Data Export (GDPR)

```typescript
// Request data export
const exportRecord = await TenantService.requestDataExport('org-123', {
  userId: 'user-456',
  exportType: 'user_data',
  format: 'json',
  scope: 'self',
});

// Complete export (after processing)
await TenantService.completeDataExport(exportRecord.id, {
  downloadUrl: 'https://cdn.example.com/exports/export-1.json',
  dataSizeBytes: 125000,
  processingTimeSeconds: 45,
});
```

### Tenant Suspension and Termination

```typescript
// Suspend tenant for compliance
await TenantService.suspendTenant('org-123', {
  suspensionType: 'compliance',
  reasonCategory: 'compliance',
  reasonDetails: 'Failed security audit',
  scheduledDeletionDays: 90,
  suspendedBy: 'admin-user',
});

// Reactivate after issue resolved
await TenantService.reactivateTenant('org-123', 'admin-user');

// Terminate account
await TenantService.terminateTenant('org-123', {
  reason: 'Company dissolution',
  terminatedBy: 'user-123',
  dataRetentionDays: 30,
});
```

## Security Best Practices

### Row-Level Security (RLS)

1. **Enable RLS on all tenant-scoped tables**:
   ```sql
   ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
   ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
   ```

2. **Set security context in queries**:
   ```typescript
   // Add organization_id to context before queries
   db.query('SET app.current_organization_id = $1', [organizationId]);
   ```

3. **Test isolation with cross-tenant queries** (should return 0 results)

### Compliance & Audit

1. **Log all PII/PHI access**:
   - Flag `is_pii_accessed` and `is_phi_accessed` in compliance logs
   - Regular audits for unauthorized access

2. **Implement data retention policies**:
   - GDPR: 30-day data export availability
   - HIPAA: 6-year retention after account termination
   - SOC2: Indefinite audit trail (immutable logs)

3. **Encryption**:
   - All API keys stored encrypted in database
   - TLS 1.2+ for all network traffic
   - Database-level encryption at rest

### Quota Enforcement

1. **Implement soft and hard limits**:
   - Soft limit: warning at 80% usage
   - Hard limit: block requests at 100% usage
   - Daily token reset at midnight UTC

2. **Rate limiting**:
   - Per-organization API rate limits
   - Per-user rate limits within organization
   - Burst allowance for legitimate spikes

## Roadmap

### Phase 3.7.1: Multi-Region Deployment
- [ ] Automated region failover
- [ ] Cross-region read replicas
- [ ] Eventually consistent replication
- [ ] Conflict resolution strategies

### Phase 3.7.2: Advanced Billing
- [ ] Metered billing integration (Stripe, AWS)
- [ ] Reserved capacity discounts
- [ ] Commit-based pricing
- [ ] Usage analytics dashboard

### Phase 3.7.3: Tenant Customization
- [ ] Custom branding (logo, colors, domain)
- [ ] Email customization (templates, sender)
- [ ] Role definitions per tenant
- [ ] Custom integrations (webhooks, API)

### Phase 3.7.4: Advanced Compliance
- [ ] Automated SOC2 compliance checks
- [ ] HIPAA audit report generation
- [ ] PII data discovery and masking
- [ ] Data residency enforcement
- [ ] Breach notification automation

### Phase 3.7.5: Performance Optimization
- [ ] Query performance optimization per tenant workload
- [ ] Connection pooling tuning
- [ ] Caching strategies for multi-tenant data
- [ ] Cost optimization recommendations
