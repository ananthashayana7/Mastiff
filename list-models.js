import { GoogleGenAI } from "@google/genai";

async function test() {
    const apiKey = 'AIzaSyDvIVI0JBaDbEqJcMIITWGq932YCadttNs';
    const client = new GoogleGenAI({ apiKey });
    try {
        // Attempting to list models using the correct iterator pattern for @google/genai
        console.log("Listing models...");
        const models = await client.models.list();
        for await (const model of models) {
            console.log("FOUND MODEL:", model.name);
        }
    } catch (e) {
        console.error("ERROR listing models:", e.message);
    }
}

test();
