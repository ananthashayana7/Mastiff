import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { validateCSRFRequest } from '@/lib/csrf';
import { isKeyExhaustedError, parseApiKeys } from '@/services/llm';

export const dynamic = 'force-dynamic';

const MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const KEY_COOLDOWN_MS = 90_000;
const exhaustedKeysUntil = new Map<string, number>();

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

function getAvailableKeys(): string[] {
    const now = Date.now();
    return parseApiKeys(
        process.env.API_KEY,
        process.env.GEMINI_API_KEY,
        process.env.GOOGLE_API_KEY
    ).filter((key) => (exhaustedKeysUntil.get(key) || 0) <= now);
}

function markKeyCoolingDown(key: string): void {
    exhaustedKeysUntil.set(key, Date.now() + KEY_COOLDOWN_MS);
}

function normalizeSuggestionList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];

    return Array.from(new Set(
        raw
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 6)
    ));
}

function buildDeterministicSuggestions(dataContext: string): string[] {
    const normalized = String(dataContext || '').toLowerCase();
    const isAssemblyLine = /(assembly|line|shift|operator|checker|engineer|qa|defect|reject|rework|throughput|cycle[_\s-]?time|downtime|station|production|yield|quality)/i.test(normalized);
    const isFinancial = /(revenue|sales|profit|margin|cost|expense|ebit|ebitda|income|refund|gmv|budget|cash|forecast)/i.test(normalized);
    const isMultiFile = /dataset count:\s*([2-9]|\d{2,})/i.test(normalized) || (normalized.match(/file:/g) || []).length > 1;

    if (isAssemblyLine) {
        return [
            'Forecast the next shift and flag the highest production risks.',
            'Build an assembly-line dashboard with shift, operator, and QA views.',
            'Which shift, operator, or station is driving the most defects?',
            'Show the top 5 management concerns and the action for each.',
            'Which anomalies or downtime pockets suggest hidden process issues?',
            isMultiFile
                ? 'Compare the imported files together and highlight cross-line deviations.'
                : 'Drill into throughput, cycle time, reject rate, and quality drivers.',
        ];
    }

    if (isFinancial) {
        return [
            'Forecast the next period and show the main revenue and margin drivers.',
            'Show the top 5 concerns, actions, and expected business impact.',
            'Which segments are compressing profit or margin the most?',
            'Where are the biggest anomalies, gaps, or unexplained swings?',
            isMultiFile
                ? 'Compare all imported files and explain what changed most materially.'
                : 'Build an interactive management dashboard with trends and outliers.',
            'Which metrics should leadership monitor weekly from this dataset?',
        ];
    }

    return [
        'Forecast the next likely trend and explain confidence and risk.',
        'Summarize the top 5 concerns and one action for each.',
        'Build an interactive dashboard with drill-down filters and charts.',
        'Find anomalies, gaps, and likely root causes in this data.',
        isMultiFile
            ? 'Compare the imported files together and surface the biggest differences.'
            : 'Which dimensions matter most, and what should I ask next?',
        'Which rows, columns, or segments deserve immediate investigation?',
    ];
}

async function generateSuggestions(dataContext: string): Promise<string[]> {
    const fallbackSuggestions = buildDeterministicSuggestions(dataContext);
    const apiKeys = getAvailableKeys();

    if (apiKeys.length === 0) {
        return fallbackSuggestions;
    }

    const systemInstruction = `
      You are Mastiff's suggestion engine. Return EXACTLY 6 short, actionable analysis questions.

      RULES:
      - Return ONLY a JSON array of strings.
      - Maximum 16 words per suggestion.
      - Every suggestion must be management-relevant and decision-oriented.
      - Include at least one forecast question.
      - Include at least one chart or dashboard question.
      - Include at least one anomaly, gap, or root-cause question.
      - If multiple files are present, include at least one comparison question.
      - If assembly line or manufacturing data is present, include shift-wise, operator-wise, and bottleneck or quality prompts.
      - Avoid generic filler. Use the provided context.
    `;

    let lastError: any = null;

    for (const apiKey of apiKeys) {
        const ai = new GoogleGenAI({ apiKey });

        for (const model of MODEL_CANDIDATES) {
            try {
                const result = await ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: `DATA CONTEXT:\n${dataContext}` }] }],
                    config: {
                        systemInstruction,
                        responseMimeType: 'application/json',
                        maxOutputTokens: 1024,
                        temperature: 0.2,
                    },
                });

                const text = normalizeResponseText(result).replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = normalizeSuggestionList(JSON.parse(text || '[]'));
                if (parsed.length > 0) {
                    return parsed;
                }
            } catch (error: any) {
                lastError = error;

                if (isKeyExhaustedError(error)) {
                    markKeyCoolingDown(apiKey);
                    break;
                }

                if (isModelNotFoundError(error)) {
                    continue;
                }

                throw error;
            }
        }
    }

    if (lastError) {
        console.warn('Suggestion model fallback triggered:', lastError);
    }

    return fallbackSuggestions;
}

export async function POST(req: NextRequest) {
    try {
        const csrfValidation = await validateCSRFRequest(req);
        if (!csrfValidation.valid) {
            return NextResponse.json({ error: csrfValidation.error || 'Invalid CSRF token' }, { status: 403 });
        }

        const { dataContext } = await req.json();
        const suggestions = await generateSuggestions(String(dataContext || ''));
        return NextResponse.json(suggestions);
    } catch (error: any) {
        console.error('Suggestions API Error:', error);
        return NextResponse.json(buildDeterministicSuggestions(''));
    }
}
