#!/usr/bin/env python3
"""
Mastiff AI - Kernel Bridge
Persistent Python execution environment for data analysis.
Receives JSON requests via stdin, executes code, returns results via stdout.
Supports: pandas, numpy, matplotlib, seaborn, plotly, scipy, sklearn.
"""

import sys
import json
import os
import traceback
import base64
from io import BytesIO

# Preload common libraries for faster execution
import pandas as pd
import numpy as np

try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    import seaborn as sns
    sns.set_theme(style="whitegrid", palette="colorblind")
    HAS_MPL = True
except ImportError:
    HAS_MPL = False

try:
    import plotly.express as px
    import plotly.graph_objects as go
    import plotly.io as pio

    DEFAULT_COLORWAY = [
        '#0B6E99', '#FF7F0E', '#2CA02C', '#D62728',
        '#9467BD', '#8C564B', '#17BECF', '#BCBD22'
    ]

    pio.templates['mastiff'] = go.layout.Template(
        layout=go.Layout(
            colorway=DEFAULT_COLORWAY,
            font=dict(family='IBM Plex Sans, DejaVu Sans, Arial', size=12, color='#1f2937'),
            paper_bgcolor='white',
            plot_bgcolor='white',
        )
    )
    pio.templates['mastiff'].layout.colorscale = dict(
        sequential=px.colors.sequential.Viridis,
        diverging=px.colors.diverging.RdBu,
        sequentialminus=px.colors.sequential.Blues
    )
    pio.templates.default = 'mastiff'
    HAS_PLOTLY = True
except ImportError:
    HAS_PLOTLY = False

try:
    from scipy import stats as scipy_stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

try:
    from sklearn import preprocessing, cluster, decomposition, ensemble, linear_model, metrics
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False


# Persistent session state across requests
session_state = {
    'dfs': {},
    'variables': {},
    'history': []
}


def read_csv_flexible(filepath: str, forced_sep: str = None) -> pd.DataFrame:
    """Read CSV/TSV files with delimiter and encoding fallback."""
    encodings = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']
    separators = [forced_sep] if forced_sep else [None, ',', ';', '\t', '|']
    last_error = None

    for encoding in encodings:
        for sep in separators:
            kwargs = {
                'encoding': encoding,
                'low_memory': False,
            }

            if sep is None:
                kwargs['sep'] = None
                kwargs['engine'] = 'python'
            else:
                kwargs['sep'] = sep

            try:
                df = pd.read_csv(filepath, **kwargs)

                if not forced_sep and df.shape[1] <= 1 and len(df.columns) > 0:
                    header_text = str(df.columns[0])
                    if any(sym in header_text for sym in [',', ';', '\t', '|'] if sym != sep):
                        continue

                return df
            except Exception as exc:
                last_error = exc

    if last_error:
        raise last_error

    return pd.read_csv(filepath, low_memory=False)


def read_json_flexible(filepath: str) -> pd.DataFrame:
    """Read JSON arrays/objects and line-delimited JSON files."""
    try:
        return pd.read_json(filepath)
    except ValueError:
        return pd.read_json(filepath, lines=True)


def load_files(files_json_str: str):
    """Load data files into the session state."""
    try:
        files = json.loads(files_json_str)
    except (json.JSONDecodeError, TypeError):
        return

    for f in files:
        filepath = f.get('path', '')
        name = f.get('name', '')
        if not filepath or not name:
            continue
        if name in session_state['dfs']:
            continue  # Already loaded
        
        ext = os.path.splitext(filepath)[1].lower()
        try:
            if ext == '.csv':
                session_state['dfs'][name] = read_csv_flexible(filepath)
            elif ext in ['.xlsx', '.xls']:
                # Advanced Sheet Discovery: Scan all sheets and pick the richest one
                xl = pd.ExcelFile(filepath)
                sheet_scores = []
                
                for sheet_name in xl.sheet_names:
                    temp_df = pd.read_excel(filepath, sheet_name=sheet_name)
                    # Cleaning to get honest count
                    temp_df = temp_df.dropna(how='all').dropna(axis=1, how='all')
                    score = len(temp_df) * len(temp_df.columns)
                    sheet_scores.append((score, sheet_name, temp_df))
                
                # Sort by score descending and take the winner
                sheet_scores.sort(key=lambda x: x[0], reverse=True)
                df = sheet_scores[0][2] if sheet_scores else pd.DataFrame()
                
                # Robust cleaning
                df = df.dropna(how='all').dropna(axis=1, how='all')
                
                # Try to find header row
                for i in range(min(15, len(df))):
                    row = df.iloc[i]
                    non_null_count = row.notnull().sum()
                    if non_null_count >= 2 and row.nunique() >= non_null_count * 0.8:
                        new_header = [str(h).replace('\n', ' ').strip() for h in df.iloc[i]]
                        df = df.iloc[i+1:]
                        df.columns = new_header
                        df = df.dropna(how='all').dropna(axis=1, how='all')
                        break
                session_state['dfs'][name] = df.reset_index(drop=True)
            elif ext == '.json':
                session_state['dfs'][name] = read_json_flexible(filepath)
            elif ext == '.parquet':
                session_state['dfs'][name] = pd.read_parquet(filepath)
            elif ext == '.tsv':
                session_state['dfs'][name] = read_csv_flexible(filepath, forced_sep='\t')
            elif ext in ['.txt']:
                # Try CSV first, then raw text
                try:
                    parsed = read_csv_flexible(filepath)
                    if len(parsed.columns) < 2:
                        raise ValueError('single column text file')
                    session_state['dfs'][name] = parsed
                except Exception:
                    with open(filepath, 'r', encoding='utf-8', errors='replace') as fh:
                        content = fh.read()
                    session_state['dfs'][name] = pd.DataFrame({'text': content.split('\n')})
        except Exception as e:
            sys.stderr.write(f"Warning: Could not load {name}: {str(e)}\n")


def execute_request(request: dict) -> dict:
    """Execute a single code request and return results."""
    code = request.get('code', '')
    files_json = request.get('files_json', '[]')

    # Load any new files
    load_files(files_json)

    dfs = session_state['dfs']
    df = next(iter(dfs.values())) if dfs else pd.DataFrame()

    # Build execution namespace with all available tools
    namespace = {
        'pd': pd,
        'np': np,
        'dfs': dfs,
        'df': df,
        'result': None,
        'plotly_json': [],
        'os': os,
        'json': json,
        'base64': base64,
        'BytesIO': BytesIO,
    }

    # Add optional libraries
    if HAS_MPL:
        namespace['plt'] = plt
        namespace['sns'] = sns
        namespace['matplotlib'] = matplotlib
    if HAS_PLOTLY:
        namespace['px'] = px
        namespace['go'] = go
        namespace['pio'] = pio
    if HAS_SCIPY:
        namespace['scipy_stats'] = scipy_stats
    if HAS_SKLEARN:
        namespace['preprocessing'] = preprocessing
        namespace['cluster'] = cluster
        namespace['decomposition'] = decomposition
        namespace['ensemble'] = ensemble
        namespace['linear_model'] = linear_model
        namespace['metrics'] = metrics

    # Merge persisted variables
    namespace.update(session_state['variables'])

    try:
        # Execute the code
        exec(code, namespace)

        # Extract result
        result = namespace.get('result', None)
        result_str = ''
        if result is not None:
            if isinstance(result, pd.DataFrame):
                result_str = result.to_string(max_rows=50, max_cols=20)
            elif isinstance(result, pd.Series):
                result_str = result.to_string(max_rows=50)
            else:
                result_str = str(result)
        else:
            result_str = 'Execution successful'

        # Capture matplotlib charts
        charts = []
        if HAS_MPL:
            for fig_num in plt.get_fignums():
                fig = plt.figure(fig_num)
                buf = BytesIO()
                fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                           facecolor='#0a0a0a', edgecolor='none',
                           transparent=False)
                buf.seek(0)
                charts.append(base64.b64encode(buf.read()).decode('utf-8'))
                plt.close(fig)

        # Capture plotly charts
        plotly_charts = namespace.get('plotly_json', [])
        
        # Also check if result is a Plotly figure
        if HAS_PLOTLY and result is not None:
            if hasattr(result, 'to_plotly_json'):
                plotly_charts.append(json.loads(result.to_json()))
                result_str = 'Interactive chart generated'
            elif isinstance(result, go.Figure):
                plotly_charts.append(json.loads(result.to_json()))
                result_str = 'Interactive chart generated'

        # Get updated df sample
        updated_df_sample = None
        current_df = namespace.get('df', None)
        if isinstance(current_df, pd.DataFrame) and not current_df.empty:
            updated_df_sample = current_df.head(5).to_dict(orient='records')

        # Persist variables for future calls (exclude builtins, modules)
        skip_keys = {'pd', 'np', 'plt', 'sns', 'px', 'go', 'pio', 'dfs', 'df', 'result',
                     'plotly_json', 'os', 'json', 'base64', 'BytesIO', 'matplotlib',
                     'scipy_stats', 'preprocessing', 'cluster', 'decomposition',
                     'ensemble', 'linear_model', 'metrics',
                     '__builtins__'}
        for k, v in namespace.items():
            if k not in skip_keys and not k.startswith('__'):
                try:
                    json.dumps(v)  # Only persist serializable objects
                    session_state['variables'][k] = v
                except (TypeError, ValueError):
                    pass  # Skip non-serializable objects (but they stay in namespace)

        return {
            'success': True,
            'result': result_str[:5000],  # Cap result length
            'charts': charts,
            'plotly_charts': plotly_charts,
            'updated_df_sample': updated_df_sample
        }

    except Exception as e:
        tb = traceback.format_exc()
        return {
            'success': False,
            'result': '',
            'error': str(e),
            'traceback': tb,
            'charts': [],
            'plotly_charts': []
        }


def main():
    """Main loop — reads JSON requests from stdin, writes results to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            result = execute_request(request)
            sys.stdout.write(json.dumps(result) + '\n')
            sys.stdout.flush()
        except json.JSONDecodeError:
            error_result = {
                'success': False,
                'error': 'Invalid JSON request',
                'result': '',
                'charts': [],
                'plotly_charts': []
            }
            sys.stdout.write(json.dumps(error_result) + '\n')
            sys.stdout.flush()
        except Exception as e:
            error_result = {
                'success': False,
                'error': f'Kernel error: {str(e)}',
                'result': '',
                'charts': [],
                'plotly_charts': []
            }
            sys.stdout.write(json.dumps(error_result) + '\n')
            sys.stdout.flush()


if __name__ == '__main__':
    main()
