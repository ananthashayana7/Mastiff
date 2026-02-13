
import { GoogleGenAI, Modality } from "@google/genai";
import { AnalysisMode, GroundingSource } from "../types";

export class GeminiService {
  async getSuggestions(dataContext: string) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-2.0-flash';

    const systemInstruction = `
      You are an AI Data Scientist. Given the following data schema, suggest 4 short, actionable analysis questions the user could ask.
      Return ONLY a JSON array of strings. Max 10 words per suggestion.
      Example: ["Analyze revenue trends", "Identify customer churn patterns"]
    `;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: `DATA CONTEXT:\n${dataContext}` }] }],
        config: { systemInstruction, responseMimeType: "application/json" }
      });
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    let model = 'gemini-2.0-flash';
    let config: any = {
      temperature: 0.2,
      responseMimeType: "application/json",
    };

    // If search is enabled, use google search tool
    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
      delete config.responseMimeType;
    } else {
      if (mode === 'fast') {
        config.temperature = 0.4;
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
      const response = await ai.models.generateContent({
        model,
        contents,
        config: { ...config, systemInstruction }
      });

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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text.slice(0, 500) }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
        }
      });

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
