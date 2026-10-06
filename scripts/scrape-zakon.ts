import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadEnvConfig } from '@next/env';

// Učitavanje .env varijabli
loadEnvConfig(process.cwd());

/// --- POSTAVKE (Promijeni po potrebi) ---
const ZAKONI_ZA_OBRADU = [
  {
    url: 'https://www.zakon.hr/z/101/zakon-o-upravnim-sporovima-2024',
    naziv: 'Zakon o upravnim sporovima'
  },
  {
    url: 'https://www.zakon.hr/z/124/zakon-o-vodama', // Obavezno provjeri je li ovo točan link
    naziv: 'Zakon o vodama'
  }
];
// ---------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_KEY || process.env.GOOGLE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Nedostaju Supabase varijable u .env datoteci.");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ Nedostaje Google Gemini Key u .env datoteci.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function getEmbedding(text: string): Promise<number[]> {
  const aiModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await aiModel.embedContent({
    content: { role: 'user', parts: [{ text }] },
    // @ts-ignore - TS types might not include this yet, but API supports it
    outputDimensionality: 768
  } as any);
  return result.embedding.values;
}

// Ekstrakcija čistog teksta koristeći Cheerio
async function fetchAndParse(url: string): Promise<string> {
  console.log(`🌐 Dohvaćam HTML s URL-a: ${url}`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!response.ok) {
    throw new Error(`Greška pri dohvaćanju: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Uklanjamo nepotrebne HTML elemente
  $('script, style, head, nav, footer, iframe, header, noscript').remove();

  // Dohvaćamo čisti tekst iz tijela dokumenta
  const text = $('body').text();

  // Čistimo višestruke praznine (razmake, tabove, nove redove)
  return text.replace(/\s+/g, ' ').trim();
}

// Dijeljenje teksta na članke koristeći Regex
function splitIntoArticles(text: string): { clanak_broj: string, tekst: string }[] {
  // Regex traži "Članak [broj]." (s eventualnim slovom poput 1a) i reže string neposredno PRIJE njega.
  // Zastavica 'i' osigurava da uhvati "ČLANAK", "članak", itd.
  const parts = text.split(/(?=Članak\s+\d+[a-z]?\.?)/i);

  const articles: { clanak_broj: string, tekst: string }[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Provjeri počinje li ovaj dio sa "Članak X."
    const match = trimmed.match(/^(Članak\s+\d+[a-z]?\.?)/i);

    if (match) {
      articles.push({
        clanak_broj: match[1].trim(), // npr. "Članak 1."
        tekst: trimmed
      });
    } else {
      // Dio prije prvog članka (obično Uvod, Preambula)
      articles.push({
        clanak_broj: 'Uvod / Preambula',
        tekst: trimmed
      });
    }
  }

  return articles;
}

async function main() {
  console.log(`🚀 Započinjem batch obradu ${ZAKONI_ZA_OBRADU.length} zakona...\n`);

  for (let z = 0; z < ZAKONI_ZA_OBRADU.length; z++) {
    const zakon = ZAKONI_ZA_OBRADU[z];
    const { url, naziv } = zakon;

    console.log(`====================================================`);
    console.log(`[${z + 1}/${ZAKONI_ZA_OBRADU.length}] 🚀 Započinjem obradu: ${naziv}`);
    console.log(`====================================================`);

    try {
      const rawText = await fetchAndParse(url);
      console.log(`✅ Tekst uspješno ekstrahiran. Ukupno znakova: ${rawText.length}`);

      const articles = splitIntoArticles(rawText);
      console.log(`🧩 Tekst podijeljen na ${articles.length} članaka (uključujući uvodne odredbe).`);

      let successfulChunks = 0;

      for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const { clanak_broj, tekst } = article;

        console.log(`\n⏳ Obrađujem: ${clanak_broj}...`);

        try {
          await delay(1000); // 1 sekunda pauze zbog API rate limita

          const embedding = await getEmbedding(tekst);

          // Unos u Supabase tablicu 'zakoni'
          const { error } = await supabase.from('zakoni').insert({
            naziv_zakona: naziv,
            clanak_broj: clanak_broj,
            tekst: tekst,
            embedding: embedding
          });

          if (error) {
            console.error(`❌ Greška pri spremanju ${clanak_broj} u bazu:`, error.message);
          } else {
            successfulChunks++;
            process.stdout.write(`✅ Spremljeno: ${clanak_broj} (${successfulChunks}/${articles.length})`);
          }

        } catch (err: any) {
          console.error(`❌ Greška pri procesiranju ${clanak_broj}:`, err.message);
        }
      }

      console.log(`\n\n🎉 Završen zakon: ${naziv}. Uspješno spremljeno: ${successfulChunks}/${articles.length} članaka.`);

      // Ako nije zadnji zakon u nizu, pričekaj 5 sekundi prije idućeg
      if (z < ZAKONI_ZA_OBRADU.length - 1) {
        console.log(`\n⏳ Pauziram 5 sekundi prije idućeg zakona kako ne bismo probili rate limit servera...`);
        await delay(5000);
      }

    } catch (error: any) {
      console.error(`\n❌ Greška tijekom obrade zakona "${naziv}":`, error.message);
    }
  }

  console.log("\n✅ Svi zakoni s popisa su uspješno obrađeni!");
}

main().catch(console.error);
