import { GoogleGenAI } from "@google/genai";
import { AnalysisMode } from "@/types";

// Mode configurations — consolidated into two high-performance states
const MODE_CONFIGS: Record<AnalysisMode, {
    temperature: number;
    promptPrefix: string;
    maxHistorySlice: number;
}> = {
    chat: {
        temperature: 0.5,
        promptPrefix: `MODE: DEFAULT CHAT — High-IQ conversational reasoning.
- Goal: Answer general questions, explain concepts, and guide the user.
- Rules: Be helpful and precise. Suggest data analysis if relevant.
- Context: You are Mastiff, the ultimate AI data partner.`,
        maxHistorySlice: 10,
    },
    analysis: {
        temperature: 0.2,
        promptPrefix: `MODE: BOARDROOM ANALYST — Agentic Zero-Filler Science.
- ZERO-INTRO RULE: Do NOT start with "I performed a scan..." or "This was complex...". Start IMMEDIATELY with insights.
- NO META-TALK: Explicitly FORBIDDEN from discussing headers, delimiters, parsing, or data cleaning.
- COMPUTATIONAL TRUTH: 100% of math must be via Python. If a value like -1,000,000 repeats identically, DO NOT report it as a trend—flag it as a "Data Integrity Warning".
- FORENSIC STYLE: Output must be crisp, boardroom-ready, and void of AI personality or apologies.
- MANDATORY VISUAL: You MUST generate exactly ONE high-fidelity Plotly chart (px or go). 
- To show a Plotly chart, assign the figure to 'result' (e.g., result = px.bar(...)).`,
        maxHistorySlice: 8,
    },
};

export class LLMService {
    private genAI: GoogleGenAI | null = null;

    private getClient() {
        if (!this.genAI) {
            const apiKey = process.env.API_KEY;
            if (!apiKey) {
                if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'development') {
                    return null;
                }
                throw new Error("API_KEY must be set when using the Gemini API.");
            }
            this.genAI = new GoogleGenAI({ apiKey });
        }
        return this.genAI;
    }

    /**
     * Generate analysis code for data-related queries.
     * Mode controls temperature + system prompt behavior.
     */
    async getAnalysisCode(
        userQuery: string,
        files: { name: string; schema: string; sample: any }[],
        history: any[],
        mode: AnalysisMode = 'analysis'
    ) {
        const client = this.getClient();
        if (!client) throw new Error("AI client not initialized");

        const modeConfig = MODE_CONFIGS[mode];

        const filesContext = files.map(f => `
--- FILE: ${f.name} ---
Schema:
${f.schema}
Sample (first 5 rows):
${JSON.stringify(f.sample, null, 2)}
`).join('\n');

        const systemPrompt = `
You are MASTIFF, an elite financial data science agent. You match the best analysis platforms (Julius.ai, ChatGPT Data Analyst).

${modeConfig.promptPrefix}

CONTEXT:
The user has provided the following datasets:
${filesContext}

CAPABILITIES:
- Libraries: pandas, numpy, matplotlib, seaborn, scipy, statsmodels, sklearn, plotly.
- Persistence: This is a STATEFUL kernel. Your variables and imports persist.
- Interactive Charts: You can use 'plotly.express' (px) or 'plotly.graph_objects' (go).
- To show a Plotly chart, assign it to 'result' or append it to 'plotly_json'.
- Seaborn/Matplotlib: Still supported for static high-fidelity charts.

FINANCIAL DATA INTELLIGENCE:
- Treat all monetary columns with care: format with proper currency symbols and precision.
- When asked about a time period (e.g. "Q3", "last month", "2024"), parse dates correctly and filter the data.
- When asked about categories (e.g. "by region", "for product X"), group and filter accordingly.
- Detect anomalies: flag outliers, sudden spikes/drops, and unusual distributions.
- Always provide confidence context — don't overstate conclusions from small samples.
- Cross-reference related columns when available (e.g. cost vs revenue for margins).

CHART STYLING (CRITICAL — PLOTLY ONLY):
- Use the following color palette for all traces: ['#E50914', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
- Always add clear titles, axis labels, and hover data.
- Default to 'plotly_dark' template (already set in kernel).
- Assign your final figure to 'result'.

NATURAL LANGUAGE QUERY HANDLING:
- The user may ask questions in plain English about their data.
- Examples: "What were our top 5 expenses in March?", "Compare Q1 vs Q2 revenue", "Show me the trend over time"
- Always interpret the intent, identify relevant columns, filter data, and present results.
- If the query is ambiguous, analyze the most likely interpretation and state your assumption.

RESPONSE FORMAT (JSON ONLY):
{
  "explanation": "Expert-level summary of your approach and findings. Use markdown formatting (headings, bold, lists, tables) for clarity.",
  "code": "Python code. Use 'dfs[\\\\"filename\\\\"]', 'df', 'px', 'go'.",
  "requires_visualization": true
}

CODE RULES:
- IMPORTANT: Use 'dfs["filename"]' to access specific files.
- Use 'result = ...' to return your findings.
- Always handle NaNs and data types before analysis.
- Be proactive: if a visualization adds value, create it even if not explicitly asked.
- For string operations, always use .astype(str) first to avoid type errors.
- For date operations, always parse with pd.to_datetime() first and handle errors='coerce'.
- When creating multiple charts, use plt.figure() for each to avoid overlapping.

AI RESPONSE RULES:
- IMPORTANT: Return ONLY valid JSON. 
- All string values (explanation, code) MUST be properly escaped (\n for newlines, \" for quotes).
- Ensure the JSON is complete and not truncated.
`;

        const chatHistory = history.slice(-modeConfig.maxHistorySlice).map(h => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
        }));

        try {
            const response = await client.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [
                    ...chatHistory,
                    { role: 'user', parts: [{ text: userQuery }] }
                ],
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: "application/json",
                    temperature: modeConfig.temperature,
                }
            });

            let text = response.text || '{}';

            // Clean up Markdown code blocks if present (though responseMimeType should prevent them)
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                return JSON.parse(text);
            } catch (innerError) {
                console.warn("Standard JSON.parse failed, attempting cleanup...", innerError);

                // Attempt to fix common LLM JSON errors:
                // Replace raw control characters (newlines, tabs) ONLY inside string literals
                const cleanedText = text.replace(/"([^"\\]|\\.)*"/g, (match) => {
                    return match
                        .replace(/\n/g, "\\n")
                        .replace(/\r/g, "\\r")
                        .replace(/\t/g, "\\t");
                });

                // Note: The above might over-escape if the LLM already escaped some. 
                // But usually, it fails because it DIDN'T escape.

                try {
                    return JSON.parse(cleanedText);
                } catch (finalError) {
                    console.error("CRITICAL: JSON parsing failed after cleanup.");
                    console.error("RAW TEXT PRE-CLEANUP:", text);
                    console.error("CLEANED TEXT:", cleanedText);
                    throw finalError;
                }
            }
        } catch (error) {
            console.error("LLM Analysis Error:", error);
            throw new Error("Failed to generate analysis code");
        }
    }

    /**
     * General conversational chat — no data files needed.
     * Mode affects how detailed the response is.
     */
    async chat(userQuery: string, history: any[], mode: AnalysisMode = 'chat'): Promise<string> {
        const client = this.getClient();
        if (!client) return "AI service is not currently available. Please check your API key configuration.";

        const modeConfig = MODE_CONFIGS[mode];

        const systemPrompt = `
You are Mastiff, an expert AI Data Scientist and Financial Analyst.
You are helpful, precise, and deeply knowledgeable about data science, statistics, machine learning, and financial analysis.

${modeConfig.promptPrefix}

When the user hasn't uploaded any data yet, help them by:
1. Answering questions about data analysis, statistics, finance, and machine learning
2. Explaining concepts clearly with examples
3. Suggesting what data they could upload for analysis
4. Providing general assistance and guidance

When discussing financial topics:
- Be precise with numbers — use proper formatting ($1,234.56)
- Don't speculate without data — state assumptions clearly
- Suggest relevant analyses the user could run with their data
- Reference industry standards and best practices

Use markdown formatting in your responses: headings (##), bold (**text**), lists, code blocks (\`\`\`python), and tables where appropriate.
Be concise but thorough. Show expertise without being verbose.
`;

        const chatHistory = history.slice(-modeConfig.maxHistorySlice).map(h => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
        }));

        try {
            const response = await client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    ...chatHistory,
                    { role: 'user', parts: [{ text: userQuery }] }
                ],
                config: {
                    systemInstruction: systemPrompt,
                    temperature: modeConfig.temperature,
                }
            });

            return response.text || "I wasn't able to generate a response. Please try again.";
        } catch (error) {
            console.error("LLM Chat Error:", error);
            return "I encountered an error while processing your request. Please try again.";
        }
    }
}

export const llm = new LLMService();
