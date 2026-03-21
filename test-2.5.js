import { GoogleGenAI } from "@google/genai";

async function test() {
    const apiKey = process.env.API_KEY?.split(',')[0]?.trim();
    if (!apiKey) {
        throw new Error("Missing API_KEY in environment");
    }
    const client = new GoogleGenAI({ apiKey });
    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: 'hi' }] }]
        });
        console.log("SUCCESS 2.5-flash:", response.text);
    } catch (e) {
        console.error("ERROR 2.5-flash:", e.message);
    }
}

test();
