import { GoogleGenAI } from "@google/genai";

async function test() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error('ERROR: API_KEY is not set');
        process.exit(1);
    }

    const client = new GoogleGenAI({ apiKey });
    try {
        console.log('Listing models...');
        const models = await client.models.list();
        for await (const model of models) {
            console.log('FOUND MODEL:', model.name);
        }
    } catch (e) {
        console.error('ERROR listing models:', e.message);
        process.exit(1);
    }
}

test();
