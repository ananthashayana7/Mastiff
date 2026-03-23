/**
 * Team Workspaces Database Schema
 * 
 * Multi-team collaboration with workspace isolation
 * Supports organizations, workspaces, teams, and members
 */

import { pgTable, text, boolean, timestamp, uuid, decimal, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Organizations Table
 * Top-level container for multiple workspaces
 */
export const organizationsTable = pgTable(
    'organizations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull(),
        slug: text('slug').notNull().unique(), // URL-friendly identifier
        description: text('description'),
        logo: text('logo'), // URL to logo
        website: text('website'),

        // Plan information
        plan: text('plan').notNull().default('free'), // 'free' | 'pro' | 'enterprise'
        billingEmail: text('billing_email'),
        maxWorkspaces: decimal('max_workspaces', { precision: 5, scale: 0 }).default('5'),
        maxMembers: decimal('max_members', { precision: 5, scale: 0 }).default('10'),

        // Settings
        settings: jsonb('settings'), // Custom org settings
        metadata: jsonb('metadata'),

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            slugIdx: uniqueIndex('orgs_slug_idx').on(table.slug),
        };
    }
);

/**
 * Workspaces Table
 * Team workspaces for collaboration
 */
export const workspacesTable = pgTable(
    'workspaces',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        organizationId: uuid('organization_id').notNull(),
        name: text('name').notNull(),
        slug: text('slug').notNull(), // Unique within org
        description: text('description'),
        icon: text('icon'), // Emoji or icon identifier

        // Workspace type
        type: text('type').notNull().default('team'), // 'personal' | 'team' | 'project'
        isPublic: boolean('is_public').notNull().default(false),
        isArchived: boolean('is_archived').notNull().default(false),

        // Workspace settings
        settings: jsonb('settings'), // Theme, defaults, etc.
        metadata: jsonb('metadata'),

        // Default LLM model for workspace
        defaultLLMModelId: uuid('default_llm_model_id'),

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            orgIdIdx: index('workspaces_organization_id_idx').on(table.organizationId),
            slugIdx: uniqueIndex('workspaces_slug_idx').on(table.organizationId, table.slug),
            isArchivedIdx: index('workspaces_is_archived_idx').on(table.isArchived),
        };
    }
);

/**
 * Workspace Members Table
 * Links users to workspaces with roles
 */
export const workspaceMembersTable = pgTable(
    'workspace_members',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        userId: uuid('user_id').notNull(),

        // Role
        role: text('role').notNull(), // 'owner' | 'admin' | 'editor' | 'viewer'
        permissions: jsonb('permissions'), // Custom permission overrides

        // Status
        status: text('status').notNull().default('active'), // 'active' | 'invited' | 'suspended'
        inviteToken: text('invite_token'), // For pending invites
        inviteExpiresAt: timestamp('invite_expires_at'),

        // Metadata
        lastActiveAt: timestamp('last_active_at'),
        metadata: jsonb('metadata'),

        // Audit
        joinedAt: timestamp('joined_at').notNull().defaultNow(),
        invitedAt: timestamp('invited_at'),
        invitedBy: uuid('invited_by'),
        suspendedAt: timestamp('suspended_at'),
        suspendedBy: uuid('suspended_by'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('workspace_members_workspace_id_idx').on(table.workspaceId),
            userIdIdx: index('workspace_members_user_id_idx').on(table.userId),
            statusIdx: index('workspace_members_status_idx').on(table.status),
            roleIdx: index('workspace_members_role_idx').on(table.role),
        };
    }
);

/**
 * Teams Table
 * Sub-groups within workspaces
 */
export const teamsTable = pgTable(
    'teams',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        name: text('name').notNull(),
        slug: text('slug').notNull(),
        description: text('description'),

        // Team type
        type: text('type').notNull().default('general'), // 'general' | 'project' | 'department'
        isPrivate: boolean('is_private').notNull().default(false),
        isArchived: boolean('is_archived').notNull().default(false),

        // Metadata
        settings: jsonb('settings'),
        metadata: jsonb('metadata'),

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('teams_workspace_id_idx').on(table.workspaceId),
            slugIdx: uniqueIndex('teams_slug_idx').on(table.workspaceId, table.slug),
            isArchivedIdx: index('teams_is_archived_idx').on(table.isArchived),
        };
    }
);

/**
 * Team Members Table
 * Links workspace members to teams
 */
export const teamMembersTable = pgTable(
    'team_members',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        teamId: uuid('team_id').notNull(),
        workspaceMemberId: uuid('workspace_member_id').notNull(),

        // Role within team (can differ from workspace role)
        role: text('role').notNull().default('member'), // 'lead' | 'member'

        // Metadata
        metadata: jsonb('metadata'),

        // Audit
        joinedAt: timestamp('joined_at').notNull().defaultNow(),
        leftAt: timestamp('left_at'),
    },
    (table) => {
        return {
            teamIdIdx: index('team_members_team_id_idx').on(table.teamId),
            workspaceMemberIdIdx: index('team_members_workspace_member_id_idx').on(table.workspaceMemberId),
        };
    }
);

/**
 * Workspace Invites Table
 * Track pending and accepted invitations
 */
export const workspaceInvitesTable = pgTable(
    'workspace_invites',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        email: text('email').notNull(),
        role: text('role').notNull(), // Default role for invitee

        // Token for accepting invite
        token: text('token').notNull().unique(),
        expiresAt: timestamp('expires_at').notNull(),

        // Status
        status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'rejected' | 'expired'
        acceptedAt: timestamp('accepted_at'),
        acceptedBy: uuid('accepted_by'),

        // Metadata
        inviteMessage: text('invite_message'),
        customData: jsonb('custom_data'),

        // Audit
        createdBy: uuid('created_by').notNull(),
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('workspace_invites_workspace_id_idx').on(table.workspaceId),
            emailIdx: index('workspace_invites_email_idx').on(table.email),
            tokenIdx: uniqueIndex('workspace_invites_token_idx').on(table.token),
            statusIdx: index('workspace_invites_status_idx').on(table.status),
        };
    }
);

/**
 * Workspace Audit Log
 * Track all actions in workspace
 */
export const workspaceAuditTable = pgTable(
    'workspace_audit',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        userId: uuid('user_id').notNull(),

        // Action details
        action: text('action').notNull(), // 'create' | 'update' | 'delete' | 'invite' | 'remove' | etc
        resourceType: text('resource_type').notNull(), // 'workspace' | 'member' | 'team' | 'data' | etc
        resourceId: uuid('resource_id'),
        resourceName: text('resource_name'),

        // Change details
        before: jsonb('before'),
        after: jsonb('after'),
        changes: jsonb('changes'), // Specific field changes
        metadata: jsonb('metadata'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('workspace_audit_workspace_id_idx').on(table.workspaceId),
            userIdIdx: index('workspace_audit_user_id_idx').on(table.userId),
            actionIdx: index('workspace_audit_action_idx').on(table.action),
            resourceTypeIdx: index('workspace_audit_resource_type_idx').on(table.resourceType),
            createdAtIdx: index('workspace_audit_created_at_idx').on(table.createdAt),
        };
    }
);

/**
 * Workspace Features Table
 * Enable/disable features per workspace
 */
export const workspaceFeaturesTable = pgTable(
    'workspace_features',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull().unique(),

        // Feature flags
        notebooksEnabled: boolean('notebooks_enabled').notNull().default(true),
        templatesEnabled: boolean('templates_enabled').notNull().default(true),
        dataConnectorsEnabled: boolean('data_connectors_enabled').notNull().default(true),
        collaborationEnabled: boolean('collaboration_enabled').notNull().default(true),
        scheduledReportsEnabled: boolean('scheduled_reports_enabled').notNull().default(true),
        customAgentsEnabled: boolean('custom_agents_enabled').notNull().default(false),
        ssoEnabled: boolean('sso_enabled').notNull().default(false),
        advancedRbacEnabled: boolean('advanced_rbac_enabled').notNull().default(false),

        // Limits
        maxDataConnectors: decimal('max_data_connectors', { precision: 5, scale: 0 }).default('10'),
        maxNotebooks: decimal('max_notebooks', { precision: 5, scale: 0 }).default('50'),
        maxTemplates: decimal('max_templates', { precision: 5, scale: 0 }).default('100'),
        maxScheduledReports: decimal('max_scheduled_reports', { precision: 5, scale: 0 }).default('20'),

        // Metadata
        metadata: jsonb('metadata'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('workspace_features_workspace_id_idx').on(table.workspaceId),
        };
    }
);

/**
 * Relations
 */
export const organizationsRelations = relations(organizationsTable, ({ many }) => ({
    workspaces: many(workspacesTable),
}));

export const workspacesRelations = relations(workspacesTable, ({ one, many }) => ({
    organization: one(organizationsTable, {
        fields: [workspacesTable.organizationId],
        references: [organizationsTable.id],
    }),
    members: many(workspaceMembersTable),
    teams: many(teamsTable),
    invites: many(workspaceInvitesTable),
    auditLogs: many(workspaceAuditTable),
    features: one(workspaceFeaturesTable, {
        fields: [workspacesTable.id],
        references: [workspaceFeaturesTable.workspaceId],
    }),
}));

export const workspaceMembersRelations = relations(workspaceMembersTable, ({ one, many }) => ({
    workspace: one(workspacesTable, {
        fields: [workspaceMembersTable.workspaceId],
        references: [workspacesTable.id],
    }),
    teamMemberships: many(teamMembersTable),
}));

export const teamsRelations = relations(teamsTable, ({ one, many }) => ({
    workspace: one(workspacesTable, {
        fields: [teamsTable.workspaceId],
        references: [workspacesTable.id],
    }),
    members: many(teamMembersTable),
}));

export const teamMembersRelations = relations(teamMembersTable, ({ one }) => ({
    team: one(teamsTable, {
        fields: [teamMembersTable.teamId],
        references: [teamsTable.id],
    }),
    workspaceMember: one(workspaceMembersTable, {
        fields: [teamMembersTable.workspaceMemberId],
        references: [workspaceMembersTable.id],
    }),
}));

export const workspaceInvitesRelations = relations(workspaceInvitesTable, ({ one }) => ({
    workspace: one(workspacesTable, {
        fields: [workspaceInvitesTable.workspaceId],
        references: [workspacesTable.id],
    }),
}));

export const workspaceAuditRelations = relations(workspaceAuditTable, ({ one }) => ({
    workspace: one(workspacesTable, {
        fields: [workspaceAuditTable.workspaceId],
        references: [workspacesTable.id],
    }),
}));

export const workspaceFeaturesRelations = relations(workspaceFeaturesTable, ({ one }) => ({
    workspace: one(workspacesTable, {
        fields: [workspaceFeaturesTable.workspaceId],
        references: [workspacesTable.id],
    }),
}));
