import { spawn } from 'child_process';
import path from 'path';

export class ExecutionService {
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
        return new Promise((resolve) => {
            const filesJson = JSON.stringify(files.map(f => ({ ...f, path: f.path.replace(/\\/g, '/') })));
            const wrapperScript = `
import pandas as pd
import numpy as np
import base64
from io import BytesIO
import json
import os
import traceback
import sys

# Optional imports
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

files = ${filesJson}
dfs = {}

try:
    for f in files:
        filepath = f['path']
        name = f['name']
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
            elif ext == '.tsv':
                dfs[name] = pd.read_csv(filepath, sep='\\t')
        except Exception as e:
            sys.stderr.write(f"Warning: Could not load {name}: {str(e)}\\n")

    df = next(iter(dfs.values())) if dfs else pd.DataFrame()
    
    loc = {
        'pd': pd, 'np': np, 'dfs': dfs, 'df': df,
        'result': None, 'plotly_json': [],
        'os': os, 'json': json, 'base64': base64, 'BytesIO': BytesIO,
    }
    
    if HAS_MPL:
        loc['plt'] = plt
        loc['sns'] = sns
    if HAS_PLOTLY:
        loc['px'] = px
        loc['go'] = go
    if HAS_SCIPY:
        loc['scipy_stats'] = scipy_stats
    
    exec("""${code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}""", globals(), loc)
    result = loc.get('result')
    
    # Format result
    result_str = ''
    if result is not None:
        if isinstance(result, pd.DataFrame):
            result_str = result.to_string(max_rows=50, max_cols=20)
        elif isinstance(result, pd.Series):
            result_str = result.to_string(max_rows=50)
        else:
            result_str = str(result)
    else:
        result_str = 'Analysis complete'
    
    # Capture matplotlib charts
    charts = []
    if HAS_MPL:
        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buf = BytesIO()
            fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                       facecolor='#0a0a0a', edgecolor='none')
            buf.seek(0)
            charts.append(base64.b64encode(buf.read()).decode())
            plt.close(fig)
    
    # Capture plotly charts
    plotly_charts = loc.get('plotly_json', [])
    if HAS_PLOTLY and result is not None:
        if hasattr(result, 'to_plotly_json') or (hasattr(result, 'to_json') and hasattr(result, 'data')):
            plotly_charts.append(json.loads(result.to_json()))
            result_str = 'Interactive chart generated'
    
    # Get updated df sample
    updated_df_sample = None
    current_df = loc.get('df', None)
    if isinstance(current_df, pd.DataFrame) and not current_df.empty:
        updated_df_sample = current_df.head(5).to_dict(orient='records')
    
    output = {
        "success": True,
        "result": result_str[:5000],
        "charts": charts,
        "plotly_charts": plotly_charts,
        "updated_df_sample": updated_df_sample
    }
    print(json.dumps(output))

except Exception as e:
    print(json.dumps({
        "success": False, 
        "result": "",
        "error": str(e),
        "traceback": traceback.format_exc(),
        "charts": [],
        "plotly_charts": []
    }))
`;

            // Try multiple Python commands
            const pythonCommands = ['py', 'python3', 'python'];
            let pythonPath = 'py';

            const pythonProcess = spawn(pythonPath, ['-c', wrapperScript], {
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (exitCode) => {
                try {
                    const lines = stdout.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    const parsed = JSON.parse(lastLine);
                    resolve(parsed);
                } catch (e) {
                    console.error("Executor Failed:", stdout.slice(-500), stderr.slice(-500));
                    resolve({
                        success: false,
                        result: '',
                        error: stderr || 'Execution engine encountered an error',
                        charts: [],
                        plotly_charts: []
                    });
                }
            });

            pythonProcess.on('error', (err) => {
                resolve({
                    success: false,
                    result: '',
                    error: `Failed to start Python: ${err.message}`,
                    charts: [],
                    plotly_charts: []
                });
            });

            // Timeout after 45 seconds
            setTimeout(() => {
                try { pythonProcess.kill(); } catch { }
                resolve({
                    success: false,
                    result: '',
                    error: 'Analysis timed out (45s limit)',
                    charts: [],
                    plotly_charts: []
                });
            }, 45000);
        });
    }
}

export const executor = new ExecutionService();
