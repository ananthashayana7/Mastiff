/**
 * Template Schema
 * 
 * Database schema for pre-built analysis templates
 */

import { pgTable, uuid, text, integer, timestamp, jsonb, index, varchar, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

/**
 * Templates table - Pre-built analysis workflows
 */
export const templates = pgTable(
    'templates',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => users.id).notNull(),
        
        name: varchar('name', { length: 255 }).notNull(),
        description: text('description'),
        category: varchar('category', { length: 100 }), // e.g. 'segmentation', 'forecasting', 'churn'
        
        // Template configuration
        inputs: jsonb('inputs'), // Required inputs from user
        steps: jsonb('steps'), // Template steps (notebook cells + queries)
        outputs: jsonb('outputs'), // Expected outputs
        
        // Metadata
        version: integer('version').default(1),
        tags: text('tags'), // Comma-separated tags
        isPublic: boolean('is_public').default(false),
        isFeatured: boolean('is_featured').default(false),
        
        // Usage tracking
        executionCount: integer('execution_count').default(0),
        lastExecutedAt: timestamp('last_executed_at'),
        
        createdAt: timestamp('created_at').defaultNow(),
        updatedAt: timestamp('updated_at').defaultNow(),
    },
    (table) => ({
        userIdIdx: index('idx_templates_user_id').on(table.userId),
        categoryIdx: index('idx_templates_category').on(table.category),
        isPublicIdx: index('idx_templates_is_public').on(table.isPublic),
    })
);

/**
 * Template Executions - Track when templates are run
 */
export const templateExecutions = pgTable(
    'template_executions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        templateId: uuid('template_id').references(() => templates.id).notNull(),
        userId: uuid('user_id').references(() => users.id).notNull(),
        
        // Execution details
        status: varchar('status', { length: 50 }), // 'running', 'completed', 'failed'
        inputs: jsonb('inputs'), // User-provided inputs
        outputs: jsonb('outputs'), // Generated outputs
        
        // Performance
        startedAt: timestamp('started_at').defaultNow(),
        completedAt: timestamp('completed_at'),
        executionTimeMs: integer('execution_time_ms'),
        
        // Error handling
        errorMessage: text('error_message'),
        errorStack: text('error_stack'),
        
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        templateIdIdx: index('idx_template_executions_template_id').on(table.templateId),
        userIdIdx: index('idx_template_executions_user_id').on(table.userId),
        statusIdx: index('idx_template_executions_status').on(table.status),
    })
);

/**
 * Template Versions - Version history for templates
 */
export const templateVersions = pgTable(
    'template_versions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        templateId: uuid('template_id').references(() => templates.id).notNull(),
        
        version: integer('version').notNull(),
        changelog: text('changelog'),
        
        // Versioned content
        steps: jsonb('steps').notNull(),
        inputs: jsonb('inputs'),
        outputs: jsonb('outputs'),
        
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        templateIdIdx: index('idx_template_versions_template_id').on(table.templateId),
        versionIdx: index('idx_template_versions_template_id_version').on(table.templateId, table.version),
    })
);

/**
 * Template Favorites - User's favorite templates
 */
export const templateFavorites = pgTable(
    'template_favorites',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => users.id).notNull(),
        templateId: uuid('template_id').references(() => templates.id).notNull(),
        
        createdAt: timestamp('created_at').defaultNow(),
    },
    (table) => ({
        userIdIdx: index('idx_template_favorites_user_id').on(table.userId),
        templateIdIdx: index('idx_template_favorites_template_id').on(table.templateId),
    })
);

// Relations
export const templatesRelations = relations(templates, ({ one, many }) => ({
    user: one(users, { fields: [templates.userId], references: [users.id] }),
    executions: many(templateExecutions),
    versions: many(templateVersions),
}));

export const templateExecutionsRelations = relations(templateExecutions, ({ one }) => ({
    template: one(templates, { fields: [templateExecutions.templateId], references: [templates.id] }),
    user: one(users, { fields: [templateExecutions.userId], references: [users.id] }),
}));

export const templateVersionsRelations = relations(templateVersions, ({ one }) => ({
    template: one(templates, { fields: [templateVersions.templateId], references: [templates.id] }),
}));

export const templateFavoritesRelations = relations(templateFavorites, ({ one }) => ({
    user: one(users, { fields: [templateFavorites.userId], references: [users.id] }),
    template: one(templates, { fields: [templateFavorites.templateId], references: [templates.id] }),
}));
