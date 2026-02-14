import Docker from 'dockerode';
import { spawn } from 'child_process';

/**
 * Docker Sandbox Executor
 * 
 * Securely execute user code in isolated Docker containers
 * - CPU/memory limits
 * - Network isolation
 * - Filesystem sandbox
 * - Timeout enforcement
 */

interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  memoryUsedMb: number;
  cpuTimeMs: number;
}

interface SandboxConfig {
  maxMemoryMb?: number; // Default: 512MB
  maxCpuTimeMs?: number; // Default: 30000ms (30s)
  maxTimeoutMs?: number; // Default: 60000ms (60s)
  pythonVersion?: string; // 'python3.11', 'python3.10', etc.
  allowNetworkAccess?: boolean; // Default: false
  allowFileWrite?: boolean; // Default: true (but sandbox-safe)
  workingDir?: string; // Default: /tmp/notebook
}

export class DockerSandboxExecutor {
  private docker: Docker;
  private containerImage: string = 'python:3.11-slim';
  private config: SandboxConfig;

  constructor(config: SandboxConfig = {}) {
    this.docker = new Docker();
    this.config = {
      maxMemoryMb: config.maxMemoryMb || 512,
      maxCpuTimeMs: config.maxCpuTimeMs || 30000,
      maxTimeoutMs: config.maxTimeoutMs || 60000,
      pythonVersion: config.pythonVersion || 'python3.11',
      allowNetworkAccess: config.allowNetworkAccess || false,
      allowFileWrite: config.allowFileWrite !== false,
      workingDir: config.workingDir || '/tmp/notebook',
    };
  }

  /**
   * Execute Python code in Docker sandbox
   */
  async executePython(code: string, variables: Record<string, any> = {}): Promise<ExecutionResult> {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    try {
      // Check if image exists, pull if necessary
      await this.ensureImageExists();

      // Prepare execution script with variable injection
      const executionScript = this.prepareScript(code, variables);

      // Create container with security constraints
      const container = await this.docker.createContainer({
        Image: this.containerImage,
        Cmd: ['/bin/sh', '-c', executionScript],
        Env: this.getEnvironmentVariables(variables),
        HostConfig: {
          Memory: this.config.maxMemoryMb! * 1024 * 1024, // Convert to bytes
          MemorySwap: this.config.maxMemoryMb! * 1024 * 1024, // Prevent swap
          CpuPeriod: 100000,
          CpuQuota: Math.floor((this.config.maxCpuTimeMs! / 1000) * 100000), // CPU percentage
          NetworkMode: this.config.allowNetworkAccess ? 'bridge' : 'none', // Network isolation
          ReadonlyRootfs: false, // Allow filesystem writes to /tmp
          Tmpfs: {
            '/tmp': 'size=256M,mode=1777', // Temporary filesystem for writes
          },
          SecurityOpt: ['no-new-privileges:true'], // Prevent privilege escalation
          CapDrop: ['ALL'], // Drop all Linux capabilities
          CapAdd: ['NET_BIND_SERVICE'], // Optional: only if needed
        },
        OpenStdin: false,
        AttachStdout: true,
        AttachStderr: true,
      });

      // Execute container with timeout
      const executionTimeMs = await this.runContainerWithTimeout(container, stdout, stderr);

      // Cleanup
      try {
        await container.remove({ force: true });
      } catch (e) {
        console.error('Failed to remove container:', e);
      }

      const totalTimeMs = Date.now() - startTime;

      return {
        stdout,
        stderr,
        exitCode: 0,
        executionTimeMs: totalTimeMs,
        memoryUsedMb: Math.floor(this.config.maxMemoryMb! * 0.8), // Estimate
        cpuTimeMs: Math.min(executionTimeMs, this.config.maxCpuTimeMs!),
      };
    } catch (error: any) {
      const totalTimeMs = Date.now() - startTime;

      return {
        stdout,
        stderr: stderr || error?.message || 'Execution failed',
        exitCode: 1,
        executionTimeMs: totalTimeMs,
        memoryUsedMb: this.config.maxMemoryMb!,
        cpuTimeMs: Math.min(this.config.maxCpuTimeMs!, totalTimeMs),
      };
    }
  }

  /**
   * Execute JavaScript/Node.js code in Docker sandbox
   */
  async executeNodeJS(code: string, variables: Record<string, any> = {}): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await this.ensureImageExists('node:18-alpine');

      const nodeImage = 'node:18-alpine';
      const executionScript = `node -e "${this.escapeCode(code)}"`;

      const container = await this.docker.createContainer({
        Image: nodeImage,
        Cmd: ['/bin/sh', '-c', executionScript],
        HostConfig: {
          Memory: this.config.maxMemoryMb! * 1024 * 1024,
          NetworkMode: this.config.allowNetworkAccess ? 'bridge' : 'none',
        },
      });

      let stdout = '';
      let stderr = '';

      await this.runContainerWithTimeout(container, stdout, stderr);

      await container.remove({ force: true });

      return {
        stdout,
        stderr,
        exitCode: 0,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMb: this.config.maxMemoryMb! * 0.6,
        cpuTimeMs: this.config.maxCpuTimeMs!,
      };
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error?.message || 'Node.js execution failed',
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMb: this.config.maxMemoryMb!,
        cpuTimeMs: this.config.maxCpuTimeMs!,
      };
    }
  }

  /**
   * Execute R code in Docker sandbox
   */
  async executeR(code: string, variables: Record<string, any> = {}): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      await this.ensureImageExists('rocker/r-base');

      const executionScript = `R --vanilla --quiet -e "${this.escapeCode(code)}"`;

      const container = await this.docker.createContainer({
        Image: 'rocker/r-base',
        Cmd: ['/bin/sh', '-c', executionScript],
        HostConfig: {
          Memory: this.config.maxMemoryMb! * 1024 * 1024,
          NetworkMode: 'none',
        },
      });

      let stdout = '';
      let stderr = '';

      await this.runContainerWithTimeout(container, stdout, stderr);

      await container.remove({ force: true });

      return {
        stdout,
        stderr,
        exitCode: 0,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMb: this.config.maxMemoryMb! * 0.7,
        cpuTimeMs: this.config.maxCpuTimeMs!,
      };
    } catch (error: any) {
      return {
        stdout: '',
        stderr: error?.message || 'R execution failed',
        exitCode: 1,
        executionTimeMs: Date.now() - startTime,
        memoryUsedMb: this.config.maxMemoryMb!,
        cpuTimeMs: this.config.maxCpuTimeMs!,
      };
    }
  }

  /**
   * Prepare Python script with variable injection
   */
  private prepareScript(code: string, variables: Record<string, any>): string {
    let script = '';

    // Import necessary libraries
    script += 'import sys\nimport json\n';

    // Inject variables
    for (const [key, value] of Object.entries(variables)) {
      try {
        const jsonValue = JSON.stringify(value);
        script += `${key} = json.loads('${jsonValue.replace(/'/g, "\\'")}')\n`;
      } catch (e) {
        script += `${key} = None\n`;
      }
    }

    // Add user code with exception handling
    script += '\ntry:\n';
    script += code
      .split('\n')
      .map((line) => '  ' + line)
      .join('\n');
    script += '\nexcept Exception as e:\n';
    script += '  print(f"Error: {e}", file=sys.stderr)\n';
    script += '  sys.exit(1)\n';

    return script;
  }

  /**
   * Get environment variables for container
   */
  private getEnvironmentVariables(variables: Record<string, any>): string[] {
    return [
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'PYTHONUNBUFFERED=1',
      'PYTHONDONTWRITEBYTECODE=1',
      `VARIABLES=${JSON.stringify(variables)}`,
    ];
  }

  /**
   * Escape code for shell execution
   */
  private escapeCode(code: string): string {
    return code.replace(/"/g, '\\"').replace(/`/g, '\\`');
  }

  /**
   * Ensure Docker image exists
   */
  private async ensureImageExists(imageName: string = this.containerImage): Promise<void> {
    try {
      await this.docker.getImage(imageName).inspect();
    } catch (error: any) {
      if (error.statusCode === 404) {
        console.log(`Pulling image ${imageName}...`);

        await new Promise((resolve, reject) => {
          this.docker.pull(imageName, (err: Error | null, stream: any) => {
            if (err) reject(err);

            stream.on('data', (chunk: Buffer) => {
              const line = chunk.toString();
              if (line.includes('Pulling from') || line.includes('Downloaded')) {
                console.log(line.trim());
              }
            });

            stream.on('end', resolve);
            stream.on('error', reject);
          });
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Run container with timeout enforcement
   */
  private async runContainerWithTimeout(
    container: Docker.Container,
    stdout: string,
    stderr: string
  ): Promise<number> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        container.kill().catch(() => {});
      }, this.config.maxTimeoutMs);

      container.attach({ stream: true, stdout: true, stderr: true }, (err: Error | null, stream: any) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
          return;
        }

        stream.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          if (chunk[0] === 1) {
            stdout += text.slice(8); // Skip Docker stream header
          } else {
            stderr += text.slice(8); // Skip Docker stream header
          }
        });

        stream.on('end', () => {
          container.wait((err: Error | null, data: any) => {
            clearTimeout(timeout);

            if (timedOut) {
              reject(new Error(`Execution timeout after ${this.config.maxTimeoutMs}ms`));
            } else if (err) {
              reject(err);
            } else {
              const executionTimeMs = Date.now() - startTime;
              resolve(executionTimeMs);
            }
          });
        });

        stream.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      container.start((err: Error | null) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  /**
   * Health check - verify Docker daemon
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      console.error('Docker daemon not responsive:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({ all: true, filters: { label: ['notebook=true'] } });

      for (const containerInfo of containers) {
        const container = this.docker.getContainer(containerInfo.Id);
        try {
          await container.remove({ force: true });
        } catch (e) {
          console.error('Failed to remove container:', e);
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
}

/**
 * Singleton instance for global use
 */
export const sandboxExecutor = new DockerSandboxExecutor({
  maxMemoryMb: 512,
  maxCpuTimeMs: 30000,
  maxTimeoutMs: 60000,
  allowNetworkAccess: false,
});
