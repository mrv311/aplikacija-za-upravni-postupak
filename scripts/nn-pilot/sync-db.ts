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

async function getBatchEmbeddings768(texts: string[], retries = 3): Promise<number[][]> {
  const aiModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  try {
    const res = await aiModel.batchEmbedContents({
      requests: texts.map((t) => ({
        content: { role: 'user', parts: [{ text: t }] },
        // @ts-ignore
        outputDimensionality: 768,
      } as any)),
    });
    return res.embeddings.map((e) => e.values);
  } catch (err: any) {
    if (retries > 0 && (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED'))) {
      console.warn(`   ⏳ Rate limit (429), čekam 3s i pokušavam ponovno...`);
      await delay(3000);
      return getBatchEmbeddings768(texts, retries - 1);
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

  // Provjeri podržava li baza nove stupce strukture
  let supportsStructureColumns = true;
  let successCount = 0;
  const BATCH_SIZE = 25;

  for (let b = 0; b < law.articles.length; b += BATCH_SIZE) {
    const batch = law.articles.slice(b, b + BATCH_SIZE);
    const textsForEmbedding = batch.map((art) => {
      return `${law.naziv}, ${art.clanak_broj}${art.naslov ? ` (${art.naslov})` : ''}\n${
        art.struktura ? `[${art.struktura}]\n` : ''
      }${art.tekst}`;
    });

    try {
      const embeddings = await getBatchEmbeddings768(textsForEmbedding);

      const payloadsWithStructure = batch.map((art, idx) => {
        const p: Record<string, any> = {
          naziv_zakona: law.naziv,
          clanak_broj: art.clanak_broj,
          tekst: art.tekst,
          embedding: embeddings[idx],
        };
        if (art.naslov) p.naslov = art.naslov;
        if (art.struktura) p.struktura = art.struktura;
        if (art.dio) p.dio = art.dio;
        if (art.glava) p.glava = art.glava;
        if (art.poglavlje) p.poglavlje = art.poglavlje;
        if (art.odjeljak) p.odjeljak = art.odjeljak;
        return p;
      });

      const payloadsStandard = batch.map((art, idx) => ({
        naziv_zakona: law.naziv,
        clanak_broj: art.clanak_broj,
        tekst: art.tekst,
        embedding: embeddings[idx],
      }));

      let insError: any = null;

      if (supportsStructureColumns) {
        const res = await supabase.from('zakoni').insert(payloadsWithStructure);
        insError = res.error;
        if (insError && (insError.message?.includes('column') || insError.message?.includes('does not exist'))) {
          supportsStructureColumns = false;
          const fallback = await supabase.from('zakoni').insert(payloadsStandard);
          insError = fallback.error;
        }
      } else {
        const fallback = await supabase.from('zakoni').insert(payloadsStandard);
        insError = fallback.error;
      }

      if (insError) {
        console.error(`❌ Greška pri unosu serije ${b + 1} - ${b + batch.length}:`, insError.message);
      } else {
        successCount += batch.length;
        console.log(`   💾 Spremljeno: ${successCount}/${law.articles.length} članaka...`);
      }
    } catch (err: any) {
      console.error(`❌ Greška pri obradi serije ${b + 1} - ${b + batch.length}:`, err.message);
    }

    await delay(200);
  }

  console.log(
    `\n✅ USPJEH! U bazu 'zakoni' spremljeno je ${successCount}/${law.articles.length} važećih članaka za ${law.naziv}.`
  );
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
