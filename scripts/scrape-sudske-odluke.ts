import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

const BASE_URL = 'https://odluke.sudovi.hr';
const DATA_DIR = path.join(process.cwd(), 'data', 'sudska-praksa');

const CHUNK_MAX_SIZE = 1400;
const CHUNK_OVERLAP = 200;
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Čišćenje znakova koji nisu dopušteni u nazivima datoteka
function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

// Semantičko chunkiranje teksta za RAG (identično postojećim odlukama u bazi)
function chunkText(text: string, maxSize = CHUNK_MAX_SIZE, overlap = CHUNK_OVERLAP): string[] {
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
async function getEmbedding3072(text: string, retries = 5): Promise<number[]> {
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

// Određivanje mape na disku i oznake kategorije
function detectCategory(query: string, text: string, defaultCat?: string): { folderName: string; categoryTag: string } {
  if (defaultCat) {
    const catLower = defaultCat.toLowerCase();
    if (catLower.includes('doprinos')) return { folderName: '01_Vodni_doprinos', categoryTag: 'Vodni doprinos' };
    if (catLower.includes('uređenj') || catLower.includes('uredenj')) return { folderName: '02_Naknada_za_uredjenje_voda', categoryTag: 'Naknada za uređenje voda' };
    if (catLower.includes('zaštit') || catLower.includes('zastit')) return { folderName: '03_Naknada_za_zastitu_voda', categoryTag: 'Naknada za zaštitu voda' };
    if (catLower.includes('troškov') || catLower.includes('šutnj') || catLower.includes('sutnj')) return { folderName: '04_Sutnja_uprave_i_troskovi', categoryTag: 'Troškovi postupka' };
  }

  const combined = (query + ' ' + text.slice(0, 3000)).toLowerCase();

  if (combined.includes('vodni doprinos') || combined.includes('vodnog doprinosa') || combined.includes('vodnoga doprinosa')) {
    return { folderName: '01_Vodni_doprinos', categoryTag: 'Vodni doprinos' };
  }
  if (combined.includes('uređenje voda') || combined.includes('uređenja voda') || combined.includes('naknada za uređenje')) {
    return { folderName: '02_Naknada_za_uredjenje_voda', categoryTag: 'Naknada za uređenje voda' };
  }
  if (combined.includes('zaštitu voda') || combined.includes('zaštite voda') || combined.includes('naknada za zaštitu')) {
    return { folderName: '03_Naknada_za_zastitu_voda', categoryTag: 'Naknada za zaštitu voda' };
  }
  if (combined.includes('šutnj') || combined.includes('sutnj') || (combined.includes('troškov') && combined.includes('obustav'))) {
    return { folderName: '04_Sutnja_uprave_i_troskovi', categoryTag: 'Troškovi postupka' };
  }
  if (combined.includes('korištenje voda') || combined.includes('korištenja voda')) {
    return { folderName: '01_Vodni_doprinos', categoryTag: 'Naknada za korištenje voda' };
  }
  if (combined.includes('koncesij')) {
    return { folderName: '05_Ostali_upravni_sporovi', categoryTag: 'Naknada za koncesiju' };
  }

  return { folderName: '05_Ostali_upravni_sporovi', categoryTag: 'Ostali upravni sporovi' };
}

// Kratki prepoznatljivi naziv suda
function formatSudShort(sud: string): string {
  if (/Visoki upravni sud/i.test(sud) || /VUSRH/i.test(sud)) return 'VUSRH';
  if (/Upravni sud u Zagrebu/i.test(sud)) return 'Upravni sud u Zagrebu';
  if (/Upravni sud u Splitu/i.test(sud)) return 'Upravni sud u Splitu';
  if (/Upravni sud u Rijeci/i.test(sud)) return 'Upravni sud u Rijeci';
  if (/Upravni sud u Osijeku/i.test(sud)) return 'Upravni sud u Osijeku';
  if (/Vrhovni sud/i.test(sud) || /VSRH/i.test(sud)) return 'VSRH';
  return sud.trim() || 'Upravni sud';
}

// Prepoznavanje ishoda iz izreke i teksta
function detectIshod(text: string, vrstaOdluke: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('poništava se') || lower.includes('usvaja se tužbeni zahtjev') || lower.includes('uvažava se tužba')) {
    return 'Poništeno rješenje';
  }
  if (lower.includes('odbija se tužbeni zahtjev') || lower.includes('odbija se tužba') || lower.includes('odbija se žalba')) {
    return 'Odbijena tužba';
  }
  if (lower.includes('obustavlja se postupak') || lower.includes('obustava postupka')) {
    return lower.includes('troškov') ? 'Obustava postupka (dosuđeni troškovi)' : 'Obustava postupka';
  }
  if (lower.includes('odbacuje se')) {
    return 'Odbačena tužba';
  }
  return vrstaOdluke || 'Presuda';
}

export interface ScrapedDocMetadata {
  id: string;
  brojOdluke: string;
  sud: string;
  sudKratki: string;
  datum: string;
  godina: string;
  vrstaOdluke: string;
  pravomocnost: string;
  ecli: string;
  stvarnoKazalo: string[];
  zakonskoKazalo: string[];
  ishod: string;
  categoryTag: string;
  folderName: string;
  url: string;
  safeFileName: string;
  cleanText: string;
}

// Dohvat i parsiranje pojedinačne odluke
async function fetchDocumentDetails(docId: string, queryHint: string, defaultCat?: string): Promise<ScrapedDocMetadata | null> {
  const url = `${BASE_URL}/Document/View?id=${docId}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`      ⚠️ Greška ${res.status} za dokument ${docId}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const brojOdluke =
      $('.view-decisionnumber').text().trim() ||
      $('title').text().split(',')[0].trim() ||
      docId;

    const titleText = $('.view-decision-title').text().replace(/\s+/g, ' ').trim();
    const datum = $('.view-decisiondate').text().trim();
    const pravomocnost = $('.final-decision').text().trim();

    // Određivanje suda
    let sud = 'Upravni sud';
    if (/Visoki upravni sud/i.test(titleText) || /VUSRH/i.test(html)) {
      sud = 'Visoki upravni sud Republike Hrvatske';
    } else if (/Upravni sud u Zagrebu/i.test(titleText) || /Upravni sud u Zagrebu/i.test(html)) {
      sud = 'Upravni sud u Zagrebu';
    } else if (/Upravni sud u Splitu/i.test(titleText) || /Upravni sud u Splitu/i.test(html)) {
      sud = 'Upravni sud u Splitu';
    } else if (/Upravni sud u Rijeci/i.test(titleText) || /Upravni sud u Rijeci/i.test(html)) {
      sud = 'Upravni sud u Rijeci';
    } else if (/Upravni sud u Osijeku/i.test(titleText) || /Upravni sud u Osijeku/i.test(html)) {
      sud = 'Upravni sud u Osijeku';
    } else if (/Vrhovni sud/i.test(titleText) || /VSRH/i.test(html)) {
      sud = 'Vrhovni sud Republike Hrvatske';
    }

    // Čišćenje i formatiranje teksta odluke
    const textEl = $('.decision-text').clone();
    textEl.find('style, script').remove();
    textEl.find('br').replaceWith('\n');
    textEl.find('p, div, tr').each((_, el) => {
      $(el).append('\n');
    });

    const cleanText = textEl.text().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!cleanText || cleanText.length < 80) {
      return null;
    }

    // ECLI
    const ecliMatch = html.match(/ECLI:[A-Z0-9:]+/i);
    const ecli = ecliMatch ? ecliMatch[0] : '';

    // Godina
    const yearMatch = datum.match(/\b(20\d{2}|19\d{2})\b/) || brojOdluke.match(/[\/-](20\d{2}|19\d{2})\b/);
    const godina = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

    // Kazala
    const stvarnoKazalo: string[] = [];
    $('.metadata-content-part').each((_, el) => {
      const t = $(el).text().trim();
      if (t && !stvarnoKazalo.includes(t)) stvarnoKazalo.push(t);
    });

    const ishod = detectIshod(cleanText, pravomocnost || 'Presuda');
    const { folderName, categoryTag } = detectCategory(queryHint, cleanText, defaultCat);
    const sudKratki = formatSudShort(sud);
    const safeFileName = sanitizeFileName(`${sudKratki}_${brojOdluke}`);

    return {
      id: docId,
      brojOdluke,
      sud,
      sudKratki,
      datum,
      godina,
      vrstaOdluke: pravomocnost || 'Presuda',
      pravomocnost,
      ecli,
      stvarnoKazalo,
      zakonskoKazalo: [],
      ishod,
      categoryTag,
      folderName,
      url,
      safeFileName,
      cleanText,
    };
  } catch (err: any) {
    console.error(`      ❌ Greška dohvata ${docId}:`, err.message);
    return null;
  }
}

// Pretraga i prikupljanje ID-jeva s portala
async function searchCourtPortal(query: string, maxPages = 5): Promise<string[]> {
  const docIds = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const searchUrl = `${BASE_URL}/Document/DisplayList?q=${encodeURIComponent(query)}&page=${page}`;
    try {
      const res = await fetch(searchUrl, { headers: HEADERS });
      if (!res.ok) break;

      const html = await res.text();
      const matches = html.match(/\/Document\/View\?id=([a-f0-9\-]+)/gi) || [];

      let newCount = 0;
      for (const m of matches) {
        const idMatch = m.match(/id=([a-f0-9\-]+)/i);
        if (idMatch && idMatch[1]) {
          if (!docIds.has(idMatch[1])) {
            docIds.add(idMatch[1]);
            newCount++;
          }
        }
      }

      if (newCount === 0 || matches.length === 0) {
        break; // Nema novih rezultata
      }

      await delay(500); // Pauza između stranica
    } catch (err: any) {
      console.warn(`      ⚠️ Greška pretrage stranice ${page}:`, err.message);
      break;
    }
  }

  return Array.from(docIds);
}

// Glavna funkcija za pokretanje
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

  // Osiguraj lokalnu bazu mapa
  if (!dryRun) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  // 1. Pretraži portal
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

    // Dohvati detalje
    const doc = await fetchDocumentDetails(docId, query, category);
    if (!doc) continue;

    // Filtar po sudu ako je tražen
    if (courtFilter === 'vusrh' && doc.sudKratki !== 'VUSRH') {
      skippedFilter++;
      continue;
    }
    if (courtFilter === 'upravni' && !doc.sudKratki.includes('Upravni')) {
      skippedFilter++;
      continue;
    }

    // Provjera postoji li već na disku
    const targetFolder = path.join(DATA_DIR, doc.folderName, doc.godina);
    const jsonPath = path.join(targetFolder, `${doc.safeFileName}.json`);
    const txtPath = path.join(targetFolder, `${doc.safeFileName}.txt`);

    const existsOnDisk = fsSync.existsSync(jsonPath);

    // Provjera postoji li u Supabase bazi
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

    console.log(`\n📥 [${processedCount + 1}/${limit}] Obrada: ${doc.sudKratki} - ${doc.brojOdluke} (${doc.datum})`);
    console.log(`   🏷️  Kategorija:  ${doc.categoryTag} (${doc.folderName})`);
    console.log(`   ⚖️  Ishod:        ${doc.ishod}`);
    console.log(`   📄  Veličina:     ${doc.cleanText.length} znakova`);

    if (dryRun) {
      console.log(`   🧪  [DRY-RUN] Spremanje u mapu: ${targetFolder}`);
      console.log(`   🧪  [DRY-RUN] Naslov u bazi:  ${standardTitle}`);
      processedCount++;
      continue;
    }

    // 1. SPREMANJE NA DISK
    await fs.mkdir(targetFolder, { recursive: true });

    // Snimi JSON s potpunim metapodacima
    await fs.writeFile(jsonPath, JSON.stringify(doc, null, 2), 'utf-8');

    // Snimi TXT za lako čitanje
    const readableHeader = `================================================================================
POSLOVNI BROJ: ${doc.brojOdluke}
SUD:           ${doc.sud}
DATUM:         ${doc.datum}
PRAVOMOĆNOST:  ${doc.pravomocnost}
ISHOD:         ${doc.ishod}
KATEGORIJA:    ${doc.categoryTag}
IZVOR:         ${doc.url}
================================================================================\n\n`;

    await fs.writeFile(txtPath, readableHeader + doc.cleanText, 'utf-8');
    console.log(`   💾 Spremljeno na disk: ${path.relative(process.cwd(), jsonPath)}`);

    // 2. VEKTORSKO INDEKSIRANJE I SPREMANJE U SUPABASE
    if (!skipDb && !existsInDb) {
      const chunks = chunkText(doc.cleanText);
      console.log(`   🧩 Dijeljenje u ${chunks.length} semantičkih chunkova (3072 dim)...`);

      let savedChunks = 0;
      for (let j = 0; j < chunks.length; j++) {
        if (j > 0) await delay(300); // Pauza radi rate limita

        try {
          const embedding = await getEmbedding3072(chunks[j]);
          const { error: insErr } = await supabase.from('praksa').insert({
            naziv_datoteke: standardTitle,
            sadrzaj: chunks[j],
            chunk_index: j,
            ukupno_chunkova: chunks.length,
            embedding,
          });

          if (!insErr) {
            savedChunks++;
          } else {
            console.error(`      ❌ Greška inserta chunk ${j + 1}: ${insErr.message}`);
          }
        } catch (embErr: any) {
          console.error(`      ❌ Greška embeddinga chunk ${j + 1}: ${embErr.message}`);
        }
      }

      totalChunksSaved += savedChunks;
      console.log(`   ✅ Uspješno indeksirano ${savedChunks}/${chunks.length} chunkova u tablicu 'praksa'.`);
    } else if (existsInDb) {
      console.log(`   ℹ️  Već postoji u Supabase bazi, preskačem ponovno indeksiranje.`);
    }

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

  const query = getArg('--query') || 'vodni doprinos';
  const category = getArg('--category');
  const limitStr = getArg('--limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 10;
  const courtFilterRaw = getArg('--court') || 'all';
  const courtFilter = ['vusrh', 'upravni', 'all'].includes(courtFilterRaw.toLowerCase())
    ? (courtFilterRaw.toLowerCase() as 'vusrh' | 'upravni' | 'all')
    : 'all';

  const dryRun = hasFlag('--dry-run');
  const skipDb = hasFlag('--skip-db');

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
