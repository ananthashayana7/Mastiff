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
        promptPrefix: `MODE: DEEP ANALYSIS
- Use deterministic, evidence-driven reasoning with high analytical precision.
- Never fabricate metrics, trends, or statistics.
- If visualization is requested, generate suitable plotting code with professional styling.
- Validate data quality and integrity before producing executive insights.
- Add uncertainty caveats when sample size or data quality is weak.
- Structure responses with clear sections: Key Findings, Statistical Summary, Recommendations.
- For management-level decisions, include confidence levels and risk factors.
- Always prefer quantitative evidence over qualitative assertions.`,
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

export class LLMService {
    private genAI: GoogleGenAI | null = null;

    private getClient() {
        if (!this.genAI) {
            const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
            if (!apiKey) {
                if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'development') {
                    return null;
                }
                throw new Error('API_KEY must be set when using the Gemini API.');
            }
            this.genAI = new GoogleGenAI({ apiKey });
        }
        return this.genAI;
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

    private async generateWithFallback(params: GenerateWithFallbackParams): Promise<{ response: any; model: string }> {
        const client = this.getClient();
        if (!client) {
            throw new Error('AI client not initialized');
        }

        let lastError: any = null;

        for (const model of Array.from(new Set(params.models))) {
            try {
                const response = await client.models.generateContent({
                    model,
                    contents: params.contents,
                    config: params.config,
                });
                return { response, model };
            } catch (error: any) {
                lastError = error;
                if (!this.isModelNotFoundError(error)) {
                    throw error;
                }
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
        personaInstruction: string = ''
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

        const systemPrompt = `
You are Mastiff, an AI data analyst executing Python in a stateful sandbox.

${modeConfig.promptPrefix}
${personaBlock}

DATA CONTEXT:
${filesContext}
${connectorContextBlock}

EXECUTION ENVIRONMENT:
- Libraries available: pandas, numpy, matplotlib, seaborn, scipy, statsmodels, sklearn, plotly.
- Dataframes available as: dfs["filename"] and df (default first dataframe).
- Return result via variable: result.
- For Plotly visual output, set result to a Plotly figure.

INSTRUCTIONS:
- Convert data types safely before analysis.
- Handle missing values and invalid dates robustly.
- Do all calculations in Python.
- For every numerical question, write deterministic Python that computes the answer directly from data (never prose-only math).
- Guard edge cases (division by zero, empty subsets, non-numeric coercion, and missing columns) before computing.
- Perform a quick data quality check (nulls, outliers, malformed dates) when relevant.
- Keep explanations grounded in what the code will compute, not assumptions.
- If visualization is requested (${wantsVisualization ? 'YES' : 'NO'}), produce the most suitable chart.
- If visualization is not requested, do not force a chart.
- Chart selection guidance:
    - Use pie/donut for part-to-whole with <= 8 categories.
    - Use heatmap for correlation matrices, pivot intensity, or dense cross-tab comparisons.
    - Use line for temporal trends, bar for ranking, scatter for relationship/outlier checks.
- Styling guidance for Plotly:
    - Use professional color palettes (e.g., px.colors.qualitative.Safe, px.colors.qualitative.Vivid).
    - For heatmaps, use a perceptual continuous scale (e.g., Viridis).
    - Set readable labels, title, and balanced margins.
- Keep explanation factual and procedural; do not claim computed numbers before execution.

RESPONSE FORMAT (JSON ONLY):
{
  "explanation": "Short description of what the code will do.",
  "code": "Python code",
  "requires_visualization": ${wantsVisualization ? 'true' : 'false'}
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
        mode: AnalysisMode = 'analysis'
    ): Promise<string> {
        const chartCount = (execution.charts?.length || 0) + (execution.plotly_charts?.length || 0);
        const fallback = execution.error
            ? `Execution failed: ${execution.error}`
            : execution.result || 'Execution completed.';

        const client = this.getClient();
        if (!client) return fallback;

        const systemPrompt = `
You are an evidence-grounded data analyst providing executive-quality insights.
Use ONLY the provided execution artifacts — never fabricate data.

RULES:
- Never fabricate values, percentages, or trends not present in the execution output.
- If evidence is insufficient, state that clearly and suggest what additional data would help.
- If execution failed, explain the failure plainly and suggest a concrete next step.
- Structure your response with clear sections: Key Findings, Details, and Recommendations where appropriate.
- Present numerical findings with appropriate precision.
- If charts were generated, describe what they reveal without inventing unseen details.
- Keep the response concise, professional, and decision-oriented.
- Use markdown formatting: bold for key metrics, bullet points for findings, headers for sections.
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
