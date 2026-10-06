import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_KEY || process.env.GOOGLE_API_KEY || '');
async function run() {
  const models = ["text-embedding-004", "embedding-001", "gemini-embedding-001"];
  for (const m of models) {
      try {
        const aiModel = genAI.getGenerativeModel({ model: m });
        const result = await aiModel.embedContent("test");
        console.log(`${m} length:`, result.embedding.values.length);
      } catch (e: any) {
        console.log(`${m} error:`, e.message);
      }
  }
}
run();
