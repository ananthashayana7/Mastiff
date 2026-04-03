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
                'Show key statistics with charts',
                'Identify outliers and anomalies — why do they exist?',
                'Forecast the next period trend',
                'What are the top 5 concerns and actions?',
                'Create an interactive dashboard of this data',
            ]);
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const systemInstruction = `
          You are an elite AI Data Strategist. Given the following data schema, suggest 6 short, actionable analysis questions the user could ask.
          
          RULES:
          - Return ONLY a JSON array of strings.
          - Max 15 words per suggestion.
          - Make them SPECIFIC to the actual columns and data types present.
          - Include at least ONE forecast/prediction question (e.g., "Forecast next quarter revenue with confidence bands").
          - Include at least ONE chart/visualization question (e.g., "Create an interactive dashboard of key metrics").
          - Include at least ONE anomaly/outlier detection question (e.g., "What anomalies exist and why?").
          - Include at least ONE gap detection question (e.g., "What gaps or missing patterns exist in this data?").
          - Focus on management-level questions that drive DECISIONS and ACTIONS.
          - If assembly line, production, shift, operator, defect, cycle time, throughput, or manufacturing data is detected:
            - Include shift-wise and operator-wise performance questions.
            - Include a question about production bottlenecks or quality issues.
          - If financial data (revenue, cost, profit, margin) is detected:
            - Include a question about profitability trends and margin compression.
            - Include a question about cost drivers and optimization.
          
          AVOID generic questions. Be SPECIFIC to the data columns provided.
          Example: ["Forecast next month revenue trend with confidence bands", "Show top 5 underperforming segments and why", "What anomalies exist in the last quarter data?", "Which operator has the highest defect rate and why?", "Create a shift-wise performance dashboard", "What data gaps could hide issues?"]
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
            'Summarize key statistics with charts',
            'Identify anomalies and their root causes',
            'Forecast the next period trend',
            'Show top 5 concerns and recommended actions',
            'Create an interactive data dashboard',
            'What gaps exist in this data?',
        ]);
    }
}
