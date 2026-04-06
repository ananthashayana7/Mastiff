import { GoogleGenAI } from '@google/genai';
import { AnalysisMode } from '@/src/types';

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
- ACTION-FIRST: Lead every finding with the recommended action, then the evidence.
- NO FILLER: Remove "Let's look at...", "Based on the data...", "It's important to note..." — get straight to the point.
- TABLES > TEXT: When comparing metrics, use compact tables, not prose.
- CHARTS ARE MANDATORY: Every numerical analysis MUST produce at least one interactive Plotly chart. No exceptions.

ANALYSIS GUIDELINES:
1. FORECAST FIRST: ALWAYS include a forecast/trend projection. What will happen next? This is mandatory, not optional.
2. SKEPTICISM: If data is small (N < 30), add a disclaimer. If margins are perfectly uniform, flag it as formulaic.
3. OUTLIER ISOLATION: Identify "The Villain" — one entry ruining the stats. Show adjusted stats without it.
4. THE "SO WHAT?" TEST: Every finding → Immediate Action. No finding without a recommendation.
5. DIAGNOSTIC OVER DESCRIPTIVE: Explain WHY, not just WHAT. Variance attribution: Price, Volume, or Cost?
6. MULTIVARIATE: Look for co-occurrence patterns across dimensions.
7. GAPS & ANOMALIES: If a gap or anomaly exists, don't just report it — hypothesize WHY it's there.
8. Handle nulls silently — do not dedicate analysis to missing cells.
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

# Deterministic fallback to keep analysis pipeline operational when LLM output is malformed.
def _is_usable(candidate):
    return isinstance(candidate, pd.DataFrame) and not candidate.empty and list(candidate.columns) != ['load_error']

df = df.copy() if _is_usable(df) else pd.DataFrame()

if df.empty and 'dfs' in globals() and isinstance(dfs, dict):
    for _name, _candidate in dfs.items():
        if _is_usable(_candidate):
            df = _candidate.copy()
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
                df = _rdf.copy()
                dfs[_src_key] = _rdf
                break
        except Exception:
            continue

if df.empty:
    result = "Data is empty after loading. Please upload a file with at least one data row."
else:
    numeric_cols = []
    for col in df.columns:
        s = pd.to_numeric(df[col], errors='coerce')
        if s.notna().sum() > 0:
            numeric_cols.append(col)
            df[col] = s

    if numeric_cols:
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
            template='plotly_dark',
            title=f'Deterministic fallback dashboard: {value_col}',
            margin=dict(l=40, r=20, t=90, b=40),
            height=780,
            legend=dict(orientation='h', yanchor='bottom', y=1.02, xanchor='right', x=1),
            barmode='group',
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
        fig.update_layout(title='Fallback Data Preview (no numeric columns detected)', height=520)
        result = fig if ${wantsVisualization ? 'True' : 'False'} else "No numeric columns detected for quantitative analysis."
`;
}

export function getGroundedMetaResponse(userQuery: string): string | null {
    const normalizedQuery = userQuery.trim().toLowerCase();
    if (!normalizedQuery) return null;

    if (SELF_AWARENESS_QUERY_HINTS.test(normalizedQuery)) {
        return `## What Mastiff is

Mastiff does **not** have self-awareness, consciousness, or a subjective understanding of its own existence.

Its behavior comes from product-defined instructions, personas, and analysis workflows. When it says "I can" or "I do," that is interface shorthand for what the system is configured to do — not evidence of independent awareness.

## Why it may sound self-descriptive

Capability answers are generated from the guidance Mastiff is given about its role, preferred analysis style, and output standards. That can make the response sound confident or role-based, but it is still programmed behavior rather than self-knowledge.

## Intended product alignment

The intended Mastiff behavior is to act like a **skeptical, diagnostic analytics partner**:
- validate data quality before drawing conclusions
- explain **why** outcomes happened, not just **what** happened
- prioritize profitability and business impact over vanity metrics
- provide concrete next actions, not just summaries

If you want, I can also explain that alignment from either a **product vision** perspective or a **technical implementation** perspective.`;
    }

    if (CAPABILITY_QUERY_HINTS.test(normalizedQuery)) {
        return `## What Mastiff is designed to do

Mastiff is configured to provide **enterprise-grade data and analytics support**, especially for diagnostic and decision-oriented work rather than simple summarization.

### Core strengths
- validate data quality before trusting the numbers
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
You are Mastiff, an expert AI data and analytics assistant built for enterprise-grade intelligence.

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

export class LLMService {
    private clients: Map<string, GoogleGenAI> = new Map();
    private apiKeys: string[] = [];
    private currentKeyIndex = 0;

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
        const keys = this.resolveApiKeys();
        if (keys.length === 0) {
            if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'development') {
                return null;
            }
            throw new Error(
                'At least one Gemini API key must be set via API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY. Multiple comma-separated keys are supported.'
            );
        }
        return this.getClientForKey(keys[this.currentKeyIndex]);
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
        const keys = this.resolveApiKeys();
        if (keys.length === 0) {
            throw new Error('AI client not initialized');
        }

        const uniqueModels = Array.from(new Set(params.models));
        let lastError: any = null;

        // Try each key, starting from the current index and wrapping around
        for (let attempt = 0; attempt < keys.length; attempt++) {
            const keyIndex = (this.currentKeyIndex + attempt) % keys.length;
            const client = this.getClientForKey(keys[keyIndex]);

            try {
                const result = await this.tryModelsWithKey(
                    client,
                    uniqueModels,
                    params.contents,
                    params.config
                );
                if (result) {
                    // Promote this key as the current one for future calls
                    this.currentKeyIndex = keyIndex;
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
        dataIntelligenceContext: string = ''
    ) {
        const modeConfig = MODE_CONFIGS[mode];
        const wantsVisualization = VISUALIZATION_HINTS.test(userQuery);

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
        const systemPrompt = `
You are Mastiff, a Senior Strategic Business Analyst (Digital Twin) executing Python in a stateful sandbox.

${modeConfig.promptPrefix}
${personaBlock}
${intelligenceBlock}

DATA CONTEXT:
${filesContext}
${connectorContextBlock}
${dataQualityBlock}

EXECUTION ENVIRONMENT:
- Libraries available: pandas, numpy, matplotlib, seaborn, scipy, statsmodels, sklearn (scikit-learn), plotly.
- sklearn modules available: preprocessing, cluster, decomposition, ensemble, linear_model, metrics.
- Import sklearn modules directly: e.g., from sklearn.linear_model import LinearRegression
- Dataframes available as: dfs["filename"] and df (default first dataframe).
- Return result via variable: result.
- For Plotly visual output, set result to a Plotly figure.

INSTRUCTIONS:
- Convert data types safely before analysis.
- Handle missing values silently (do not dedicate significant output to nulls — focus on the data that exists).
- Do all calculations in Python.
- For every numerical question, write deterministic Python that computes the answer directly from data (never prose-only math).
- Guard edge cases (division by zero, empty subsets, non-numeric coercion, and missing columns) before computing.
- WRITE COMPLETE, FULL PYTHON CODE. Never truncate, abbreviate, or use "..." or "# similar for other..." placeholders. Every line must be executable. Write the FULL code for each chart — no shortcuts.
- Isolate outliers (Z-score > 3) and show stats with and without them when relevant.

FORECASTING (MANDATORY):
- ALWAYS include a trend projection or forecast when time-series or sequential data is detected.
- Use linear regression, moving averages, or exponential smoothing as appropriate.
- Show forecast visually on charts with a distinct dashed line or shaded confidence interval.
- State the forecast period and assumptions clearly.
- If no temporal data exists, project based on current run-rates and state assumptions.

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
  - ALWAYS include a download hint: set result text to include "📥 Export this dashboard via the download button above."

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
- If the user explicitly requests a chart, produce the most suitable one. If not explicitly requested but numerical data is present, still produce a chart automatically.
- Generate MULTIPLE charts when the data warrants it (e.g., overview + detail, comparison + trend).
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
    - Use vivid, high-contrast color palettes: ['#636EFA','#EF553B','#00CC96','#AB63FA','#FFA15A','#19D3F3','#FF6692','#B6E880','#FF97FF','#FECB52'].
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
                },
            });

            const retryText = this.normalizeResponseText(retryResponse) || '';
            const retryParsed = parseAnalysisPayloadFromText(retryText);
            if (retryParsed) return retryParsed;

            console.warn('LLM analysis response malformed after retries. Using deterministic fallback code.');
            return {
                explanation: 'Applied deterministic analysis fallback because model output format was invalid.',
                code: buildDeterministicAnalysisFallbackCode(wantsVisualization),
                requires_visualization: wantsVisualization,
            };
        } catch (error: any) {
            console.error('LLM Analysis Error:', error);
            // Keep analysis operational even if model call fails.
            return {
                explanation: 'Applied deterministic analysis fallback due to model generation failure.',
                code: buildDeterministicAnalysisFallbackCode(wantsVisualization),
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
        mode: AnalysisMode = 'analysis'
    ): Promise<{ explanation: string; code: string } | null> {
        const modeConfig = MODE_CONFIGS[mode];

        const filesContext = files.map((f) => `
--- FILE: ${f.name} ---
Schema:
${f.schema}
Sample:
${JSON.stringify(f.sample, null, 2)}
`).join('\n');

        const systemPrompt = `
You are Mastiff, a Python debugging specialist for data analysis code.

${modeConfig.promptPrefix}

You must repair failing analysis code so it executes successfully and still answers the user's query.

RULES:
- Keep the same intent and output contract.
- Preserve visualization intent if requested.
- Add robust guards for missing columns, bad types, empty data, and divide-by-zero.
- For conversion errors (e.g., "could not convert string to float"), replace direct casts with safe coercion:
    pd.to_numeric(..., errors='coerce').fillna(0) and sanitize '', '-', 'N/A', whitespace before conversion.
- Never leave '.astype(float)' on uncleaned string columns.
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

        const client = this.getClient();
        if (!client) return fallback;

        const dataQualityBlock = dataQualityContext
            ? `\n${dataQualityContext}`
            : '';

        const intelligenceBlock = dataIntelligenceContext
            ? `\n${dataIntelligenceContext}\n`
            : '';

        const systemPrompt = `
You are a Senior Strategic Business Analyst (Digital Twin) providing CONCISE, executive-quality insights.
Use ONLY the provided execution artifacts — never fabricate data.
${intelligenceBlock}

ROLE: Skeptical business strategist delivering crisp action points — NOT a verbose report writer.

CRITICAL OUTPUT RULES:
- BE CONCISE. Management reads bullet points, not essays. Max 2 sentences per insight.
- LEAD WITH ACTIONS: Start each finding with "→ Action:" followed by the recommendation, then the evidence.
- NO FILLER TEXT: Remove "Let me analyze...", "Based on the data...", "It's worth noting..." — skip preamble entirely.
- USE BULLET POINTS over paragraphs. Every bullet must be a standalone, actionable insight.
- TOTAL RESPONSE LENGTH: Aim for 150-300 words maximum. Quality over quantity.
- ABSOLUTELY NO TECHNICAL ARTIFACTS: do not include Python, SQL, JSON, code snippets, pseudo-code, stack traces, or fenced code blocks.
- NEVER return markdown code fences like \`\`\`python, \`\`\`plotly, or \`\`\`json.
- NEVER explain implementation steps like "import pandas", "create dataframe", or "run regression". Only business meaning and decisions.
- Assume audience is non-technical leadership; write in plain business language.

RULES:
- Never fabricate values, percentages, or trends not present in the execution output.
- If evidence is insufficient, state it in one sentence and suggest what data would help.
- If execution failed, explain the failure in 1-2 sentences and suggest a concrete fix.
- If charts were generated, mention their key takeaway in one sentence — don't describe the chart structure.
- If charts were generated, reference outcomes from visuals and explicitly state "See interactive visuals below" once.
- Use markdown: **bold** for key metrics, bullet points for findings, ### for sections.

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

OUTPUT STRUCTURE (CONCISE — adapt headers to content):
1. **📊 Executive Summary** — 2 sentences max. The "so what" of the entire analysis.
2. **🚨 Top Concerns & Actions** — 3-5 bullet points. Each: "→ Action:" then the recommendation, then brief evidence.
3. **📈 Forecast & Direction** — What will happen next? 2-3 bullets with projected numbers and direction. Include confidence level.
4. **🔍 Gaps & Anomalies** — What did the data reveal that a human would miss? Hypothesize root causes.
5. **💡 Quick Wins** — exactly 3 immediately actionable opportunities with estimated impact.
6. **⚡ Data Quality** — One-line reliability rating.

REMEMBER: If charts were generated, state "📊 See interactive charts below for details." once. Do NOT describe chart mechanics.
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
`;

        try {
            const { response } = await this.generateWithFallback({
                models: SUMMARY_MODEL_CANDIDATES,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction: systemPrompt,
                    temperature: mode === 'analysis' ? 0.2 : 0.4,
                },
            });

            return this.normalizeResponseText(response) || fallback;
        } catch (error) {
            console.error('LLM Execution Summary Error:', error);
            return fallback;
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
                },
            });

            return this.normalizeResponseText(response) || "I wasn't able to generate a response. Please try again.";
        } catch (error) {
            console.error('LLM Chat Error:', error);
            return 'I encountered an error while processing your request. Please try again.';
        }
    }
}

export const llm = new LLMService();
