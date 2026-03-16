import { GoogleGenAI } from '@google/genai';
import { AnalysisMode } from '@/types';

const MODE_CONFIGS: Record<AnalysisMode, {
    temperature: number;
    promptPrefix: string;
    maxHistorySlice: number;
}> = {
    chat: {
        temperature: 0.35,
        promptPrefix: `MODE: CHAT
- Answer clearly and directly.
- For conceptual questions, give a pure theory answer.
- If the user asks for analysis without data, provide an explicit assumption or a Python template.
- Never invent data, percentages, or trends.`,
        maxHistorySlice: 10,
    },
    analysis: {
        temperature: 0.15,
        promptPrefix: `MODE: ANALYSIS
- Use deterministic, evidence-driven reasoning.
- Never fabricate metrics or trends.
- If visualization is requested, generate suitable plotting code.
- Validate data quality before producing executive insights.
- Add uncertainty caveats when sample size or data quality is weak.`,
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
        mode: AnalysisMode = 'analysis'
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

        const systemPrompt = `
You are Mastiff, an AI data analyst executing Python in a stateful sandbox.

${modeConfig.promptPrefix}

DATA CONTEXT:
${filesContext}

EXECUTION ENVIRONMENT:
- Libraries available: pandas, numpy, matplotlib, seaborn, scipy, statsmodels, sklearn, plotly.
- Dataframes available as: dfs["filename"] and df (default first dataframe).
- Return result via variable: result.
- For Plotly visual output, set result to a Plotly figure.

INSTRUCTIONS:
- Convert data types safely before analysis.
- Handle missing values and invalid dates robustly.
- Do all calculations in Python.
- Perform a quick data quality check (nulls, outliers, malformed dates) when relevant.
- Keep explanations grounded in what the code will compute, not assumptions.
- If visualization is requested (${wantsVisualization ? 'YES' : 'NO'}), produce the most suitable chart.
- If visualization is not requested, do not force a chart.
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
You are an evidence-grounded analyst.
Use ONLY the provided execution artifacts.

RULES:
- Never fabricate values, percentages, or trends.
- If evidence is insufficient, state that clearly.
- If execution failed, explain the failure plainly and suggest a concrete next step.
- Keep response concise and decision-oriented.
- If charts exist, mention what was visualized without inventing unseen details.
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

    async chat(userQuery: string, history: any[], mode: AnalysisMode = 'chat'): Promise<string> {
        const client = this.getClient();
        if (!client) return 'AI service is not currently available. Please check your API key configuration.';

        const modeConfig = MODE_CONFIGS[mode];

        const systemPrompt = `
You are Mastiff, an expert AI data and analytics assistant.

${modeConfig.promptPrefix}

BEHAVIOR:
- For theory questions: answer with theory only.
- For practical questions without data: provide assumptions and optionally a Python example.
- For high-stakes decisions: include confidence caveats when evidence is limited.
- Use markdown formatting for clarity.
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
