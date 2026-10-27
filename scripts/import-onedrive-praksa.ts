import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
// @ts-ignore
import WordExtractor from 'word-extractor';
import { anonymizeDocument } from './anonymizer';

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
// @ts-ignore
const ExtractorClass = WordExtractor.default || WordExtractor;
const extractor = new ExtractorClass();

const USER_PROFILE = process.env.USERPROFILE || 'C:\\Users\\dinom';
const CHUNK_MAX_SIZE = 1400;
const CHUNK_OVERLAP = 200;

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.doc') {
      const doc = await extractor.extract(filePath);
      return doc.getBody() || '';
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value || '';
    } else if (ext === '.pdf') {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return data.text || '';
    } else if (ext === '.txt') {
      return await fs.readFile(filePath, 'utf-8');
    }
  } catch (err: any) {
    console.error(`      ⚠️ Greška čitanja teksta: ${err.message}`);
  }

  return '';
}

async function ocrPdfWithGemini(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    if (buffer.length > 25 * 1024 * 1024) return '';

    const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: buffer.toString('base64'),
        },
      },
      {
        text: 'Ti si asistent za ekstrakciju teksta. Prepiši točan i potpun tekst ove presude/upravnog akta. Nemoj komentirati, vrati samo tekst.',
      },
    ]);
    return result.response.text() || '';
  } catch (err: any) {
    console.error(`      ⚠️ Gemini OCR greška: ${err.message}`);
    return '';
  }
}

function categorizeCourtDecision(fileName: string, textSnippet: string): string {
  const f = fileName.toLowerCase();
  const t = textSnippet.toLowerCase();

  if (
    /\bvd\b/i.test(f) ||
    f.includes('-vd') ||
    f.includes('_vd') ||
    f.includes('vodni doprinos') ||
    f.includes('ozakonjenj') ||
    f.includes('obujam') ||
    f.includes('im obrazac')
  ) {
    return 'Vodni doprinos';
  }
  if (
    /\bnuv\b/i.test(f) ||
    f.includes('-nuv') ||
    f.includes('_nuv') ||
    f.includes('uređenj') ||
    f.includes('uredenj') ||
    f.includes('komunaln') ||
    f.includes('slivne vodne naknade') ||
    f.includes('svn') ||
    f.includes('garaž')
  ) {
    return 'Naknada za uređenje voda';
  }
  if (
    /\bnzzv\b/i.test(f) ||
    f.includes('-nzzv') ||
    f.includes('_nzzv') ||
    f.includes('zaštit') ||
    f.includes('zastit') ||
    /\bk1\b/i.test(f) ||
    /\bk2\b/i.test(f) ||
    f.includes('onečišć') ||
    f.includes('otpadne vode')
  ) {
    return 'Naknada za zaštitu voda';
  }
  if (
    /\bnzkv\b/i.test(f) ||
    f.includes('-nzkv') ||
    f.includes('_nzkv') ||
    f.includes('korištenj') ||
    f.includes('koristenj') ||
    f.includes('zahvać') ||
    f.includes('crpljenj')
  ) {
    return 'Naknada za korištenje voda';
  }
  if (f.includes('koncesij')) {
    return 'Naknada za koncesiju';
  }

  if (
    t.includes('vodnoga doprinosa') ||
    t.includes('vodnog doprinosa') ||
    t.includes('vodni doprinos') ||
    (t.includes('vodn') && t.includes('doprinos'))
  ) {
    return 'Vodni doprinos';
  }
  if (
    t.includes('naknade za uređenje voda') ||
    t.includes('naknada za uređenje voda') ||
    t.includes('naknade za uredenje voda') ||
    t.includes('naknadu za uređenje voda') ||
    t.includes('uređenja voda')
  ) {
    return 'Naknada za uređenje voda';
  }
  if (
    t.includes('naknade za zaštitu voda') ||
    t.includes('naknada za zaštitu voda') ||
    t.includes('naknade za zastitu voda') ||
    t.includes('onečišćenja voda') ||
    t.includes('otpadnih voda')
  ) {
    return 'Naknada za zaštitu voda';
  }
  if (
    t.includes('naknade za korištenje voda') ||
    t.includes('naknada za korištenje voda') ||
    t.includes('korištenja voda')
  ) {
    return 'Naknada za korištenje voda';
  }
  if (t.includes('naknade za koncesiju') || t.includes('koncesij')) {
    return 'Naknada za koncesiju';
  }

  return 'Ostali upravni sporovi';
}

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
    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    currentIndex = endIndex - overlap;
  }

  return chunks.filter((c) => c.length > 30);
}

interface ExistingDbState {
  categoryYearIndex: Set<string>;
  courtIndex: Set<number>;
  storedNames: Set<string>;
}

const dbState: ExistingDbState = {
  categoryYearIndex: new Set(),
  courtIndex: new Set(),
  storedNames: new Set(),
};

async function loadExistingDbState(): Promise<ExistingDbState> {
  console.log('🔄 Učitavam postojeće spise iz baze Supabase radi 100% zaštite od duplikata...');
  const start = Date.now();
  let from = 0;
  const step = 1000;
  let totalDocs = 0;

  while (true) {
    const { data, error } = await supabase
      .from('praksa')
      .select('naziv_datoteke')
      .eq('chunk_index', 0)
      .range(from, from + step - 1);

    if (error) {
      console.error('❌ Greška pri učitavanju postojećih spisa iz baze:', error);
      break;
    }
    if (!data || data.length === 0) break;

    totalDocs += data.length;
    for (const row of data) {
      const name = row.naziv_datoteke;
      dbState.storedNames.add(name);

      const courtMatch = name.match(/Praksa upravnih sudova.*\(#(\d+)\)$/);
      if (courtMatch) {
        dbState.courtIndex.add(parseInt(courtMatch[1], 10));
        continue;
      }

      const catMatch = name.match(/^\[(.*?) - (\d{4})\].*\(#(\d+)\)$/);
      if (catMatch) {
        const cat = catMatch[1].trim();
        const year = catMatch[2].trim();
        const idx = parseInt(catMatch[3], 10);
        dbState.categoryYearIndex.add(`${cat}:${year}:${idx}`);
      }
    }

    if (data.length < step) break;
    from += step;
  }

  console.log(`✅ Učitano ${totalDocs} postojećih spisa iz baze u ${Date.now() - start} ms:`);
  console.log(`   - Upravni sporovi / presude: ${dbState.courtIndex.size}`);
  console.log(`   - Upravni postupak (NUV/VD/dr.): ${dbState.categoryYearIndex.size}\n`);

  return dbState;
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function getEmbedding(text: string, retries = 5): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await model.embedContent(text);
      return res.embedding.values;
    } catch (err: any) {
      if (attempt === retries) throw err;
      const waitMs = attempt * 3000;
      console.log(`\n      ⏳ Rate limit (429) embedding, pauza ${waitMs / 1000}s (pokušaj ${attempt}/${retries})...`);
      await delay(waitMs);
    }
  }
  return [];
}

async function processSingleFile(
  filePath: string,
  categoryTag: string,
  year: string,
  fileIndex: number,
  preExtractedText?: string
): Promise<boolean> {
  const originalFileName = path.basename(filePath);
  const rawText = preExtractedText || (await extractText(filePath));
  if (!rawText || rawText.trim().length < 80) {
    return false;
  }

  // 1. GDPR Anonimizacija (fizičke i pravne osobe SAMO prva slova/inicijali, OIB -> [OIB], adrese -> [Adresa])
  process.stdout.write(`(Anonimizacija... `);
  const anon = await anonymizeDocument(rawText, originalFileName, categoryTag, year, fileIndex);
  process.stdout.write(`${anon.anonymizedParty}) `);

  const storedName = anon.storedName;

  // Provjera postoji li već u bazi (i u memorijskom cacheu)
  if (dbState.storedNames.has(storedName)) {
    return false;
  }

  const { data: existing } = await supabase
    .from('praksa')
    .select('id')
    .eq('naziv_datoteke', storedName)
    .limit(1);

  if (existing && existing.length > 0) {
    dbState.storedNames.add(storedName);
    return false; // Već uvezeno
  }

  const chunks = chunkText(anon.anonymizedText);
  let savedCount = 0;

  for (let j = 0; j < chunks.length; j++) {
    const chunk = chunks[j];
    await delay(350); // stabilna pauza radi rate limita

    try {
      const embedding = await getEmbedding(chunk);
      const { error: insertErr } = await supabase.from('praksa').insert({
        naziv_datoteke: storedName,
        sadrzaj: chunk,
        chunk_index: j,
        ukupno_chunkova: chunks.length,
        embedding: embedding,
      });

      if (!insertErr) {
        savedCount++;
      } else {
        console.error(`      ❌ Greška inserta (chunk ${j + 1}): ${insertErr.message}`);
      }
    } catch (err: any) {
      console.error(`      ❌ Greška embeddinga (chunk ${j + 1}): ${err.message}`);
    }
  }

  if (savedCount > 0) {
    dbState.storedNames.add(storedName);
    return true;
  }
  return false;
}

async function importSudskaPraksa(courtDir: string) {
  console.log('\n====================================================');
  console.log('⚖️  UVOZ SUDSKE PRAKSE (S AUTOMATSKOM ANONIMIZACIJOM):');
  console.log(`   ${courtDir}`);
  console.log('🏷️  Kategorija / Područje: Praksa upravnih sudova\n');

  try {
    await fs.access(courtDir);
  } catch {
    console.error(`❌ Mapa ne postoji ili nije dostupna: ${courtDir}`);
    return;
  }

  const allFiles: { name: string; fullPath: string }[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (/\.(pdf|doc|docx)$/i.test(e.name) && !e.name.startsWith('~$')) {
        allFiles.push({ name: e.name, fullPath: full });
      }
    }
  }

  await walk(courtDir);
  allFiles.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`📄 Ukupno pronađeno presuda i akata: ${allFiles.length}\n`);

  let grandTotalDocs = 0;
  let grandTotalSkipped = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    const fileIndex = i + 1;
    const fileId = String(fileIndex).padStart(2, '0');

    // Provjera duplikata PRIJE obrade ili API poziva
    if (dbState.courtIndex.has(fileIndex)) {
      process.stdout.write(`   [${fileIndex}/${allFiles.length}] ${file.name.substring(0, 36)}... ⏭️ Već u bazi (#${fileId})\n`);
      grandTotalSkipped++;
      continue;
    }

    process.stdout.write(`   [${fileIndex}/${allFiles.length}] ${file.name.substring(0, 36)}... `);

    let rawText = await extractText(file.fullPath);
    if (!rawText || rawText.trim().length < 80) {
      if (file.name.toLowerCase().endsWith('.pdf')) {
        process.stdout.write(`(OCR) `);
        rawText = await ocrPdfWithGemini(file.fullPath);
      }
    }

    if (!rawText || rawText.trim().length < 80) {
      process.stdout.write(`⏭️ Preskočeno (prazno / nečitljivo)\n`);
      grandTotalSkipped++;
      continue;
    }

    const subkategorija = categorizeCourtDecision(file.name, rawText.substring(0, 3500));
    const yearMatch = file.name.match(/(19\d\d|20\d\d)/);
    const courtYear = yearMatch ? yearMatch[1] : 'Presude';

    process.stdout.write(`[${subkategorija}] `);

    const success = await processSingleFile(
      file.fullPath,
      `Praksa upravnih sudova - ${subkategorija}`,
      courtYear,
      fileIndex,
      rawText
    );

    if (success) {
      process.stdout.write(`✅ Uvezeno\n`);
      dbState.courtIndex.add(fileIndex);
      grandTotalDocs++;
    } else {
      process.stdout.write(`⏭️ Preskočeno\n`);
      grandTotalSkipped++;
    }
  }

  console.log('====================================================');
  console.log('🎉 ZAVRŠEN UVOZ ZA [Praksa upravnih sudova]!');
  console.log(`   Ukupno novo uvezeno sudskih odluka: ${grandTotalDocs}`);
  console.log(`   Ukupno preskočeno (već u bazi ili nečitljivo): ${grandTotalSkipped}`);
  console.log('====================================================\n');
}

function detectCategoryTag(folderName: string): string {
  if (/NAKNADA ZA URE[ĐD]ENJE VODA|\bNUV\b/i.test(folderName)) return 'Naknada za uređenje voda';
  if (/NAKNADA ZA ZA[ŠS]TITU VODA|\bNZZV\b/i.test(folderName)) return 'Naknada za zaštitu voda';
  if (/NAKNADA ZA KORI[ŠS]TENJE VODA|\bNZKV\b/i.test(folderName)) return 'Naknada za korištenje voda';
  if (/VODNI DOPRINOS|\bVD\b/i.test(folderName)) return 'Vodni doprinos';
  if (/SUDSK|PRESUDE|UPRAVNI SPOR/i.test(folderName)) return 'Praksa upravnih sudova';
  return folderName;
}

async function importCategory(parentFolder: string, categoryTag: string) {
  console.log('\n====================================================');
  console.log('📂 Glavna mapa za uvoz (s automatskom anonimizacijom):');
  console.log(`   ${parentFolder}`);
  console.log(`🏷️  Kategorija / Područje: ${categoryTag}\n`);

  try {
    await fs.access(parentFolder);
  } catch {
    console.error(`❌ Mapa ne postoji ili nije dostupna: ${parentFolder}`);
    return;
  }

  const entries = await fs.readdir(parentFolder, { withFileTypes: true });

  const yearFolders = entries
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => parseInt(b) - parseInt(a));

  let grandTotalDocs = 0;
  let grandTotalSkipped = 0;

  if (yearFolders.length > 0) {
    console.log(`📅 Pronađene mape godina (${yearFolders.length}):`);
    console.log(`   ${yearFolders.join(', ')}\n`);

    for (const year of yearFolders) {
      const folderPath = path.join(parentFolder, year);
      const filesInFolder = await fs.readdir(folderPath);
      const supportedFiles = filesInFolder
        .filter((f) => /\.(doc|docx|pdf|txt)$/i.test(f) && !f.startsWith('~$'))
        .sort((a, b) => a.localeCompare(b));

      console.log(`----------------------------------------------------`);
      console.log(`📁 [${categoryTag}] Godina ${year} (${supportedFiles.length} spisa u mapi)...`);

      let yearImported = 0;
      let yearSkipped = 0;

      for (let i = 0; i < supportedFiles.length; i++) {
        const file = supportedFiles[i];
        const filePath = path.join(folderPath, file);
        const fileIndex = i + 1;
        const fileId = String(fileIndex).padStart(2, '0');

        // Provjera duplikata PRIJE obrade ili API poziva
        const catKey = `${categoryTag}:${year}:${fileIndex}`;
        if (dbState.categoryYearIndex.has(catKey)) {
          process.stdout.write(`   [${fileIndex}/${supportedFiles.length}] ${file.substring(0, 36)}... ⏭️ Već u bazi (#${fileId})\n`);
          yearSkipped++;
          grandTotalSkipped++;
          continue;
        }

        process.stdout.write(`   [${fileIndex}/${supportedFiles.length}] ${file.substring(0, 36)}... `);

        const success = await processSingleFile(filePath, categoryTag, year, fileIndex);
        if (success) {
          process.stdout.write(`✅ Uvezeno\n`);
          dbState.categoryYearIndex.add(catKey);
          yearImported++;
          grandTotalDocs++;
        } else {
          process.stdout.write(`⏭️ Preskočeno\n`);
          yearSkipped++;
          grandTotalSkipped++;
        }
      }

      console.log(`✨ Godina ${year} dovršena: ${yearImported} uvezeno, ${yearSkipped} preskočeno.\n`);
    }
  } else {
    const directFiles = entries
      .filter((e) => e.isFile() && /\.(doc|docx|pdf|txt)$/i.test(e.name) && !e.name.startsWith('~$'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));

    console.log(`📄 Pronađeno spisa izravno u mapi: ${directFiles.length}\n`);

    for (let i = 0; i < directFiles.length; i++) {
      const file = directFiles[i];
      const filePath = path.join(parentFolder, file);
      const fileIndex = i + 1;
      const fileId = String(fileIndex).padStart(2, '0');

      const yearMatch = file.match(/(19\d\d|20\d\d)/);
      let fileYear = yearMatch ? yearMatch[1] : '';
      if (!fileYear) {
        const stat = await fs.stat(filePath);
        fileYear = stat.mtime.getFullYear().toString();
      }

      // Provjera duplikata PRIJE obrade ili API poziva
      const catKey = `${categoryTag}:${fileYear}:${fileIndex}`;
      if (dbState.categoryYearIndex.has(catKey)) {
        process.stdout.write(`   [${fileIndex}/${directFiles.length}] [${fileYear}] ${file.substring(0, 36)}... ⏭️ Već u bazi (#${fileId})\n`);
        grandTotalSkipped++;
        continue;
      }

      process.stdout.write(`   [${fileIndex}/${directFiles.length}] [${fileYear}] ${file.substring(0, 36)}... `);

      const success = await processSingleFile(filePath, categoryTag, fileYear, fileIndex);
      if (success) {
        process.stdout.write(`✅ Uvezeno\n`);
        dbState.categoryYearIndex.add(catKey);
        grandTotalDocs++;
      } else {
        process.stdout.write(`⏭️ Preskočeno\n`);
        grandTotalSkipped++;
      }
    }
  }

  console.log('====================================================');
  console.log(`🎉 ZAVRŠEN UVOZ ZA [${categoryTag}]!`);
  console.log(`   Ukupno novo uvezeno rješenja: ${grandTotalDocs}`);
  console.log(`   Ukupno preskočeno (već postojalo ili prazno): ${grandTotalSkipped}`);
  console.log('====================================================\n');
}

async function main() {
  await loadExistingDbState();

  const customArg = process.argv[2];

  if (customArg && customArg !== '--sve' && customArg !== '--all') {
    if (/presude_scan/i.test(customArg) || /upravni sporovi/i.test(customArg) || /sudsk/i.test(customArg)) {
      await importSudskaPraksa(customArg);
      return;
    }

    try {
      const entries = await fs.readdir(customArg, { withFileTypes: true });
      const subdirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

      // Ako je to master mapa (npr. "za aplikaciju") koja sadrži podmape za naknade
      const isMasterFolder = subdirs.some((d) =>
        /naknada|vodni|ure[đd]enj|za[šs]tit|kori[šs]tenj|sudsk|presud|upravni spor|\bnuv\b|\bvd\b|\bnzzv\b|\bnzkv\b/i.test(d)
      );

      if (isMasterFolder) {
        console.log(`\n📂 Detektirana glavna mapa s podmapama naknada: ${customArg}`);
        for (const sub of subdirs) {
          const subPath = path.join(customArg, sub);
          if (/sudsk|presud|upravni spor/i.test(sub)) {
            await importSudskaPraksa(subPath);
          } else {
            const tag = detectCategoryTag(sub);
            await importCategory(subPath, tag);
          }
        }
        return;
      }
    } catch (e: any) {
      console.warn(`Napomena pri provjeri mape: ${e.message}`);
    }

    // Inače je to izravna mapa jedne naknade
    let tag = process.argv[3] || detectCategoryTag(path.basename(customArg));
    await importCategory(customArg, tag);
    return;
  }

  const baseDir = path.join(
    USER_PROFILE,
    'OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije',
    'P O S A O',
    'ŽALBE NA VODNE NAKNADE'
  );

  const uredjenjeDir = path.join(baseDir, 'NAKNADA ZA UREĐENJE VODA');
  await importCategory(uredjenjeDir, 'Naknada za uređenje voda');

  const zastitaDir = path.join(baseDir, 'NAKNADA ZA ZAŠTITU VODA');
  await importCategory(zastitaDir, 'Naknada za zaštitu voda');

  const koristenjeDir = path.join(baseDir, 'NAKNADA ZA KORIŠTENJE VODA');
  await importCategory(koristenjeDir, 'Naknada za korištenje voda');
}

main().catch(console.error);
