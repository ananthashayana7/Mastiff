
**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `API_KEY`, `GEMINI_API_KEY`, or `GOOGLE_API_KEY` in `.env.local` to one or more Gemini API keys.
   - Mastiff supports **multiple comma-separated keys** with automatic fallback, so you are **not limited to three keys**.
   - If many users will be sharing the app, you can add more keys to increase quota headroom, for example:
     `API_KEY=key1,key2,key3,key4,key5`
3. Run the app:
   `npm run dev`
