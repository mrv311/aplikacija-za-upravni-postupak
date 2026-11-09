import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  BASE_COURT_URL,
  DATA_COURT_DIR,
  searchCourtPortal,
  fetchDocumentDetails,
  detectCategory,
  saveDecisionLocally,
  type ScrapedDocMetadata,
} from '../src/lib/court-scraper';

// Učitavanje okruženja iz .env.local
if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile('.env.local');
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GEMINI_API_KEY =
  process.env.GOOGLE_GEMINI_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Nedostaju Supabase varijable u .env.local.');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('❌ Nedostaje Gemini API ključ u .env.local.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const CHUNK_MAX_SIZE = 1400;
const CHUNK_OVERLAP = 200;
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Semantičko chunkiranje teksta za RAG (identično postojećim odlukama u bazi)
export function chunkText(text: string, maxSize = CHUNK_MAX_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (clean.length <= maxSize) return [clean];

  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < clean.length) {
    let endIndex = currentIndex + maxSize;
    if (endIndex >= clean.length) {
      chunks.push(clean.substring(currentIndex).trim());
      break;
    }

    const window = clean.substring(endIndex - 120, endIndex);
    const match = window.match(/[.!?]\s/);
    if (match && match.index !== undefined) {
      endIndex = endIndex - 120 + match.index + 1;
    } else {
      const lastSpace = clean.lastIndexOf(' ', endIndex);
      if (lastSpace > currentIndex + maxSize / 2) {
        endIndex = lastSpace;
      }
    }

    const chunk = clean.substring(currentIndex, endIndex).trim();
    if (chunk.length > 40) chunks.push(chunk);
    currentIndex = endIndex - overlap;
  }

  return chunks.filter((c) => c.length > 30);
}

// Generiranje 3072-dimenzionalnih vektora s retry mehanizmom
export async function getEmbedding3072(text: string, retries = 5): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await model.embedContent(text);
      return res.embedding.values;
    } catch (err: any) {
      if (attempt === retries) throw err;
      const waitMs = attempt * 3000;
      console.log(`\n      ⏳ Rate limit (429) embedding, čekam ${waitMs / 1000}s (pokušaj ${attempt}/${retries})...`);
      await delay(waitMs);
    }
  }
  return [];
}

// Glavna funkcija za obradu i indeksiranje
export async function scrapeAndIndexDecisions(options: {
  query: string;
  category?: string;
  limit?: number;
  courtFilter?: 'vusrh' | 'upravni' | 'all';
  dryRun?: boolean;
  skipDb?: boolean;
}) {
  const {
    query,
    category,
    limit = 10,
    courtFilter = 'all',
    dryRun = false,
    skipDb = false,
  } = options;

  console.log('\n============================================================');
  console.log('🏛️  UVOZ SUDSKIH PRESUDA S PORTALA: odluke.sudovi.hr');
  console.log(`🔍  Pojam pretrage:    "${query}"`);
  console.log(`📁  Kategorija / Tag:   ${category || 'Automatska detekcija'}`);
  console.log(`🎯  Maksimalan broj:    ${limit}`);
  console.log(`⚖️  Filtar suda:        ${courtFilter.toUpperCase()}`);
  console.log(`🧪  Način rada:         ${dryRun ? 'DRY-RUN (samo pregled)' : 'PUN UVOZ (Mape + Supabase)'}`);
  console.log('============================================================\n');

  if (!dryRun) {
    await fs.mkdir(DATA_COURT_DIR, { recursive: true });
  }

  console.log(`🔎 Pretražujem javni portal odluka sudova RH...`);
  const docIds = await searchCourtPortal(query, Math.ceil(limit / 5) + 2);
  console.log(`✅ Pronađeno ${docIds.length} potencijalnih odluka za obradu.\n`);

  if (docIds.length === 0) {
    console.log('Nema pronađenih odluka za zadani upit.');
    return;
  }

  let processedCount = 0;
  let skippedExistingDisk = 0;
  let skippedExistingDb = 0;
  let skippedFilter = 0;
  let totalChunksSaved = 0;

  for (let i = 0; i < docIds.length; i++) {
    if (processedCount >= limit) {
      console.log(`\n🎉 Dosegnut je zadani limit od ${limit} novih odluka.`);
      break;
    }

    const docId = docIds[i];
    await delay(350);

    const doc = await fetchDocumentDetails(docId, query, category);
    if (!doc) continue;

    if (courtFilter === 'vusrh' && doc.sudKratki !== 'VUSRH') {
      skippedFilter++;
      continue;
    }
    if (courtFilter === 'upravni' && !doc.sudKratki.includes('Upravni')) {
      skippedFilter++;
      continue;
    }

    const targetFolder = path.join(DATA_COURT_DIR, doc.folderName, doc.godina);
    const jsonPath = path.join(targetFolder, `${doc.safeFileName}.json`);

    const existsOnDisk = fsSync.existsSync(jsonPath);

    const standardTitle = `[Praksa upravnih sudova (presude) - ${doc.categoryTag} - ${doc.godina}] ${doc.sudKratki} - ${doc.brojOdluke} - ${doc.ishod}`;

    const { data: dbExisting } = await supabase
      .from('praksa')
      .select('id')
      .ilike('naziv_datoteke', `%${doc.brojOdluke}%`)
      .limit(1);

    const existsInDb = dbExisting && dbExisting.length > 0;

    if (existsOnDisk && existsInDb) {
      console.log(`⏭️  [${i + 1}/${docIds.length}] ${doc.sudKratki} ${doc.brojOdluke} -> Već postoji i na disku i u bazi.`);
      skippedExistingDisk++;
      continue;
    }

    console.log(`\n📥 [${processedCount + 1}/${limit}] Obrada: ${doc.sudKratki} - ${doc.brojOdluke} (${doc.datum || doc.godina})`);
    console.log(`   🏷️  Kategorija:  ${doc.categoryTag} (${doc.folderName})`);
    console.log(`   ⚖️  Ishod:        ${doc.ishod}`);
    console.log(`   📄  Veličina:     ${doc.cleanText.length} znakova`);

    if (dryRun) {
      processedCount++;
      continue;
    }

    const savedFiles = await saveDecisionLocally(doc);
    console.log(`   💾 Spremljeno na disk: ${savedFiles.jsonPath}`);

    if (skipDb) {
      processedCount++;
      continue;
    }

    const chunks = chunkText(doc.cleanText);
    console.log(`   🧩 Dijeljenje u ${chunks.length} semantičkih chunkova (3072 dim)...`);

    let savedChunksForDoc = 0;
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      const cText = chunks[cIdx];
      try {
        const embedding = await getEmbedding3072(cText);

        const { error: insErr } = await supabase.from('praksa').insert({
          naziv_datoteke: standardTitle,
          chunk_index: cIdx,
          sadrzaj: cText,
          embedding,
          ukupno_chunkova: chunks.length,
        });

        if (insErr) {
          console.warn(`      ⚠️ Greška unosa chunka ${cIdx + 1}:`, insErr.message);
        } else {
          savedChunksForDoc++;
          totalChunksSaved++;
        }
      } catch (err: any) {
        console.error(`      ❌ Greška generiranja embeddinga za chunk ${cIdx + 1}:`, err.message);
      }
      await delay(120);
    }

    console.log(`   ✅ Uspješno indeksirano ${savedChunksForDoc}/${chunks.length} chunkova u tablicu 'praksa'.`);
    processedCount++;
  }

  console.log('\n============================================================');
  console.log('📊 REZULTAT UVOZA SUDSKE PRAKSE:');
  console.log(`   ✨ Novoobrađenih odluka:      ${processedCount}`);
  console.log(`   🧩 Ukupno novih vektora (DB): ${totalChunksSaved}`);
  console.log(`   📁 Mape spremljene u:         ./data/sudska-praksa/`);
  console.log('============================================================\n');
}

// Pokretanje iz CLI naredbenog retka
async function main() {
  const args = process.argv.slice(2);

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  };

  const hasFlag = (flag: string): boolean => args.includes(flag);

  const isAllWater = hasFlag('--all-water');
  const isZup = hasFlag('--zup');
  const isGradnja = hasFlag('--gradnja');
  const isAllExtended = hasFlag('--all-extended');

  const category = getArg('--category');
  const limitStr = getArg('--limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 10;
  const courtFilterRaw = getArg('--court') || 'all';
  const courtFilter = ['vusrh', 'upravni', 'all'].includes(courtFilterRaw.toLowerCase())
    ? (courtFilterRaw.toLowerCase() as 'vusrh' | 'upravni' | 'all')
    : 'all';

  const dryRun = hasFlag('--dry-run');
  const skipDb = hasFlag('--skip-db');

  if (isZup) {
    console.log('⚖️ POKREĆEM TEMATSKI UVOZ ZA INSTITUTE ZUP-a (OBNOVA, PONIŠTAVANJE, NIŠTAVOST, ROKOVI) ⚖️');
    const zupTopics = [
      { q: 'obnova postupka nove činjenice dokazi', cat: 'Obnova postupka i pravni lijekovi', lim: limit },
      { q: 'poništavanje i ukidanje rješenja', cat: 'Obnova postupka i pravni lijekovi', lim: limit },
      { q: 'oglašavanje rješenja ništavim', cat: 'Obnova postupka i pravni lijekovi', lim: limit },
      { q: 'povrat u prijašnje stanje opravdani razlozi', cat: 'Obnova postupka i pravni lijekovi', lim: limit },
    ];
    for (const t of zupTopics) {
      await scrapeAndIndexDecisions({ query: t.q, category: t.cat, limit: t.lim, courtFilter, dryRun, skipDb });
      await delay(1000);
    }
    return;
  }

  if (isGradnja) {
    console.log('🏗️ POKREĆEM TEMATSKI UVOZ ZA GRADNJU I OZAKONJENJE (ZPNIZ, GRAĐEVINSKE DOZVOLE) 🏗️');
    const gradnjaTopics = [
      { q: 'nezakonito izgrađena zgrada naknada', cat: 'Ozakonjenje i građenje', lim: limit },
      { q: 'rješenje o izvedenom stanju ozakonjenje', cat: 'Ozakonjenje i građenje', lim: limit },
      { q: 'građevinska dozvola zakonitost', cat: 'Ozakonjenje i građenje', lim: limit },
    ];
    for (const t of gradnjaTopics) {
      await scrapeAndIndexDecisions({ query: t.q, category: t.cat, limit: t.lim, courtFilter, dryRun, skipDb });
      await delay(1000);
    }
    return;
  }

  if (isAllWater || isAllExtended) {
    console.log('🌊 POKREĆEM CJELOVITI TEMATSKI UVOZ SUDSKE PRAKSE 🌊');
    const topics = [
      { q: 'vodno gospodarstvo', cat: 'Vodni doprinos', lim: limit },
      { q: 'vodni doprinos', cat: 'Vodni doprinos', lim: limit },
      { q: 'naknada za uređenje voda', cat: 'Naknada za uređenje voda', lim: limit },
      { q: 'naknada za zaštitu voda', cat: 'Naknada za zaštitu voda', lim: limit },
      { q: 'šutnja uprave troškovi', cat: 'Troškovi postupka', lim: limit },
    ];

    if (isAllExtended) {
      topics.push(
        { q: 'obnova postupka nove činjenice', cat: 'Obnova postupka i pravni lijekovi', lim: limit },
        { q: 'poništavanje rješenja nezakonitost', cat: 'Obnova postupka i pravni lijekovi', lim: limit },
        { q: 'nezakonito izgrađena zgrada naknada', cat: 'Ozakonjenje i građenje', lim: limit },
        { q: 'procjena utjecaja na okoliš', cat: 'Zaštita okoliša i prirode', lim: limit }
      );
    }

    for (const t of topics) {
      await scrapeAndIndexDecisions({
        query: t.q,
        category: t.cat,
        limit: t.lim,
        courtFilter,
        dryRun,
        skipDb,
      });
      await delay(1000);
    }
    return;
  }

  const query = getArg('--query') || 'vodni doprinos';

  await scrapeAndIndexDecisions({
    query,
    category,
    limit,
    courtFilter,
    dryRun,
    skipDb,
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatalna greška:', err);
    process.exit(1);
  });
}
