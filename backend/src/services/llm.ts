import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenAI(process.env.API_KEY || "");

export class LLMService {
    async getAnalysisCode(userQuery: string, schema: string, sampleData: any, history: any[]) {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const systemPrompt = `
You are a data analysis assistant. The user has uploaded a dataset and wants to analyze it.

Dataset Schema:
${schema}

Dataset Sample (first 5 rows):
${JSON.stringify(sampleData, null, 2)}

Available libraries: pandas, numpy, matplotlib, seaborn, scipy, statsmodels

Your task:
1. Understand the user's question
2. Write Python code to analyze the data
3. The dataframe is already loaded as 'df'
4. Store results in a variable called 'result'
5. If creating a visualization, simply create the plot. The environment will handle the save.

Return your response in this JSON format:
{
  "explanation": "Brief explanation of what you're doing",
  "code": "Python code here",
  "requires_visualization": true/false
}

Code rules:
- Use only pandas, numpy, matplotlib, seaborn
- Don't use input() or any user interaction
- Don't access the internet
- Handle missing values appropriately
- Always return meaningful results
`;

        const chat = model.startChat({
            history: history.map(h => ({
                role: h.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: h.content }],
            })),
        });

        try {
            const result = await chat.sendMessage([
                { text: systemPrompt },
                { text: userQuery }
            ]);
            const response = await result.response;
            let text = response.text();

            // Remove markdown code blocks if any
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            return JSON.parse(text);
        } catch (error) {
            console.error("LLM Error:", error);
            throw new Error("Failed to generate analysis code");
        }
    }
}

export const llm = new LLMService();
