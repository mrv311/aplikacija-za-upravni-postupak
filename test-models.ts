import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function run() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GEMINI_KEY || process.env.GOOGLE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  const embedModels = data.models.filter((m: any) => m.name.includes("embed"));
  console.log("Embed models:", JSON.stringify(embedModels, null, 2));
}
run();
