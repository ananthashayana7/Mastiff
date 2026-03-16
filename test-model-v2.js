import { GoogleGenAI } from "@google/genai";

async function test() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error('ERROR: API_KEY is not set');
        process.exit(1);
    }

    const client = new GoogleGenAI({ apiKey });
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];

    for (const model of models) {
        try {
            const response = await client.models.generateContent({
                model,
                contents: [{ role: 'user', parts: [{ text: 'say hi in one word' }] }]
            });
            console.log(`SUCCESS ${model}:`, response.text || '[no text]');
            return;
        } catch (e) {
            console.error(`ERROR ${model}:`, e.message);
        }
    }

    process.exit(1);
}

test();
