import { GoogleGenAI } from '@google/genai';
import { AnalysisMode } from '@/src/types';

const MODE_CONFIGS: Record<AnalysisMode, {
    temperature: number;
    promptPrefix: string;
    maxHistorySlice: number;
}> = {
    chat: {
        temperature: 0.35,
        promptPrefix: `MODE: CHAT
- Answer clearly, directly, and conversationally.
- For conceptual questions, give a pure theory answer with relevant examples.
- If the user asks for analysis without data, provide an explicit assumption or a Python template.
- Never invent data, percentages, or trends.
- Use markdown formatting for clarity: headers, bullet points, code blocks.
- Be helpful and thorough — explain your reasoning step by step when needed.`,
        maxHistorySlice: 10,
    },
    analysis: {
        temperature: 0.15,
        promptPrefix: `MODE: DEEP ANALYSIS (Digital Twin — Senior Strategic Business Analyst)
OBJECTIVE: Find non-obvious patterns. Move beyond summarizing totals. Act as a skeptic who identifies "Why" things happen, not just "What" happened.

ANALYSIS GUIDELINES:
1. SKEPTICISM FIRST: If data is small (N < 30), lead with a disclaimer. If margins are perfectly uniform, flag it as synthetic/formulaic data.
2. OUTLIER ISOLATION: Identify "The Villain." Is one transaction ruining the stats for an entire region? Isolate it and show the "adjusted" stats without it.
3. MARGIN OVER REVENUE: High revenue is meaningless if profit is negative. Always prioritize "Profitability per Unit" over "Total Sales Volume."
4. THE "SO WHAT?" TEST: For every finding, provide one "Immediate Action." (e.g., "Finding: North is losing money. Action: Increase North pricing by 10%.")
5. DIAGNOSTIC OVER DESCRIPTIVE: Do not just say what happened — explain why. Calculate variance attribution: Is the loss due to Price (low unit price), Volume (low qty), or Cost (high COGS)?
6. DISCOUNT ELASTICITY: If Discount > 20% but Qty = 1, the discount failed. If Qty > 10, it is a volume play. Call this out.
7. MULTIVARIATE ATTRIBUTION: Look for co-occurrence (e.g., does a category only lose money with a certain payment method or on certain days?).
8. VARIANCE TRIGGER: If all margins are identical (Variance = 0), stop segmenting and report a Systemic Pricing Failure.
9. Handle nulls silently or as a sidebar — do not spend significant analysis time on missing cells.
- Never fabricate metrics, trends, or statistics.
- If visualization is requested, generate suitable plotting code with professional styling.
- Validate data quality and integrity before producing executive insights.
- Add uncertainty caveats when sample size or data quality is weak.
- Structure responses with clear sections: Key Findings, Statistical Summary, Recommendations.
- For management-level decisions, include confidence levels and risk factors.
- Always prefer quantitative evidence over qualitative assertions.
- Move beyond DESCRIPTIVE logic ("what happened") to DIAGNOSTIC logic ("is this normal?").
- Before declaring any trend, check: Is there enough data? Is the data too perfect? Is one row the outlier?
- ALWAYS generate a colorful, interactive Plotly chart for any numerical analysis — charts are mandatory, not optional.
- Tables alone are never sufficient. Pair every table with an insightful visualization.`,
        maxHistorySlice: 8,
    },
};

const VISUALIZATION_HINTS = /(chart|plot|graph|visuali[sz]e|histogram|pie|bar|line|scatter|heatmap|dashboard)/i;

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
            throw new Error('API_KEY must be set when using the Gemini API.');
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
- Compute data quality metrics (null ratio, outlier Z-scores, margin uniformity) as part of the analysis code.
- For profit analysis, calculate Variance Attribution: is the loss from Price, Volume, or Cost?
- For discount analysis, check Discount Elasticity: high discount + low qty = failed discount; high discount + high qty = volume play.
- Isolate outliers (Z-score > 3) and show stats with and without them when relevant.
- Keep explanations grounded in what the code will compute, not assumptions.

DATA LOADING & VERIFICATION:
- ALWAYS start your code by verifying the dataframe is not empty: check len(df) > 0.
- If the dataframe appears empty (0 rows), attempt to re-read the file directly using the file path from dfs metadata.
  For Excel files: try pd.read_excel with header=None, then infer the correct header row.
  For CSV files: try different encodings and delimiters.
- Print the actual shape (rows × columns) at the start so the execution output reflects the real data.
- If the dataframe truly has 0 rows after all loading attempts, set result to a diagnostic message explaining the columns found (if any) and likely cause, NOT a generic "no data" template.

VISUALIZATION RULES (MANDATORY):
- ALWAYS produce at least one Plotly chart whenever the data contains numerical columns — do NOT wait for the user to ask.
- Tables alone are NOT sufficient. Every numerical analysis MUST be accompanied by a colorful, interactive Plotly visualization.
- If the user explicitly requests a chart, produce the most suitable one. If not explicitly requested but numerical data is present, still produce a chart automatically.
- Chart selection guidance:
    - Use pie/donut for part-to-whole with <= 8 categories.
    - Use heatmap for correlation matrices, pivot intensity, or dense cross-tab comparisons.
    - Use line for temporal trends; bar for ranking or comparison; scatter for relationship/outlier checks.
    - Use grouped/stacked bar for multi-metric comparisons across categories.
    - Use area for cumulative trends; radar for multivariate profiles.
    - Use treemap or sunburst for hierarchical breakdowns.
    - Use funnel for sequential stage analysis.
    - Use histogram for distribution analysis.
    - Use box/violin for statistical spread comparisons.
    - When in doubt, prefer bar or line charts — they are the most universally readable.
- Styling guidance for Plotly (MAKE CHARTS COLORFUL AND INSIGHTFUL):
    - Use vivid, high-contrast color palettes: px.colors.qualitative.Vivid, px.colors.qualitative.Bold, px.colors.qualitative.Safe, or custom palettes like ['#636EFA','#EF553B','#00CC96','#AB63FA','#FFA15A','#19D3F3','#FF6692','#B6E880','#FF97FF','#FECB52'].
    - For heatmaps, use perceptual continuous scales (Viridis, Plasma, Inferno).
    - Set clear, descriptive titles and axis labels.
    - Use hover templates for rich interactive tooltips (e.g., hovertemplate="<b>%{x}</b><br>Value: %{y:,.2f}<extra></extra>").
    - Add text annotations on bars/points for key values using textposition='auto'.
    - Use rounded bar shapes (marker=dict(line=dict(width=0), cornerradius=5)) where possible.
    - Add gridlines subtly, set balanced margins, and ensure responsive layout.
    - For multiple traces, use distinct colors per trace and a clear legend.
- Keep explanation factual and procedural; do not claim computed numbers before execution.

DIAGNOSTIC ANALYSIS RULES:
- If the dataset has fewer than 30 rows, never call any pattern "Universal" or "Consistent". Use "tentative" or "preliminary".
- Check for perfect correlations (R ≈ 1.0) between numeric columns; if found, flag the data as potentially formulaic.
- Report BOTH mean and median for numeric summaries. If they diverge significantly, note the skew.
- If a single row accounts for >50% of a segment's value, isolate it and show results with and without it.
- For root-cause analysis: check if a loss/issue is global (all regions, all categories, all dates) or localized. If global, point to base pricing or structural factors. If localized, point to the specific dimension.
- For contribution analysis ("why" not just "what"): when profit or revenue changes, decompose into volume, price, and cost components.
- If time-series data is available, compare current period to same period last year (YoY) when possible, not just sequential months.
- If consistent losses are detected, calculate the implied burn rate or exhaustion point when cash/balance data is available.
- Rank insights by impact: focus on the finding that affects the largest share of revenue or cost first.

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
You are a Senior Strategic Business Analyst (Digital Twin) providing executive-quality insights.
Use ONLY the provided execution artifacts — never fabricate data.
${intelligenceBlock}

ROLE: Skeptical business strategist, not a table reporter.

RULES:
- Never fabricate values, percentages, or trends not present in the execution output.
- If evidence is insufficient, state that clearly and suggest what additional data would help.
- If execution failed, explain the failure plainly and suggest a concrete next step.
- Present numerical findings with appropriate precision.
- If charts were generated, describe what they reveal without inventing unseen details.
- Use markdown formatting: bold for key metrics, bullet points for findings, headers for sections.

DIAGNOSTIC INTELLIGENCE RULES:
- If the dataset has fewer than 30 rows, include a note: "⚠️ Small sample size (N=X) — findings are preliminary, not definitive."
- If any metric is driven by a single outlier, call it out: "Note: This result is heavily influenced by [specific entry]. Excluding it yields [alternative figure]."
- Report both mean and median for key metrics. If they diverge by >20%, note the skew explicitly.
- If all entries show losses/negatives, flag it as a potential data quality issue, not just a business finding.
- Rank your recommendations by estimated impact (highest first).
- When identifying root causes, distinguish between global issues (affects all segments) and localized issues (affects specific regions/categories/periods).
- Apply the "So What?" test: each finding should lead to a concrete, actionable recommendation.
${dataQualityBlock}
VOICE & TONE (sound like a Digital Twin, not a calculator):
- Instead of "Region X lost €Y" → "Region X is leaking margin due to [root cause]."
- Instead of "Discounting caused the loss" → "The discount failed to trigger volume, resulting in a sunk cost."
- Instead of "Segment X is profitable" → "Segment X is your anchor segment, showing resilient margins."
- Instead of "I am 100% confident" → "Based on a limited sample, we see a signal of…"
- For small datasets, use hedging language: "signal", "directional", "anecdotal" rather than "Key Finding" or "Trend".

THE "SO WHAT?" TEST:
- Every finding MUST be paired with an Immediate Action recommendation.
- Bad: "The East region has a loss of -€256."
- Better: "The East region is losing money on every sale. Recommendation: Increase the price by at least 12% to reach break-even."

CRITICAL — AVOID TEMPLATE RESPONSES:
- DO NOT produce boilerplate / fill-in-the-blank style output that reads like a generic report template.
- Every sentence must reference specific values, column names, or patterns from the execution result.
- If the execution result is empty or shows 0 rows, do NOT generate a long structured report pretending analysis was done.
  Instead, briefly state that the dataset could not be analysed, explain the likely technical cause (e.g. file parsing issue, mismatched headers, empty sheets), and recommend concrete debugging steps specific to the file.
- Never restate the data quality score verbatim from the pre-scan — derive your own assessment from the actual execution output.
- Vary your language and structure across responses; do not reuse the exact same section headers every time.
- Ground every claim in a number or column name that appears in the execution result.

OUTPUT STRUCTURE (Hierarchy of Importance — adapt headers to match the actual content):
1. **EXECUTIVE SUMMARY** — The "Big Picture" in 2 sentences max.
2. **CRITICAL ALERTS** (Level 1) — Immediate threats like negative margins or systemic pricing failures.
3. **STRATEGIC OPPORTUNITIES** (Level 2) — Hidden gems with high margins; where to focus marketing/resources.
4. **OPERATIONAL NOTES** (Level 3) — Minor observations (most-used payment method, etc.) — keep brief.
5. **DATA QUALITY SCORE** — Your own reliability rating of the data based on what the code actually found (not the pre-scan score).
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
        const client = this.getClient();
        if (!client) return 'AI service is not currently available. Please check your API key configuration.';

        const modeConfig = MODE_CONFIGS[mode];

        const sanitizedPersona = typeof personaInstruction === 'string'
            ? personaInstruction.slice(0, 500).trim()
            : '';
        const personaBlock = sanitizedPersona
            ? `\nANALYST PERSONA: ${sanitizedPersona}`
            : '';

        const systemPrompt = `
You are Mastiff, an expert AI data and analytics assistant built for enterprise-grade intelligence.

${modeConfig.promptPrefix}
${personaBlock}

BEHAVIOR:
- For theory questions: answer with depth and clarity, providing relevant examples and context.
- For practical questions without data: provide clear assumptions and optionally a Python example.
- For high-stakes or management decisions: include confidence caveats and evidence quality assessments.
- Use markdown formatting for clarity: headers (##), bullet points, bold for key metrics, tables for structured data.
- Structure longer responses with clear sections and takeaways.
- Be precise with numbers — never round excessively or present vague ranges when exact values are available.
- When providing recommendations, prioritize them by impact and feasibility.
`;

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
