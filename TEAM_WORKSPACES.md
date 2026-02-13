# Team Workspaces Architecture

## Overview

The Team Workspaces system enables multi-user collaboration in Mastiff with proper isolation, role-based access, and team management. Organizations can create multiple workspaces with different teams and members.

**Key Features**:
- Organizations as top-level containers
- Workspaces for team collaboration
- Teams within workspaces for sub-groups
- Role-based member management (owner, admin, editor, viewer)
- Workspace-scoped data isolation
- Complete audit trail
- Feature flagging per workspace
- Workspace invitations with token expiration

## Architecture

### Hierarchy

```
Organization
├── Workspace 1
│   ├── Team A
│   │   ├── Member 1 (lead)
│   │   └── Member 2 (member)
│   ├── Team B
│   │   └── Member 1 (lead)
│   └── Member (not in team)
└── Workspace 2
    ├── Team X
    └── Team Y
```

### Data Model

```
Organizations (top-level container)
  ↓
Workspaces (collaboration spaces)
  ├── Members (workspace-level roles)
  ├── Teams (sub-groups)
  │   └── TeamMembers (team-level roles)
  ├── Features (feature flags & limits)
  ├── Invites (pending invitations)
  └── AuditLog (all actions)
```

### Context Flow

Every request operates within a workspace context:

```
Request
  ↓
Authentication (user, workspace, role)
  ↓
Authorization (role-based permissions)
  ↓
Audit Log (track action)
  ↓
Execute (with workspace isolation)
```

## Database Schema

### Organizations Table

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo TEXT,
  website TEXT,
  
  -- Plan
  plan TEXT DEFAULT 'free',              -- 'free' | 'pro' | 'enterprise'
  billing_email TEXT,
  max_workspaces DECIMAL DEFAULT 5,
  max_members DECIMAL DEFAULT 10,
  
  settings JSONB,
  metadata JSONB,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE INDEX (slug)
);
```

**Fields Explanation**:
- `slug`: URL-friendly identifier (e.g., "acme-corp")
- `plan`: Subscription tier determining limits
- `settings`: Organization-wide settings (theme, defaults)
- `metadata`: Extensible custom data

### Workspaces Table

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  
  -- Type
  type TEXT DEFAULT 'team',              -- 'personal' | 'team' | 'project'
  is_public BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  
  -- Default LLM
  default_llm_model_id UUID,
  
  settings JSONB,
  metadata JSONB,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE INDEX (organization_id, slug),
  INDEX (is_archived),
  INDEX (organization_id)
);
```

**Key Features**:
- Scoped to organization (multi-tenant safe)
- Type indicates purpose (personal workspace, team workspace, project)
- `is_archived` for soft-delete
- Default LLM model for workspace

### Workspace Members Table

```sql
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL,
  
  -- Role & Permissions
  role TEXT NOT NULL,                    -- 'owner' | 'admin' | 'editor' | 'viewer'
  permissions JSONB,
  
  -- Status
  status TEXT DEFAULT 'active',          -- 'active' | 'invited' | 'suspended'
  invite_token TEXT,
  invite_expires_at TIMESTAMP,
  
  last_active_at TIMESTAMP,
  metadata JSONB,
  
  joined_at TIMESTAMP DEFAULT NOW(),
  invited_at TIMESTAMP,
  invited_by UUID,
  suspended_at TIMESTAMP,
  suspended_by UUID,
  
  INDEX (workspace_id),
  INDEX (user_id),
  INDEX (status),
  INDEX (role)
);
```

**Role Definitions**:
- **Owner**: Full control, can delete workspace, manage billing
- **Admin**: Manage members, teams, settings, but not org settings
- **Editor**: Create/edit content, add members to teams
- **Viewer**: Read-only access

### Teams Table

```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  
  type TEXT DEFAULT 'general',           -- 'general' | 'project' | 'department'
  is_private BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  
  settings JSONB,
  metadata JSONB,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE INDEX (workspace_id, slug),
  INDEX (is_archived)
);
```

**Use Cases**:
- **General**: Public discussion/work area
- **Project**: Specific project collaboration
- **Department**: Department-specific workspace

### Workspace Invites Table

```sql
CREATE TABLE workspace_invites (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  
  -- Token
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending',         -- 'pending' | 'accepted' | 'rejected' | 'expired'
  accepted_at TIMESTAMP,
  accepted_by UUID,
  
  invite_message TEXT,
  custom_data JSONB,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (workspace_id),
  INDEX (email),
  INDEX (status),
  UNIQUE INDEX (token)
);
```

**Invite Flow**:
1. Admin sends invite (7-day expiry)
2. Email with invite link (contains token)
3. User clicks link and accepts
4. Auto-added as workspace member

### Workspace Audit Table

```sql
CREATE TABLE workspace_audit (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  action TEXT NOT NULL,                  -- 'create' | 'update' | 'delete' | 'invite'
  resource_type TEXT NOT NULL,           -- 'workspace' | 'member' | 'team' | 'data'
  resource_id UUID,
  resource_name TEXT,
  
  before JSONB,
  after JSONB,
  changes JSONB,
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (workspace_id),
  INDEX (user_id),
  INDEX (action),
  INDEX (resource_type),
  INDEX (created_at)
);
```

**Audit Information**:
- All actions logged (create, update, delete, invite, remove)
- Before/after for change tracking
- Used for compliance, debugging, security
- 90-day retention by default

### Workspace Features Table

```sql
CREATE TABLE workspace_features (
  id UUID PRIMARY KEY,
  workspace_id UUID UNIQUE NOT NULL REFERENCES workspaces(id),
  
  -- Feature Flags
  notebooks_enabled BOOLEAN DEFAULT true,
  templates_enabled BOOLEAN DEFAULT true,
  data_connectors_enabled BOOLEAN DEFAULT true,
  collaboration_enabled BOOLEAN DEFAULT true,
  scheduled_reports_enabled BOOLEAN DEFAULT true,
  custom_agents_enabled BOOLEAN DEFAULT false,
  sso_enabled BOOLEAN DEFAULT false,
  advanced_rbac_enabled BOOLEAN DEFAULT false,
  
  -- Limits
  max_data_connectors DECIMAL DEFAULT 10,
  max_notebooks DECIMAL DEFAULT 50,
  max_templates DECIMAL DEFAULT 100,
  max_scheduled_reports DECIMAL DEFAULT 20,
  
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Feature Levels**:
- **Free**: Basic features, single workspace
- **Pro**: Multiple workspaces, SSO, advanced features
- **Enterprise**: Custom agents, unlimited resources, multiple teams

## API Endpoints

### Organizations

#### POST /api/workspaces/orgs
Create organization.

```json
{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "description": "The leading roadrunner anvil company",
  "website": "https://acme.example.com"
}
```

### Workspaces

#### POST /api/workspaces
Create workspace.

```json
{
  "organizationId": "org-123",
  "name": "Data Analytics",
  "slug": "data-analytics",
  "description": "Team workspace for analytics",
  "type": "team"
}
```

**Response**:
```json
{
  "success": true,
  "workspaceId": "ws-456",
  "message": "Created workspace: Data Analytics"
}
```

#### GET /api/workspaces
List user's workspaces.

**Query**:
- `limit`: 50 (default)
- `offset`: 0

**Response**:
```json
{
  "success": true,
  "workspaces": [
    {
      "id": "ws-456",
      "name": "Data Analytics",
      "slug": "data-analytics",
      "type": "team",
      "members": [{...}],
      "teams": [{...}],
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "count": 1
}
```

#### GET /api/workspaces/:id
Get workspace details.

**Response**:
```json
{
  "success": true,
  "workspace": {
    "id": "ws-456",
    "organizationId": "org-123",
    "name": "Data Analytics",
    "slug": "data-analytics",
    "description": "Team workspace for analytics",
    "type": "team",
    "isPublic": false,
    "isArchived": false,
    "defaultLLMModelId": "llm-789",
    "members": [{...}],
    "teams": [{...}],
    "features": {...},
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

#### PUT /api/workspaces/:id
Update workspace.

**Request**:
```json
{
  "name": "Analytics & Reporting",
  "description": "Updated description",
  "defaultLLMModelId": "new-llm-id"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Workspace updated"
}
```

#### DELETE /api/workspaces/:id
Archive workspace.

**Response**:
```json
{
  "success": true,
  "message": "Workspace archived"
}
```

### Members

#### POST /api/workspaces/:id/members
Add member to workspace.

**Request**:
```json
{
  "userId": "user-123",
  "role": "editor"
}
```

**Response**:
```json
{
  "success": true,
  "memberId": "member-456",
  "message": "Added member with role: editor"
}
```

#### GET /api/workspaces/:id/members
List workspace members.

**Query**:
- `limit`: 100
- `offset`: 0

**Response**:
```json
{
  "success": true,
  "members": [
    {
      "id": "member-456",
      "userId": "user-123",
      "role": "editor",
      "status": "active",
      "joinedAt": "2024-01-15T10:00:00Z",
      "lastActiveAt": "2024-01-16T14:30:00Z"
    }
  ],
  "count": 1
}
```

#### PUT /api/workspaces/:id/members/:userId
Update member role.

**Request**:
```json
{
  "role": "admin"
}
```

#### DELETE /api/workspaces/:id/members/:userId
Remove member from workspace.

**Response**:
```json
{
  "success": true,
  "message": "Member removed"
}
```

### Invitations

#### POST /api/workspaces/:id/invite
Create workspace invitation.

**Request**:
```json
{
  "email": "newuser@example.com",
  "role": "editor",
  "inviteMessage": "Welcome to our analytics team!"
}
```

**Response**:
```json
{
  "success": true,
  "inviteId": "invite-789",
  "token": "inv_abc123def456",
  "message": "Sent invite to newuser@example.com"
}
```

**Email Content**:
```
Subject: Invited to join Acme Corp - Data Analytics

You've been invited to join the Data Analytics workspace.

Click here to accept: https://mastiff.example.com/accept-invite?token=inv_abc123def456

This invite expires in 7 days.
```

#### POST /api/workspaces/invite/accept
Accept workspace invitation.

**Request**:
```json
{
  "token": "inv_abc123def456"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Invite accepted"
}
```

### Teams

#### POST /api/workspaces/:id/teams
Create team.

**Request**:
```json
{
  "name": "Analytics Team",
  "slug": "analytics-team",
  "description": "Core analytics team",
  "type": "project"
}
```

**Response**:
```json
{
  "success": true,
  "teamId": "team-789",
  "message": "Created team: Analytics Team"
}
```

#### GET /api/workspaces/:id/teams
List teams in workspace.

**Response**:
```json
{
  "success": true,
  "teams": [
    {
      "id": "team-789",
      "name": "Analytics Team",
      "slug": "analytics-team",
      "type": "project",
      "isPrivate": false,
      "members": [{...}],
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ],
  "count": 1
}
```

### Features & Settings

#### GET /api/workspaces/:id/features
Get workspace features & limits.

**Response**:
```json
{
  "success": true,
  "features": {
    "notebooksEnabled": true,
    "templatesEnabled": true,
    "dataConnectorsEnabled": true,
    "collaborationEnabled": true,
    "scheduledReportsEnabled": true,
    "customAgentsEnabled": false,
    "ssoEnabled": false,
    "advancedRbacEnabled": false,
    "maxDataConnectors": 10,
    "maxNotebooks": 50,
    "maxTemplates": 100,
    "maxScheduledReports": 20
  }
}
```

#### PUT /api/workspaces/:id/features
Update workspace features.

**Request**:
```json
{
  "customAgentsEnabled": true,
  "ssoEnabled": true,
  "maxDataConnectors": 20
}
```

### Audit Logs

#### GET /api/workspaces/:id/audit
Get workspace audit logs.

**Query**:
- `action`: Filter by action
- `resourceType`: Filter by resource type
- `limit`: 100
- `offset`: 0

**Response**:
```json
{
  "success": true,
  "logs": [
    {
      "id": "audit-123",
      "workspaceId": "ws-456",
      "userId": "user-123",
      "action": "add_workspace_member",
      "resourceType": "workspace_member",
      "resourceId": "member-456",
      "before": null,
      "after": {
        "role": "editor",
        "status": "active"
      },
      "changes": {
        "role": ["", "editor"]
      },
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

## Role-Based Access Control

### Permission Matrix

```
┌─────────────────────┬───────┬───────┬────────┬────────┐
│ Action              │ Owner │ Admin │ Editor │ Viewer │
├─────────────────────┼───────┼───────┼────────┼────────┤
│ View Workspace      │  ✓    │  ✓    │   ✓    │   ✓    │
│ Edit Workspace      │  ✓    │  ✓    │   ✗    │   ✗    │
│ Add Members         │  ✓    │  ✓    │   ✗    │   ✗    │
│ Remove Members      │  ✓    │  ✓    │   ✗    │   ✗    │
│ Update Member Role  │  ✓    │  ✓    │   ✗    │   ✗    │
│ Create Teams        │  ✓    │  ✓    │   ✓    │   ✗    │
│ Edit Teams          │  ✓    │  ✓    │   ✓    │   ✗    │
│ Create Content      │  ✓    │  ✓    │   ✓    │   ✗    │
│ Edit Content        │  ✓    │  ✓    │   ✓    │   ✗    │
│ Delete Content      │  ✓    │  ✓    │   ✓    │   ✗    │
│ Manage Features     │  ✓    │  ✓    │   ✗    │   ✗    │
│ View Audit Logs     │  ✓    │  ✓    │   ✗    │   ✗    │
│ View Analytics      │  ✓    │  ✓    │   ✓    │   ✓    │
│ Delete Workspace    │  ✓    │   ✗   │   ✗    │   ✗    │
│ Manage Billing      │  ✓    │   ✗   │   ✗    │   ✗    │
└─────────────────────┴───────┴───────┴────────┴────────┘
```

## Integration with Existing Features

All existing features now work within workspace context:

### Data Connectors
```typescript
// Scope connectors to workspace
const connectors = await connectorService.list({
  workspaceId,
  userId
});
```

### Notebooks
```typescript
// Each notebook belongs to workspace
const notebooks = await notebookService.list({
  workspaceId,
  userId
});
```

### Templates
```typescript
// Templates shared within workspace
const templates = await templateService.listWorkspaceTemplates({
  workspaceId,
  userId
});
```

### LLM Models
```typescript
// Each workspace has default LLM model
const provider = await llmManagement.getDefaultProvider(workspaceId);
```

### Scheduled Reports
```typescript
// Reports generated within workspace context
const reports = await reportService.list({
  workspaceId,
  userId
});
```

## Middleware Integration

### Workspace Context Middleware

```typescript
// middleware/workspaceContext.ts
export async function withWorkspaceContext(
  request: NextRequest,
  handler: (req: NextRequest, context: WorkspaceContext) => Promise<Response>
) {
  const session = await getSession();
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  
  // Get workspace member record
  const member = await workspaceMemberService.getMember(workspaceId, session.user.id);
  
  const context: WorkspaceContext = {
    workspaceId,
    userId: session.user.id,
    role: member.role,
    permissions: calculatePermissions(member.role),
    teamIds: await getTeamMemberships(member.id)
  };
  
  return handler(request, context);
}
```

### Usage in API Routes

```typescript
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withWorkspaceContext(request, async (req, context) => {
    if (!context.permissions.canEditWorkspace) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Use context.workspaceId for all database queries
  });
}
```

## Usage Examples

### Create Organization & Workspace

```typescript
// 1. Create organization
const orgId = await organizationService.createOrganization(
  {
    name: 'Acme Corp',
    slug: 'acme-corp',
    website: 'https://acme.example.com'
  },
  userId
);

// 2. Create workspace in organization
const workspaceId = await workspaceService.createWorkspace(
  {
    organizationId: orgId,
    name: 'Analytics Team',
    slug: 'analytics-team',
    type: 'team'
  },
  userId
);

// 3. Add members
await workspaceMemberService.addMember(workspaceId, userId2, 'editor', userId);
await workspaceMemberService.addMember(workspaceId, userId3, 'viewer', userId);

// 4. Create teams
const teamId = await teamService.createTeam(
  workspaceId,
  {
    name: 'Core Analytics',
    slug: 'core-analytics',
    type: 'project'
  },
  userId
);

// 5. Add team members
const memberRecord = await workspaceMemberService.getMember(workspaceId, userId2);
await teamService.addTeamMember(teamId, memberRecord.id, 'member', userId);
```

### Invite User Flow

```typescript
// 1. Send invitation
const { inviteId, token } = await workspaceMemberService.inviteMember(
  workspaceId,
  'newuser@example.com',
  'editor',
  userId
);

// 2. User receives email with token

// 3. User clicks link and accepts
await workspaceMemberService.acceptInvite(token, newUserId);

// 4. User is now workspace member with 'editor' role
```

### Multi-Workspace User

```typescript
// User with access to multiple workspaces
const workspaces = await workspaceService.getUserWorkspaces(userId);

// workspaces = [
//   { id: 'ws-1', name: 'Marketing Team', role: 'admin' },
//   { id: 'ws-2', name: 'Engineering Team', role: 'editor' },
//   { id: 'ws-3', name: 'Personal Analytics', role: 'owner' }
// ]

// Switch context to specific workspace
const workspace = await workspaceService.getWorkspace('ws-2');
// Now all operations are scoped to this workspace
```

## Security Considerations

### Multi-Tenancy Isolation

1. **Query Scoping**: All queries include workspace filter
   ```sql
   WHERE workspace_id = $1 AND user_id IN (SELECT user_id FROM workspace_members WHERE workspace_id = $1)
   ```

2. **Row-Level Security**: Database constraints prevent cross-workspace access
   ```sql
   CREATE POLICY workspace_isolation ON workspaces
   AS SELECT (auth.uid() IN (SELECT user_id FROM workspace_members));
   ```

3. **Audit Trail**: All actions logged with workspace context
   ```typescript
   await auditLogger.log({
     workspaceId,
     userId,
     action,
     details
   });
   ```

### Role-Based Protection

1. **Permission Checking**:
   ```typescript
   if (!permissions.canAddMembers) {
     throw new ForbiddenError('Not authorized to add members');
   }
   ```

2. **Team Isolation**: Members can only access teams they're in
   ```typescript
   const teamMembers = await teamService.getTeamMembers(teamId);
   if (!teamMembers.includes(userId)) {
     throw new ForbiddenError('Not a team member');
   }
   ```

## Performance Optimization

### Indexing Strategy

```sql
-- Frequently queried columns
CREATE INDEX idx_workspace_members_user_workspace ON workspace_members(user_id, workspace_id);
CREATE INDEX idx_teams_workspace ON teams(workspace_id, is_archived);
CREATE INDEX idx_audit_workspace_action ON workspace_audit(workspace_id, action);
```

### Caching

```typescript
// Cache member role for 5 minutes
const cacheKey = `workspace:${workspaceId}:member:${userId}`;
const cached = await cache.get(cacheKey);

if (!cached) {
  const member = await workspaceMemberService.getMember(workspaceId, userId);
  await cache.set(cacheKey, member, 300);
}
```

## Roadmap

**Phase 3.2** (Current):
- ✅ Organization & workspace creation
- ✅ Member management & invitations
- ✅ Team sub-groups
- ✅ Feature flagging per workspace
- ✅ Audit logging
- ⏳ UI for workspace management

**Phase 3.3+**:
- SSO team auto-mapping
- Workspace resource limits
- Workspace billing
- Workspace templates
- Workspace analytics
- Advanced team hierarchy
