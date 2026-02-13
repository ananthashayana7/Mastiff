/**
 * Docker Sandbox Client Service
 * Manages secure code execution in isolated Docker containers
 * 
 * Features:
 * - Network isolation (no internet access)
 * - Resource limits (memory, CPU, timeout)
 * - Read-only data files, write-only output
 * - Non-root user execution
 * - Automatic cleanup
 */

import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';

interface ExecutionOptions {
  memoryLimit?: number; // MB (default: 512)
  cpuLimit?: number; // cores (default: 1)
  timeout?: number; // ms (default: 30000)
  dataDir?: string; // Directory with input files (read-only)
  outputDir?: string; // Directory for results (write-only)
}

interface ExecutionResult {
  success: boolean;
  output: string;
  stdout: string;
  stderr: string;
  charts?: string[];
  plotly_charts?: any[];
  error?: string;
  traceback?: string;
  executionTime: number;
}

const SANDBOX_IMAGE = 'mastiff-sandbox:latest';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MEMORY_LIMIT = 512 * 1024 * 1024; // 512 MB
const DEFAULT_CPU_LIMIT = 1; // 1 core

export class DockerSandboxService {
  private docker: Docker;
  private imageBuilt = false;

  constructor() {
    // Connect to Docker daemon
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    });
  }

  /**
   * Build the sandbox Docker image if not already built
   */
  async ensureImageExists(): Promise<void> {
    if (this.imageBuilt) return;

    try {
      // Check if image exists
      const images = await this.docker.listImages({
        filters: { reference: [SANDBOX_IMAGE] },
      });

      if (images.length > 0) {
        this.imageBuilt = true;
        return;
      }

      // Build image from Dockerfile
      console.log(`Building Docker image: ${SANDBOX_IMAGE}`);
      const dockerfilePath = path.join(__dirname, '../../docker/sandbox.Dockerfile');
      const buildStream = await this.docker.buildImage(
        {
          context: path.dirname(dockerfilePath),
          src: ['sandbox.Dockerfile'],
        },
        { t: SANDBOX_IMAGE }
      );

      // Wait for build to complete
      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(buildStream, (err: any, res: any) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      this.imageBuilt = true;
      console.log(`Successfully built image: ${SANDBOX_IMAGE}`);
    } catch (err) {
      console.error('Failed to build sandbox image:', err);
      throw new Error(`Docker image build failed: ${err}`);
    }
  }

  /**
   * Execute code safely in a Docker sandbox
   */
  async executeCode(
    code: string,
    files: Array<{ name: string; path: string }>,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    // Ensure image is built
    await this.ensureImageExists();

    const startTime = Date.now();
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const memoryLimit = options.memoryLimit || 512; // MB
    const cpuLimit = options.cpuLimit || 1;

    let container: Docker.Container | null = null;
    const timeoutId = setTimeout(() => {
      if (container) {
        container
          .kill()
          .catch((e) => console.error('Failed to kill container:', e));
      }
    }, timeout);

    try {
      // Prepare wrapper script
      const wrapperScript = this.createWrapperScript(code, files);

      // Create container with security & resource limits
      container = await this.docker.createContainer({
        Image: SANDBOX_IMAGE,
        Cmd: ['-c', wrapperScript],
        HostConfig: {
          Memory: memoryLimit * 1024 * 1024, // Convert MB to bytes
          MemorySwap: memoryLimit * 1024 * 1024, // No swap
          CpuQuota: Math.round((cpuLimit * 100000) / 1), // CPU shares
          CpuPeriod: 100000,
          NetworkMode: 'none', // No network access
          ReadonlyRootfs: false,
          CapDrop: ['ALL'], // Drop all capabilities
          SecurityOpt: ['no-new-privileges:true'], // Prevent privilege escalation
        },
        Env: [
          'PYTHONUNBUFFERED=1',
          'PYTHONDONTWRITEBYTECODE=1', // Don't create __pycache__
        ],
        // Mount data as read-only
        Volumes: {
          '/sandbox/data': {},
        },
        Mounts: files.length
          ? [
              {
                Type: 'bind',
                Source: files[0].path.split('/').slice(0, -1).join('/'),
                Target: '/sandbox/data',
                ReadOnly: true,
              },
            ]
          : [],
      });

      // Run container
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      const output = await this.captureOutput(stream);

      // Wait for container to finish
      const exitInfo = await container.wait();

      clearTimeout(timeoutId);

      const executionTime = Date.now() - startTime;

      // Parse results from container output
      return await this.parseExecutionResult(
        output.stdout,
        output.stderr,
        exitInfo.StatusCode || 0,
        executionTime
      );
    } catch (err) {
      clearTimeout(timeoutId);

      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        stdout: '',
        stderr: error,
        error: `Execution failed: ${error}`,
        executionTime: Date.now() - startTime,
      };
    } finally {
      // Clean up container
      if (container) {
        try {
          await container.remove({ force: true });
        } catch (e) {
          console.error('Failed to remove container:', e);
        }
      }
    }
  }

  /**
   * Create wrapper script with safety checks
   */
  private createWrapperScript(code: string, files: Array<{ name: string; path: string }>): string {
    // List of forbidden imports
    const forbiddenModules = ['os', 'subprocess', 'sys', 'shutil', 'socket', 'urllib', 'requests'];
    const forbiddenFunctions = ['eval', 'exec', 'compile', 'open', 'input', '__import__'];

    // Validate code doesn't contain forbidden patterns
    this.validateCode(code, forbiddenModules, forbiddenFunctions);

    const filesJson = JSON.stringify(
      files.map((f) => ({
        name: f.name,
        path: f.path.replace(/\\/g, '/'),
      }))
    );

    return `
import pandas as pd
import numpy as np
import json
import os
import traceback
import sys
from io import BytesIO
import base64

# Security: Disable dangerous functions
__builtins__['eval'] = None
__builtins__['exec'] = None
__builtins__['compile'] = None
__builtins__['open'] = None
__builtins__['input'] = None
__builtins__['__import__'] = None

# Import visualization libraries
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import seaborn as sns
    sns.set_theme(style="darkgrid")
    HAS_MPL = True
except ImportError:
    HAS_MPL = False

try:
    import plotly.express as px
    import plotly.graph_objects as go
    import plotly.io as pio
    pio.templates.default = "plotly_dark"
    HAS_PLOTLY = True
except ImportError:
    HAS_PLOTLY = False

try:
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

# Load data files
files = ${filesJson}
dfs = {}

try:
    for f in files:
        filepath = f.get('path', f.get('name'))
        name = f.get('name', filepath.split('/')[-1])
        ext = os.path.splitext(filepath)[1].lower()
        
        try:
            if ext == '.csv':
                dfs[name] = pd.read_csv(filepath)
            elif ext in ['.xlsx', '.xls']:
                dfs[name] = pd.read_excel(filepath)
            elif ext == '.json':
                dfs[name] = pd.read_json(filepath)
            elif ext == '.parquet':
                dfs[name] = pd.read_parquet(filepath)
        except Exception as e:
            sys.stderr.write(f"Warning: Could not load {name}: {str(e)}\\n")

    df = next(iter(dfs.values())) if dfs else pd.DataFrame()
except:
    df = pd.DataFrame()

# Prepare execution environment
result = None
plotly_json = []

loc = {
    'pd': pd,
    'np': np,
    'df': df,
    'dfs': dfs,
    'result': None,
    'plotly_json': [],
    'json': json,
    'BytesIO': BytesIO,
    'base64': base64,
}

if HAS_MPL:
    loc['plt'] = plt
    loc['sns'] = sns
if HAS_PLOTLY:
    loc['px'] = px
    loc['go'] = go
if HAS_SCIPY:
    loc['scipy_stats'] = scipy_stats

# Execute user code
try:
    user_code = """${code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""
    exec(user_code, loc)
    
    result = loc.get('result')
    plotly_json = loc.get('plotly_json', [])
    
    # Format output
    output_data = {
        'success': True,
        'result': str(result) if result is not None else 'Code executed successfully',
        'charts': [],
        'plotly_charts': [],
    }
    
    # Capture matplotlib figures
    if HAS_MPL and plt.get_fignums():
        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buffer = BytesIO()
            fig.savefig(buffer, format='png', dpi=100)
            buffer.seek(0)
            chart_b64 = base64.b64encode(buffer.read()).decode()
            output_data['charts'].append(chart_b64)
            plt.close(fig)
    
    # Include Plotly charts
    if plotly_json:
        output_data['plotly_charts'] = plotly_json if isinstance(plotly_json, list) else [plotly_json]
    
    print(json.dumps(output_data))
    
except Exception as e:
    error_output = {
        'success': False,
        'error': str(e),
        'traceback': traceback.format_exc(),
    }
    print(json.dumps(error_output), file=sys.stderr)
    sys.exit(1)
`;
  }

  /**
   * Validate code for dangerous patterns
   */
  private validateCode(
    code: string,
    forbiddenModules: string[],
    forbiddenFunctions: string[]
  ): void {
    // Check for forbidden imports
    for (const module of forbiddenModules) {
      const importPattern = new RegExp(`\\b(import|from)\\s+${module}\\b|\\b${module}\\s*\\.`, 'g');
      if (importPattern.test(code)) {
        throw new Error(`Code contains forbidden module: ${module}`);
      }
    }

    // Check for forbidden function calls
    for (const fn of forbiddenFunctions) {
      const functionPattern = new RegExp(`\\b${fn}\\s*\\(`, 'g');
      if (functionPattern.test(code)) {
        throw new Error(`Code contains forbidden function: ${fn}`);
      }
    }
  }

  /**
   * Capture output from container stream
   */
  private captureOutput(stream: any): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      stream.on('data', (chunk: Buffer) => {
        // Docker stream format: [header(8 bytes)][payload]
        // Header: [0-3] stream type, [4-7] size
        const data = chunk.toString();
        stdout += data;
      });

      stream.on('error', (err: any) => {
        stderr += err.message;
      });

      stream.on('end', () => {
        resolve({ stdout, stderr });
      });

      stream.on('close', () => {
        resolve({ stdout, stderr });
      });

      // Timeout safety
      setTimeout(() => {
        resolve({ stdout, stderr });
      }, 35000);
    });
  }

  /**
   * Parse execution result from container output
   */
  private async parseExecutionResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    executionTime: number
  ): Promise<ExecutionResult> {
    try {
      // Try to parse JSON output from stdout
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          success: result.success !== false && exitCode === 0,
          output: result.result || result.output || '',
          stdout,
          stderr,
          charts: result.charts || [],
          plotly_charts: result.plotly_charts || [],
          error: result.error,
          traceback: result.traceback,
          executionTime,
        };
      }

      // If no JSON found but successful exit
      if (exitCode === 0) {
        return {
          success: true,
          output: stdout.trim(),
          stdout,
          stderr,
          executionTime,
        };
      }

      // Error case
      return {
        success: false,
        output: '',
        stdout,
        stderr: stderr || stdout,
        error: `Execution failed with exit code ${exitCode}`,
        executionTime,
      };
    } catch (err) {
      return {
        success: false,
        output: '',
        stdout,
        stderr,
        error: `Failed to parse execution result: ${err}`,
        executionTime,
      };
    }
  }

  /**
   * Health check - verify Docker is running and image is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.docker.ping();
      await this.ensureImageExists();
      return true;
    } catch (err) {
      console.error('Docker sandbox health check failed:', err);
      return false;
    }
  }
}

export const dockerSandbox = new DockerSandboxService();
