/**
 * Advanced RBAC Database Schema
 * 
 * Fine-grained role-based access control with custom permissions
 */

import { pgTable, text, boolean, timestamp, uuid, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Roles Table
 * Define custom roles with specific permissions
 */
export const rolesTable = pgTable(
    'roles',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        name: text('name').notNull(), // 'admin', 'editor', 'analyst', etc.
        slug: text('slug').notNull(), // URL-friendly identifier
        description: text('description'),

        // Distinguishes built-in vs custom
        isSystem: boolean('is_system').notNull().default(false),
        isEditable: boolean('is_editable').notNull().default(true),

        // Metadata
        color: text('color'), // For UI display
        icon: text('icon'), // For UI display
        metadata: jsonb('metadata'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('roles_workspace_id_idx').on(table.workspaceId),
            slugIdx: uniqueIndex('roles_slug_idx').on(table.workspaceId, table.slug),
        };
    }
);

/**
 * Permissions Table
 * Granular permissions (e.g., 'notebooks:create', 'members:delete')
 */
export const permissionsTable = pgTable(
    'permissions',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        // Permission identifier format: resource:action
        code: text('code').notNull().unique(), // 'notebooks:create', 'members:invite'
        resourceType: text('resource_type').notNull(), // 'notebooks', 'members', 'templates', etc.
        action: text('action').notNull(), // 'create', 'read', 'update', 'delete', 'invite', etc.

        // Human-readable
        name: text('name').notNull(),
        description: text('description'),

        // Permission category for UI grouping
        category: text('category').notNull(), // 'workspace', 'content', 'members', 'templates', etc.
        riskLevel: text('risk_level').notNull().default('low'), // 'low', 'medium', 'high', 'critical'

        // Metadata
        metadata: jsonb('metadata'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            codeIdx: uniqueIndex('permissions_code_idx').on(table.code),
            resourceTypeIdx: index('permissions_resource_type_idx').on(table.resourceType),
            actionIdx: index('permissions_action_idx').on(table.action),
        };
    }
);

/**
 * Role Permissions Junction Table
 * Maps roles to permissions
 */
export const rolePermissionsTable = pgTable(
    'role_permissions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        roleId: uuid('role_id').notNull(),
        permissionId: uuid('permission_id').notNull(),

        // Allow conditional permissions (e.g., only own resources)
        condition: jsonb('condition'), // {resource: 'own_content_only'}

        // Audit
        grantedAt: timestamp('granted_at').notNull().defaultNow(),
        grantedBy: uuid('granted_by'),
    },
    (table) => {
        return {
            roleIdIdx: index('role_permissions_role_id_idx').on(table.roleId),
            permissionIdIdx: index('role_permissions_permission_id_idx').on(table.permissionId),
            uniqueIdx: uniqueIndex('role_permissions_unique_idx').on(table.roleId, table.permissionId),
        };
    }
);

/**
 * User Roles Table
 * Maps users to roles in a workspace
 */
export const userRolesTable = pgTable(
    'user_roles',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        userId: uuid('user_id').notNull(),
        roleId: uuid('role_id').notNull(),

        // Temporary role grants
        expiresAt: timestamp('expires_at'), // For time-limited access
        revokedAt: timestamp('revoked_at'), // Soft-delete
        revokedBy: uuid('revoked_by'),

        // Audit
        grantedAt: timestamp('granted_at').notNull().defaultNow(),
        grantedBy: uuid('granted_by'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('user_roles_workspace_id_idx').on(table.workspaceId),
            userIdIdx: index('user_roles_user_id_idx').on(table.userId),
            roleIdIdx: index('user_roles_role_id_idx').on(table.roleId),
            uniqueIdx: uniqueIndex('user_roles_unique_idx').on(table.workspaceId, table.userId, table.roleId),
        };
    }
);

/**
 * Resource-Level Permissions
 * Fine-grained permissions on specific resources
 */
export const resourcePermissionsTable = pgTable(
    'resource_permissions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),

        // Resource being restricted
        resourceType: text('resource_type').notNull(), // 'notebook', 'template', 'connector', etc.
        resourceId: uuid('resource_id').notNull(),

        // Subject (user or role)
        subjectType: text('subject_type').notNull(), // 'user' | 'role' | 'team'
        subjectId: uuid('subject_id').notNull(),

        // Permissions granted
        permissions: jsonb('permissions').notNull(), // ['read', 'write', 'share']
        accessLevel: text('access_level').notNull(), // 'owner' | 'editor' | 'viewer'

        // Inheritance
        inherited: boolean('inherited').notNull().default(false),
        inheritedFrom: uuid('inherited_from'), // Parent resource ID

        // Audit
        grantedAt: timestamp('granted_at').notNull().defaultNow(),
        grantedBy: uuid('granted_by'),
        expiresAt: timestamp('expires_at'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('resource_permissions_workspace_id_idx').on(table.workspaceId),
            resourceIdx: index('resource_permissions_resource_idx').on(table.resourceType, table.resourceId),
            subjectIdx: index('resource_permissions_subject_idx').on(table.subjectType, table.subjectId),
        };
    }
);

/**
 * ABAC Attributes Table
 * Attribute-based access control for complex policies
 */
export const attributesTable = pgTable(
    'attributes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),

        // Entity being attributed
        entityType: text('entity_type').notNull(), // 'user', 'resource', 'environment'
        entityId: uuid('entity_id').notNull(),

        // Attribute key-value pairs
        attributeName: text('attribute_name').notNull(), // 'department', 'location', 'clearance_level'
        attributeValue: text('attribute_value').notNull(), // 'engineering', 'us-west', 'top-secret'
        attributeType: text('attribute_type').notNull(), // 'string', 'number', 'boolean', 'date'

        // Metadata
        metadata: jsonb('metadata'),

        // Audit
        setAt: timestamp('set_at').notNull().defaultNow(),
        setBy: uuid('set_by'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('attributes_workspace_id_idx').on(table.workspaceId),
            entityIdx: index('attributes_entity_idx').on(table.entityType, table.entityId),
            attributeIdx: index('attributes_attribute_idx').on(table.attributeName, table.attributeValue),
        };
    }
);

/**
 * Access Policies Table
 * Complex conditional policies (e.g., IF department == 'engineering' AND clearance_level >= 3 THEN allow)
 */
export const policiesTable = pgTable(
    'policies',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        name: text('name').notNull(),
        description: text('description'),

        // Policy definition
        rules: jsonb('rules').notNull(), // Array of conditions
        effect: text('effect').notNull(), // 'allow' | 'deny'
        priority: text('priority').notNull().default('medium'), // 'low', 'medium', 'high'

        // Applies to
        resourceType: text('resource_type'), // If null, applies to all resources
        actions: jsonb('actions'), // ['create', 'read', 'delete']

        // Status
        isActive: boolean('is_active').notNull().default(true),

        // Metadata
        metadata: jsonb('metadata'),

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
        updatedAt: timestamp('updated_at').notNull().defaultNow(),
        createdBy: uuid('created_by'),
    },
    (table) => {
        return {
            workspaceIdIdx: index('policies_workspace_id_idx').on(table.workspaceId),
            resourceTypeIdx: index('policies_resource_type_idx').on(table.resourceType),
            isActiveIdx: index('policies_is_active_idx').on(table.isActive),
        };
    }
);

/**
 * Permission Audit Log
 * Track all permission changes for compliance
 */
export const permissionAuditTable = pgTable(
    'permission_audit',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        workspaceId: uuid('workspace_id').notNull(),
        userId: uuid('user_id').notNull(),

        // Action
        action: text('action').notNull(), // 'grant', 'revoke', 'update', 'delete'
        target: text('target').notNull(), // 'role', 'user', 'resource', 'policy'
        targetId: uuid('target_id'),
        targetName: text('target_name'),

        // Changes
        changes: jsonb('changes'),
        reason: text('reason'),

        // Impact
        affectedUsers: text('affected_users') // CSV or JSON of affected users

        // Audit
        createdAt: timestamp('created_at').notNull().defaultNow(),
    },
    (table) => {
        return {
            workspaceIdIdx: index('permission_audit_workspace_id_idx').on(table.workspaceId),
            userIdIdx: index('permission_audit_user_id_idx').on(table.userId),
            actionIdx: index('permission_audit_action_idx').on(table.action),
            targetIdx: index('permission_audit_target_idx').on(table.target),
            createdAtIdx: index('permission_audit_created_at_idx').on(table.createdAt),
        };
    }
);

/**
 * Relations
 */
export const rolesRelations = relations(rolesTable, ({ one, many }) => ({
    workspace: one({ ref: () => workspacesTable }, {
        fields: [rolesTable.workspaceId],
        references: [workspacesTable.id],
    }),
    permissions: many(rolePermissionsTable),
    userRoles: many(userRolesTable),
}));

export const permissionsRelations = relations(permissionsTable, ({ many }) => ({
    roles: many(rolePermissionsTable),
}));

export const rolePermissionsRelations = relations(rolePermissionsTable, ({ one }) => ({
    role: one(rolesTable, {
        fields: [rolePermissionsTable.roleId],
        references: [rolesTable.id],
    }),
    permission: one(permissionsTable, {
        fields: [rolePermissionsTable.permissionId],
        references: [permissionsTable.id],
    }),
}));

export const userRolesRelations = relations(userRolesTable, ({ one }) => ({
    workspace: one({ ref: () => workspacesTable }, {
        fields: [userRolesTable.workspaceId],
        references: [workspacesTable.id],
    }),
    role: one(rolesTable, {
        fields: [userRolesTable.roleId],
        references: [rolesTable.id],
    }),
}));

export const resourcePermissionsRelations = relations(resourcePermissionsTable, ({ one }) => ({
    workspace: one({ ref: () => workspacesTable }, {
        fields: [resourcePermissionsTable.workspaceId],
        references: [workspacesTable.id],
    }),
}));

export const attributesRelations = relations(attributesTable, ({ one }) => ({
    workspace: one({ ref: () => workspacesTable }, {
        fields: [attributesTable.workspaceId],
        references: [workspacesTable.id],
    }),
}));

export const policiesRelations = relations(policiesTable, ({ one }) => ({
    workspace: one({ ref: () => workspacesTable }, {
        fields: [policiesTable.workspaceId],
        references: [workspacesTable.id],
    }),
}));

export const permissionAuditRelations = relations(permissionAuditTable, ({ one }) => ({
    workspace: one({ ref: () => workspacesTable }, {
        fields: [permissionAuditTable.workspaceId],
        references: [workspacesTable.id],
    }),
}));

// Forward reference for workspace table
export const workspacesTable = pgTable('workspaces', {
    id: uuid('id').primaryKey(),
});
