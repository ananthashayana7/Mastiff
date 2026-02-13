/**
 * Tool Registry - Central registry for all available tools
 * Provides execution, validation, and discovery of agent tools
 */

import { db } from '@/src/db/index';
import { toolsTable, toolExecutionLogTable } from '@/src/db/agentSchema';
import { eq, and } from 'drizzle-orm';

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    description?: string;
    enum?: string[];
    default?: any;
}

export interface ToolDefinition {
    code: string;
    name: string;
    description: string;
    category: 'search' | 'execution' | 'data' | 'integration';
    type: 'builtin' | 'custom' | 'webhook';
    inputSchema: {
        type: 'object';
        properties: Record<string, ToolParameter>;
        required: string[];
    };
    outputSchema?: {
        type: 'object';
        properties: Record<string, any>;
    };
    handler?: string;
    webhookUrl?: string;
}

export interface ToolExecutionRequest {
    workspaceId: string;
    toolId: string;
    toolCode: string;
    input: Record<string, any>;
    executionId?: string;
    timeout?: number;
}

export interface ToolExecutionResult {
    status: 'success' | 'error' | 'timeout';
    output?: Record<string, any>;
    error?: string;
    duration: number;
}

/**
 * Builtin Tools Repository
 */
const BUILTIN_TOOLS: Record<string, ToolDefinition> = {
    web_search: {
        code: 'web_search',
        name: 'Web Search',
        description: 'Search the internet for information',
        category: 'search',
        type: 'builtin',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query',
                },
                maxResults: {
                    type: 'number',
                    description: 'Maximum number of results',
                    default: 10,
                },
            },
            required: ['query'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                results: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string' },
                            url: { type: 'string' },
                            snippet: { type: 'string' },
                        },
                    },
                },
            },
        },
    },

    code_executor: {
        code: 'code_executor',
        name: 'Code Executor',
        description: 'Execute Python or JavaScript code',
        category: 'execution',
        type: 'builtin',
        inputSchema: {
            type: 'object',
            properties: {
                language: {
                    type: 'string',
                    enum: ['python', 'javascript'],
                    description: 'Programming language',
                },
                code: {
                    type: 'string',
                    description: 'Code to execute',
                },
                timeout: {
                    type: 'number',
                    description: 'Execution timeout in milliseconds',
                    default: 30000,
                },
            },
            required: ['language', 'code'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                output: { type: 'string' },
                error: { type: 'string' },
            },
        },
    },

    database_query: {
        code: 'database_query',
        name: 'Database Query',
        description: 'Execute SQL queries and retrieve data',
        category: 'data',
        type: 'builtin',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'SQL query to execute',
                },
                limit: {
                    type: 'number',
                    description: 'Limit number of results',
                    default: 100,
                },
            },
            required: ['query'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                rows: { type: 'array' },
                count: { type: 'number' },
            },
        },
    },

    file_operations: {
        code: 'file_operations',
        name: 'File Operations',
        description: 'Read, write, and manage files',
        category: 'data',
        type: 'builtin',
        inputSchema: {
            type: 'object',
            properties: {
                operation: {
                    type: 'string',
                    enum: ['read', 'write', 'delete', 'list'],
                    description: 'File operation to perform',
                },
                path: {
                    type: 'string',
                    description: 'File path',
                },
                content: {
                    type: 'string',
                    description: 'Content to write (for write operations)',
                },
            },
            required: ['operation', 'path'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string' },
                success: { type: 'boolean' },
            },
        },
    },

    email_sender: {
        code: 'email_sender',
        name: 'Email Sender',
        description: 'Send emails to users',
        category: 'integration',
        type: 'builtin',
        inputSchema: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: 'Recipient email address',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject',
                },
                body: {
                    type: 'string',
                    description: 'Email body content',
                },
                htmlBody: {
                    type: 'string',
                    description: 'HTML email body (optional)',
                },
            },
            required: ['to', 'subject', 'body'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                messageId: { type: 'string' },
                sent: { type: 'boolean' },
            },
        },
    },

    http_request: {
        code: 'http_request',
        name: 'HTTP Request',
        description: 'Make HTTP requests to external APIs',
        category: 'integration',
        type: 'builtin',
        inputSchema: {
            type: 'object',
            properties: {
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    description: 'HTTP method',
                },
                url: {
                    type: 'string',
                    description: 'URL to request',
                },
                headers: {
                    type: 'object',
                    description: 'HTTP headers',
                },
                body: {
                    type: 'object',
                    description: 'Request body',
                },
            },
            required: ['method', 'url'],
        },
        outputSchema: {
            type: 'object',
            properties: {
                status: { type: 'number' },
                data: { type: 'object' },
                error: { type: 'string' },
            },
        },
    },
};

/**
 * Tool Registry Service
 */
export class ToolRegistry {
    /**
     * Get all available tools for workspace
     */
    static async getAvailableTools(workspaceId: string) {
        const builtins = Object.values(BUILTIN_TOOLS);

        // Get custom tools from database
        const customTools = await db
            .select()
            .from(toolsTable)
            .where(and(eq(toolsTable.workspaceId, workspaceId), eq(toolsTable.isActive, true)));

        return {
            builtin: builtins,
            custom: customTools,
        };
    }

    /**
     * Get tool by code
     */
    static async getTool(
        workspaceId: string,
        toolCode: string
    ): Promise<(typeof BUILTIN_TOOLS)[keyof typeof BUILTIN_TOOLS] | typeof customTools[0] | null> {
        // Check builtin first
        if (BUILTIN_TOOLS[toolCode]) {
            return BUILTIN_TOOLS[toolCode];
        }

        // Check custom tools
        const customTools = await db
            .select()
            .from(toolsTable)
            .where(and(eq(toolsTable.workspaceId, workspaceId), eq(toolsTable.code, toolCode)))
            .limit(1);

        return customTools[0] || null;
    }

    /**
     * Validate tool input against schema
     */
    static validateInput(
        toolCode: string,
        input: Record<string, any>
    ): { valid: boolean; errors: string[] } {
        const tool = BUILTIN_TOOLS[toolCode];
        if (!tool) {
            return { valid: false, errors: ['Tool not found'] };
        }

        const errors: string[] = [];

        // Check required fields
        for (const required of tool.inputSchema.required) {
            if (!(required in input)) {
                errors.push(`Missing required parameter: ${required}`);
            }
        }

        // Validate field types
        for (const [field, param] of Object.entries(tool.inputSchema.properties)) {
            if (field in input) {
                const value = input[field];
                const expectedType = param.type;

                // Type checking
                if (expectedType === 'string' && typeof value !== 'string') {
                    errors.push(`Parameter ${field} must be string, got ${typeof value}`);
                } else if (expectedType === 'number' && typeof value !== 'number') {
                    errors.push(`Parameter ${field} must be number, got ${typeof value}`);
                } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
                    errors.push(`Parameter ${field} must be boolean, got ${typeof value}`);
                }

                // Enum validation
                if (param.enum && !param.enum.includes(value)) {
                    errors.push(
                        `Parameter ${field} must be one of: ${param.enum.join(', ')}`
                    );
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Execute a tool
     */
    static async executeTool(req: ToolExecutionRequest): Promise<ToolExecutionResult> {
        const startTime = Date.now();

        try {
            // Get tool definition
            const tool = await this.getTool(req.workspaceId, req.toolCode);
            if (!tool) {
                return {
                    status: 'error',
                    error: `Tool not found: ${req.toolCode}`,
                    duration: Date.now() - startTime,
                };
            }

            // Validate input
            const validation = this.validateInput(req.toolCode, req.input);
            if (!validation.valid) {
                return {
                    status: 'error',
                    error: `Invalid input: ${validation.errors.join(', ')}`,
                    duration: Date.now() - startTime,
                };
            }

            // Execute tool
            const result = await this.executeToolHandler(req.toolCode, req.input, req.timeout);

            // Log execution
            if (req.executionId) {
                await db.insert(toolExecutionLogTable).values({
                    workspaceId: req.workspaceId,
                    toolId: tool.id || '',
                    executionId: req.executionId,
                    status: result.status,
                    input: req.input,
                    output: result.output,
                    error: result.error,
                    duration: result.duration,
                    startedAt: new Date(),
                    completedAt: new Date(),
                });
            }

            return result;
        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime,
            };
        }
    }

    /**
     * Execute tool handler based on type
     */
    private static async executeToolHandler(
        toolCode: string,
        input: Record<string, any>,
        timeout: number = 30000
    ): Promise<ToolExecutionResult> {
        const startTime = Date.now();

        // Create timeout promise
        const timeoutPromise = new Promise<ToolExecutionResult>((resolve) => {
            setTimeout(() => {
                resolve({
                    status: 'timeout',
                    error: `Tool execution timed out after ${timeout}ms`,
                    duration: Date.now() - startTime,
                });
            }, timeout);
        });

        // Execute based on tool type
        const executionPromise = (async () => {
            switch (toolCode) {
                case 'web_search':
                    return await this.executeWebSearch(input);
                case 'code_executor':
                    return await this.executeCode(input);
                case 'database_query':
                    return await this.executeDatabaseQuery(input);
                case 'file_operations':
                    return await this.executeFileOperation(input);
                case 'email_sender':
                    return await this.executeSendEmail(input);
                case 'http_request':
                    return await this.executeHttpRequest(input);
                default:
                    return {
                        status: 'error' as const,
                        error: `Unknown tool: ${toolCode}`,
                        duration: Date.now() - startTime,
                    };
            }
        })();

        // Race between execution and timeout
        return Promise.race([executionPromise, timeoutPromise]);
    }

    /**
     * Tool implementations
     */
    private static async executeWebSearch(input: {
        query: string;
        maxResults?: number;
    }): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        try {
            // Placeholder: In production, integrate with search API
            const results = [
                {
                    title: `Search result for "${input.query}"`,
                    url: 'https://example.com',
                    snippet: 'Search result snippet...',
                },
            ];

            return {
                status: 'success',
                output: { results },
                duration: Date.now() - startTime,
            };
        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'Search failed',
                duration: Date.now() - startTime,
            };
        }
    }

    private static async executeCode(input: {
        language: string;
        code: string;
        timeout?: number;
    }): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        try {
            // Placeholder: In production, use isolated execution environment
            return {
                status: 'success',
                output: { output: 'Code executed successfully' },
                duration: Date.now() - startTime,
            };
        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'Code execution failed',
                duration: Date.now() - startTime,
            };
        }
    }

    private static async executeDatabaseQuery(input: { query: string; limit?: number }): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        try {
            // Placeholder: In production, execute actual SQL
            return {
                status: 'success',
                output: { rows: [], count: 0 },
                duration: Date.now() - startTime,
            };
        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'Query failed',
                duration: Date.now() - startTime,
            };
        }
    }

    private static async executeFileOperation(input: {
        operation: string;
        path: string;
        content?: string;
    }): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        try {
            // Placeholder: In production, handle actual file operations
            return {
                status: 'success',
                output: { success: true },
                duration: Date.now() - startTime,
            };
        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'File operation failed',
                duration: Date.now() - startTime,
            };
        }
    }

    private static async executeSendEmail(input: {
        to: string;
        subject: string;
        body: string;
        htmlBody?: string;
    }): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        try {
            // Placeholder: In production, use email service
            return {
                status: 'success',
                output: { messageId: 'msg-' + Date.now(), sent: true },
                duration: Date.now() - startTime,
            };
        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'Email send failed',
                duration: Date.now() - startTime,
            };
        }
    }

    private static async executeHttpRequest(input: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: Record<string, any>;
    }): Promise<ToolExecutionResult> {
        const startTime = Date.now();
        try {
            const response = await fetch(input.url, {
                method: input.method,
                headers: input.headers,
                body: input.body ? JSON.stringify(input.body) : undefined,
            });

            const data = await response.json();

            return {
                status: 'success',
                output: { status: response.status, data },
                duration: Date.now() - startTime,
            };
        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'HTTP request failed',
                duration: Date.now() - startTime,
            };
        }
    }
}
