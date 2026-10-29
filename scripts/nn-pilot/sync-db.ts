import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabaseServer as supabase } from '../../src/lib/supabase-server';
import { ConsolidatedLaw } from './engine';

if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile('.env.local');
  } catch {}
}

const GEMINI_API_KEY =
  process.env.GOOGLE_GEMINI_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ Nedostaje GOOGLE_GEMINI_KEY');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function getEmbedding768(text: string, retries = 3): Promise<number[]> {
  const aiModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  try {
    const result = await aiModel.embedContent({
      content: { role: 'user', parts: [{ text }] },
      // @ts-ignore
      outputDimensionality: 768,
    } as any);
    return result.embedding.values;
  } catch (err: any) {
    if (retries > 0 && err.message?.includes('429')) {
      console.warn(`   ⏳ Rate limit (429), čekam 2.5s i pokušavam ponovno...`);
      await delay(2500);
      return getEmbedding768(text, retries - 1);
    }
    throw err;
  }
}

export async function syncLawToDatabase(kratica: string) {
  const filePath = path.resolve('.nn-cache', 'consolidated', `${kratica.toUpperCase()}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const law: ConsolidatedLaw = JSON.parse(raw);

  console.log(`\n=============================================================`);
  console.log(`📤 SINHRONIZIRAM U SUPABASE: ${law.kratica} – ${law.naziv}`);
  console.log(`   Ukupno članaka za unos: ${law.articles.length}`);
  console.log(`=============================================================`);

  // 1. Obriši stare članke tog zakona ako postoje
  const { error: delError, count: delCount } = await supabase
    .from('zakoni')
    .delete({ count: 'exact' })
    .eq('naziv_zakona', law.naziv);

  if (delError) {
    console.error(`⚠️ Greška pri brisanju starih članaka:`, delError.message);
  } else {
    console.log(`🗑️ Obrisano ${delCount ?? 0} prethodnih članaka iz tablice 'zakoni'.`);
  }

  // 2. Unesi nove pročišćene članke s embeddingom
  let successCount = 0;
  for (let i = 0; i < law.articles.length; i++) {
    const art = law.articles[i];
    const fullTextForEmbedding = `${law.naziv}, ${art.clanak_broj}\n${art.tekst}`;

    try {
      const emb = await getEmbedding768(fullTextForEmbedding);

      const { error: insError } = await supabase.from('zakoni').insert({
        naziv_zakona: law.naziv,
        clanak_broj: art.clanak_broj,
        tekst: art.tekst,
        embedding: emb,
      });

      if (insError) {
        console.error(`❌ Greška pri unosu ${art.clanak_broj}:`, insError.message);
      } else {
        successCount++;
        if (successCount % 10 === 0 || successCount === law.articles.length) {
          console.log(`   💾 Spremljeno: ${successCount}/${law.articles.length} članaka...`);
        }
      }
    } catch (err: any) {
      console.error(`❌ Greška za ${art.clanak_broj}:`, err.message);
    }

    // Pauza od 150ms za stabilnost rate limita
    await delay(150);
  }

  console.log(`\n✅ USPJEH! U bazu 'zakoni' spremljeno je ${successCount}/${law.articles.length} važećih članaka za ${law.naziv}.`);
}

async function main() {
  const kratica = process.argv[2];
  if (!kratica) {
    console.log('Uporaba: npx tsx scripts/nn-pilot/sync-db.ts <KRATICA>');
    process.exit(1);
  }
  await syncLawToDatabase(kratica);
}

if (require.main === module) {
  main().catch(console.error);
}
