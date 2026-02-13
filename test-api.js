import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

async function test() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error("API_KEY not found");
        return;
    }
    const client = new GoogleGenAI({ apiKey });
    try {
        const models = await client.models.list();
        console.log("Available models:");
        for (const m of models) {
            console.log(m.name);
        }
    } catch (e) {
        console.error("Error listing models:", e);
    }
}

test();
