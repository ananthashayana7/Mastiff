import { GoogleGenAI } from "@google/genai";

async function test() {
    const apiKey = 'AIzaSyDvIVI0JBaDbEqJcMIITWGq932YCadttNs';
    const client = new GoogleGenAI({ apiKey });
    try {
        const response = await client.models.generateContent({
            model: 'gemini-1.5-flash-latest',
            contents: [{ role: 'user', parts: [{ text: 'hi' }] }]
        });
        console.log("SUCCESS:", response.text);
    } catch (e) {
        console.error("ERROR 1.5-flash-latest:", e.message);

        try {
            const response2 = await client.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: [{ role: 'user', parts: [{ text: 'hi' }] }]
            });
            console.log("SUCCESS 2.0-flash-exp:", response2.text);
        } catch (e2) {
            console.error("ERROR 2.0-flash-exp:", e2.message);
        }
    }
}

test();
