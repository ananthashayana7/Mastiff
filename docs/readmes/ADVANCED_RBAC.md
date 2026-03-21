# Advanced RBAC System

## Overview

The Advanced RBAC (Role-Based Access Control) system provides fine-grained permission management with support for:
- **Role-Based Access Control (RBAC)**: Permissions grouped into roles
- **Attribute-Based Access Control (ABAC)**: Policies based on user/resource attributes
- **Resource-Level Permissions**: Fine-grained sharing (notebook, template, connector level)
- **Dynamic Policies**: Complex conditional access rules
- **Time-Limited Access**: Roles with expiration dates
- **Complete Audit Trail**: All permission changes tracked

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│            Permission Check Request                     │
└────────────────┬────────────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │  RBAC Engine    │
        │  (Policy Engine)│
        └────────┬────────┘
                 │
    ┌────────────┼────────────┬──────────────┐
    │            │            │              │
┌───▼──────┐ ┌──▼──────┐ ┌──▼───────┐ ┌──▼──────┐
│Role-Based│ │Resource-│ │Attribute-│ │Temporal │
│Perms     │ │Level    │ │Based     │ │Expiry   │
└──────────┘ └─────────┘ └──────────┘ └─────────┘
```

### Permission Check Flow

```
User Action
  ↓
Check Role Permissions (RBAC)
  ↓ (pass)
Check Resource Permissions
  ↓ (pass)
Check Attribute Policies (ABAC)
  ↓ (pass)
Check Temporal Constraints
  ↓ (pass)
✓ ALLOW | ✗ DENY
```

## Database Schema

### Permissions Table

```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,          -- 'notebooks:create'
  resource_type TEXT NOT NULL,        -- 'notebooks'
  action TEXT NOT NULL,               -- 'create'
  
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,             -- 'workspace' | 'content' | 'members'
  risk_level TEXT DEFAULT 'low',      -- 'low' | 'medium' | 'high' | 'critical'
  
  UNIQUE INDEX (code)
);
```

**Permission Categories**:
- **Workspace**: `workspace:manage`, `workspace:invite`, `workspace:delete`
- **Content**: `notebooks:create`, `notebooks:edit`, `templates:share`, `connectors:delete`
- **Members**: `members:invite`, `members:manage`, `members:suspend`
- **Admin**: `rbac:manage`, `audit:view`, `policies:create`

### Roles Table

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,                 -- 'Senior Analyst'
  slug TEXT NOT NULL,                 -- 'senior-analyst'
  description TEXT,
  
  is_system BOOLEAN DEFAULT false,    -- Built-in (admin, editor, viewer)
  is_editable BOOLEAN DEFAULT true,
  
  color TEXT,                         -- UI color for role
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Built-in Roles**:
- **Owner**: Full control
- **Admin**: Manage members, settings, audit logs
- **Editor**: Create/edit content
- **Viewer**: Read-only access

**Custom Roles**: Workspace admins can create custom roles with specific permissions.

### Role Permissions Junction Table

```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES roles(id),
  permission_id UUID NOT NULL REFERENCES permissions(id),
  
  -- Conditional permission
  condition JSONB,                    -- {resource: 'own_content_only'}
  
  granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID NOT NULL,
  
  UNIQUE INDEX (role_id, permission_id)
);
```

**Conditional Permissions**:
```json
{
  "condition": {
    "scope": "own_content_only",      // User can only access own resources
    "departmentMatch": true            // Only same department
  }
}
```

### User Roles Table

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id),
  
  -- Temporary roles
  expires_at TIMESTAMP,               -- For time-limited access
  revoked_at TIMESTAMP,               -- Soft-delete
  revoked_by UUID,
  
  granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID NOT NULL,
  
  UNIQUE INDEX (workspace_id, user_id, role_id)
);
```

**Use Cases**:
- Permanent role: `expires_at = NULL`
- Time-limited access: `expires_at = 2024-03-31`
- Contract worker: Auto-revoke on date

### Resource Permissions Table

```sql
CREATE TABLE resource_permissions (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  
  -- Target resource
  resource_type TEXT NOT NULL,        -- 'notebook' | 'template' | 'connector'
  resource_id UUID NOT NULL,
  
  -- Subject (who has access)
  subject_type TEXT NOT NULL,         -- 'user' | 'role' | 'team'
  subject_id UUID NOT NULL,
  
  -- Permissions
  permissions JSONB NOT NULL,         -- ['read', 'write', 'share']
  access_level TEXT NOT NULL,         -- 'owner' | 'editor' | 'viewer'
  
  -- Inheritance
  inherited BOOLEAN DEFAULT false,
  inherited_from UUID,                -- Parent folder/project
  
  granted_at TIMESTAMP DEFAULT NOW(),
  granted_by UUID NOT NULL,
  expires_at TIMESTAMP,               -- Temporary access
  
  INDEX (workspace_id, resource_type, resource_id),
  INDEX (subject_type, subject_id)
);
```

**Access Levels**:
- **Owner**: Create, read, update, delete, share, revoke
- **Editor**: Read, create, update, delete
- **Viewer**: Read-only

### Attributes Table (ABAC)

```sql
CREATE TABLE attributes (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  
  -- Entity
  entity_type TEXT NOT NULL,          -- 'user' | 'resource' | 'environment'
  entity_id UUID NOT NULL,
  
  -- Attribute
  attribute_name TEXT NOT NULL,       -- 'department' | 'location' | 'clearance_level'
  attribute_value TEXT NOT NULL,      -- 'engineering' | 'us-west-2' | '3'
  attribute_type TEXT NOT NULL,       -- 'string' | 'number' | 'boolean' | 'date'
  
  set_at TIMESTAMP DEFAULT NOW(),
  set_by UUID,
  
  INDEX (entity_type, entity_id),
  INDEX (attribute_name, attribute_value)
);
```

**Example Attributes**:
```
user:123 → department: engineering
user:123 → clearance_level: 3
user:123 → location: us-west-2
user:123 → team_lead: true

notebook:456 → sensitivity: confidential
notebook:456 → data_classification: pii
```

### Policies Table (ABAC Rules)

```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Policy definition
  rules JSONB NOT NULL,               -- Array of conditions
  effect TEXT NOT NULL,               -- 'allow' | 'deny'
  priority TEXT DEFAULT 'medium',     -- 'low' | 'medium' | 'high'
  
  -- Scope
  resource_type TEXT,                 -- null = all resources
  actions JSONB,                      -- ['read', 'write']
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP,
  created_by UUID
);
```

**Policy Example**:
```json
{
  "name": "Engineering team access",
  "effect": "allow",
  "priority": "high",
  "actions": ["read", "write"],
  "rules": [
    {
      "type": "attribute",
      "attribute": "department",
      "operator": "eq",
      "value": "engineering"
    },
    {
      "type": "attribute",
      "attribute": "clearance_level",
      "operator": "gte",
      "value": "2"
    }
  ]
}
```

### Permission Audit Table

```sql
CREATE TABLE permission_audit (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  action TEXT NOT NULL,               -- 'grant' | 'revoke' | 'update'
  target TEXT NOT NULL,               -- 'role' | 'user' | 'resource'
  target_id UUID,
  target_name TEXT,
  
  changes JSONB,                      -- What changed
  reason TEXT,                        -- Why (compliance reason)
  affected_users TEXT,                -- Who was affected
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (workspace_id),
  INDEX (action),
  INDEX (created_at)
);
```

## API Endpoints

### Role Management

#### POST /api/rbac/roles
Create custom role.

```json
{
  "workspaceId": "ws-123",
  "name": "Senior Analyst",
  "slug": "senior-analyst",
  "description": "Can create/edit reports and share with team",
  "color": "#FF6B6B"
}
```

**Response**:
```json
{
  "success": true,
  "roleId": "role-456",
  "message": "Created role: Senior Analyst"
}
```

#### POST /api/rbac/roles/:roleId/permissions
Grant permission to role.

```json
{
  "permissionId": "perm-789"
}
```

#### DELETE /api/rbac/roles/:roleId/permissions/:permissionId
Revoke permission from role.

### User Role Assignment

#### POST /api/rbac/users/:userId/roles
Assign role to user.

```json
{
  "workspaceId": "ws-123",
  "roleId": "role-456",
  "expiresAt": "2024-12-31"  // Optional: time-limited access
}
```

#### DELETE /api/rbac/users/:userId/roles/:roleId
Revoke role from user.

**Query**:
- `workspaceId` (required)

#### GET /api/rbac/users/:userId/permissions
Get user's effective permissions.

**Response**:
```json
{
  "success": true,
  "permissions": [
    "workspace:manage",
    "notebooks:create",
    "notebooks:edit",
    "templates:share"
  ],
  "count": 4
}
```

### Permission Directory

#### POST /api/rbac/permissions
List all permissions (optionally by category).

```json
{
  "category": "content"  // Optional
}
```

**Response**:
```json
{
  "success": true,
  "permissions": [
    {
      "id": "perm-123",
      "code": "notebooks:create",
      "resourceType": "notebooks",
      "action": "create",
      "name": "Create Notebooks",
      "category": "content",
      "riskLevel": "low"
    }
  ],
  "count": 12
}
```

#### GET /api/rbac/permissions/:code
Get specific permission details.

### Resource Sharing

#### POST /api/rbac/resources/:resourceId/share
Grant access to resource.

```json
{
  "workspaceId": "ws-123",
  "resourceType": "notebook",
  "subjectType": "user",        // 'user' | 'role' | 'team'
  "subjectId": "user-456",
  "permissions": ["read", "write"],
  "expiresAt": "2024-06-30"     // Optional: temporary access
}
```

#### GET /api/rbac/resources/:resourceId/permissions
Get resource access list.

**Query**:
- `workspaceId` (required)
- `resourceType` (default: notebook)

**Response**:
```json
{
  "success": true,
  "permissions": [
    {
      "id": "share-123",
      "subjectType": "user",
      "subjectId": "user-456",
      "permissions": ["read", "write"],
      "accessLevel": "editor",
      "grantedAt": "2024-01-15T10:00:00Z",
      "expiresAt": "2024-06-30T23:59:59Z"
    },
    {
      "id": "share-124",
      "subjectType": "role",
      "subjectId": "role-789",
      "permissions": ["read"],
      "accessLevel": "viewer"
    }
  ]
}
```

#### DELETE /api/rbac/resources/:resourceId/share/:subjectId
Revoke resource access.

**Query**:
- `workspaceId` (required)
- `resourceType` (default: notebook)
- `subjectType` (default: user)

### Policies

#### POST /api/rbac/policies
Create access policy.

```json
{
  "workspaceId": "ws-123",
  "name": "Engineering-only notebooks",
  "description": "Only engineering team can access confidential notebooks",
  "effect": "allow",
  "priority": "high",
  "resourceType": "notebook",
  "actions": ["read", "write"],
  "rules": [
    {
      "type": "attribute",
      "attribute": "department",
      "operator": "eq",
      "value": "engineering"
    },
    {
      "type": "attribute",
      "attribute": "clearance_level",
      "operator": "gte",
      "value": "2"
    }
  ]
}
```

#### PUT /api/rbac/policies/:id
Update policy.

#### DELETE /api/rbac/policies/:id
Delete policy.

### Permission Checking

#### GET /api/rbac/check
Check if user has permission.

**Query**:
- `workspaceId` (required)
- `action` (required): Permission code
- `resourceType` (optional): Check resource type
- `resourceId` (optional): Check specific resource

**Response**:
```json
{
  "success": true,
  "hasPermission": true
}
```

**Example Calls**:
```
GET /api/rbac/check?workspaceId=ws-123&action=notebooks:create
GET /api/rbac/check?workspaceId=ws-123&action=notebooks:delete&resourceType=notebook&resourceId=nb-456
GET /api/rbac/check?workspaceId=ws-123&action=connectors:execute&resourceType=connector&resourceId=conn-789
```

## Permission Categories

### Workspace Management
- `workspace:manage` - Edit workspace settings
- `workspace:invite` - Invite users
- `workspace:delete` - Delete workspace
- `workspace:archive` - Archive workspace

### Content Operations
- `notebooks:create` - Create new notebooks
- `notebooks:read` - View notebooks
- `notebooks:edit` - Edit notebooks
- `notebooks:delete` - Delete notebooks
- `notebooks:execute` - Run notebook cells
- `templates:create` - Create templates
- `templates:share` - Share templates
- `connectors:create` - Create data connectors
- `connectors:test` - Test connectors
- `connectors:execute` - Run queries
- `reports:create` - Create scheduled reports
- `reports:schedule` - Schedule reports
- `reports:delete` - Delete reports

### Collaboration
- `members:invite` - Invite workspace members
- `members:manage` - Manage member roles
- `members:suspend` - Suspend members
- `teams:create` - Create teams
- `teams:manage` - Manage teams

### Administration
- `rbac:manage` - Create roles, manage permissions
- `audit:view` - View audit logs
- `audit:export` - Export audit logs
- `policies:create` - Create policies
- `policies:manage` - Manage policies

### LLM Configuration
- `llm:configure` - Add LLM providers
- `llm:switch` - Switch active provider
- `llm:view-costs` - View LLM costs

## Service Usage

### Check Permission

```typescript
import { rbacEngine } from '@/src/services/rbacService';

const hasPermission = await rbacEngine.hasPermission({
  userId: 'user-123',
  workspaceId: 'ws-456',
  action: 'notebooks:create'
});

if (!hasPermission) {
  throw new ForbiddenError('User cannot create notebooks');
}
```

### Check Resource Permission

```typescript
const canEdit = await rbacEngine.hasPermission({
  userId: 'user-123',
  workspaceId: 'ws-456',
  resourceType: 'notebook',
  resourceId: 'nb-789',
  action: 'edit'
});
```

### Share Resource

```typescript
import { resourcePermissionService } from '@/src/services/rbacService';

await resourcePermissionService.grantResourcePermission(
  'ws-456',        // workspaceId
  'notebook',      // resourceType
  'nb-789',        // resourceId
  'user',          // subjectType
  'user-999',      // subjectId
  ['read', 'write'], // permissions
  'user-123'       // grantedBy
);
```

### Create Policy

```typescript
import { policyService } from '@/src/services/rbacService';

const policyId = await policyService.createPolicy(
  'ws-456',
  {
    name: 'Confidential data access',
    effect: 'allow',
    resourceType: 'notebook',
    rules: [
      {
        type: 'attribute',
        attribute: 'clearance_level',
        operator: 'gte',
        value: '3'
      }
    ]
  },
  'admin-user-123'
);
```

## Audit Trail

All permission changes are logged with:
- Who made the change
- What changed (before/after)
- When it happened
- Why (reason if provided)
- Impact (affected users)

**Example Audit Entry**:
```json
{
  "id": "audit-123",
  "workspaceId": "ws-456",
  "userId": "admin-123",
  "action": "grant_permission",
  "target": "role",
  "targetId": "role-456",
  "targetName": "Senior Analyst",
  "changes": {
    "permissionId": "perm-789",
    "permissionCode": "notebooks:create"
  },
  "reason": "Promote team member to analyst role",
  "affectedUsers": ["user-456", "user-789"],
  "createdAt": "2024-01-15T10:30:00Z"
}
```

## Security Best Practices

1. **Principle of Least Privilege**: Grant minimum necessary permissions
2. **Separation of Duties**: Split sensitive operations across roles
3. **Regular Review**: Audit permissions quarterly
4. **Temporal Constraints**: Use expiration dates for temporary access
5. **Deny Precedence**: Deny rules override allow rules
6. **Attribute Validation**: Ensure attributes are trustworthy

## Roadmap

**Phase 3.3** (Current):
- ✅ RBAC engine (role-based permissions)
- ✅ Resource-level permissions
- ✅ ABAC policies (attribute-based rules)
- ✅ Permission audit trail
- ✅ API endpoints
- ⏳ UI for permission management

**Phase 3.4+**:
- Policy builder UI
- Permission simulation
- Risk assessment
- OAuth scope mapping
- Fine-grained resource hierarchies
- Delegation (user A can grant their permissions to B)
