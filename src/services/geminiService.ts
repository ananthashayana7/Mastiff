import { GoogleGenAI, Modality } from "@google/genai";
import { AnalysisMode, GroundingSource } from "../types";

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

export class GeminiService {
  private clients: Map<string, GoogleGenAI> = new Map();
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;

  private resolveApiKeys(): string[] {
    if (this.apiKeys.length > 0) return this.apiKeys;

    this.apiKeys = parseApiKeys(
      process.env.API_KEY,
      process.env.GEMINI_API_KEY,
      process.env.GOOGLE_API_KEY
    );

    return this.apiKeys;
  }

  private getClientForKey(apiKey: string): GoogleGenAI {
    let client = this.clients.get(apiKey);
    if (!client) {
      client = new GoogleGenAI({ apiKey });
      this.clients.set(apiKey, client);
    }
    return client;
  }

  private async generateWithFallback(call: (ai: GoogleGenAI) => Promise<any>): Promise<any> {
    const keys = this.resolveApiKeys();
    if (keys.length === 0) {
      throw new Error('No API keys configured. Set API_KEY/GEMINI_API_KEY/GOOGLE_API_KEY.');
    }

    let lastError: any = null;

    for (let keyOffset = 0; keyOffset < keys.length; keyOffset++) {
      const keyIndex = (this.currentKeyIndex + keyOffset) % keys.length;
      const client = this.getClientForKey(keys[keyIndex]);

      try {
        const response = await call(client);
        this.currentKeyIndex = keyIndex;
        return response;
      } catch (error: any) {
        lastError = error;
        if (isKeyExhaustedError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw lastError || new Error('All configured API keys are exhausted. Retry shortly.');
  }

  async getSuggestions(dataContext: string) {
    const model = 'gemini-2.0-flash';

    const systemInstruction = `
      You are an AI Data Scientist. Given the following data schema, suggest 4 short, actionable analysis questions the user could ask.
      Return ONLY a JSON array of strings. Max 10 words per suggestion.
      Example: ["Analyze revenue trends", "Identify customer churn patterns"]
    `;

    try {
      const response = await this.generateWithFallback((ai) => ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `DATA CONTEXT:\n${dataContext}` }] }],
        config: { systemInstruction, responseMimeType: "application/json", temperature: 0.1 }
      }));
      return JSON.parse(response.text || "[]");
    } catch (error) {
      console.error("Suggestions Error:", error);
      return ["Basic data profile", "Identify outliers", "Trend analysis", "Correlation check"];
    }
  }

  async analyze(
    userPrompt: string,
    dataContext: string,
    history: { role: string, content: string }[],
    mode: AnalysisMode = 'standard',
    personaInstruction?: string,
    useSearch: boolean = false
  ) {
    let model = 'gemini-2.0-flash';
    let config: any = {
      temperature: 0.15,
      responseMimeType: "application/json",
    };

    // If search is enabled, use google search tool
    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
      delete config.responseMimeType;
    } else {
      if (mode === 'fast') {
        config.temperature = 0.25;
      } else if (mode === 'deep' || mode === 'ml') {
        config.temperature = 0.1;
      }
    }

    const systemInstruction = `
      You are Mastiff, an expert AI Data Scientist and Research Assistant.
      PERSONA CONTEXT: ${personaInstruction || 'Focus on clarity and business impact.'}
      
      BEHAVIOR:
      1. ANALYZE: Examine provided datasets or perform research.
      2. VISUALIZE: Provide a visualization if data is present.
      3. OUTPUT FORMAT: 
         If useSearch is true or if you are answering a general chat question without data, provide a structured response.
         If performing data analysis, use JSON:
         {
           "analysis": "Markdown explanation.",
           "code": "Processing steps.",
           "visualization": {
             "type": "bar" | "line" | "pie" | "scatter" | "table",
             "title": "Insight Title",
             "data": [ ... ],
             "config": { "xAxis": "key", "yAxis": "key", "keys": ["key1"] }
           }
         }
    `;

    const contents: any[] = history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: `DATA SOURCES:\n${dataContext || 'No data files uploaded.'}\n\nQUESTION: ${userPrompt}` }]
    });

    try {
      const response = await this.generateWithFallback((ai) => ai.models.generateContent({
        model,
        contents,
        config: { ...config, systemInstruction }
      }));

      const text = response.text;
      if (!text) throw new Error("Empty response");

      let sources: GroundingSource[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        sources = chunks
          .filter((chunk: any) => chunk.web)
          .map((chunk: any) => ({
            title: chunk.web.title,
            uri: chunk.web.uri
          }));
      }

      try {
        const parsed = JSON.parse(text);
        return { ...parsed, sources };
      } catch {
        return { analysis: text, code: "Natural Language Processing", visualization: null, sources };
      }
    } catch (error) {
      console.error("Gemini Error:", error);
      throw error;
    }
  }

  async speak(text: string) {
    try {
      const response = await this.generateWithFallback((ai) => ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text.slice(0, 500) }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      }));

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = this.decodeBase64(base64Audio);
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const buffer = await this.decodeAudio(audioData, ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      }
    } catch (err) { console.error("TTS failed", err); }
  }

  private decodeBase64(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private async decodeAudio(data: Uint8Array, ctx: AudioContext, rate: number, channels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / channels;
    const buffer = ctx.createBuffer(channels, frameCount, rate);
    for (let c = 0; c < channels; c++) {
      const channelData = buffer.getChannelData(c);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * channels + c] / 32768.0;
    }
    return buffer;
  }
}

export const gemini = new GeminiService();
