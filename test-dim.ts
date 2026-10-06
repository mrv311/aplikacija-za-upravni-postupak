import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_KEY || process.env.GOOGLE_API_KEY || '');
async function run() {
  try {
    const aiModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await aiModel.embedContent({
      content: { role: 'user', parts: [{ text: "test" }] },
      // @ts-ignore
      outputDimensionality: 768
    } as any);
    console.log("gemini-embedding-001 with outputDimensionality length:", result.embedding.values.length);
  } catch (e: any) {
    console.log("error:", e.message);
  }
}
run();
