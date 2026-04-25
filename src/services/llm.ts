import { GoogleGenAI } from '@google/genai';
import { AnalysisMode } from '@/src/types';
import { buildDeterministicSignalSummaryFromExecution } from '@/lib/deterministicSignalSummary';
import { buildDeterministicAnalysisFallbackPython } from './deterministicAnalysisFallback';

const MODE_CONFIGS: Record<AnalysisMode, {
    temperature: number;
    promptPrefix: string;
    maxHistorySlice: number;
}> = {
    chat: {
        temperature: 0.25,
        promptPrefix: `MODE: INTELLIGENT ANALYSIS
- Answer clearly, directly, and concisely.
- For conceptual questions, give a crisp theory answer with one practical example.
- If the user asks for analysis without data, provide an explicit assumption or a Python template.
- Never invent data, percentages, or trends.
- Use markdown formatting for clarity: headers, bullet points, code blocks.
- Be concise — no filler text. Every sentence must add value.
- ALWAYS produce charts/visualizations when numerical data is involved.`,
        maxHistorySlice: 10,
    },
    analysis: {
        temperature: 0.15,
        promptPrefix: `MODE: STRATEGIC ANALYSIS ENGINE (Digital Twin — Senior Strategic Business Analyst)

CORE MANDATE: Be CONCISE. Management reads bullet points, not essays. Every response must be crisp, actionable, and management-ready.

OUTPUT STYLE (CRITICAL):
- BREVITY IS KING: Use bullet points, not paragraphs. Max 2-3 sentences per insight.
 - INSIGHT-FIRST IN REPORTING: Surface the signal and evidence first; recommendations belong after the insights in the final narrative.
- NO FILLER: Remove "Let's look at...", "Based on the data...", "It's important to note..." — get straight to the point.
- TABLES > TEXT: When comparing metrics, use compact tables, not prose.
- CHARTS ARE MANDATORY: Every numerical analysis MUST produce at least one interactive Plotly chart. No exceptions.
- PLAN BEFORE CODING: Decide whether the task is profiling, comparison, root-cause, forecasting, cleaning, or a mixed request before writing Python.
- FULL CODE ONLY: Return complete runnable Python. Never truncate code, never use placeholders, and never omit imports or the final result assignment.

ANALYSIS GUIDELINES:
1. FORECAST FIRST: ALWAYS include a forecast/trend projection. What will happen next? This is mandatory, not optional.
2. SKEPTICISM: If data is small (N < 30), add a disclaimer. If margins are perfectly uniform, flag it as formulaic.
3. OUTLIER ISOLATION: Identify "The Villain" — one entry ruining the stats. Show adjusted stats without it.
4. THE "SO WHAT?" TEST: Every finding → Immediate Action. No finding without a recommendation.
5. DIAGNOSTIC OVER DESCRIPTIVE: Explain WHY, not just WHAT. Variance attribution: Price, Volume, or Cost?
6. MULTIVARIATE: Look for co-occurrence patterns across dimensions.
7. GAPS & ANOMALIES: If a gap or anomaly exists, don't just report it — hypothesize WHY it's there.
8. Handle nulls silently — do not dedicate analysis to missing cells.
9. If multiple datasets are active, compare them deliberately on common dimensions first, then call out confidence limits.
10. If the first pass loses rows because of blank lines, spacer columns, or messy headers, recover and continue instead of giving up.
11. FINANCE PATTERN DETECTION: If columns include Revenue, EBITDA, Net Income, Gross Profit, PAT, EBIT, Margins, Cost, Expense, Budget, Actuals, Variance:
    - ALWAYS compute YoY, MoM, QoQ growth rates where time is available
    - ALWAYS compute margin ratios: Gross Margin, EBITDA Margin, Net Margin
    - Flag margin compression/expansion and explain the driver (Price, Volume, or Cost)
    - Show waterfall chart for revenue bridge or cost breakdown when available
    - Compute trailing 3-period moving average for smoothing
12. CONFIDENCE BANDS: For every forecast, compute ±1 standard deviation confidence band and shade it visually
13. PATTERN DEPTH: Look for: seasonality cycles, regime changes (structural breaks), co-movement between columns, leading indicator relationships, and anomaly clusters. Don't just describe patterns — name the mechanism causing them.
14. MIND-BENDING INSIGHT: After standard analysis, always add one non-obvious insight the user probably hasn't considered — a hidden correlation, a counter-intuitive ratio, or a structural risk invisible in the top-line numbers.
- Never fabricate metrics or trends.
- ALWAYS generate colorful, interactive Plotly charts — mandatory, not optional.
- Tables alone are NEVER sufficient. Pair every table with a visualization.
- For management decisions: include confidence levels and risk.
- Rank insights by business impact (highest first).`,
        maxHistorySlice: 8,
    },
};

const VISUALIZATION_HINTS = /(chart|plot|graph|visuali[sz]e|histogram|pie|bar|line|scatter|heatmap|dashboard)/i;
const CAPABILITY_QUERY_PATTERNS = [
    'what can you do',
    'what do you do',
    'capabilit(?:y|ies)',
    'how can you help',
    'who are you',
    'what are you',
];
const SELF_AWARENESS_QUERY_PATTERNS = [
    'self[- ]aware',
    'self awareness',
    'conscious',
    'sentient',
    'understand (?:(?:your|ur|its|the model\'?s)) own existence',
    'aware of (?:(?:your|ur|its|the model\'?s)) existence',
    'does the model understand its own existence',
    'do you exist',
    'are you alive',
];
const CAPABILITY_QUERY_HINTS = new RegExp(`\\b(${CAPABILITY_QUERY_PATTERNS.join('|')})\\b`, 'i');
const SELF_AWARENESS_QUERY_HINTS = new RegExp(`\\b(${SELF_AWARENESS_QUERY_PATTERNS.join('|')})\\b`, 'i');

const ANALYSIS_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const SUMMARY_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const CHAT_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

interface ExecutionSummaryInput {
    success?: boolean;
    result?: string;
    error?: string;
    traceback?: string;
    charts?: string[];
    plotly_charts?: any[];
}

interface GenerateWithFallbackParams {
    models: string[];
    contents: any[];
    config?: any;
}

interface AnalysisCodePayload {
    explanation: string;
    code: string;
    requires_visualization?: boolean;
}

export interface ClassifiedLlmError {
    code: 'rate_limit' | 'context_limit' | 'configuration' | 'unknown';
    status: number;
    error: string;
    content: string;
}

function stripMarkdownCodeFences(text: string): string {
    return text.replace(/```json/g, '').replace(/```python/g, '').replace(/```/g, '').trim();
}

function extractJsonObjectCandidate(text: string): string | null {
    const source = text.trim();
    if (!source) return null;

    const start = source.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i++) {
        const ch = source[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }

    return null;
}

function extractPythonFence(text: string): string | null {
    const match = text.match(/```(?:python)?\s*([\s\S]*?)```/i);
    if (!match?.[1]) return null;
    const code = match[1].trim();
    return code || null;
}

function sanitizeJsonForParse(text: string): string {
    return text.replace(/"([^"\\]|\\.)*"/g, (match) =>
        match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    );
}

function parseAnalysisPayloadObject(parsed: any): AnalysisCodePayload | null {
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.code !== 'string' || !parsed.code.trim()) return null;

    return {
        explanation: typeof parsed.explanation === 'string' && parsed.explanation.trim()
            ? parsed.explanation.trim()
            : 'Generated analysis code from model output.',
        code: parsed.code,
        requires_visualization: typeof parsed.requires_visualization === 'boolean'
            ? parsed.requires_visualization
            : undefined,
    };
}

export function parseAnalysisPayloadFromText(rawText: string): AnalysisCodePayload | null {
    const text = (rawText || '').trim();
    if (!text) return null;

    const directAttempts = [
        text,
        stripMarkdownCodeFences(text),
        extractJsonObjectCandidate(text) || '',
    ].filter(Boolean);

    for (const attempt of directAttempts) {
        try {
            const parsed = JSON.parse(attempt);
            const payload = parseAnalysisPayloadObject(parsed);
            if (payload) return payload;
        } catch {
            try {
                const parsed = JSON.parse(sanitizeJsonForParse(attempt));
                const payload = parseAnalysisPayloadObject(parsed);
                if (payload) return payload;
            } catch {
                // Try next representation.
            }
        }
    }

    // Salvage plain code-fence output into a valid payload.
    const fencedCode = extractPythonFence(text);
    if (fencedCode) {
        return {
            explanation: 'Recovered analysis code from fenced model output.',
            code: fencedCode,
        };
    }

    // Last-resort salvage for raw code responses with no JSON wrapper.
    if (/(^|\n)\s*(import\s+|from\s+\w+\s+import\s+|df\s*=|result\s*=)/.test(text)) {
        return {
            explanation: 'Recovered analysis code from raw model response.',
            code: text,
        };
    }

    return null;
}

export function buildDeterministicAnalysisFallbackCode(wantsVisualization: boolean): string {
    return `import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import os

# Safe numeric conversion — prevents "arg must be a list, tuple, 1-d array, or Series"
def _safe_to_numeric(arg, errors='coerce'):
    if arg is None:
        return np.nan
    if isinstance(arg, (int, float, np.integer, np.floating)):
        return arg
    if isinstance(arg, pd.DataFrame):
        return arg.apply(lambda c: pd.to_numeric(c, errors=errors))
    if isinstance(arg, (pd.Series, pd.Index, np.ndarray, list, tuple)):
        return pd.to_numeric(arg, errors=errors)
    try:
        return float(str(arg).replace(',', '').strip())
    except (ValueError, TypeError):
        return np.nan if errors == 'coerce' else arg

def _dedup_columns(frame):
    cols = list(frame.columns)
    seen, new_cols = {}, []
    for c in cols:
        key = str(c)
        seen[key] = seen.get(key, 0) + 1
        new_cols.append(f'{key}_{seen[key]}' if seen[key] > 1 else key)
    frame.columns = new_cols
    return frame

# Deterministic fallback to keep analysis pipeline operational when LLM output is malformed.
def _is_usable(candidate):
    return isinstance(candidate, pd.DataFrame) and not candidate.empty and list(candidate.columns) != ['load_error']

df = df.copy() if _is_usable(df) else pd.DataFrame()
if not df.empty:
    df = _dedup_columns(df)
_usable_dfs = {}

if 'dfs' in globals() and isinstance(dfs, dict):
    for _name, _candidate in dfs.items():
        if _is_usable(_candidate):
            _usable_dfs[_name] = _dedup_columns(_candidate.copy())

if df.empty and 'dfs' in globals() and isinstance(dfs, dict):
    for _name, _candidate in dfs.items():
        if _is_usable(_candidate):
            df = _dedup_columns(_candidate.copy())
            break

# Last-resort: re-read files from disk when the in-memory df is still empty.
if df.empty and 'dfs' in globals() and isinstance(dfs, dict):
    _file_sources = globals().get('file_sources', {}) or {}
    for _src_key, _src_path in _file_sources.items():
        if not _src_path or not os.path.isfile(_src_path):
            continue
        try:
            _ext = os.path.splitext(_src_path)[1].lower()
            if _ext == '.csv':
                _rdf = pd.read_csv(_src_path, low_memory=False)
            elif _ext in ('.xlsx', '.xls'):
                _rdf = pd.read_excel(_src_path)
                _rdf = _rdf.dropna(how='all').dropna(axis=1, how='all')
                if len(_rdf) == 0:
                    _rdf = pd.read_excel(_src_path, header=None)
                    _rdf = _rdf.dropna(how='all').dropna(axis=1, how='all')
            elif _ext == '.json':
                _rdf = pd.read_json(_src_path)
            elif _ext == '.parquet':
                _rdf = pd.read_parquet(_src_path)
            elif _ext == '.tsv':
                _rdf = pd.read_csv(_src_path, sep='\\t', low_memory=False)
            else:
                continue
            if _is_usable(_rdf):
                df = _dedup_columns(_rdf.copy())
                dfs[_src_key] = _rdf
                _usable_dfs[_src_key] = _dedup_columns(_rdf.copy())
                break
        except Exception:
            continue

if not _usable_dfs and _is_usable(df):
    _usable_dfs['active_df'] = df.copy()

if df.empty:
    result = "No usable rows were loaded, so the actionable pass is limited to schema recovery and source checks."
else:
    _multi_file_ready = len(_usable_dfs) > 1
    if _multi_file_ready:
        _normalized_sets = []
        _profile_rows = []

        for _source_name, _source_df in _usable_dfs.items():
            _normalized_map = {str(_col).strip().lower(): _col for _col in _source_df.columns}
            _normalized_sets.append(set(_normalized_map.keys()))
            _numeric_hits = 0
            for _col in _source_df.columns:
                _col_data = _source_df[_col]
                if isinstance(_col_data, pd.DataFrame):
                    _col_data = _col_data.iloc[:, 0]
                if _safe_to_numeric(_col_data, errors='coerce').notna().sum() > 0:
                    _numeric_hits += 1
            _profile_rows.append({
                'source_file': str(_source_name),
                'rows': int(len(_source_df)),
                'columns': int(len(_source_df.columns)),
                'numeric_columns': int(_numeric_hits),
            })

        _shared_columns = set.intersection(*_normalized_sets) if _normalized_sets else set()
        _shared_numeric = []
        for _shared_key in sorted(_shared_columns):
            _numeric_ok = True
            for _source_name, _source_df in _usable_dfs.items():
                _source_map = {str(_col).strip().lower(): _col for _col in _source_df.columns}
                _raw = _source_df[_source_map[_shared_key]]
                if isinstance(_raw, pd.DataFrame):
                    _raw = _raw.iloc[:, 0]
                _series = _safe_to_numeric(_raw, errors='coerce')
                if _series.notna().sum() == 0:
                    _numeric_ok = False
                    break
            if _numeric_ok:
                _shared_numeric.append(_shared_key)

        _profile_df = pd.DataFrame(_profile_rows)
        _primary_metric_key = _shared_numeric[0] if _shared_numeric else None
        _compare_rows = []
        _distribution_frames = []

        if _primary_metric_key:
            for _source_name, _source_df in _usable_dfs.items():
                _source_map = {str(_col).strip().lower(): _col for _col in _source_df.columns}
                _metric_col = _source_map[_primary_metric_key]
                _raw_metric = _source_df[_metric_col]
                if isinstance(_raw_metric, pd.DataFrame):
                    _raw_metric = _raw_metric.iloc[:, 0]
                _metric = _safe_to_numeric(_raw_metric, errors='coerce')
                _compare_rows.append({
                    'source_file': str(_source_name),
                    'metric_sum': float(_metric.fillna(0).sum()),
                    'metric_mean': float(_metric.mean()) if _metric.notna().sum() > 0 else 0.0,
                })
                _dist = pd.DataFrame({
                    'source_file': str(_source_name),
                    'metric_value': _metric.dropna().head(250),
                })
                if not _dist.empty:
                    _distribution_frames.append(_dist)

        _compare_df = pd.DataFrame(_compare_rows)
        _distribution_df = pd.concat(_distribution_frames, ignore_index=True) if _distribution_frames else pd.DataFrame()
        _shared_columns_label = ', '.join(sorted(list(_shared_columns))[:8]) if _shared_columns else 'none'

        print(f"Datasets analyzed: {len(_usable_dfs)}")
        print(f"Dataset names: {', '.join(list(_usable_dfs.keys())[:8])}")
        print(f"Shared columns: {_shared_columns_label}")
        if _primary_metric_key:
            print(f"Primary shared metric for comparison: {_primary_metric_key}")
        else:
            print("Primary shared metric for comparison: none detected")

        fig = make_subplots(
            rows=2,
            cols=2,
            specs=[[{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'table'}]],
            subplot_titles=(
                'Rows by dataset',
                'Cross-file KPI comparison',
                'Distribution by dataset',
                'Multi-file summary',
            ),
            vertical_spacing=0.14,
            horizontal_spacing=0.1,
        )

        fig.add_trace(
            go.Bar(
                x=_profile_df['source_file'],
                y=_profile_df['rows'],
                marker=dict(color='#38BDF8'),
                name='Rows',
                text=_profile_df['rows'],
                textposition='auto',
            ),
            row=1,
            col=1,
        )

        if not _compare_df.empty and _primary_metric_key:
            fig.add_trace(
                go.Bar(
                    x=_compare_df['source_file'],
                    y=_compare_df['metric_sum'],
                    marker=dict(color='#2DD4BF'),
                    name=f'{_primary_metric_key} sum',
                    text=_compare_df['metric_sum'].round(2),
                    textposition='auto',
                ),
                row=1,
                col=2,
            )
        else:
            fig.add_trace(
                go.Bar(
                    x=_profile_df['source_file'],
                    y=_profile_df['columns'],
                    marker=dict(color='#F59E0B'),
                    name='Columns',
                    text=_profile_df['columns'],
                    textposition='auto',
                ),
                row=1,
                col=2,
            )

        if not _distribution_df.empty and _primary_metric_key:
            fig.add_trace(
                go.Box(
                    x=_distribution_df['source_file'],
                    y=_distribution_df['metric_value'],
                    marker=dict(color='#818CF8'),
                    name=f'{_primary_metric_key} spread',
                    boxmean=True,
                ),
                row=2,
                col=1,
            )
        else:
            fig.add_trace(
                go.Bar(
                    x=_profile_df['source_file'],
                    y=_profile_df['numeric_columns'],
                    marker=dict(color='#F59E0B'),
                    name='Numeric columns',
                    text=_profile_df['numeric_columns'],
                    textposition='auto',
                ),
                row=2,
                col=1,
            )

        _summary_metrics = pd.DataFrame({
            'metric': ['datasets', 'total_rows', 'shared_columns', 'primary_metric'],
            'value': [
                int(len(_usable_dfs)),
                int(_profile_df['rows'].sum()),
                int(len(_shared_columns)),
                _primary_metric_key or 'none',
            ],
        })

        fig.add_trace(
            go.Table(
                header=dict(values=['Metric', 'Value'], fill_color='#0f172a', font=dict(color='white')),
                cells=dict(values=[_summary_metrics['metric'], _summary_metrics['value']], fill_color='#111827'),
                name='Summary',
            ),
            row=2,
            col=2,
        )

        fig.update_layout(
            paper_bgcolor='#F8FAFC',
            plot_bgcolor='#EEF4F7',
            font=dict(family='system-ui,sans-serif', color='#0F172A'),
            title=dict(text='Multi-Dataset Comparison Dashboard', font=dict(size=18, color='#0F172A')),
            margin=dict(l=50, r=30, t=90, b=40),
            height=780,
            legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1, font=dict(color='#334155')),
            barmode='group',
            hoverlabel=dict(bgcolor='#E2E8F0', font_size=12, font_color='#0F172A'),
        )
        result = fig

    numeric_cols = []
    for col in df.columns:
        _raw_col = df[col]
        if isinstance(_raw_col, pd.DataFrame):
            _raw_col = _raw_col.iloc[:, 0]
        s = _safe_to_numeric(_raw_col, errors='coerce')
        if s.notna().sum() > 0:
            numeric_cols.append(col)
            df[col] = s

    if _multi_file_ready:
        pass
    elif numeric_cols:
        value_col = numeric_cols[0]
        category_candidates = [c for c in df.columns if c not in numeric_cols]
        secondary_value_col = numeric_cols[1] if len(numeric_cols) > 1 else None
        cat_col = category_candidates[0] if category_candidates else None

        series_df = df[[value_col]].copy().reset_index(drop=True)
        series_df['row_id'] = np.arange(len(series_df))
        valid_series = series_df.dropna(subset=[value_col]).copy()
        if valid_series.empty:
            valid_series = pd.DataFrame({'row_id': [0], value_col: [0.0]})

        if len(valid_series) >= 2:
            coeffs = np.polyfit(valid_series['row_id'], valid_series[value_col], 1)
            future_steps = min(max(3, int(len(valid_series) * 0.2)), 12)
            future_index = np.arange(len(valid_series), len(valid_series) + future_steps)
            future_values = coeffs[0] * future_index + coeffs[1]
            forecast_df = pd.DataFrame({'row_id': future_index, value_col: future_values})
        else:
            forecast_df = pd.DataFrame({'row_id': [len(valid_series)], value_col: [float(valid_series[value_col].iloc[-1]) if not valid_series.empty else 0.0]})

        if cat_col:
            chart_df = df[[cat_col, value_col]].dropna().copy()
            if chart_df.empty:
                chart_df = pd.DataFrame({cat_col: ["All Rows"], value_col: [float(df[value_col].fillna(0).sum())]})
            else:
                chart_df = chart_df.groupby(cat_col, as_index=False)[value_col].sum().sort_values(value_col, ascending=False).head(10)
        else:
            chart_df = pd.DataFrame({'label': [f'Row {idx + 1}' for idx in range(min(len(valid_series), 10))], value_col: valid_series[value_col].head(10).tolist()})
            cat_col = 'label'

        summary_metrics = pd.DataFrame({
            'metric': ['rows', 'columns', f'sum_{value_col}', f'mean_{value_col}'],
            'value': [
                int(len(df)),
                int(len(df.columns)),
                float(df[value_col].fillna(0).sum()),
                float(df[value_col].fillna(0).mean()),
            ],
        })

        top_group_label = str(chart_df[cat_col].iloc[0]) if len(chart_df) > 0 else 'n/a'
        top_group_value = float(chart_df[value_col].iloc[0]) if len(chart_df) > 0 else 0.0
        forecast_last_value = float(forecast_df[value_col].iloc[-1]) if len(forecast_df) > 0 else 0.0
        print(f"Rows analyzed: {len(df)}")
        print(f"Primary metric: {value_col}")
        print(f"Top segment: {top_group_label} = {top_group_value:,.2f}")
        print(f"Run-rate forecast ({value_col}): {forecast_last_value:,.2f}")

        fig = make_subplots(
            rows=2,
            cols=2,
            specs=[[{'type': 'xy'}, {'type': 'xy'}], [{'type': 'xy'}, {'type': 'table'}]],
            subplot_titles=(
                f'{value_col} by {cat_col}',
                f'{value_col} trend and forecast',
                f'{value_col} distribution',
                'Fallback summary',
            ),
            vertical_spacing=0.14,
            horizontal_spacing=0.1,
        )

        fig.add_trace(
            go.Bar(
                x=chart_df[cat_col],
                y=chart_df[value_col],
                marker=dict(color=chart_df[value_col], colorscale='Viridis'),
                name='Top groups',
            ),
            row=1,
            col=1,
        )

        fig.add_trace(
            go.Scatter(
                x=valid_series['row_id'],
                y=valid_series[value_col],
                mode='lines+markers',
                name='Observed',
                line=dict(color='#19D3F3', width=3),
            ),
            row=1,
            col=2,
        )
        fig.add_trace(
            go.Scatter(
                x=forecast_df['row_id'],
                y=forecast_df[value_col],
                mode='lines+markers',
                name='Forecast',
                line=dict(color='#EF553B', width=3, dash='dash'),
            ),
            row=1,
            col=2,
        )

        # Confidence band (±1 std)
        if len(valid_series) >= 3:
            _std_val = float(valid_series[value_col].std())
            _upper = forecast_df[value_col] + _std_val
            _lower = forecast_df[value_col] - _std_val
            fig.add_trace(
                go.Scatter(
                    x=list(forecast_df['row_id']) + list(forecast_df['row_id'][::-1]),
                    y=list(_upper) + list(_lower[::-1]),
                    fill='toself',
                    fillcolor='rgba(239,85,59,0.12)',
                    line=dict(color='rgba(0,0,0,0)'),
                    name='Confidence band (±1σ)',
                    showlegend=True,
                    hoverinfo='skip',
                ),
                row=1,
                col=2,
            )

        fig.add_trace(
            go.Histogram(
                x=valid_series[value_col],
                nbinsx=min(20, max(5, len(valid_series))),
                marker=dict(color='#AB63FA'),
                name='Distribution',
            ),
            row=2,
            col=1,
        )

        fig.add_trace(
            go.Table(
                header=dict(values=['Metric', 'Value'], fill_color='#1f2937', font=dict(color='white')),
                cells=dict(values=[summary_metrics['metric'], summary_metrics['value'].round(2)], fill_color='#111827'),
                name='Summary',
            ),
            row=2,
            col=2,
        )

        if secondary_value_col:
            paired = df[[value_col, secondary_value_col]].dropna().copy()
            if not paired.empty:
                fig.add_trace(
                    go.Scatter(
                        x=paired[value_col],
                        y=paired[secondary_value_col],
                        mode='markers',
                        marker=dict(color='#00CC96', size=9, opacity=0.75),
                        name=f'{secondary_value_col} vs {value_col}',
                    ),
                    row=2,
                    col=1,
                )

        fig.update_layout(
            paper_bgcolor='#F8FAFC',
            plot_bgcolor='#EEF4F7',
            font=dict(family='system-ui,sans-serif', color='#0F172A'),
            title=dict(text=f'Analysis Dashboard: {value_col}', font=dict(size=18, color='#0F172A')),
            margin=dict(l=50, r=30, t=90, b=40),
            height=780,
            legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1, font=dict(color='#334155')),
            barmode='group',
            hoverlabel=dict(bgcolor='#E2E8F0', font_size=12, font_color='#0F172A'),
        )
        result = fig
    else:
        preview = df.head(10).astype(str)
        fig = go.Figure(
            data=[go.Table(
                header=dict(values=list(preview.columns)),
                cells=dict(values=[preview[col].tolist() for col in preview.columns]),
            )]
        )
        fig.update_layout(title='Fallback Data Preview: qualitative columns', height=520)
        result = fig if ${wantsVisualization ? 'True' : 'False'} else "Qualitative preview completed; no numeric KPI column was detected for quantitative ranking."
    `;
}

export function buildResilientDeterministicAnalysisFallbackCode(wantsVisualization: boolean): string {
    return buildDeterministicAnalysisFallbackPython(wantsVisualization);
}

export function getGroundedMetaResponse(userQuery: string): string | null {
    const normalizedQuery = userQuery.trim().toLowerCase();
    if (!normalizedQuery) return null;

    if (SELF_AWARENESS_QUERY_HINTS.test(normalizedQuery)) {
        return `## What SPARTA is

SPARTA does **not** have self-awareness, consciousness, or a subjective understanding of its own existence.

Its behavior comes from product-defined instructions, personas, and analysis workflows. When it says "I can" or "I do," that is interface shorthand for what the system is configured to do — not evidence of independent awareness.

## Why it may sound self-descriptive

Capability answers are generated from the guidance SPARTA is given about its role, preferred analysis style, and output standards. That can make the response sound confident or role-based, but it is still programmed behavior rather than self-knowledge.

## Intended product alignment

The intended SPARTA behavior is to act like a **skeptical, diagnostic analytics partner**:
- accept the active data and produce the strongest evidence-backed insights available
- explain **why** outcomes happened, not just **what** happened
- prioritize profitability and business impact over vanity metrics
- provide concrete next actions, not just summaries

If you want, I can also explain that alignment from either a **product vision** perspective or a **technical implementation** perspective.`;
    }

    if (CAPABILITY_QUERY_HINTS.test(normalizedQuery)) {
        return `## What SPARTA is designed to do

SPARTA is configured to provide **enterprise-grade data and analytics support**, especially for diagnostic and decision-oriented work rather than simple summarization.

### Core strengths
- accept uploaded files and adapt to the schema in front of it
- identify outliers and separate them from underlying performance
- focus on **profitability, margin, and business impact** instead of top-line volume alone
- explain **why** performance changed through diagnostic analysis
- recommend concrete next actions with risks and confidence caveats
- generate clear visual analysis when numerical data is involved

### Important clarification

These are **product-defined capabilities and operating rules**, not evidence that the model understands its own existence. The intended persona is a disciplined analytics assistant that behaves like a senior business analyst, while remaining a configured software system.`;
    }

    return null;
}

export function buildChatSystemPrompt(mode: AnalysisMode, personaInstruction: string = ''): string {
    const modeConfig = MODE_CONFIGS[mode];
    const sanitizedPersona = typeof personaInstruction === 'string'
        ? personaInstruction.slice(0, 500).trim()
        : '';
    const personaBlock = sanitizedPersona
        ? `\nANALYST PERSONA: ${sanitizedPersona}`
        : '';

    const codeBlockRule = mode === 'analysis'
        ? `- ABSOLUTELY NO PYTHON, SQL, OR CODE BLOCKS. Do not output fenced code blocks (\`\`\`python, \`\`\`sql, etc.) under any circumstances. Your audience is non-technical leadership.`
        : `- Use markdown formatting: ### headers, bullet points, **bold** for key metrics, tables for structured data.`;

    return `
You are SPARTA, an expert AI data and analytics assistant built for enterprise-grade intelligence.

${modeConfig.promptPrefix}
${personaBlock}

BEHAVIOR:
- BE CONCISE. Management reads bullet points, not essays.
- For theory questions: answer with depth but be concise — max 200 words.
- For management decisions: include confidence caveats and rank recommendations by impact.
- ${codeBlockRule}
- Be precise with numbers — never round excessively.
- When asked about data, LEAD WITH ACTIONS and insights, not code.
- LEAD WITH ACTIONS, not descriptions. What should the user do?
- If active data exists and the question is short or ambiguous, assume the user wants the answer grounded in that data and say the assumption briefly.
- If a query mixes theory and data, answer the data-backed portion first and keep any conceptual note short and useful.
- If active data exists, never refuse because the schema is not a specific domain template. Use the available columns and rows to produce the strongest actionable read.
- Do not ask the user to upload or activate a different file just because a requested metric is absent; map to the closest available evidence and continue.
`;
}

/**
 * Parse comma-separated API keys from environment variables.
 * Filters out empty/whitespace-only entries.
 */
export function parseApiKeys(...envValues: (string | undefined)[]): string[] {
    const keys: string[] = [];
    for (const raw of envValues) {
        if (!raw) continue;
        for (const part of raw.split(',')) {
            const trimmed = part.trim();
            if (trimmed) keys.push(trimmed);
        }
    }
    return keys;
}

/**
 * Detect errors that indicate a key-level failure (rate-limit, quota, auth)
 * rather than a model-level or transient failure.
 */
export function isKeyExhaustedError(error: any): boolean {
    const status = error?.status ?? error?.statusCode ?? error?.code;
    if (status === 429 || status === 403 || status === 401) return true;

    const msg = String(error?.message || error || '').toLowerCase();
    return (
        msg.includes('resource_exhausted') ||
        msg.includes('rate limit') ||
        msg.includes('rate_limit') ||
        msg.includes('quota') ||
        msg.includes('permission_denied') ||
        msg.includes('api key not valid') ||
        msg.includes('api_key_invalid') ||
        msg.includes('invalid api key') ||
        msg.includes('unauthorized')
    );
}

function isContextLimitError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    return (
        msg.includes('maximum context length') ||
        msg.includes('context window') ||
        msg.includes('context length') ||
        msg.includes('too many tokens') ||
        msg.includes('token limit') ||
        msg.includes('token count') ||
        msg.includes('prompt is too long') ||
        msg.includes('request too large') ||
        msg.includes('input is too large') ||
        msg.includes('reduce the length')
    );
}

function isConfigurationError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    return (
        msg.includes('ai client not initialized') ||
        msg.includes('at least one gemini api key must be set') ||
        msg.includes('api key not valid') ||
        msg.includes('api_key_invalid') ||
        msg.includes('invalid api key')
    );
}

export function classifyLlmError(error: any): ClassifiedLlmError {
    if (isContextLimitError(error)) {
        return {
            code: 'context_limit',
            status: 400,
            error: 'AI request exceeds model context limit',
            content: 'Your request is too large for the current model context window. Please shorten the message or reduce attached content and try again.',
        };
    }

    if (isConfigurationError(error)) {
        return {
            code: 'configuration',
            status: 503,
            error: 'AI service is not configured',
            content: 'The AI service is not available right now because its API configuration is incomplete. Please try again later.',
        };
    }

    if (isKeyExhaustedError(error)) {
        return {
            code: 'rate_limit',
            status: 429,
            error: 'AI rate limit or quota exceeded',
            content: 'The AI service is temporarily rate-limited or out of quota. Please try again in a few minutes.',
        };
    }

    return {
        code: 'unknown',
        status: 500,
        error: 'An unexpected error occurred during analysis',
        content: 'I encountered an error while processing your request. Please try again.',
    };
}

export class LLMService {
    private clients: Map<string, GoogleGenAI> = new Map();
    private apiKeys: string[] = [];
    private currentKeyIndex = 0;
    private exhaustedKeysUntil: Map<string, number> = new Map();

    /**
     * Resolve all available API keys from environment variables.
     * Supports comma-separated keys for fallback redundancy.
     */
    private resolveApiKeys(): string[] {
        if (this.apiKeys.length > 0) return this.apiKeys;
        this.apiKeys = parseApiKeys(
            process.env.API_KEY,
            process.env.GEMINI_API_KEY,
            process.env.GOOGLE_API_KEY
        );
        return this.apiKeys;
    }

    private getCandidateKeys(): string[] {
        const allKeys = this.resolveApiKeys();
        if (allKeys.length === 0) return [];

        const rotated = [
            ...allKeys.slice(this.currentKeyIndex),
            ...allKeys.slice(0, this.currentKeyIndex),
        ];
        const now = Date.now();
        const available = rotated.filter((key) => (this.exhaustedKeysUntil.get(key) || 0) <= now);

        return available.length > 0 ? available : rotated;
    }

    private markKeyCoolingDown(apiKey: string): void {
        this.exhaustedKeysUntil.set(apiKey, Date.now() + 90_000);
    }

    /**
     * Get (or create) a GoogleGenAI client for the given API key.
     */
    private getClientForKey(apiKey: string): GoogleGenAI {
        let client = this.clients.get(apiKey);
        if (!client) {
            client = new GoogleGenAI({ apiKey });
            this.clients.set(apiKey, client);
        }
        return client;
    }

    /**
     * Get a client using the current primary API key.
     * Returns null during build / dev when no keys are configured.
     */
    private getClient(): GoogleGenAI | null {
        const keys = this.getCandidateKeys();
        if (keys.length === 0) {
            if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'development') {
                return null;
            }
            throw new Error(
                'At least one Gemini API key must be set via API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY. Multiple comma-separated keys are supported.'
            );
        }
        return this.getClientForKey(keys[0]);
    }

    private normalizeResponseText(response: any): string {
        if (!response) return '';
        if (typeof response.text === 'function') return response.text() || '';
        if (typeof response.text === 'string') return response.text;
        return '';
    }

    private isModelNotFoundError(error: any): boolean {
        const msg = String(error?.message || error || '').toLowerCase();
        return msg.includes('not_found') || msg.includes('not found') || msg.includes('models/');
    }

    /**
     * Try all models with a single API key.
     * Returns the response on success, or throws the last non-model-not-found error.
     * Returns null if all models returned "not found".
     */
    private async tryModelsWithKey(
        apiKey: string,
        client: GoogleGenAI,
        models: string[],
        contents: any[],
        config?: any
    ): Promise<{ response: any; model: string } | null> {
        let lastError: any = null;

        for (const model of models) {
            try {
                const response = await client.models.generateContent({
                    model,
                    contents,
                    config,
                });
                return { response, model };
            } catch (error: any) {
                lastError = error;
                if (isKeyExhaustedError(error)) {
                    this.markKeyCoolingDown(apiKey);
                    throw error; // bubble up so key rotation can handle it
                }
                if (!this.isModelNotFoundError(error)) {
                    throw error;
                }
                // model not found — try next model
            }
        }

        if (lastError && !this.isModelNotFoundError(lastError)) {
            throw lastError;
        }
        return null; // all models not found
    }

    /**
     * Generate content with automatic key rotation and model fallback.
     *
     * Strategy:
     *  1. For the current API key, try every model candidate in order.
     *  2. If the key is exhausted (rate-limit / quota / auth), rotate to the
     *     next API key and repeat from step 1.
     *  3. Throw the last error if all keys and models are exhausted.
     */
    private async generateWithFallback(params: GenerateWithFallbackParams): Promise<{ response: any; model: string }> {
        const keys = this.getCandidateKeys();
        if (keys.length === 0) {
            throw new Error('AI client not initialized');
        }

        const uniqueModels = Array.from(new Set(params.models));
        let lastError: any = null;

        for (const apiKey of keys) {
            const client = this.getClientForKey(apiKey);
            const originalKeyIndex = Math.max(0, this.resolveApiKeys().indexOf(apiKey));
            const keyIndex = originalKeyIndex;

            try {
                const result = await this.tryModelsWithKey(
                    apiKey,
                    client,
                    uniqueModels,
                    params.contents,
                    params.config
                );
                if (result) {
                    // Promote this key as the current one for future calls
                    this.currentKeyIndex = originalKeyIndex;
                    return result;
                }
            } catch (error: any) {
                lastError = error;
                if (isKeyExhaustedError(error)) {
                    console.warn(
                        `API key ${keyIndex + 1}/${keys.length} exhausted, rotating to next key…`
                    );
                    continue; // try next key
                }
                throw error; // non-key error, fail fast
            }
        }

        throw lastError || new Error('No supported Gemini model is available');
    }

    async getAnalysisCode(
        userQuery: string,
        files: { name: string; schema: string; sample: any }[],
        history: any[],
        mode: AnalysisMode = 'analysis',
        connectorContext: string = '',
        personaInstruction: string = '',
        dataQualityContext: string = '',
        dataIntelligenceContext: string = '',
        multiDatasetContext: string = '',
        queryPlanContext: string = ''
    ) {
        const modeConfig = MODE_CONFIGS[mode];
        const wantsVisualization = mode === 'analysis' || files.length > 0 || VISUALIZATION_HINTS.test(userQuery);

        const filesContext = files.map((f) => `
--- FILE: ${f.name} ---
Schema:
${f.schema}
Sample:
${JSON.stringify(f.sample, null, 2)}
`).join('\n');

        const connectorContextBlock = connectorContext
            ? `\nCONNECTED SOURCES (LINKED CONNECTORS):\n${connectorContext}\n- These are metadata-only references unless query results are explicitly provided.`
            : '\nCONNECTED SOURCES (LINKED CONNECTORS):\n- None linked.';

        const sanitizedPersona = typeof personaInstruction === 'string'
            ? personaInstruction.slice(0, 500).trim()
            : '';
        const personaBlock = sanitizedPersona
            ? `\nANALYST PERSONA: ${sanitizedPersona}`
            : '';

        const dataQualityBlock = dataQualityContext
            ? `\n${dataQualityContext}`
            : '';

        const intelligenceBlock = dataIntelligenceContext
            ? `\n${dataIntelligenceContext}\n`
            : '';
        const multiDatasetBlock = multiDatasetContext
            ? `\n${multiDatasetContext}\n`
            : '';
        const queryPlanBlock = queryPlanContext
            ? `\n${queryPlanContext}\n`
            : '';
        const systemPrompt = `
You are SPARTA, a Senior Strategic Business Analyst (Digital Twin) executing Python in a stateful sandbox.

${modeConfig.promptPrefix}
${personaBlock}
${intelligenceBlock}
${multiDatasetBlock}
${queryPlanBlock}

DATA CONTEXT:
${filesContext}
${connectorContextBlock}
${dataQualityBlock}

UNIVERSAL DATA ACCEPTANCE:
- Treat every uploaded or pasted dataset as valid input for a best-effort insight pass.
- Never refuse because the schema does not match a finance, production, sales, or other expected template.
- If the user asks for a metric name that is not present, do not fabricate it and do not ask for another workbook. Map the request to the closest available numeric rows, date-like columns, categorical dimensions, anomalies, and driver signals, then continue.
- If a workbook stores metric names in rows rather than columns, inspect the first text-like column and transpose or melt as needed before deciding which signals exist.
- Do not tell the user the dataset is "not correct", "not financial", "not in the right format", or that they must upload a different file. Use the active data and produce actionable insights, confidence, and next actions.

EXECUTION ENVIRONMENT:
- Libraries available: pandas, numpy, matplotlib, seaborn, scipy, statsmodels, sklearn (scikit-learn), plotly.
- sklearn modules available: preprocessing, cluster, decomposition, ensemble, linear_model, metrics.
- Import sklearn modules directly: e.g., from sklearn.linear_model import LinearRegression
- statsmodels available: sm (statsmodels.api), ExponentialSmoothing, seasonal_decompose. Use for advanced forecasting.
- Dataframes available as: dfs["filename"] and df (default first dataframe).
- dataset_catalog is available as a list of file-level metadata dictionaries for multi-file orchestration.
- When multiple files are present, inspect dfs first and never assume all files should be stacked blindly.
- Return result via variable: result.
- For Plotly visual output, set result to a Plotly figure.
- Text is mandatory whenever data is analyzed. Visuals support the answer; they never replace the written summary.
- Before using ranking helpers such as nlargest, nsmallest, idxmax, idxmin, or percentile logic, coerce the target Series with safe_to_numeric(..., errors='coerce'), drop nulls, and fall back safely if no numeric values remain.
- Never call Series.nlargest(...) or Series.nsmallest(...) on raw object/string columns. If a grouped metric may still be object-typed after aggregation, explicitly re-coerce that metric column before ranking or sorting.
- Never assume derived helper columns already exist. Before referencing names like Month_Num, Month_Index, Period_Number, or similar synthetic fields, check df.columns first and derive them safely only when needed.
- If no reliable time/order field exists, create a sequential fallback with np.arange(len(df)) and label the assumption in stdout instead of crashing on a missing column.
- Handle missing values silently (do not dedicate significant output to nulls — focus on the data that exists).
- Do all calculations in Python.
- For every numerical question, write deterministic Python that computes the answer directly from data (never prose-only math).
- Guard edge cases (division by zero, empty subsets, non-numeric coercion, and missing columns) before computing.
- WRITE COMPLETE, FULL PYTHON CODE. Never truncate, abbreviate, or use "..." or "# similar for other..." placeholders. Every line must be executable. Write the FULL code for each chart — no shortcuts.
- When result is a Plotly figure, you MUST ALSO print a concise evidence block to stdout with the exact KPIs, top concerns, forecast assumptions, and recommended actions used. Those printed logs are consumed by the business summary and are mandatory.
- Isolate outliers (Z-score > 3) and show stats with and without them when relevant.
- When multiple datasets are loaded:
  - First determine whether the files should be harmonized vertically, compared side by side, or joined on shared keys.
  - If schemas are aligned, create a harmonized dataframe with a source_file column before cross-file comparisons.
  - If schemas differ materially, keep per-file analyses separate and compare only shared dimensions or KPIs.
  - State confidence carefully when only partial overlap exists across files.
  - Print a short coverage line showing which files were actually used in the analysis.

FORECASTING (MANDATORY):
- ALWAYS include a trend projection or forecast when time-series or sequential data is detected.
- Preferred methods (in order of sophistication):
  1. ExponentialSmoothing (Holt-Winters) via statsmodels — best for seasonal/trended data (N >= 12).
  2. Linear regression via numpy polyfit or sklearn — good default for non-seasonal trends.
  3. Moving averages (rolling mean) — fallback for very short series (N < 8).
- If you use sklearn regression or classification models, keep feature containers consistent between fit and predict. Fit and predict with the same DataFrame column names, or convert both sides to numpy arrays. Never fit on a DataFrame and then predict with an unnamed list or array like [[next_x]].
- ALWAYS show ±1σ confidence bands as shaded regions on forecast charts (use fill='toself' with rgba opacity).
- Show forecast visually on charts with a distinct dashed line and different color from observed data.
- State the forecast period, method used, and assumptions clearly in print output.
- If no temporal data exists, project based on current run-rates and state assumptions.
- For financial data: always compute trailing 3-period moving average alongside the main forecast for smoothing.

ASSEMBLY LINE DATA DETECTION:
- If the data contains columns related to assembly lines, production, shifts, operators, defects, cycle times, throughput, QA, or manufacturing:
  - This is ASSEMBLY LINE DATA. Apply the special template below.
  - Generate a COMPREHENSIVE DASHBOARD with multiple charts using plotly subplots (make_subplots):
    1. TOP-LEFT: Overall production summary — KPIs (total output, defect rate, efficiency %) displayed as indicator or summary table + a trend chart.
    2. BELOW TOP-LEFT: Shift-wise performance comparison (Shift 1 vs Shift 2) as grouped bar charts showing output, defects, and efficiency per shift.
    3. BELOW SHIFTS: Operator-wise performance — bar/radar chart showing each operator's metrics (output, quality, efficiency). Also show QA/Engineer/Checker performance if available.
    4. CENTER (HERO SECTION): Forecast data — trends, anomalies, patterns observed with forward projections. Use line charts with dashed forecast lines and confidence bands. This is the MOST IMPORTANT section.
    5. BELOW CENTER (TWO COLUMNS):
       - Column 1: Top 5 Concerns — management-critical issues ranked by impact (use go.Table or formatted annotations).
       - Column 2: Recommended Actions — specific action for each concern (use go.Table or formatted annotations).
    6. REMAINING SPACE: Interactive drill-down charts — cycle time distribution, defect Pareto, hourly production rate, or any other relevant deep-dive.
  - Use plotly subplots with make_subplots to create a multi-panel dashboard layout.
  - Use specs=[{"type":"xy"},{"type":"xy"},...] appropriately. Use {"type":"domain"} for pie charts and {"type":"table"} for table traces.
  - Make it visually compelling with distinct colors per section.
  - The template must be management-ready: focus on gaps, anomalies, actionable insights, and what a human would miss.
  - Add updatemenus (dropdown filters) for shift selection, date range, or operator filtering where data supports it.
  - If multiple assembly-line files are present, treat source_file as the line identifier unless a stronger line column exists. Compare lines explicitly.
    - ALWAYS include a download hint: set result text to include "Export this dashboard via the download button above."

FINANCIAL DATA DETECTION:
- If the data contains columns related to: Revenue, Sales, EBITDA, EBIT, PAT, PBT, Net Profit, Gross Profit, Cost, Expense, Margin, Budget, Actuals, Variance, P&L, Income, Loss, Cash Flow, Capex, Opex, Working Capital, Receivables, Payables, Inventory, Turnover, ROE, ROA, ROCE:
  - This is FINANCIAL DATA. Apply the Finance Dashboard template:
  1. TOP-LEFT: Revenue & Profit KPI cards displayed as go.Indicator with delta from previous period
  2. TOP-RIGHT: Revenue vs Profit trend line chart with dual-axis and dashed forecast extension
  3. MIDDLE-LEFT: Margin analysis (Gross/EBITDA/Net) as grouped bar chart showing trend
    4. MIDDLE-RIGHT: TRUE PAT bridge waterfall from the prior period to the weakest or current period. Use go.Waterfall and show the exact drivers: inventory, raw material, employee cost, other expenses, other income, tax/residual.
    5. BOTTOM-LEFT: Explicit scenario comparison chart with at least 3 paths: stress/downside, base case, and recovery/upside. Show them as bars or lines in one chart, not prose only.
    6. BOTTOM-RIGHT: Forecast for primary KPI with 80% confidence interval band
    7. Add one supporting diagnostic visual that exposes the hidden risk behind the top-line numbers, such as PAT delta vs inventory movement, margin compression vs revenue stability, or a one-off income dependency view.
  - Use a clean executive canvas: paper_bgcolor='#F8FAFC', plot_bgcolor='#EEF4F7', font color '#0F172A'
  - Color: profits/gains in #0F766E, losses/expenses in #DC2626, forecast in #0284C7 with softened opacity
    - Always print: YoY growth %, top margin change, top expense driver, forecast value with confidence range
    - ALWAYS surface one hidden-risk insight in the written findings. It must be something management may miss at first glance: margin compression despite stable revenue, inventory timing distortion, one-off income masking weakness, or cost recognition volatility.
    - NEVER replace the PAT bridge or scenario comparison with generic grouped bars. Those two visuals are mandatory for financial statement analysis.
        - Every finance chart MUST have a specific layout.title.text. Avoid generic titles like "Chart", "Analysis", or leaving the title blank.
        - Every finance subplot MUST label its x and y axes unless the visual is self-evident like a KPI indicator card.
        - Every multi-trace chart MUST set unique trace names and keep showlegend=True so leadership can identify each driver or scenario instantly.

INLINE / PASTED DATA HANDLING:
- If the user's message contains tabular data (markdown tables, pipe-delimited rows, or dense numbers),
  parse that data DIRECTLY into a DataFrame using pd.read_csv(io.StringIO(...)) or by constructing
  the dict manually. Do NOT rely on the file system for pasted data.
- Use the import: import io
- Example: df = pd.read_csv(io.StringIO("""col1,col2\n1,2\n3,4"""))
- For tab-separated pasted statements with mixed sections (e.g., Monthly + YTD in one line), rows are often ragged.
    You MUST normalize row widths before DataFrame construction:
    1) split each line by '\\t'
    2) trim cells
    3) choose exact target width per section
    4) slice extra cells and pad short rows with ''
    5) only then build DataFrame with fixed columns
- Skip non-data section labels like 'A- Total Income' and 'B- Total Expenses' if they don't carry numeric cells.
- Never create DataFrame(columns=...) from unnormalized ragged rows.

NUMERIC CLEANING RULES (MANDATORY FOR PASTED TABLES):
- NEVER use direct '.astype(float)' on raw string columns from pasted data.
- Treat '', '-', '\u2014', 'N/A', 'NA', 'null', and whitespace as missing values.
- Normalize numeric text first, then coerce safely:
    series = (series.astype(str).str.replace(',', '', regex=False).str.strip())
    series = series.replace({'': np.nan, '-': np.nan, '\u2014': np.nan, 'N/A': np.nan, 'NA': np.nan, 'null': np.nan})
    series = pd.to_numeric(series, errors='coerce').fillna(0)
- Use errors='coerce' for numeric/date parsing and continue execution.
- If parsing creates all-null series, set a defensive fallback and proceed (do not crash).

DATA LOADING & VERIFICATION (CRITICAL — always include this logic):
- ALWAYS start your code by checking len(df) and printing the shape.
- If df has 0 rows, DO NOT give up or create placeholder charts. Instead, recover the data:
  1. Get the file path: file_path = [f['path'] for f in json.loads(files_json) if f.get('name')][0] if available, or use the dfs dict.
  2. For Excel files: try df = pd.read_excel(file_path, header=0) first; if still 0 rows try header=None, then set the first row as column names.
  3. For CSV files: try df = pd.read_csv(file_path) with different encodings.
  4. Update dfs and df with the recovered dataframe.
- After recovery, print the new df.shape so the execution output shows the real row count.
- NEVER generate a matplotlib/plotly figure with an error message like "Data Discrepancy", "No Data", or "0 rows". This is FORBIDDEN.
- NEVER create a grey/blank chart with centered text as a placeholder. If data truly cannot be loaded, set result to a plain text string explaining the issue.
- If data recovery succeeds (rows > 0), proceed with the full analysis as normal — do NOT reference the initial 0-row state.

VISUALIZATION RULES (MANDATORY — CHARTS ARE NON-NEGOTIABLE):
- ALWAYS produce at least one Plotly chart whenever the data contains numerical columns — do NOT wait for the user to ask.
- Tables alone are NEVER sufficient. Every numerical analysis MUST be accompanied by a colorful, interactive Plotly visualization.
- Every charted answer MUST still leave behind enough printed evidence for a written management summary. Do not return charts without textual findings.
- If the user explicitly requests a chart, produce the most suitable one. If not explicitly requested but numerical data is present, still produce a chart automatically.
- Generate MULTIPLE charts when the data warrants it (e.g., overview + detail, comparison + trend).
- Every chart MUST have a meaningful title. Every axis-based chart MUST include x-axis and y-axis titles. Every multi-series chart MUST define explicit trace names and a visible legend.
- Never leave Plotly placeholder labels such as "Click to enter X axis title" or unnamed traces in the final figure.
- Chart selection guidance:
    - Use pie/donut for part-to-whole with <= 8 categories.
    - Use heatmap for correlation matrices, pivot intensity, or dense cross-tab comparisons.
    - Use line for temporal trends; bar for ranking or comparison; scatter for relationship/outlier checks.
    - Use grouped/stacked bar for multi-metric comparisons across categories.
    - Use area for cumulative trends; radar for multivariate profiles.
    - Use treemap or sunburst for hierarchical breakdowns.
    - Use funnel for sequential stage analysis; histogram for distributions; box/violin for spread comparisons.
    - When in doubt, prefer bar or line charts — they are the most universally readable.
- Styling guidance for Plotly (MAKE CHARTS COLORFUL AND INSIGHTFUL):
    - Use vivid but executive-grade color palettes: ['#0EA5E9','#14B8A6','#F59E0B','#F97316','#22C55E','#2563EB','#FB7185','#84CC16','#06B6D4','#A16207'].
    - FINANCE COLOR PALETTE (use for financial data): ['#0F766E','#DC2626','#0284C7','#F59E0B','#22C55E','#FB7185','#14B8A6','#2563EB','#84CC16','#B45309']
    - For profit/positive values: use teals/greens (#0F766E, #14B8A6, #22C55E)
    - For loss/negative values: use reds/oranges (#DC2626, #F97316, #F59E0B)
    - For forecasts/projections: use blues with 70% opacity and dashed lines
    - For confidence bands: use rgba fills with 15% opacity
    - ALWAYS set paper_bgcolor='#F8FAFC' and plot_bgcolor='#EEF4F7' for a cleaner executive presentation
    - ALWAYS set font=dict(family='system-ui,sans-serif', color='#0F172A') for readability
    - ALWAYS use hovertemplate with rich formatting for tooltips
    - For waterfall/bridge charts (finance): use green for positive bars, red for negative, gold for totals
    - For heatmaps, use perceptual continuous scales (Viridis, Plasma, Inferno).
    - Set clear, descriptive titles and axis labels.
    - Use hover templates for rich interactive tooltips (e.g., hovertemplate="<b>%{x}</b><br>Value: %{y:,.2f}<extra></extra>").
    - Add text annotations on bars/points for key values using textposition='auto'.
    - Add gridlines subtly, set balanced margins, and ensure responsive layout.
    - For multiple traces, use distinct colors per trace and a clear legend.
    - Add dropdown menus or range sliders for drill-down interactivity where applicable.
    - Plotly subplot compatibility is mandatory:
        - If you use go.Pie, the target subplot cell spec must be {"type": "domain"}.
        - If you use go.Table, the target subplot cell spec must be {"type": "table"}.
        - Use {"type": "xy"} only for bar/line/scatter/histogram/box/violin style traces.
        - Never place pie/table traces in an "xy" subplot cell.

DIAGNOSTIC ANALYSIS RULES:
- If the dataset has fewer than 30 rows, never call any pattern "Universal" or "Consistent". Use "tentative" or "preliminary".
- Check for perfect correlations (R ≈ 1.0) between numeric columns; if found, flag the data as potentially formulaic.
- Report BOTH mean and median for numeric summaries. If they diverge significantly, note the skew.
- If a single row accounts for >50% of a segment's value, isolate it and show results with and without it.
- For root-cause analysis: check if a loss/issue is global or localized.
- If time-series data is available, compare current period to same period last year (YoY) when possible.
- Rank insights by impact: focus on the finding that affects the largest share of revenue or cost first.
- IDENTIFY GAPS: If a gap or anomaly exists, don't just report it — hypothesize WHY it exists. Question the data like a skeptic.
- GAP ANALYSIS: Look for missing data points, unexpected zeroes, sudden jumps, or flat lines. For each gap:
  1. State what the gap is (e.g., "Revenue dropped 40% in May")
  2. Hypothesize WHY (e.g., "Possible seasonal effect, supply chain disruption, or pricing change")
  3. Recommend what data would confirm the hypothesis
- BETWEEN-THE-LINES READING: Look for what the data is NOT showing — missing categories, unexplained ratios, or patterns that break.

RESPONSE FORMAT (JSON ONLY):
{
  "explanation": "Short description of what the code will do.",
  "code": "Python code",
  "requires_visualization": true
}

IMPORTANT:
- Return valid JSON only.
- Escape strings correctly.
`;

        const chatHistory = history.slice(-modeConfig.maxHistorySlice).map((h) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
        }));

        const requestContents = [
            ...chatHistory,
            { role: 'user', parts: [{ text: userQuery }] },
        ];

        try {
            // Attempt 1: strict JSON contract.
            const { response } = await this.generateWithFallback({
                models: ANALYSIS_MODEL_CANDIDATES,
                contents: requestContents,
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: 'application/json',
                    temperature: modeConfig.temperature,
                    maxOutputTokens: 16384,
                },
            });

            const initialText = this.normalizeResponseText(response) || '';
            const parsed = parseAnalysisPayloadFromText(initialText);
            if (parsed) return parsed;

            // Attempt 2: retry with a stronger formatting directive if model produced malformed JSON.
            const { response: retryResponse } = await this.generateWithFallback({
                models: ANALYSIS_MODEL_CANDIDATES,
                contents: [
                    ...requestContents,
                    {
                        role: 'user',
                        parts: [{ text: 'FORMAT FIX: Return ONLY strict JSON with keys: explanation, code, requires_visualization. No markdown, no prose before/after JSON.' }],
                    },
                ],
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: 'application/json',
                    temperature: 0.05,
                    maxOutputTokens: 12288,
                },
            });

            const retryText = this.normalizeResponseText(retryResponse) || '';
            const retryParsed = parseAnalysisPayloadFromText(retryText);
            if (retryParsed) return retryParsed;

            console.warn('LLM analysis response malformed after retries. Using deterministic fallback code.');
            return {
                explanation: 'Applied deterministic analysis fallback because model output format was invalid.',
                code: buildResilientDeterministicAnalysisFallbackCode(wantsVisualization),
                requires_visualization: wantsVisualization,
            };
        } catch (error: any) {
            console.error('LLM Analysis Error:', error);
            // Keep analysis operational even if model call fails.
            return {
                explanation: 'Applied deterministic analysis fallback due to model generation failure.',
                code: buildResilientDeterministicAnalysisFallbackCode(wantsVisualization),
                requires_visualization: wantsVisualization,
            };
        }
    }

    async repairAnalysisCode(
        userQuery: string,
        previousCode: string,
        executionError: string,
        traceback: string | undefined,
        files: { name: string; schema: string; sample: any }[],
        mode: AnalysisMode = 'analysis',
        queryPlanContext: string = ''
    ): Promise<{ explanation: string; code: string } | null> {
        const modeConfig = MODE_CONFIGS[mode];

        const filesContext = files.map((f) => `
--- FILE: ${f.name} ---
Schema:
${f.schema}
Sample:
${JSON.stringify(f.sample, null, 2)}
`).join('\n');
        const queryPlanBlock = queryPlanContext
            ? `\n${queryPlanContext}\n`
            : '';

        const systemPrompt = `
You are SPARTA, a Python debugging specialist for data analysis code.

${modeConfig.promptPrefix}
${queryPlanBlock}

You must repair failing analysis code so it executes successfully and still answers the user's query.

RULES:
- Keep the same intent and output contract.
- Preserve the original business intent and query plan while repairing the code.
- Preserve visualization intent if requested.
- Add robust guards for missing columns, bad types, empty data, and divide-by-zero.
- If a referenced column is missing, do not guess blindly. Check df.columns, map to the closest real field, or derive a sequential fallback when the missing field is just an index/order helper such as Month_Num.
- For conversion errors (e.g., "could not convert string to float"), replace direct casts with safe coercion:
    pd.to_numeric(..., errors='coerce').fillna(0) and sanitize '', '-', 'N/A', whitespace before conversion.
- Never leave '.astype(float)' on uncleaned string columns.
- For ranking errors (e.g., "Cannot use method 'nlargest' with dtype object"), coerce the ranked Series or aggregated metric column to numeric with errors='coerce', drop invalid rows, and only then apply nlargest/nsmallest/idxmax/idxmin.
- For Plotly subplot errors (e.g., "Trace type 'pie' is not compatible with subplot type 'xy'"),
    repair make_subplots specs so pie traces use type='domain' and table traces use type='table'.
- For pandas column-shape errors (e.g., "X columns passed, passed data had Y columns"),
    repair parsing logic by normalizing each split row to the target column count before DataFrame creation.
- Return only valid JSON.

RESPONSE FORMAT (JSON ONLY):
{
  "explanation": "Short explanation of the fix.",
  "code": "Corrected Python code"
}
`;

        const repairPrompt = `
User query:
${userQuery}

Data context:
${filesContext}

Previous failing code:
${previousCode}

Execution error:
${executionError}

Traceback:
${traceback || ''}
`;

        try {
            const { response } = await this.generateWithFallback({
                models: ANALYSIS_MODEL_CANDIDATES,
                contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: 'application/json',
                    temperature: 0.1,
                    maxOutputTokens: 12288,
                },
            });

            const text = this.normalizeResponseText(response) || '';
            const parsed = parseAnalysisPayloadFromText(text);
            if (!parsed?.code || typeof parsed.code !== 'string') {
                return null;
            }

            return {
                explanation: parsed.explanation || 'Code repaired after execution failure',
                code: parsed.code,
            };
        } catch (error) {
            console.error('LLM Repair Error:', error);
            return null;
        }
    }

    async summarizeExecution(
        userQuery: string,
        code: string,
        execution: ExecutionSummaryInput,
        mode: AnalysisMode = 'analysis',
        dataQualityContext: string = '',
        dataIntelligenceContext: string = ''
    ): Promise<string> {
        const chartCount = (execution.charts?.length || 0) + (execution.plotly_charts?.length || 0);
        const fallback = execution.error
            ? `Execution failed: ${execution.error}`
            : execution.result || 'Execution completed.';
        const deterministicSignalSummary = execution.error
            ? null
            : buildDeterministicSignalSummaryFromExecution(execution.result || '', {
                hasChart: chartCount > 0,
            });

        const client = this.getClient();
        if (!client) return deterministicSignalSummary || fallback;

        const dataQualityBlock = dataQualityContext
            ? `\n${dataQualityContext}`
            : '';

        const intelligenceBlock = dataIntelligenceContext
            ? `\n${dataIntelligenceContext}\n`
            : '';

        const systemPrompt = `
You are a Senior Strategic Business Analyst (Digital Twin) providing CONCISE, executive-quality insights.
Use ONLY the provided execution artifacts — never fabricate data.

GROUNDING RULE (CRITICAL — ZERO TOLERANCE FOR HALLUCINATION):
- Every number, percentage, metric name, or named trend you cite MUST appear verbatim in the "Execution result text" below.
- If a specific value is not present in the execution output, write "N/A" or omit it — NEVER invent or round to a stronger claim.
- If the execution output is empty or contains only "Execution successful", state that the analysis ran but produced no printable evidence, and base your summary ONLY on chart count and deterministic signal summary.
${intelligenceBlock}

ROLE: Skeptical business strategist delivering crisp action points — NOT a verbose report writer.

CRITICAL OUTPUT RULES:
- BE CONCISE. Management reads bullet points, not essays. Max 2 sentences per insight.
- START IMMEDIATELY. No greeting, no setup sentence, no filler.
- USE THIS EXACT OUTPUT ORDER:
    1. One line starting with "Executive Signal:".
    2. Exactly 5 numbered insights using "1)", "2)", "3)", "4)", "5)".
    3. Exactly 3 action lines, each starting with "→ Action:".
    4. One line starting with "Forecast:".
    5. One line starting with "Data Quality:".
- Each insight must be a finding, not a recommendation label. Never start an insight with "Action:", "Recommendation:", "Impact:", or "Evidence:".
- The 5 insights must be distinct. Do not restate the Executive Signal in insight 1, and do not repeat the same thesis across insights, actions, and forecast.
- Each insight must carry a specific number, driver, anomaly, or business condition when evidence exists.
- Name the primary metric or dataset inside the forecast line when the evidence makes it clear, so the UI can attach focused follow-up forecasting actions.
- Make insight 4 or 5 the non-obvious mechanism, structural risk, or hidden lever when the evidence supports one. Avoid generic recap language.
- For financial analyses, insight 1 should state the core earnings signal, insight 2 should explain the main bridge/scenario driver, insight 3 should quantify the operational or accounting consequence, and insight 4 or 5 should surface the hidden risk management may miss.
- The 3 actions must be distinct: one immediate move, one structural improvement, one risk-control move.
- The forecast line must describe what likely happens next. It must not repeat an action item. Anchor a base case first, and mention the condition that would create upside or downside when the evidence supports it.
- If multiple datasets are active, say which dataset or comparison set the forecast applies to.
- NO FILLER TEXT: Remove "Let me analyze...", "Based on the data...", "It's worth noting..." — skip preamble entirely.
- USE BULLET POINTS over paragraphs. Every bullet must be a standalone, actionable insight.
- TOTAL RESPONSE LENGTH: Aim for 220-360 words maximum. Quality over quantity.
- ABSOLUTELY NO TECHNICAL ARTIFACTS: do not include Python, SQL, JSON, code snippets, pseudo-code, stack traces, or fenced code blocks.
- NEVER return markdown code fences like \`\`\`python, \`\`\`plotly, or \`\`\`json.
- NEVER explain implementation steps like "import pandas", "create dataframe", or "run regression". Only business meaning and decisions.
- Assume audience is non-technical leadership; write in plain business language.

RULES:
- Never fabricate values, percentages, or trends not present in the execution output.
- Never say the active dataset is the wrong domain or ask the user to upload/activate a different workbook. If a requested metric is absent, summarize the closest evidence actually computed.
- When stating a percentage change, use the exact computed figure from the execution output and round to at most 1 decimal place.
- Never round an exact change into a stronger claim (for example, do not say 90% if the evidence supports 86.6%).
- Never attribute a movement to a single cause unless the evidence clearly shows it is the largest driver; otherwise say "primary observed driver" or "one of the main drivers".
- If a forecast is based on fewer than 12 periods or a visibly volatile series, label it low confidence and describe it as a run-rate or directional estimate.
- If evidence is insufficient, state it in one sentence and suggest what data would help.
- If execution failed, explain the failure in 1-2 sentences and suggest a concrete fix.
- If charts were generated, mention their key takeaway in one sentence — don't describe the chart structure.
- If charts were generated, prioritize the key driver bridge, anomaly, or scenario takeaway over generic "trend is up/down" commentary.
- If charts were generated, reference outcomes from visuals and explicitly state "See interactive visuals below." once.
- The UI will present insights and actions before charts, so state the business takeaway before telling the reader to inspect the visuals.
- A written summary is mandatory even when the visuals are strong. Never answer with chart references alone.
- If execution output lists multiple datasets analyzed, include one short coverage note so the user knows whether the conclusion is cross-file or single-file.
- Use markdown only for **bold** metrics when helpful. Do not use headings beyond the required line labels above.

DIAGNOSTIC RULES:
- Small sample (N < 30): Add "⚠️ Preliminary (N=X)" — one line, not a paragraph.
- Outlier-driven metric: Call it out in one line with the adjusted figure.
- Rank recommendations by estimated business impact (highest first).
- Apply the "So What?" test: finding → action. No finding without action.
${dataQualityBlock}

VOICE:
- Sound like a strategic advisor, not a calculator.
- "Region X is leaking margin — increase pricing by 10%" NOT "Region X has a loss of -€256."
- Use hedging for small samples: "signal", "directional" — not "Key Finding" or "Trend".

AVOID:
- DO NOT produce boilerplate/template-style output.
- Every sentence must reference specific values from the execution result.
- If 0 rows, write 2 sentences explaining why and suggest next steps. Don't fake a report.
- If execution SUCCEEDED with real data, trust execution output over pre-scan warnings.

REMEMBER:
- If charts were generated, include "See interactive visuals below." exactly once.
- If evidence is thin, say so in the Data Quality line rather than padding the insights with filler.
`;

        // Summarize the code intent in one line so the LLM understands context without seeing
        // implementation details that might be reproduced in the business summary.
        const codeIntent = code
            ? `[Python analysis executed — ${code.split('\n').length} lines, ${chartCount > 0 ? chartCount + ' chart(s) generated' : 'no charts'}]`
            : '[No code executed]';

        const prompt = `
User question:
${userQuery}

Analysis performed: ${codeIntent}

Execution success: ${execution.success ? 'true' : 'false'}
Execution result text:
${execution.result || ''}

Execution error:
${execution.error || ''}

Traceback:
${execution.traceback || ''}

Chart count: ${chartCount}

Deterministic execution signal summary:
${deterministicSignalSummary || 'None available.'}
`;

        try {
            const { response } = await this.generateWithFallback({
                models: SUMMARY_MODEL_CANDIDATES,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction: systemPrompt,
                    temperature: mode === 'analysis' ? 0.05 : 0.3,
                    maxOutputTokens: 4096,
                },
            });

            return this.normalizeResponseText(response) || deterministicSignalSummary || fallback;
        } catch (error) {
            console.error('LLM Execution Summary Error:', error);
            return deterministicSignalSummary || fallback;
        }
    }

    async chat(userQuery: string, history: any[], mode: AnalysisMode = 'chat', personaInstruction: string = ''): Promise<string> {
        const groundedMetaResponse = getGroundedMetaResponse(userQuery);
        if (groundedMetaResponse) {
            return groundedMetaResponse;
        }

        const client = this.getClient();
        if (!client) return 'AI service is not currently available. Please check your API key configuration.';

        const modeConfig = MODE_CONFIGS[mode];
        const systemPrompt = buildChatSystemPrompt(mode, personaInstruction);

        const chatHistory = history.slice(-modeConfig.maxHistorySlice).map((h) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
        }));

        try {
            const { response } = await this.generateWithFallback({
                models: CHAT_MODEL_CANDIDATES,
                contents: [
                    ...chatHistory,
                    { role: 'user', parts: [{ text: userQuery }] },
                ],
                config: {
                    systemInstruction: systemPrompt,
                    temperature: modeConfig.temperature,
                    maxOutputTokens: 6144,
                },
            });

            return this.normalizeResponseText(response) || "I wasn't able to generate a response. Please try again.";
        } catch (error) {
            console.error('LLM Chat Error:', error);
            throw error;
        }
    }
}

export const llm = new LLMService();
