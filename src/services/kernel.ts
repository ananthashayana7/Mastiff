import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const KERNEL_TIMEOUT_MS = 60000; // 60s max per execution
const MAX_RETRIES = 2;

class KernelService {
    private processes: Map<string, ChildProcess> = new Map();

    async execute(sessionId: string, code: string, files: { name: string; path: string }[]): Promise<any> {
        let retries = 0;

        while (retries <= MAX_RETRIES) {
            try {
                let process = this.processes.get(sessionId);

                if (!process || process.killed || process.exitCode !== null) {
                    // Process doesn't exist or has died — start a new one
                    process = this.startKernel(sessionId);
                    this.processes.set(sessionId, process);
                }

                return await this.sendRequest(process, code, files, sessionId);
            } catch (error: any) {
                retries++;
                console.error(`Kernel [${sessionId}] execution failed (attempt ${retries}):`, error.message);

                // Kill the existing process and retry
                this.terminate(sessionId);

                if (retries > MAX_RETRIES) {
                    return {
                        success: false,
                        result: '',
                        error: `Analysis failed after ${MAX_RETRIES + 1} attempts: ${error.message}`,
                        charts: [],
                        plotly_charts: []
                    };
                }
            }
        }
    }

    private sendRequest(
        process: ChildProcess,
        code: string,
        files: { name: string; path: string }[],
        sessionId: string
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            const filesJson = JSON.stringify(files.map(f => ({ ...f, path: f.path.replace(/\\/g, '/') })));
            const request = JSON.stringify({ code, files_json: filesJson }) + '\n';

            let stdout = '';
            let timeoutHandle: NodeJS.Timeout;

            const onData = (data: Buffer) => {
                stdout += data.toString();
                // Check if we received a complete JSON response
                const lines = stdout.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    try {
                        const res = JSON.parse(line.trim());
                        clearTimeout(timeoutHandle);
                        process.stdout?.removeListener('data', onData);
                        process.removeListener('error', onError);
                        resolve(res);
                        return;
                    } catch {
                        // Not yet a complete JSON — keep accumulating
                    }
                }
            };

            const onError = (err: Error) => {
                clearTimeout(timeoutHandle);
                process.stdout?.removeListener('data', onData);
                reject(err);
            };

            // Timeout
            timeoutHandle = setTimeout(() => {
                process.stdout?.removeListener('data', onData);
                process.removeListener('error', onError);
                reject(new Error(`Analysis timed out after ${KERNEL_TIMEOUT_MS / 1000}s`));
            }, KERNEL_TIMEOUT_MS);

            process.on('error', onError);
            process.stdout?.on('data', onData);

            try {
                process.stdin?.write(request);
            } catch (err) {
                clearTimeout(timeoutHandle);
                reject(new Error('Failed to write to kernel process'));
            }
        });
    }

    private startKernel(sessionId: string): ChildProcess {
        const bridgePath = path.join(process.cwd(), 'src', 'services', 'kernel_bridge.py');

        // Try 'py' first (Windows launcher), fall back to 'python3', then 'python'
        const pythonCommands = ['py', 'python3', 'python'];
        let pythonProcess: ChildProcess | null = null;
        let lastError: Error | null = null;

        for (const cmd of pythonCommands) {
            try {
                pythonProcess = spawn(cmd, [bridgePath], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...process.env, PYTHONUNBUFFERED: '1' }
                });

                // Check if process started successfully
                if (pythonProcess.pid) {
                    console.log(`Kernel [${sessionId}] started with ${cmd} (PID: ${pythonProcess.pid})`);
                    break;
                }
            } catch (e: any) {
                lastError = e;
                continue;
            }
        }

        if (!pythonProcess) {
            throw new Error(`Failed to start Python kernel: ${lastError?.message}`);
        }

        pythonProcess.stderr?.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.error(`Kernel [${sessionId}] stderr:`, msg);
        });

        pythonProcess.on('close', (code) => {
            console.log(`Kernel [${sessionId}] closed with code ${code}`);
            this.processes.delete(sessionId);
        });

        pythonProcess.on('error', (err) => {
            console.error(`Kernel [${sessionId}] process error:`, err);
            this.processes.delete(sessionId);
        });

        return pythonProcess;
    }

    terminate(sessionId: string) {
        const process = this.processes.get(sessionId);
        if (process) {
            try {
                process.kill('SIGTERM');
                // Force kill after 3 seconds if still alive
                setTimeout(() => {
                    try { process.kill('SIGKILL'); } catch { }
                }, 3000);
            } catch { }
            this.processes.delete(sessionId);
        }
    }

    terminateAll() {
        for (const [id] of this.processes) {
            this.terminate(id);
        }
    }
}

export const kernelService = new KernelService();
