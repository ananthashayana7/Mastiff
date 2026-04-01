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

    return `
You are Mastiff, an expert AI data and analytics assistant built for enterprise-grade intelligence.

${modeConfig.promptPrefix}
${personaBlock}

BEHAVIOR:
- BE CONCISE. Management reads bullet points, not essays.
- For theory questions: answer with depth but be concise — max 200 words.
- For practical questions without data: provide clear assumptions and a Python example if relevant.
- For management decisions: include confidence caveats and rank recommendations by impact.
- Use markdown formatting: ### headers, bullet points, **bold** for key metrics, tables for structured data.
- Be precise with numbers — never round excessively.
- When asked about data, ALWAYS generate charts/visualizations alongside text.
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
- Libraries available: pandas, numpy, matplotlib, seaborn, scipy, statsmodels, sklearn, plotly.
- Dataframes available as: dfs["filename"] and df (default first dataframe).
- Return result via variable: result.
- For Plotly visual output, set result to a Plotly figure.

INSTRUCTIONS:
- Convert data types safely before analysis.
- Handle missing values silently (do not dedicate significant output to nulls — focus on the data that exists).
- Do all calculations in Python.
- For every numerical question, write deterministic Python that computes the answer directly from data (never prose-only math).
- Guard edge cases (division by zero, empty subsets, non-numeric coercion, and missing columns) before computing.
- WRITE COMPLETE, FULL PYTHON CODE. Never truncate, abbreviate, or use "..." or "# similar for other..." placeholders. Every line must be executable.
- If generating multiple charts, write the FULL code for each chart. Do not skip any chart creation code.
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
    1. TOP-LEFT: Overall production summary (KPIs + trend chart)
    2. BELOW TOP-LEFT: Shift-wise performance comparison (Shift 1 vs Shift 2) as grouped bar chart
    3. BELOW SHIFTS: Operator-wise and QA/Engineer performance charts
    4. CENTER: Forecast data — trends, anomalies, patterns with projections (THIS IS THE HERO SECTION)
    5. BELOW CENTER: Two columns — (a) Top 5 Concerns (management-critical), (b) Recommended Actions for each
    6. REMAINING SPACE: Interactive drill-down charts for deeper insights
  - Use plotly subplots with make_subplots to create a multi-panel dashboard layout.
  - Make it visually compelling with distinct colors per section.
  - The template must be management-ready: focus on gaps, anomalies, and actionable insights.

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

DIAGNOSTIC ANALYSIS RULES:
- If the dataset has fewer than 30 rows, never call any pattern "Universal" or "Consistent". Use "tentative" or "preliminary".
- Check for perfect correlations (R ≈ 1.0) between numeric columns; if found, flag the data as potentially formulaic.
- Report BOTH mean and median for numeric summaries. If they diverge significantly, note the skew.
- If a single row accounts for >50% of a segment's value, isolate it and show results with and without it.
- For root-cause analysis: check if a loss/issue is global or localized.
- If time-series data is available, compare current period to same period last year (YoY) when possible.
- Rank insights by impact: focus on the finding that affects the largest share of revenue or cost first.
- IDENTIFY GAPS: If a gap or anomaly exists, don't just report it — hypothesize WHY it exists. Question the data like a skeptic.

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

        try {
            const { response } = await this.generateWithFallback({
                models: ANALYSIS_MODEL_CANDIDATES,
                contents: [
                    ...chatHistory,
                    { role: 'user', parts: [{ text: userQuery }] },
                ],
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: 'application/json',
                    temperature: modeConfig.temperature,
                },
            });

            let text = this.normalizeResponseText(response) || '{}';
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                return JSON.parse(text);
            } catch {
                const cleanedText = text.replace(/"([^"\\]|\\.)*"/g, (match) =>
                    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
                );
                return JSON.parse(cleanedText);
            }
        } catch (error) {
            console.error('LLM Analysis Error:', error);
            throw new Error('Failed to generate analysis code');
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

            let text = this.normalizeResponseText(response) || '{}';
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            const parsed = JSON.parse(text);
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
- BE CONCISE. Management reads bullet points, not essays. Max 2-3 sentences per insight.
- LEAD WITH ACTIONS: Start each finding with "→ Action:" followed by the recommendation, then the evidence.
- NO FILLER TEXT: Remove "Let me analyze...", "Based on the data...", "It's worth noting..." — skip preamble entirely.
- USE BULLET POINTS over paragraphs. Every bullet must be a standalone, actionable insight.
- TOTAL RESPONSE LENGTH: Aim for 200-400 words. Quality over quantity. Crisp over comprehensive.

RULES:
- Never fabricate values, percentages, or trends not present in the execution output.
- If evidence is insufficient, state it in one sentence and suggest what data would help.
- If execution failed, explain the failure in 1-2 sentences and suggest a concrete fix.
- If charts were generated, mention their key takeaway in one sentence — don't describe the chart structure.
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
2. **🚨 Top Concerns & Actions** — Max 5 bullet points. Each: Finding → Action.
3. **📈 Forecast & Trends** — What will happen next? 2-3 bullets with projected direction.
4. **💡 Quick Wins** — 2-3 immediately actionable opportunities.
5. **⚡ Data Quality** — One-line reliability rating.
`;

        const prompt = `
User question:
${userQuery}

Executed code:
${code}

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
