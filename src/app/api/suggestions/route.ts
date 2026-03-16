import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

const MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

function normalizeResponseText(result: any): string {
    if (!result) return '';
    if (typeof result.text === 'function') return result.text() || '';
    if (typeof result.text === 'string') return result.text;
    return '';
}

function isModelNotFoundError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    return msg.includes('not_found') || msg.includes('not found') || msg.includes('models/');
}

export async function POST(req: NextRequest) {
    try {
        const { dataContext } = await req.json();

        if (!process.env.API_KEY || process.env.API_KEY === 'your_gemini_api_key_here') {
            return NextResponse.json([
                'What patterns exist in this dataset?',
                'Show me a summary of key statistics',
                'Identify any outliers or anomalies',
                'Create a visualization of the trends',
            ]);
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const systemInstruction = `
          You are an AI Data Scientist. Given the following data schema, suggest 4 short, actionable analysis questions the user could ask.
          Return ONLY a JSON array of strings. Max 12 words per suggestion. Make them specific to the data.
          Example: ["Show revenue trends by region", "Find correlation between sales and growth"]
        `;

        let lastError: any = null;

        for (const model of MODEL_CANDIDATES) {
            try {
                const result = await ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: `DATA CONTEXT:\n${dataContext}` }] }],
                    config: { systemInstruction, responseMimeType: 'application/json' },
                });

                const text = normalizeResponseText(result).replace(/```json/g, '').replace(/```/g, '').trim();
                return NextResponse.json(JSON.parse(text || '[]'));
            } catch (error: any) {
                lastError = error;
                if (!isModelNotFoundError(error)) {
                    throw error;
                }
            }
        }

        throw lastError || new Error('No supported Gemini model is available for suggestions');
    } catch (error: any) {
        console.error('Suggestions API Error:', error);
        return NextResponse.json([
            'Summarize the key statistics',
            'Find patterns and correlations',
            'Create a trend visualization',
            'Identify data quality issues',
        ]);
    }
}
