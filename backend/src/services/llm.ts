import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
];

function parseApiKeys(...envValues: (string | undefined)[]): string[] {
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

function isKeyExhaustedError(error: any): boolean {
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

    constructor() {
        this.apiKeys = parseApiKeys(
            process.env.API_KEY,
            process.env.GEMINI_API_KEY,
            process.env.GOOGLE_API_KEY
        );

        if (this.apiKeys.length === 0) {
            throw new Error('Missing API_KEY/GEMINI_API_KEY/GOOGLE_API_KEY environment variable');
        }
    }

    private getClientForKey(apiKey: string): GoogleGenAI {
        let client = this.clients.get(apiKey);
        if (!client) {
            client = new GoogleGenAI({ apiKey });
            this.clients.set(apiKey, client);
        }
        return client;
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

        for (let keyOffset = 0; keyOffset < this.apiKeys.length; keyOffset++) {
            const keyIndex = (this.currentKeyIndex + keyOffset) % this.apiKeys.length;
            const client = this.getClientForKey(this.apiKeys[keyIndex]);

            for (const model of MODEL_CANDIDATES) {
                try {
                    const response = await client.models.generateContent({
                        model,
                        contents: [
                            ...convertedHistory,
                            { role: 'user', parts: [{ text: userQuery }] },
                        ],
                        config: {
                            systemInstruction: systemPrompt,
                            responseMimeType: 'application/json',
                            temperature: 0.1,
                        },
                    });

                    this.currentKeyIndex = keyIndex;

                    const text = this.sanitizeJsonText(this.normalizeTextResponse(response));
                    return JSON.parse(text);
                } catch (error: any) {
                    lastError = error;
                    const msg = String(error?.message || error);
                    const isModelNotFound = msg.includes('NOT_FOUND') || msg.includes('models/') || msg.includes('not found');

                    if (isModelNotFound) {
                        continue;
                    }

                    if (isKeyExhaustedError(error)) {
                        break;
                    }

                    throw error;
                }
            }
        }

        console.error('LLM Error:', lastError);
        throw new Error('All configured Gemini API keys are exhausted or unavailable. Please retry shortly.');
    }
}

export const llm = new LLMService();
