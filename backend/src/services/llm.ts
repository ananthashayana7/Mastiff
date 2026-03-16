import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
];

export class LLMService {
    private client: GoogleGenAI;

    constructor() {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new Error('Missing API_KEY environment variable');
        }
        this.client = new GoogleGenAI({ apiKey });
    }

    private sanitizeJsonText(text: string): string {
        return text
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
    }

    private normalizeTextResponse(response: any): string {
        if (!response) return '';
        if (typeof response.text === 'string') return response.text;
        if (typeof response.text === 'function') return response.text() || '';
        return '';
    }

    async getAnalysisCode(userQuery: string, schema: string, sampleData: any, history: any[]) {
        const systemPrompt = `
You are a data analysis assistant. The user has uploaded a dataset and wants to analyze it.

Dataset Schema:
${schema}

Dataset Sample (first 5 rows):
${JSON.stringify(sampleData, null, 2)}

Available libraries: pandas, numpy, matplotlib, seaborn, scipy, statsmodels

Your task:
1. Understand the user's question
2. Write Python code to analyze the data
3. The dataframe is already loaded as 'df'
4. Store results in a variable called 'result'
5. If creating a visualization, simply create the plot. The environment will handle the save.

Return your response in this JSON format:
{
  "explanation": "Brief explanation of what you're doing",
  "code": "Python code here",
  "requires_visualization": true/false
}

Code rules:
- Use only pandas, numpy, matplotlib, seaborn
- Don't use input() or any user interaction
- Don't access the internet
- Handle missing values appropriately
- Always return meaningful results
`;

        const convertedHistory = (history || []).slice(-12).map((h: any) => ({
            role: h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }],
        }));

        let lastError: any = null;

        for (const model of MODEL_CANDIDATES) {
            try {
                const response = await this.client.models.generateContent({
                    model,
                    contents: [
                        ...convertedHistory,
                        { role: 'user', parts: [{ text: userQuery }] },
                    ],
                    config: {
                        systemInstruction: systemPrompt,
                        responseMimeType: 'application/json',
                        temperature: 0.2,
                    },
                });

                const text = this.sanitizeJsonText(this.normalizeTextResponse(response));
                return JSON.parse(text);
            } catch (error: any) {
                lastError = error;
                const msg = String(error?.message || error);
                const isModelNotFound = msg.includes('NOT_FOUND') || msg.includes('models/') || msg.includes('not found');
                if (!isModelNotFound) {
                    break;
                }
            }
        }

        console.error('LLM Error:', lastError);
        throw new Error('Failed to generate analysis code: no supported Gemini model was available');
    }
}

export const llm = new LLMService();
