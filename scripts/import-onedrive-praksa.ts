import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
// @ts-ignore
import WordExtractor from 'word-extractor';

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
const DEFAULT_PARENT = path.join(
  USER_PROFILE,
  'OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije',
  'P O S A O',
  'ŽALBE NA VODNE NAKNADE',
  'VODNI DOPRINOS'
);

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

  // 1. Naziv datoteke
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

  // 2. Pretraga u tekstu odluke (prvih 3500 znakova)
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

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function getEmbedding(text: string, retries = 3): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await model.embedContent(text);
      return res.embedding.values;
    } catch (err: any) {
      if (attempt === retries || !err.message?.includes('429')) throw err;
      console.log(`\n      ⏳ Rate limit (429), pauza 4s (pokušaj ${attempt}/${retries})...`);
      await delay(4000);
    }
  }
  return [];
}

async function processSingleFile(filePath: string, storedName: string, preExtractedText?: string): Promise<boolean> {
  // Provjera postoji li već u bazi
  const { data: existing } = await supabase
    .from('praksa')
    .select('id')
    .eq('naziv_datoteke', storedName)
    .limit(1);

  if (existing && existing.length > 0) {
    return false; // Već uvezeno
  }

  const rawText = preExtractedText || (await extractText(filePath));
  if (!rawText || rawText.trim().length < 80) {
    return false;
  }

  const chunks = chunkText(rawText);
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
      }
    } catch (err: any) {
      console.error(`      ❌ Greška embeddinga (chunk ${j + 1}): ${err.message}`);
    }
  }

  return savedCount > 0;
}

async function importSudskaPraksa(courtDir: string) {
  console.log('\n====================================================');
  console.log('⚖️  UVOZ SUDSKE PRAKSE:');
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
    process.stdout.write(`   [${i + 1}/${allFiles.length}] ${file.name.substring(0, 40)}... `);

    // Brza provjera postoji li već u bazi po imenu spisa
    const { data: existing } = await supabase
      .from('praksa')
      .select('id')
      .ilike('naziv_datoteke', `%${file.name}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      process.stdout.write(`⏭️ Preskočeno (već u bazi)\n`);
      grandTotalSkipped++;
      continue;
    }

    // 1. Ekstrakcija teksta
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

    // 2. Kategorizacija u podmapu naknade
    const subkategorija = categorizeCourtDecision(file.name, rawText.substring(0, 3500));
    const storedName = `[Praksa upravnih sudova - ${subkategorija}] ${file.name}`;

    process.stdout.write(`[${subkategorija}] `);

    // 3. Procesiranje i upis
    const success = await processSingleFile(file.fullPath, storedName, rawText);
    if (success) {
      process.stdout.write(`✅ Uvezeno\n`);
      grandTotalDocs++;
    } else {
      process.stdout.write(`⏭️ Preskočeno\n`);
      grandTotalSkipped++;
    }
  }

  console.log('====================================================');
  console.log('🎉 ZAVRŠEN UVOZ ZA [Praksa upravnih sudova]!');
  console.log(`   Ukupno novo uvezeno sudskih odluka: ${grandTotalDocs}`);
  console.log(`   Ukupno preskočeno: ${grandTotalSkipped}`);
  console.log('====================================================\n');
}

async function importCategory(parentFolder: string, categoryTag: string) {
  console.log('\n====================================================');
  console.log('📂 Glavna mapa za uvoz:');
  console.log(`   ${parentFolder}`);
  console.log(`🏷️  Kategorija / Područje: ${categoryTag}\n`);

  try {
    await fs.access(parentFolder);
  } catch {
    console.error(`❌ Mapa ne postoji ili nije dostupna: ${parentFolder}`);
    return;
  }

  const entries = await fs.readdir(parentFolder, { withFileTypes: true });

  // Filtriraj SAMO podmape čije je ime točno 4 znamenke (godina: npr. 2006-2026), preskače "RJEŠENJA"
  const yearFolders = entries
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => e.name)
    // Sortiraj od najnovijih prema starijim godinama (2026 -> 2006)
    .sort((a, b) => parseInt(b) - parseInt(a));

  let grandTotalDocs = 0;
  let grandTotalSkipped = 0;

  if (yearFolders.length > 0) {
    console.log(`📅 Pronađene mape godina (${yearFolders.length}):`);
    console.log(`   ${yearFolders.join(', ')}\n`);

    for (const year of yearFolders) {
      const folderPath = path.join(parentFolder, year);
      const filesInFolder = await fs.readdir(folderPath);
      const supportedFiles = filesInFolder.filter(
        (f) => /\.(doc|docx|pdf|txt)$/i.test(f) && !f.startsWith('~$')
      );

      console.log(`----------------------------------------------------`);
      console.log(`📁 [${categoryTag}] Godina ${year} (${supportedFiles.length} spisa u mapi)...`);

      let yearImported = 0;
      let yearSkipped = 0;

      for (let i = 0; i < supportedFiles.length; i++) {
        const file = supportedFiles[i];
        const filePath = path.join(folderPath, file);
        // Format: [Naknada za uređenje voda - 2026] 01-Ministarstvo...
        const storedName = `[${categoryTag} - ${year}] ${file}`;

        process.stdout.write(`   [${i + 1}/${supportedFiles.length}] ${file.substring(0, 48)}... `);

        const success = await processSingleFile(filePath, storedName);
        if (success) {
          process.stdout.write(`✅ Uvezeno\n`);
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
    // Slučaj kada su datoteke izravno u mapi bez godišnjih podmapa (npr. Naknada za korištenje voda)
    const directFiles = entries
      .filter((e) => e.isFile() && /\.(doc|docx|pdf|txt)$/i.test(e.name) && !e.name.startsWith('~$'))
      .map((e) => e.name);

    console.log(`📄 Pronađeno spisa izravno u mapi: ${directFiles.length}\n`);

    for (let i = 0; i < directFiles.length; i++) {
      const file = directFiles[i];
      const filePath = path.join(parentFolder, file);

      // Ekstrakcija godine iz naziva datoteke ili vremena zadnje izmjene
      const yearMatch = file.match(/(19\d\d|20\d\d)/);
      let fileYear = yearMatch ? yearMatch[1] : '';
      if (!fileYear) {
        const stat = await fs.stat(filePath);
        fileYear = stat.mtime.getFullYear().toString();
      }

      const storedName = `[${categoryTag} - ${fileYear}] ${file}`;
      process.stdout.write(`   [${i + 1}/${directFiles.length}] [${fileYear}] ${file.substring(0, 44)}... `);

      const success = await processSingleFile(filePath, storedName);
      if (success) {
        process.stdout.write(`✅ Uvezeno\n`);
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
  const customArg = process.argv[2];

  if (customArg) {
    if (/presude_scan/i.test(customArg) || /upravni sporovi/i.test(customArg) || /sudsk/i.test(customArg)) {
      await importSudskaPraksa(customArg);
      return;
    }

    if (customArg !== '--sve' && customArg !== '--all') {
      let tag = process.argv[3];
      if (!tag) {
        if (/NAKNADA ZA URE[ĐD]ENJE VODA/i.test(customArg)) tag = 'Naknada za uređenje voda';
        else if (/NAKNADA ZA ZA[ŠS]TITU VODA/i.test(customArg)) tag = 'Naknada za zaštitu voda';
        else if (/NAKNADA ZA KORI[ŠS]TENJE VODA/i.test(customArg)) tag = 'Naknada za korištenje voda';
        else if (/VODNI DOPRINOS/i.test(customArg)) tag = 'Vodni doprinos';
        else tag = 'Opća upravna praksa';
      }
      await importCategory(customArg, tag);
      return;
    }
  }

  const baseDir = path.join(
    USER_PROFILE,
    'OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije',
    'P O S A O',
    'ŽALBE NA VODNE NAKNADE'
  );

  // 1. Naknada za uređenje voda (redom od 2026 do 2006)
  const uredjenjeDir = path.join(baseDir, 'NAKNADA ZA UREĐENJE VODA');
  await importCategory(uredjenjeDir, 'Naknada za uređenje voda');

  // 2. Naknada za zaštitu voda (od 2026 do 2019)
  const zastitaDir = path.join(baseDir, 'NAKNADA ZA ZAŠTITU VODA');
  await importCategory(zastitaDir, 'Naknada za zaštitu voda');

  // 3. Naknada za korištenje voda
  const koristenjeDir = path.join(baseDir, 'NAKNADA ZA KORIŠTENJE VODA');
  await importCategory(koristenjeDir, 'Naknada za korištenje voda');
}

main().catch(console.error);
