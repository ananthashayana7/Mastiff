import { GoogleGenAI } from "@google/genai";

async function test() {
    const apiKey = 'AIzaSyDvIVI0JBaDbEqJcMIITWGq932YCadttNs';
    const client = new GoogleGenAI({ apiKey });
    try {
        // List models doesn't seem to be a function in @google/genai? 
        // Wait, the client usually has a models property.
        // Let me try a simple generate call instead with 1.5-flash
        const response = await client.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [{ role: 'user', parts: [{ text: 'hi' }] }]
        });
        console.log("SUCCESS:", response.text);
    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

test();
