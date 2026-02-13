/**
 * Execution Service - Routes code execution through Docker sandbox
 * 
 * SECURITY: All user code execution is now sandboxed in Docker containers
 */

import { dockerSandbox } from './dockerSandbox';

export class ExecutionService {
    /**
     * Execute code safely in Docker sandbox
     */
    async executeCode(
        code: string,
        files: { name: string; path: string }[]
    ): Promise<{
        success: boolean;
        result: string;
        charts?: string[];
        plotly_charts?: any[];
        error?: string;
        traceback?: string;
        updated_df_sample?: any[];
    }> {
        try {
            // Validate Docker is available
            const dockerHealthy = await dockerSandbox.healthCheck();
            if (!dockerHealthy) {
                console.error('Docker sandbox health check failed');
                return {
                    success: false,
                    result: '',
                    error: 'Docker sandbox not available. Execution blocked for safety.',
                    charts: [],
                    plotly_charts: [],
                };
            }

            // Execute code in isolated container with resource limits
            const result = await dockerSandbox.executeCode(code, files, {
                memoryLimit: 512, // MB limit per query
                cpuLimit: 1, // 1 core
                timeout: 30000, // 30 second timeout
            });

            return {
                success: result.success,
                result: result.output.slice(0, 5000), // Truncate long outputs
                charts: result.charts,
                plotly_charts: result.plotly_charts,
                error: result.error,
                traceback: result.traceback,
                updated_df_sample: [], // Future: Include sampled dataframe
            };
        } catch (err) {
            const error =
                err instanceof Error ? err.message : String(err);
            console.error('ExecutionService error:', error);
            return {
                success: false,
                result: '',
                error: `Code execution failed: ${error}`,
                charts: [],
                plotly_charts: [],
            };
        }
    }
}

export const executor = new ExecutionService();

export const executor = new ExecutionService();
