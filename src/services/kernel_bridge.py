#!/usr/bin/env python3
"""
SPARTA - Kernel Bridge
Persistent Python execution environment for data analysis.
Receives JSON requests via stdin, executes code, returns results via stdout.
Supports: pandas, numpy, matplotlib, seaborn, plotly, scipy, sklearn.
"""

import sys
import json
import os
import re
import traceback
import base64
from datetime import date, datetime, time
from io import BytesIO, StringIO
from contextlib import redirect_stdout, redirect_stderr

BENIGN_STDERR_PATTERNS = [
    re.compile(
        r'(?ms)^.*sklearn[\\/].*UserWarning:\s*X does not have valid feature names, but .* was fitted with feature names\s*\n\s*warnings\.warn\(\s*\n?'
    ),
]


def _filter_benign_stderr(stderr_text):
    filtered = stderr_text or ''
    for pattern in BENIGN_STDERR_PATTERNS:
        filtered = pattern.sub('', filtered)

    filtered_lines = [line.rstrip() for line in filtered.splitlines() if line.strip()]
    return '\n'.join(filtered_lines).strip()

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
    from plotly.subplots import make_subplots as _make_subplots

    DEFAULT_COLORWAY = [
        '#0EA5E9', '#14B8A6', '#F59E0B', '#F97316',
        '#22C55E', '#2563EB', '#FB7185', '#84CC16',
        '#06B6D4', '#A16207', '#0F766E', '#DC2626',
    ]

    pio.templates['sparta'] = go.layout.Template(
        layout=go.Layout(
            colorway=DEFAULT_COLORWAY,
            font=dict(family='system-ui, IBM Plex Sans, DejaVu Sans, Arial', size=12, color='#0f172a'),
            paper_bgcolor='#f8fafc',
            plot_bgcolor='#eef4f7',
            xaxis=dict(
                gridcolor='rgba(148,163,184,0.22)',
                zerolinecolor='rgba(148,163,184,0.28)',
                title_font=dict(size=13, color='#475569'),
                tickfont=dict(size=11, color='#334155'),
                showgrid=True,
            ),
            yaxis=dict(
                gridcolor='rgba(148,163,184,0.22)',
                zerolinecolor='rgba(148,163,184,0.28)',
                title_font=dict(size=13, color='#475569'),
                tickfont=dict(size=11, color='#334155'),
                showgrid=True,
            ),
            legend=dict(
                font=dict(size=12, color='#334155'),
                bgcolor='rgba(248,250,252,0.92)',
                bordercolor='rgba(148,163,184,0.35)',
                borderwidth=1,
                orientation='h',
                yanchor='bottom',
                y=1.02,
                xanchor='right',
                x=1,
            ),
            margin=dict(l=60, r=40, t=80, b=60),
            hoverlabel=dict(bgcolor='#e2e8f0', font_size=12, font_color='#0f172a'),
        )
    )
    pio.templates['sparta'].layout.colorscale = dict(
        sequential=px.colors.sequential.Viridis,
        diverging=px.colors.diverging.RdBu,
        sequentialminus=px.colors.sequential.Blues
    )
    pio.templates.default = 'sparta'
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

try:
    import statsmodels.api as sm
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    from statsmodels.tsa.seasonal import seasonal_decompose
    HAS_STATSMODELS = True
except ImportError:
    HAS_STATSMODELS = False


class SafeJSONEncoder(json.JSONEncoder):
    """JSON encoder that handles pandas/numpy types safely."""
    def default(self, obj):
        if obj is pd.NaT:
            return None
        if isinstance(obj, np.datetime64):
            return None if np.isnat(obj) else str(obj)
        if isinstance(obj, pd.Timestamp):
            return str(obj)
        if isinstance(obj, (datetime, date, time)):
            return obj.isoformat()
        if isinstance(obj, pd.Timedelta):
            return str(obj)
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            f = float(obj)
            if f != f or f == float('inf') or f == float('-inf'):
                return None
            return f
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        if isinstance(obj, (bytes, bytearray)):
            return obj.decode('utf-8', errors='replace')
        try:
            return super().default(obj)
        except TypeError:
            return str(obj)


# Persistent session state across requests
session_state = {
    'dfs': {},
    'file_sources': {},
    'variables': {},
    'history': [],
    'active_scope_signature': None,
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


def _columns_look_autogenerated(df: pd.DataFrame) -> bool:
    """Check if column names look auto-generated (e.g. 'Unnamed: 0')."""
    unnamed_count = sum(1 for c in df.columns if 'unnamed' in str(c).lower())
    return unnamed_count > len(df.columns) * 0.5


def _score_excel_sheet(sheet_name: str, df: pd.DataFrame) -> float:
    """Prefer decision-ready statement sheets over verbose notes tabs."""
    cleaned = df.dropna(how='all').dropna(axis=1, how='all') if isinstance(df, pd.DataFrame) else pd.DataFrame()
    base_score = float(len(cleaned) * max(1, len(cleaned.columns)))
    if cleaned.empty:
        return base_score

    normalized_sheet_name = str(sheet_name or '').strip().lower()
    if re.search(r'notes?\b', normalized_sheet_name):
        base_score -= 5000
    if re.search(r'p\s*&\s*l|pnl|profit|loss|income statement|statement of profit|statement of loss', normalized_sheet_name):
        base_score += 7000
    if re.fullmatch(r'bs|balance sheet', normalized_sheet_name):
        base_score -= 1500

    preview_parts = [normalized_sheet_name]
    preview_parts.extend(str(col).strip().lower() for col in cleaned.columns[:18])
    try:
        for col in cleaned.columns[:3]:
            series = cleaned[col]
            if isinstance(series, pd.DataFrame):
                series = series.iloc[:, 0]
            preview_parts.extend(str(value).strip().lower() for value in series.head(30).tolist())
    except Exception:
        pass

    preview_text = ' '.join(part for part in preview_parts if part and part != 'nan')
    finance_hits = len(re.findall(
        r'revenue from operations|total income|total expenses|profit before tax|profit for the year|\bpat\b|inventory|employee benefits|other income|depreciation',
        preview_text,
        flags=re.I,
    ))
    required_hits = sum(
        1 for pattern in [r'total income', r'profit for the year', r'revenue from operations']
        if re.search(pattern, preview_text, flags=re.I)
    )
    month_hits = len(re.findall(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\'-]*(\d{2,4})?', preview_text, flags=re.I))

    if 'particulars' in preview_text:
        base_score += 1200
    base_score += finance_hits * 220
    base_score += required_hits * 850
    base_score += min(month_hits, 12) * 60
    return base_score


def _is_usable_frame(df) -> bool:
    """Return True when *df* contains real data (not an error sentinel)."""
    if not isinstance(df, pd.DataFrame) or df.empty:
        return False
    # Error/failure DataFrames created by load_files have only a 'load_error' column.
    if list(df.columns) == ['load_error']:
        return False
    return True


def _normalize_file_id(raw_file_id) -> str:
    """Normalize client-provided file ids for stable dataframe keys."""
    if raw_file_id is None:
        return ''
    value = str(raw_file_id).strip()
    return value


def _build_file_key(file_id: str, name: str, filepath: str) -> str:
    """Build a collision-resistant key for the dfs cache."""
    if file_id:
        return f'id:{file_id}'
    if filepath:
        return f'path:{filepath}'
    return f'name:{name}'


def _set_name_alias(name: str, filepath: str, df: pd.DataFrame):
    """Preserve filename access while avoiding overwriting a non-empty alias with an empty frame."""
    if not name:
        return

    existing = session_state['dfs'].get(name)
    if isinstance(existing, pd.DataFrame) and not existing.empty and df.empty:
        return

    session_state['dfs'][name] = df
    session_state['file_sources'][name] = filepath


def ensure_unique_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize duplicate column names so df[col] resolves to a Series consistently."""
    if not isinstance(df, pd.DataFrame) or len(df.columns) == 0:
        return df

    seen = {}
    new_columns = []
    renamed = False

    for index, raw in enumerate(df.columns):
        label = str(raw).strip() or f'column_{index + 1}'
        seen[label] = seen.get(label, 0) + 1
        unique_label = label if seen[label] == 1 else f'{label}_{seen[label]}'
        if unique_label != str(raw):
            renamed = True
        new_columns.append(unique_label)

    if not renamed:
        return df

    updated = df.copy()
    updated.columns = new_columns
    return updated


def load_files(files_json_str: str):
    """Load request files into the session state and refresh stale filename collisions."""
    try:
        files = json.loads(files_json_str)
    except (json.JSONDecodeError, TypeError):
        return []

    requested_files = []

    for f in files:
        filepath = f.get('path', '')
        name = f.get('name', '')
        file_id = _normalize_file_id(f.get('id'))
        if not filepath or not name:
            continue

        file_key = _build_file_key(file_id, name, filepath)
        requested_files.append({
            'file_key': file_key,
            'path': filepath,
            'name': name,
            'id': file_id,
        })

        cached_path = session_state['file_sources'].get(file_key)
        cached_df = session_state['dfs'].get(file_key)
        should_reload = (
            cached_path != filepath
            or not _is_usable_frame(cached_df)
        )

        if not should_reload:
            _set_name_alias(name, filepath, cached_df)
            continue

        ext = os.path.splitext(filepath)[1].lower()
        try:
            loaded_df = None
            if ext == '.csv':
                loaded_df = read_csv_flexible(filepath)
            elif ext in ['.xlsx', '.xls']:
                # Advanced Sheet Discovery: Scan all sheets and pick the richest one
                xl = pd.ExcelFile(filepath)
                sheet_scores = []

                for sheet_name in xl.sheet_names:
                    temp_df = pd.read_excel(filepath, sheet_name=sheet_name)
                    # Cleaning to get honest count
                    temp_df = temp_df.dropna(how='all').dropna(axis=1, how='all')
                    score = _score_excel_sheet(sheet_name, temp_df)
                    sheet_scores.append((score, sheet_name, temp_df))

                # Sort by score descending and take the winner
                sheet_scores.sort(key=lambda x: x[0], reverse=True)
                df = sheet_scores[0][2] if sheet_scores else pd.DataFrame()

                # Robust cleaning
                df = df.dropna(how='all').dropna(axis=1, how='all')

                # Only search for a header row if columns look auto-generated
                if _columns_look_autogenerated(df) and len(df.columns) > 0:
                    header_found = False
                    for i in range(min(15, len(df))):
                        row = df.iloc[i]
                        non_null_count = row.notnull().sum()
                        if non_null_count >= 2 and row.nunique() >= non_null_count * 0.8:
                            new_header = [str(h).replace('\n', ' ').strip() for h in df.iloc[i]]
                            candidate_df = df.iloc[i+1:].copy()
                            candidate_df.columns = new_header
                            candidate_df = candidate_df.dropna(how='all').dropna(axis=1, how='all')
                            # Only accept the new header if it leaves data rows
                            if len(candidate_df) > 0:
                                df = candidate_df
                                header_found = True
                            break

                    # If no header found, assign generic column names
                    if not header_found and len(df) > 0:
                        df.columns = [f'Column_{i+1}' for i in range(len(df.columns))]

                # Fallback: if cleaning left 0 rows, re-read the best sheet with header=None
                if len(df) == 0 and sheet_scores:
                    raw_df = pd.read_excel(filepath, sheet_name=sheet_scores[0][1], header=None)
                    raw_df = raw_df.dropna(how='all').dropna(axis=1, how='all')
                    if len(raw_df) > 0:
                        new_header = [str(h).replace('\n', ' ').strip() for h in raw_df.iloc[0]]
                        df = raw_df.iloc[1:]
                        df.columns = new_header
                        df = df.dropna(how='all').dropna(axis=1, how='all')
                        if len(df) == 0:
                            df = raw_df.reset_index(drop=True)
                loaded_df = df.reset_index(drop=True)
            elif ext == '.json':
                loaded_df = read_json_flexible(filepath)
            elif ext == '.parquet':
                loaded_df = pd.read_parquet(filepath)
            elif ext == '.tsv':
                loaded_df = read_csv_flexible(filepath, forced_sep='\t')
            elif ext in ['.txt']:
                # Try CSV first, then raw text
                try:
                    parsed = read_csv_flexible(filepath)
                    if len(parsed.columns) < 2:
                        raise ValueError('single column text file')
                    loaded_df = parsed
                except Exception:
                    with open(filepath, 'r', encoding='utf-8', errors='replace') as fh:
                        content = fh.read()
                    loaded_df = pd.DataFrame({'text': content.split('\n')})

            if isinstance(loaded_df, pd.DataFrame):
                loaded_df = ensure_unique_columns(loaded_df)

            if not isinstance(loaded_df, pd.DataFrame):
                loaded_df = pd.DataFrame({'load_error': [f'Unsupported file type for {name}: {ext}']})

            session_state['dfs'][file_key] = loaded_df
            session_state['file_sources'][file_key] = filepath
            _set_name_alias(name, filepath, loaded_df)
        except Exception as e:
            sys.stderr.write(f"Error: Could not load {name}: {str(e)}\n")
            failure_df = pd.DataFrame({'load_error': [f'Failed to load {name}: {str(e)}']})
            session_state['dfs'][file_key] = failure_df
            session_state['file_sources'][file_key] = filepath
            _set_name_alias(name, filepath, failure_df)

    return requested_files


def execute_request(request: dict) -> dict:
    """Execute a single code request and return results."""
    code = request.get('code', '')
    files_json = request.get('files_json', '[]')

    # Load any new files
    requested_files = load_files(files_json)
    scope_signature = json.dumps(sorted(item['file_key'] for item in requested_files))

    if session_state.get('active_scope_signature') != scope_signature:
        session_state['variables'] = {}
        session_state['active_scope_signature'] = scope_signature

    active_dfs = {}
    active_file_sources = {}
    requested_dfs = []
    dataset_catalog = []

    for item in requested_files:
        file_key = item['file_key']
        candidate = session_state['dfs'].get(file_key)
        if not _is_usable_frame(candidate):
            continue

        requested_dfs.append(candidate)
        active_dfs[file_key] = candidate
        active_file_sources[file_key] = item['path']
        active_dfs[item['name']] = candidate
        active_file_sources[item['name']] = item['path']
        dataset_catalog.append({
            'source_key': file_key,
            'display_name': item['name'],
            'path': item['path'],
            'rows': int(len(candidate)),
            'columns': list(map(str, list(candidate.columns))),
            'column_count': int(len(candidate.columns)),
        })

    dfs = active_dfs
    df = requested_dfs[0] if requested_dfs else pd.DataFrame()

    # --- Safe pd.to_numeric wrapper to prevent "arg must be a list/tuple/Series" ---
    _original_to_numeric = pd.to_numeric

    def _safe_to_numeric(arg, errors='raise', downcast=None):
        """Wrapper around pd.to_numeric that handles DataFrames, scalars, and edge cases."""
        if arg is None:
            return np.nan
        # Scalar passthrough
        if isinstance(arg, (int, float, np.integer, np.floating)):
            return arg
        if isinstance(arg, str):
            arg = arg.strip().replace(',', '')
            if not arg or arg in ('-', '\u2014', 'N/A', 'NA', 'null', 'None', 'nan'):
                return np.nan
            try:
                return float(arg)
            except (ValueError, TypeError):
                if errors == 'coerce':
                    return np.nan
                raise
        # DataFrame: apply column-wise to return a DataFrame of numeric columns
        if isinstance(arg, pd.DataFrame):
            return arg.apply(lambda col: _original_to_numeric(col, errors=errors, downcast=downcast))
        # Proper iterable types the original function expects
        if isinstance(arg, (pd.Series, pd.Index, np.ndarray, list, tuple)):
            return _original_to_numeric(arg, errors=errors, downcast=downcast)
        # Last resort: try converting to a Series first
        try:
            return _original_to_numeric(pd.Series([arg]), errors=errors, downcast=downcast).iloc[0]
        except Exception:
            if errors == 'coerce':
                return np.nan
            raise TypeError(f"Cannot convert {type(arg).__name__} to numeric")

    # Patch pd.to_numeric in the execution namespace
    pd.to_numeric = _safe_to_numeric

    # --- Smart forecast helper: ExponentialSmoothing → polyfit → moving average ---
    def _smart_forecast(series, n_periods=6, confidence=0.8):
        """Return (forecast, upper_band, lower_band) lists of length n_periods."""
        arr = np.array(series, dtype=float)
        arr = arr[~np.isnan(arr)]
        n = len(arr)
        if n < 2:
            flat = float(arr[-1]) if n == 1 else 0.0
            return ([flat] * n_periods, [flat] * n_periods, [flat] * n_periods)
        forecast = None
        residuals = None
        # Try Holt-Winters when N >= 8
        if HAS_STATSMODELS and n >= 8:
            try:
                from statsmodels.tsa.holtwinters import ExponentialSmoothing as _ES
                seasonal = 'add' if n >= 24 else None
                sp = 12 if (seasonal and n >= 24) else None
                hw = _ES(arr, trend='add', seasonal=seasonal, seasonal_periods=sp,
                         initialization_method='estimated').fit(optimized=True)
                forecast = hw.forecast(n_periods).tolist()
                residuals = arr - hw.fittedvalues
            except Exception:
                forecast = None
        # Linear polyfit fallback
        if forecast is None:
            x = np.arange(n, dtype=float)
            slope, intercept = np.polyfit(x, arr, 1)
            x_f = np.arange(n, n + n_periods, dtype=float)
            forecast = (intercept + slope * x_f).tolist()
            residuals = arr - (intercept + slope * x)
        # Confidence band (widens with horizon)
        sigma = float(np.std(residuals, ddof=1)) if residuals is not None and len(residuals) >= 2 else (float(np.std(arr, ddof=1)) if n >= 2 else 0.0)
        z = 1.28  # default 80%
        if HAS_SCIPY:
            try:
                z = float(scipy_stats.norm.ppf(0.5 + confidence / 2))
            except Exception:
                pass
        upper = [float(f) + z * sigma * np.sqrt(1 + (i + 1) / max(n, 1)) for i, f in enumerate(forecast)]
        lower = [float(f) - z * sigma * np.sqrt(1 + (i + 1) / max(n, 1)) for i, f in enumerate(forecast)]
        return (forecast, upper, lower)

    # Build execution namespace with all available tools
    namespace = {
        'pd': pd,
        'np': np,
        'dfs': dfs,
        'df': df,
        'file_sources': active_file_sources,
        'dataset_catalog': dataset_catalog,
        'result': None,
        'plotly_json': [],
        'os': os,
        'json': json,
        'base64': base64,
        'BytesIO': BytesIO,
        'StringIO': StringIO,
        'safe_to_numeric': _safe_to_numeric,
        'smart_forecast': _smart_forecast,
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
        namespace['make_subplots'] = _make_subplots
    if HAS_SCIPY:
        namespace['scipy_stats'] = scipy_stats
    if HAS_SKLEARN:
        namespace['preprocessing'] = preprocessing
        namespace['cluster'] = cluster
        namespace['decomposition'] = decomposition
        namespace['ensemble'] = ensemble
        namespace['linear_model'] = linear_model
        namespace['metrics'] = metrics
        namespace['sklearn'] = __import__('sklearn')
    if HAS_STATSMODELS:
        namespace['sm'] = sm
        namespace['ExponentialSmoothing'] = ExponentialSmoothing
        namespace['seasonal_decompose'] = seasonal_decompose

    # Merge persisted variables
    namespace.update(session_state['variables'])

    try:
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()

        # Execute the code
        with redirect_stdout(stdout_buffer), redirect_stderr(stderr_buffer):
            exec(code, namespace)

        captured_stdout = stdout_buffer.getvalue().strip()
        captured_stderr = _filter_benign_stderr(stderr_buffer.getvalue())

        # Extract result
        result = namespace.get('result', None)
        result_str = ''
        if result is not None:
            is_plotly_result = (
                HAS_PLOTLY and (
                    hasattr(result, 'to_plotly_json')
                    or (isinstance(result, dict) and 'data' in result and 'layout' in result)
                )
            )

            if is_plotly_result:
                result_title = ''
                if isinstance(result, dict):
                    result_title = str(((result.get('layout') or {}).get('title') or {}).get('text', '')).strip()
                else:
                    try:
                        result_title = str(getattr(getattr(result, 'layout', None), 'title', None).text or '').strip()
                    except Exception:
                        result_title = ''
                result_str = f'Interactive chart generated{f": {result_title}" if result_title else ""}'
            elif isinstance(result, pd.DataFrame):
                result_str = result.to_string(max_rows=50, max_cols=20)
            elif isinstance(result, pd.Series):
                result_str = result.to_string(max_rows=50)
            else:
                result_str = str(result)

        output_sections = []
        if captured_stdout:
            output_sections.append(captured_stdout)
        if result_str and result_str != 'Execution successful':
            output_sections.append(result_str)
        if captured_stderr:
            output_sections.append(f'Warnings:\n{captured_stderr}')
        if not output_sections:
            output_sections.append('Execution successful')
        result_str = '\n\n'.join(output_sections)

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
        plotly_raw = namespace.get('plotly_json', [])
        if isinstance(plotly_raw, list):
            plotly_charts = list(plotly_raw)
        elif plotly_raw is None:
            plotly_charts = []
        else:
            plotly_charts = [plotly_raw]

        def _dedupe_plotly(items):
            unique_items = []
            plotly_seen = set()
            for item in items:
                try:
                    normalized = json.loads(json.dumps(item, cls=SafeJSONEncoder))
                    signature = json.dumps(normalized, sort_keys=True, cls=SafeJSONEncoder)
                except Exception:
                    normalized = item
                    signature = None

                if signature is not None:
                    if signature in plotly_seen:
                        continue
                    plotly_seen.add(signature)

                unique_items.append(normalized)
            return unique_items

        plotly_charts = _dedupe_plotly(plotly_charts)
        
        # Also check if result is a Plotly figure and auto-discover figures in namespace.
        if HAS_PLOTLY:
            discovered_plotly = []

            def _append_plotly_chart(value):
                try:
                    if value is None:
                        return
                    if hasattr(value, 'to_plotly_json'):
                        chart_json = value.to_plotly_json()
                        discovered_plotly.append(json.loads(json.dumps(chart_json, cls=SafeJSONEncoder)))
                    elif isinstance(value, dict) and 'data' in value and 'layout' in value:
                        discovered_plotly.append(json.loads(json.dumps(value, cls=SafeJSONEncoder)))
                except Exception:
                    pass

            _append_plotly_chart(result)

            for key, value in namespace.items():
                if key.startswith('__'):
                    continue
                _append_plotly_chart(value)

            if discovered_plotly:
                plotly_charts.extend(_dedupe_plotly(discovered_plotly))

        # Ensure output is always a list for UI rendering.
        if not isinstance(plotly_charts, list):
            plotly_charts = [plotly_charts]

        plotly_charts = _dedupe_plotly(plotly_charts)

        if len(plotly_charts) > 0 and not captured_stdout and result_str.strip() == 'Execution successful':
            result_str = 'Interactive chart generated'

        # ── Post-execution axis label & legend quality patch ─────────────────
        if HAS_PLOTLY and plotly_charts:
            _AX_RE = re.compile(r'^[xy]axis\d*$')

            def _infer_ax_label(traces, letter):
                for tr in traces:
                    sample = list((tr.get('x') if letter == 'x' else tr.get('y')) or [])[:8]
                    if not sample:
                        continue
                    if any(isinstance(v, str) and not str(v).replace('.', '', 1).lstrip('-').isdigit() for v in sample):
                        return 'Category' if letter == 'x' else 'Value'
                    return 'Period' if letter == 'x' else 'Value'
                return ''

            _patched = []
            for _ch in plotly_charts:
                try:
                    _lo = dict(_ch.get('layout', {}))
                    _tr = _ch.get('data', [])
                    # Legend: enforce for multi-series charts
                    _vis = [t for t in _tr if str(t.get('type', 'scatter')).lower() not in ('table', 'indicator')]
                    if len(_vis) >= 2 and not _lo.get('showlegend', True):
                        _lo['showlegend'] = True
                    _lg = dict(_lo.get('legend', {}))
                    _lg.setdefault('font', {}).update({'size': 12})
                    _lg.setdefault('bgcolor', 'rgba(15,23,42,0.75)')
                    _lg.setdefault('bordercolor', 'rgba(148,163,184,0.25)')
                    _lg.setdefault('borderwidth', 1)
                    _lo['legend'] = _lg
                    # Axis titles: fill blanks
                    _aks = [k for k in _lo if _AX_RE.match(k)]
                    for _fb in ('xaxis', 'yaxis'):
                        if _fb not in _aks:
                            _aks.append(_fb)
                    for _ak in _aks:
                        _ax = dict(_lo.get(_ak, {}))
                        _at = _ax.get('title', {})
                        _txt = (_at if isinstance(_at, str) else _at.get('text', '')).strip()
                        if not _txt or 'click to enter' in _txt.lower():
                            _ltr = 'x' if _ak.startswith('x') else 'y'
                            _inf = _infer_ax_label(_tr, _ltr)
                            if _inf:
                                _ax['title'] = {'text': _inf, 'font': {'size': 13, 'color': '#94a3b8'}}
                        _ax.setdefault('tickfont', {'size': 11, 'color': '#cbd5e1'})
                        _lo[_ak] = _ax
                    _patched.append({**_ch, 'layout': _lo})
                except Exception:
                    _patched.append(_ch)
            plotly_charts = _patched

        updated_df_sample = None

        def _select_sample_frame():
            current_df = namespace.get('df', None)
            if _is_usable_frame(current_df):
                return current_df

            namespace_dfs = namespace.get('dfs', None)
            if isinstance(namespace_dfs, dict):
                for candidate in namespace_dfs.values():
                    if _is_usable_frame(candidate):
                        return candidate

            for candidate in session_state.get('dfs', {}).values():
                if _is_usable_frame(candidate):
                    return candidate

            return None

        sample_source_df = _select_sample_frame()
        if isinstance(sample_source_df, pd.DataFrame) and not sample_source_df.empty:
            sample_df = sample_source_df.head(12).copy()
            for col in sample_df.columns:
                if pd.api.types.is_datetime64_any_dtype(sample_df[col]):
                    sample_df[col] = sample_df[col].astype(str)
            updated_df_sample = json.loads(json.dumps(sample_df.replace({np.nan: None}).to_dict(orient='records'), cls=SafeJSONEncoder))

        # Persist variables for future calls (exclude builtins, modules)
        skip_keys = {'pd', 'np', 'plt', 'sns', 'px', 'go', 'pio', 'dfs', 'df', 'result',
                     'plotly_json', 'os', 'json', 'base64', 'BytesIO', 'StringIO', 'matplotlib',
                     'scipy_stats', 'preprocessing', 'cluster', 'decomposition',
                     'ensemble', 'linear_model', 'metrics', 'sklearn',
                     'make_subplots', 'file_sources', '__builtins__',
                     'safe_to_numeric', 'smart_forecast', 'sm', 'ExponentialSmoothing',
                     'seasonal_decompose', 'dataset_catalog'}
        for k, v in namespace.items():
            if k not in skip_keys and not k.startswith('__'):
                try:
                    json.dumps(v, cls=SafeJSONEncoder)  # Only persist serializable objects
                    session_state['variables'][k] = v
                except (TypeError, ValueError):
                    pass  # Skip non-serializable objects (but they stay in namespace)

        return {
            'success': True,
            'result': result_str[:15000],  # Cap result length (increased for full output)
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
    finally:
        # Restore original pd.to_numeric to avoid state leakage
        pd.to_numeric = _original_to_numeric


def main():
    """Main loop — reads JSON requests from stdin, writes results to stdout."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            result = execute_request(request)
            sys.stdout.write(json.dumps(result, cls=SafeJSONEncoder) + '\n')
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
