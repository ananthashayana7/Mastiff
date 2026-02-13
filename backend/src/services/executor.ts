import { spawn } from 'child_process';
import path from 'path';

export class ExecutionService {
    async executeCode(code: string, filePath: string): Promise<{ success: boolean; output: string; error?: string }> {
        return new Promise((resolve) => {
            // For now, we use a simple subprocess execution. 
            // In production, this should be Docker for safety.
            // We'll wrap the user code to handle the 'df' load and 'result' export.
            const wrapperScript = `
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import base64
from io import BytesIO
import json

df = pd.read_csv('${filePath.replace(/\\/g, '/')}')
result = None

try:
    ${code.split('\n').map(line => '    ' + line).join('\n').trim()}
    
    output = {
        "success": True,
        "result": str(result) if result is not None else "Code executed successfully",
        "chart": None
    }
    
    if plt.get_fignums():
        buffer = BytesIO()
        plt.savefig(buffer, format='png')
        buffer.seek(0)
        output["chart"] = base64.b64encode(buffer.read()).decode()
        plt.close()
        
    print(json.dumps(output))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

            const pythonProcess = spawn('python', ['-c', wrapperScript]);
            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                try {
                    const parsed = JSON.parse(stdout);
                    resolve(parsed);
                } catch (e) {
                    resolve({ success: false, output: stdout, error: stderr || 'Execution failed or timed out' });
                }
            });

            // Set a timeout
            setTimeout(() => {
                pythonProcess.kill();
                resolve({ success: false, output: '', error: 'Execution timed out' });
            }, 30000);
        });
    }
}

export const executor = new ExecutionService();
