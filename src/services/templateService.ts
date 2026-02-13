/**
 * Template Service
 * 
 * Handles template CRUD, execution, and versioning
 */

import { db } from '@/src/db';
import { templates, templateExecutions, templateVersions, templateFavorites } from '@/src/db/templateSchema';
import { eq, and } from 'drizzle-orm';
import { auditLogger } from './auditLogger';
import { AppError } from '@/src/lib/errors';
import { connectorQueryCache } from './connectorQueryCache';

/**
 * Template step in workflow
 */
export interface TemplateStep {
    id: string;
    type: 'query' | 'notebook' | 'transformation' | 'visualization';
    connectorId?: string;
    code?: string;
    query?: string;
    description?: string;
    inputs?: Record<string, any>;
    outputs?: string[];
}

/**
 * Template input definition
 */
export interface TemplateInput {
    name: string;
    type: 'string' | 'number' | 'date' | 'select' | 'multiselect';
    required: boolean;
    description?: string;
    options?: any[];
    default?: any;
}

/**
 * Template representation
 */
export interface Template {
    id?: string;
    userId: string;
    name: string;
    description?: string;
    category?: string;
    inputs: TemplateInput[];
    steps: TemplateStep[];
    outputs?: string[];
    tags?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    executionCount?: number;
}

/**
 * Template Execution Request
 */
export interface TemplateExecutionRequest {
    templateId: string;
    userId: string;
    inputs: Record<string, any>;
}

/**
 * Template Service
 */
export class TemplateService {
    /**
     * Create a new template
     */
    static async createTemplate(userId: string, template: Template): Promise<string> {
        try {
            // Validate inputs
            if (!userId || !template.name || !template.steps) {
                throw new AppError('VALIDATION_ERROR', 'Missing required fields');
            }

            // Insert template
            const result = await db.insert(templates).values({
                userId,
                name: template.name,
                description: template.description,
                category: template.category,
                inputs: JSON.stringify(template.inputs || []),
                steps: JSON.stringify(template.steps),
                outputs: JSON.stringify(template.outputs || []),
                tags: template.tags,
                isPublic: template.isPublic ?? false,
                isFeatured: template.isFeatured ?? false,
            }).returning({ id: templates.id });

            const templateId = result[0]?.id;
            if (!templateId) {
                throw new AppError('DATABASE_ERROR', 'Failed to create template');
            }

            // Create initial version
            await db.insert(templateVersions).values({
                templateId,
                version: 1,
                steps: JSON.stringify(template.steps),
                inputs: JSON.stringify(template.inputs || []),
                outputs: JSON.stringify(template.outputs || []),
                changelog: 'Initial version',
            });

            // Audit log
            await auditLogger.log({
                userId,
                action: 'TEMPLATE_CREATED',
                resourceType: 'template',
                resourceId: templateId,
                details: { name: template.name },
            });

            return templateId;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to create template', error);
        }
    }

    /**
     * Get template by ID
     */
    static async getTemplate(templateId: string): Promise<Template> {
        try {
            const result = await db.query.templates.findFirst({
                where: eq(templates.id, templateId),
            });

            if (!result) {
                throw new AppError('NOT_FOUND', 'Template not found');
            }

            return {
                ...result,
                inputs: JSON.parse(result.inputs as string) || [],
                steps: JSON.parse(result.steps as string) || [],
                outputs: JSON.parse(result.outputs as string) || [],
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to fetch template', error);
        }
    }

    /**
     * Get template by ID including version
     */
    static async getTemplateVersion(templateId: string, version: number): Promise<{
        template: Template;
        versionInfo: any;
    }> {
        try {
            const templateData = await db.query.templates.findFirst({
                where: eq(templates.id, templateId),
            });

            if (!templateData) {
                throw new AppError('NOT_FOUND', 'Template not found');
            }

            const versionData = await db.query.templateVersions.findFirst({
                where: and(
                    eq(templateVersions.templateId, templateId),
                    eq(templateVersions.version, version)
                ),
            });

            if (!versionData) {
                throw new AppError('NOT_FOUND', `Template version ${version} not found`);
            }

            return {
                template: {
                    ...templateData,
                    inputs: JSON.parse(versionData.inputs as string) || [],
                    steps: JSON.parse(versionData.steps as string) || [],
                    outputs: JSON.parse(versionData.outputs as string) || [],
                },
                versionInfo: {
                    version: versionData.version,
                    changelog: versionData.changelog,
                    createdAt: versionData.createdAt,
                },
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to fetch template version', error);
        }
    }

    /**
     * List templates
     */
    static async listTemplates(
        options?: {
            userId?: string;
            category?: string;
            isPublic?: boolean;
            limit?: number;
            offset?: number;
        }
    ): Promise<Template[]> {
        try {
            let query = db.query.templates.findMany({
                limit: options?.limit ?? 50,
                offset: options?.offset ?? 0,
            });

            const where: any[] = [];

            if (options?.userId) {
                where.push(eq(templates.userId, options.userId));
            }

            if (options?.category) {
                where.push(eq(templates.category, options.category));
            }

            if (options?.isPublic !== undefined) {
                where.push(eq(templates.isPublic, options.isPublic));
            }

            // Note: Drizzle doesn't support dynamic where queries as easily
            // In a real implementation, you'd need to build the query differently
            const results = await db.query.templates.findMany({
                limit: options?.limit ?? 50,
                offset: options?.offset ?? 0,
            });

            // Filter in memory for now
            return results
                .filter(t => !options?.userId || t.userId === options.userId)
                .filter(t => !options?.category || t.category === options.category)
                .filter(t => options?.isPublic === undefined || t.isPublic === options.isPublic)
                .map(t => ({
                    ...t,
                    inputs: JSON.parse(t.inputs as string) || [],
                    steps: JSON.parse(t.steps as string) || [],
                    outputs: JSON.parse(t.outputs as string) || [],
                }));
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to list templates', error);
        }
    }

    /**
     * Update template
     */
    static async updateTemplate(
        templateId: string,
        userId: string,
        updates: Partial<Template>
    ): Promise<void> {
        try {
            // Check ownership
            const existing = await db.query.templates.findFirst({
                where: and(
                    eq(templates.id, templateId),
                    eq(templates.userId, userId)
                ),
            });

            if (!existing) {
                throw new AppError('NOT_FOUND', 'Template not found');
            }

            const updateData: any = {
                updatedAt: new Date(),
            };

            if (updates.name) updateData.name = updates.name;
            if (updates.description !== undefined) updateData.description = updates.description;
            if (updates.category) updateData.category = updates.category;
            if (updates.tags) updateData.tags = updates.tags;
            if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;

            // If steps are updated, create new version
            if (updates.steps) {
                const currentVersion = existing.version ?? 1;
                const newVersion = currentVersion + 1;

                updateData.version = newVersion;
                updateData.steps = JSON.stringify(updates.steps);
                updateData.inputs = JSON.stringify(updates.inputs || existing.inputs);
                updateData.outputs = JSON.stringify(updates.outputs || existing.outputs);

                // Create version record
                await db.insert(templateVersions).values({
                    templateId,
                    version: newVersion,
                    steps: JSON.stringify(updates.steps),
                    inputs: JSON.stringify(updates.inputs || existing.inputs),
                    outputs: JSON.stringify(updates.outputs || existing.outputs),
                    changelog: `Updated to version ${newVersion}`,
                });
            }

            await db.update(templates).set(updateData).where(eq(templates.id, templateId));

            await auditLogger.log({
                userId,
                action: 'TEMPLATE_UPDATED',
                resourceType: 'template',
                resourceId: templateId,
                details: Object.keys(updates),
            });
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to update template', error);
        }
    }

    /**
     * Delete template
     */
    static async deleteTemplate(templateId: string, userId: string): Promise<void> {
        try {
            const existing = await db.query.templates.findFirst({
                where: and(
                    eq(templates.id, templateId),
                    eq(templates.userId, userId)
                ),
            });

            if (!existing) {
                throw new AppError('NOT_FOUND', 'Template not found');
            }

            await db.delete(templates).where(eq(templates.id, templateId));

            await auditLogger.log({
                userId,
                action: 'TEMPLATE_DELETED',
                resourceType: 'template',
                resourceId: templateId,
            });
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError('DATABASE_ERROR', 'Failed to delete template', error);
        }
    }

    /**
     * Record template execution
     */
    static async recordExecution(
        templateId: string,
        userId: string,
        inputs: Record<string, any>,
        outputs?: Record<string, any>,
        error?: string,
        executionTimeMs?: number
    ): Promise<string> {
        try {
            const status = error ? 'failed' : 'completed';

            const result = await db.insert(templateExecutions).values({
                templateId,
                userId,
                status,
                inputs: JSON.stringify(inputs),
                outputs: outputs ? JSON.stringify(outputs) : null,
                errorMessage: error || null,
                completedAt: new Date(),
                executionTimeMs,
            }).returning({ id: templateExecutions.id });

            const executionId = result[0]?.id;

            // Update execution count
            await db.update(templates)
                .set({
                    executionCount: (existing?.executionCount ?? 0) + 1,
                    lastExecutedAt: new Date(),
                })
                .where(eq(templates.id, templateId));

            // Invalidate template cache
            await connectorQueryCache.invalidateQueryPattern(`template:${templateId}`);

            return executionId!;
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to record execution', error);
        }
    }

    /**
     * Get execution history for template
     */
    static async getExecutionHistory(
        templateId: string,
        userId: string,
        limit: number = 20
    ): Promise<any[]> {
        try {
            return await db.query.templateExecutions.findMany({
                where: and(
                    eq(templateExecutions.templateId, templateId),
                    eq(templateExecutions.userId, userId)
                ),
                limit,
            });
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to fetch execution history', error);
        }
    }

    /**
     * Toggle favorite status
     */
    static async toggleFavorite(templateId: string, userId: string): Promise<boolean> {
        try {
            const existing = await db.query.templateFavorites.findFirst({
                where: and(
                    eq(templateFavorites.templateId, templateId),
                    eq(templateFavorites.userId, userId)
                ),
            });

            if (existing) {
                // Remove from favorites
                await db.delete(templateFavorites).where(eq(templateFavorites.id, existing.id));
                return false;
            } else {
                // Add to favorites
                await db.insert(templateFavorites).values({
                    templateId,
                    userId,
                });
                return true;
            }
        } catch (error) {
            throw new AppError('DATABASE_ERROR', 'Failed to toggle favorite', error);
        }
    }

    /**
     * Get user's favorite templates
     */
    static async getFavoritesCount(templateId: string): Promise<number> {
        try {
            const result = await db.$count(templateFavorites, eq(templateFavorites.templateId, templateId));
            return result;
        } catch (error) {
            return 0;
        }
    }
}

export default TemplateService;
