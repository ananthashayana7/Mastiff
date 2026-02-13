/**
 * Template Execution Routes
 * 
 * POST /api/templates/[id]/execute - Execute template
 * GET /api/templates/[id]/executions - Get execution history
 * POST /api/templates/[id]/favorite - Toggle favorite
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessionManager } from '@/src/services/sessionManager';
import { TemplateService } from '@/src/services/templateService';
import { NotebookService } from '@/src/services/notebookService';
import { ConnectorService } from '@/src/services/connectorService';
import websocketService, { WebSocketMessageType } from '@/src/services/websocketService';
import { rateLimiter } from '@/src/lib/rateLimiting';
import { validateInput } from '@/src/lib/validation';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * Execute template schema
 */
const executeTemplateSchema = z.record(z.any());

/**
 * POST /api/templates/[id]/execute - Execute template
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit (moderate for executions)
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:execute', clientId, 100, 3600);

        // Validate session
        const sessionToken = request.cookies.get('session')?.value;
        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const session = await sessionManager.getSession(sessionToken);
        if (!session || !session.userId) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            );
        }

        // Get template
        const template = await TemplateService.getTemplate(params.id);
        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        // Check access
        if (!template.isPublic && template.userId !== session.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Parse and validate inputs
        const body = await request.json();
        const inputs = validateInput(executeTemplateSchema, body);

        // Validate required inputs
        const requiredInputs = (template.inputs || [])
            .filter((i: any) => i.required)
            .map((i: any) => i.name);

        const missingInputs = requiredInputs.filter(name => !(name in inputs));
        if (missingInputs.length > 0) {
            return NextResponse.json(
                { error: `Missing required inputs: ${missingInputs.join(', ')}` },
                { status: 400 }
            );
        }

        const startTime = Date.now();
        const executionId = uuidv4();
        let outputs: any = {};
        let error: string | null = null;

        // Notify execution start
        websocketService.notifyExecutionStart(executionId, 'template', {
            templateId: params.id,
            userId: session.userId,
        });

        try {
            // Execute template steps with real-time updates
            outputs = await executeTemplateStepsWithRealtime(
                template,
                inputs,
                session.userId,
                executionId
            );
        } catch (err: any) {
            error = err.message || 'Execution failed';
            console.error('Template execution error:', err);
            websocketService.notifyExecutionError(executionId, error, Date.now() - startTime);
        }

        const executionTimeMs = Date.now() - startTime;

        // Record execution
        await TemplateService.recordExecution(
            params.id,
            session.userId,
            inputs,
            outputs,
            error,
            executionTimeMs
        );

        // Notify completion
        if (!error) {
            websocketService.notifyExecutionComplete(executionId, executionTimeMs, outputs);
        }

        if (error) {
            return NextResponse.json({
                success: false,
                error,
                inputs,
                executionId,
                executionTimeMs,
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            outputs,
            inputs,
            executionId,
            executionTimeMs,
        });
    } catch (error: any) {
        console.error('Error executing template:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to execute template' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/templates/[id]/executions - Get execution history
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:history', clientId, 200, 3600);

        // Validate session
        const sessionToken = request.cookies.get('session')?.value;
        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const session = await sessionManager.getSession(sessionToken);
        if (!session || !session.userId) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            );
        }

        // Get template to verify access
        const template = await TemplateService.getTemplate(params.id);
        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        if (template.userId !== session.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

        const history = await TemplateService.getExecutionHistory(params.id, limit, offset);

        return NextResponse.json({
            success: true,
            executions: history,
            limit,
            offset,
        });
    } catch (error: any) {
        console.error('Error getting execution history:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get execution history' },
            { status: 500 }
        );
    }
}

/**
 * Helper function to execute template steps with real-time updates
 */
async function executeTemplateStepsWithRealtime(
    template: any,
    inputs: any,
    userId: string,
    executionId: string
): Promise<any> {
    const outputs: any = {};
    const executionContext = { ...inputs };

    for (const step of template.steps || []) {
        const stepStartTime = Date.now();
        
        try {
            websocketService.notifyStepStart(executionId, step.id, step.description || step.id);

            switch (step.type) {
                case 'query': {
                    // Execute connector query
                    const connector = await ConnectorService.getConnector(step.connectorId, userId);
                    if (!connector) {
                        throw new Error(`Connector not found: ${step.connectorId}`);
                    }

                    const query = interpolateQuery(step.query, executionContext);
                    const result = await connector.executeQuery(query);
                    
                    const stepOutputs = step.outputs || [`output_${step.id}`];
                    outputs[stepOutputs[0]] = result;
                    Object.assign(executionContext, { [stepOutputs[0]]: result });

                    websocketService.notifyStepComplete(
                        executionId,
                        step.id,
                        Date.now() - stepStartTime,
                        { rowsAffected: Array.isArray(result) ? result.length : 0 }
                    );
                    break;
                }

                case 'notebook': {
                    // Execute notebook cells
                    if (step.code) {
                        const notebook = await NotebookService.createNotebookFromCode(
                            userId,
                            {
                                name: `template_${template.id}_${step.id}`,
                                description: step.description,
                            },
                            step.code
                        );

                        const result = await NotebookService.executeCell(
                            notebook.id,
                            0,
                            step.code,
                            executionContext
                        );

                        const stepOutputs = step.outputs || [`output_${step.id}`];
                        outputs[stepOutputs[0]] = result;
                        Object.assign(executionContext, { [stepOutputs[0]]: result });

                        websocketService.notifyStepComplete(
                            executionId,
                            step.id,
                            Date.now() - stepStartTime,
                            { cellsExecuted: 1 }
                        );
                    }
                    break;
                }

                case 'transformation': {
                    // Data transformation (in Python)
                    if (step.code) {
                        const notebook = await NotebookService.createNotebookFromCode(
                            userId,
                            {
                                name: `transform_${template.id}_${step.id}`,
                                description: step.description,
                            },
                            step.code
                        );

                        const result = await NotebookService.executeCell(
                            notebook.id,
                            0,
                            step.code,
                            executionContext
                        );

                        const stepOutputs = step.outputs || [`output_${step.id}`];
                        outputs[stepOutputs[0]] = result;
                        Object.assign(executionContext, { [stepOutputs[0]]: result });

                        websocketService.notifyStepComplete(
                            executionId,
                            step.id,
                            Date.now() - stepStartTime,
                            { recordsTransformed: Array.isArray(result) ? result.length : 0 }
                        );
                    }
                    break;
                }

                case 'visualization': {
                    // Visualization step (returns chart config)
                    if (step.code) {
                        const chart = JSON.parse(interpolateQuery(step.code, executionContext));
                        const stepOutputs = step.outputs || [`visualization_${step.id}`];
                        outputs[stepOutputs[0]] = chart;
                        Object.assign(executionContext, { [stepOutputs[0]]: chart });

                        websocketService.notifyStepComplete(
                            executionId,
                            step.id,
                            Date.now() - stepStartTime,
                            { chartType: chart.type }
                        );
                    }
                    break;
                }
            }
        } catch (stepError: any) {
            websocketService.notifyStepError(
                executionId,
                step.id,
                stepError.message || 'Step failed'
            );
            throw stepError;
        }
    }

    return outputs;
}

/**
 * Helper function to execute template steps
 */
async function executeTemplateSteps(template: any, inputs: any, userId: string): Promise<any> {
    const outputs: any = {};
    const executionContext = { ...inputs };

    for (const step of template.steps || []) {
        switch (step.type) {
            case 'query': {
                // Execute connector query
                const connector = await ConnectorService.getConnector(step.connectorId, userId);
                if (!connector) {
                    throw new Error(`Connector not found: ${step.connectorId}`);
                }

                const query = interpolateQuery(step.query, executionContext);
                const result = await connector.executeQuery(query);
                
                const stepOutputs = step.outputs || [`output_${step.id}`];
                outputs[stepOutputs[0]] = result;
                Object.assign(executionContext, { [stepOutputs[0]]: result });
                break;
            }

            case 'notebook': {
                // Execute notebook cells
                if (step.code) {
                    const notebook = await NotebookService.createNotebookFromCode(
                        userId,
                        {
                            name: `template_${template.id}_${step.id}`,
                            description: step.description,
                        },
                        step.code
                    );

                    const result = await NotebookService.executeCell(
                        notebook.id,
                        0,
                        step.code,
                        executionContext
                    );

                    const stepOutputs = step.outputs || [`output_${step.id}`];
                    outputs[stepOutputs[0]] = result;
                    Object.assign(executionContext, { [stepOutputs[0]]: result });
                }
                break;
            }

            case 'transformation': {
                // Data transformation (in Python)
                if (step.code) {
                    const notebook = await NotebookService.createNotebookFromCode(
                        userId,
                        {
                            name: `transform_${template.id}_${step.id}`,
                            description: step.description,
                        },
                        step.code
                    );

                    const result = await NotebookService.executeCell(
                        notebook.id,
                        0,
                        step.code,
                        executionContext
                    );

                    const stepOutputs = step.outputs || [`output_${step.id}`];
                    outputs[stepOutputs[0]] = result;
                    Object.assign(executionContext, { [stepOutputs[0]]: result });
                }
                break;
            }

            case 'visualization': {
                // Visualization step (returns chart config)
                if (step.code) {
                    const chart = JSON.parse(interpolateQuery(step.code, executionContext));
                    const stepOutputs = step.outputs || [`visualization_${step.id}`];
                    outputs[stepOutputs[0]] = chart;
                    Object.assign(executionContext, { [stepOutputs[0]]: chart });
                }
                break;
            }
        }
    }

    return outputs;
}

/**
 * Helper to interpolate variables in query
 */
function interpolateQuery(query: string, context: any): string {
    let result = query;
    
    // Replace ${variable} with values from context
    const varRegex = /\$\{(\w+)\}/g;
    result = result.replace(varRegex, (match, varName) => {
        if (varName in context) {
            const value = context[varName];
            if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
            }
            return String(value);
        }
        return match;
    });

    return result;
}

/**
 * POST /api/templates/[id]/favorite - Toggle favorite
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Rate limit
        const clientId = request.ip || 'unknown';
        await rateLimiter.checkLimit('template:favorite', clientId, 200, 3600);

        // Validate session
        const sessionToken = request.cookies.get('session')?.value;
        if (!sessionToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const session = await sessionManager.getSession(sessionToken);
        if (!session || !session.userId) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 }
            );
        }

        // Get template
        const template = await TemplateService.getTemplate(params.id);
        if (!template) {
            return NextResponse.json(
                { error: 'Template not found' },
                { status: 404 }
            );
        }

        // Toggle favorite
        await TemplateService.toggleFavorite(params.id, session.userId);

        return NextResponse.json({
            success: true,
            message: 'Favorite toggled',
        });
    } catch (error: any) {
        console.error('Error toggling favorite:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to toggle favorite' },
            { status: 500 }
        );
    }
}
