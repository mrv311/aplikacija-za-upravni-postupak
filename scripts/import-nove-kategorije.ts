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
const POSAO_DIR = path.join(
  USER_PROFILE,
  'OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije',
  'P O S A O'
);

const CHUNK_MAX_SIZE = 1400;
const CHUNK_OVERLAP = 200;
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

interface TargetFolder {
  relPath: string;
  categoryTag: string;
}

const TARGETS: TargetFolder[] = [
  { relPath: 'ŽALBE NA VODNE NAKNADE/NAKNADA ZA ZAŠTITU VODA', categoryTag: 'Naknada za zaštitu voda' },
  { relPath: 'ŽALBE NA VODNE NAKNADE/NAKNADA ZA KORIŠTENJE VODA', categoryTag: 'Naknada za korištenje voda' },
  { relPath: 'NAKNADA ZA KONCESIJU', categoryTag: 'Naknada za koncesiju' },
  { relPath: 'PONIŠTAVANJE I UKIDANJE RJEŠENJA - NOVI ZUP_ČL_129 DO 132', categoryTag: 'Poništavanje i ukidanje rješenja (ZUP)' },
  { relPath: 'OGLAŠAVANJE RJEŠENJA NIŠTAVIM', categoryTag: 'Oglašavanje rješenja ništavim' },
  { relPath: 'OBNOVA POSTUPKA', categoryTag: 'Obnova postupka' },
  { relPath: 'RJEŠENJA PO PRIGOVORU', categoryTag: 'Rješenja po prigovoru' },
  { relPath: 'TROŠKOVI POSTUPKA', categoryTag: 'Troškovi postupka' },
  { relPath: 'ZAKLJUČCI - NOVI ZUP', categoryTag: 'Zaključci (ZUP)' },
  { relPath: 'ZAŠTITA OD POSTUPANJA PRUŽATELJA JAVNIH USLUGA_ČL_157 i 158_ZUP', categoryTag: 'Zaštita od postupanja pružatelja javnih usluga' },
  { relPath: 'ZAKUP JAVNOG VODNOG DOBRA - ŽALBE', categoryTag: 'Zakup javnog vodnog dobra' },
  { relPath: 'AKTI PO PRESUDAMA USTAVNOG SUDA', categoryTag: 'Akti po presudama Ustavnog suda' },
];

function getCanonicalDocKey(fileName: string): string {
  const ext = path.extname(fileName);
  let base = path.basename(fileName, ext);
  // Ukloni sufikse _boja, -boja, _pismohrana, -pismohrana, scan, potpis, boja1, itd.
  base = base.replace(/[_-]?(boja\d*|pismohran[ae]?\d*|scan\d*|potpis\d*)$/i, '');
  base = base.replace(/[_\s-]+$/g, '');
  // Ukloni završni brojač verzije ako se radi o duplikatu (npr. suda1, suda2)
  base = base.replace(/([a-zA-ZčćžšđČĆŽŠĐ])\d+$/i, '$1');
  return base.trim().toLowerCase();
}

function computeFileScore(fileName: string, ext: string): number {
  const nameLower = fileName.toLowerCase();
  let score = 0;
  // Boja ima najviši prioritet (glavni original u boji)
  if (nameLower.includes('boja')) {
    score += 100;
  } else if (!nameLower.includes('pismohran')) {
    score += 50;
  } else {
    // pismohrana je crno-bijeli s potpisima i parafima - rezervna opcija ako nema boje
    score += 10;
  }

  // Format datoteke: docx > doc > pdf > txt
  if (ext === '.docx') score += 30;
  else if (ext === '.doc') score += 20;
  else if (ext === '.pdf') score += 10;
  else if (ext === '.txt') score += 5;

  // Ako je boja1, boja2 - malo manji prioritet od čistog 'boja'
  if (/boja\d+/i.test(nameLower)) {
    score -= 5;
  }

  return score;
}

interface FileEntry {
  filePath: string;
  fileName: string;
  dirName: string;
  ext: string;
  score: number;
  size: number;
  mtime: number;
}

async function collectFilesRecursively(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await collectFilesRecursively(fullPath);
        results.push(...subFiles);
      } else if (entry.isFile() && /\.(doc|docx|pdf|txt)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (err: any) {
    console.warn(`Greška čitanja mape ${dir}: ${err.message}`);
  }
  return results;
}

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
      const text = data.text || '';
      if (text.trim().length > 60) return text;
      // OCR fallback za skenirane PDF-ove
      return await ocrPdfWithGemini(filePath);
    } else if (ext === '.txt') {
      return await fs.readFile(filePath, 'utf-8');
    }
  } catch (err: any) {
    console.error(`      ⚠️ Greška čitanja teksta (${path.basename(filePath)}): ${err.message}`);
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

function extractYear(fileName: string, text: string, mtimeMs: number): string {
  // 1. Naziv datoteke: npr. 2021, 2019, za 2018
  const fileYearMatch = fileName.match(/(19\d\d|20\d\d)/);
  if (fileYearMatch) return fileYearMatch[1];

  // 2. KLASA u tekstu: npr. UP/II-325-08/21-01 ili UP/II-325-08/19-01
  if (text) {
    const klasaMatch = text.match(/UP\/[I|II].*?\/(\d{2})-\d+/i);
    if (klasaMatch) {
      const yy = parseInt(klasaMatch[1], 10);
      if (yy >= 0 && yy <= 30) return `20${String(yy).padStart(2, '0')}`;
      if (yy > 80 && yy <= 99) return `19${yy}`;
    }

    // 3. Datum u tekstu (npr. "ožujka 2022.", "2021. godine")
    const dateMatch = text.match(/\b(19\d\d|20\d\d)\b(?:\.|\s+godin)/i);
    if (dateMatch) return dateMatch[1];
  }

  // 4. Fallback na mtime
  return new Date(mtimeMs).getFullYear().toString();
}

interface ExistingDbState {
  storedNames: Set<string>;
  categoryIndexKeys: Set<string>;
}

async function loadExistingDbState(): Promise<ExistingDbState> {
  console.log('🔄 Učitavam postojeće spise iz baze Supabase radi 100% zaštite od duplikata...');
  const start = Date.now();
  let from = 0;
  const step = 1000;
  const state: ExistingDbState = {
    storedNames: new Set(),
    categoryIndexKeys: new Set(),
  };

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

    for (const row of data) {
      const name = row.naziv_datoteke;
      state.storedNames.add(name);

      // Mapiraj npr. [Naknada za zaštitu voda - 2021] ... (#01)
      const match = name.match(/^\[(.*?) - (\d{4})\].*\(#(\d+)\)$/);
      if (match) {
        state.categoryIndexKeys.add(`${match[1].trim()}:${match[3].trim()}`);
      }
    }

    if (data.length < step) break;
    from += step;
  }

  console.log(`✅ Učitano ${state.storedNames.size} postojećih spisa iz baze u ${Date.now() - start} ms.\n`);
  return state;
}

async function main() {
  const dbState = await loadExistingDbState();

  const selectedCategoryArg = process.argv[2]; // npr. "koncesij" ili "zastit" ili prazno za sve

  let grandTotalProcessed = 0;
  let grandTotalNewImported = 0;
  let grandTotalSkippedDb = 0;
  let grandTotalSkippedDuplicates = 0;

  for (const target of TARGETS) {
    if (selectedCategoryArg && !target.categoryTag.toLowerCase().includes(selectedCategoryArg.toLowerCase()) && !target.relPath.toLowerCase().includes(selectedCategoryArg.toLowerCase())) {
      continue;
    }

    const targetPath = path.join(POSAO_DIR, target.relPath.replace(/\//g, path.sep));
    const allFiles = await collectFilesRecursively(targetPath);
    if (allFiles.length === 0) {
      console.log(`⚠️  [${target.categoryTag}] Nema datoteka na putanji: ${targetPath}`);
      continue;
    }

    // 1. Grupiraj i odaberi najbolje verzije (eliminiraj pismohrana ako postoji boja/glavna)
    const groups = new Map<string, FileEntry[]>();
    for (const fp of allFiles) {
      const fn = path.basename(fp);
      const ext = path.extname(fp).toLowerCase();
      const dirName = path.dirname(fp);
      const stat = await fs.stat(fp);
      const key = `${dirName}::${getCanonicalDocKey(fn)}`;

      const entry: FileEntry = {
        filePath: fp,
        fileName: fn,
        dirName,
        ext,
        score: computeFileScore(fn, ext),
        size: stat.size,
        mtime: stat.mtimeMs,
      };

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const chosen: FileEntry[] = [];
    const skippedDupes: { skipped: string; chosen: string }[] = [];

    for (const [, entries] of groups.entries()) {
      if (entries.length === 1) {
        chosen.push(entries[0]);
      } else {
        entries.sort((a, b) => b.score - a.score || b.mtime - a.mtime || b.size - a.size);
        const winner = entries[0];
        chosen.push(winner);
        for (let i = 1; i < entries.length; i++) {
          skippedDupes.push({ skipped: entries[i].fileName, chosen: winner.fileName });
        }
      }
    }

    // Sortiraj odabrane po nazivu za dosljedan redoslijed
    chosen.sort((a, b) => a.fileName.localeCompare(b.fileName));

    console.log(`====================================================`);
    console.log(`📂 KATEGORIJA: [${target.categoryTag}]`);
    console.log(`   Pronađeno na disku: ${allFiles.length} spisa`);
    console.log(`   Duplikata eliminirano: ${skippedDupes.length} (pismohrana / verzije)`);
    console.log(`   Za uvoz preostalo jedinstvenih: ${chosen.length} spisa\n`);

    grandTotalSkippedDuplicates += skippedDupes.length;

    let catImported = 0;
    let catSkipped = 0;

    for (let i = 0; i < chosen.length; i++) {
      const item = chosen[i];
      const fileIndex = i + 1;
      const fileId = String(fileIndex).padStart(2, '0');

      process.stdout.write(`   [${fileIndex}/${chosen.length}] ${item.fileName.substring(0, 42).padEnd(42)} `);

      // Brza provjera je li ovaj indeks kategorije već u bazi
      const indexKey = `${target.categoryTag}:${fileId}`;
      if (dbState.categoryIndexKeys.has(indexKey)) {
        process.stdout.write(`⏭️ Već u bazi (#${fileId})\n`);
        catSkipped++;
        grandTotalSkippedDb++;
        continue;
      }

      // Pročitaj tekst dokumenta
      const rawText = await extractText(item.filePath);
      if (!rawText || rawText.trim().length < 60) {
        process.stdout.write(`⚠️ Preskočeno (prazan ili nečitljiv tekst)\n`);
        catSkipped++;
        continue;
      }

      // Odredi godinu
      const year = extractYear(item.fileName, rawText, item.mtime);

      // Anonimizacija putem Gemini AI modela
      process.stdout.write(`(Anonimizacija... `);
      const anon = await anonymizeDocument(rawText, item.fileName, target.categoryTag, year, fileIndex);
      process.stdout.write(`${anon.anonymizedParty}) `);

      const storedName = anon.storedName;

      // Provjera točnog naziva u bazi
      if (dbState.storedNames.has(storedName)) {
        process.stdout.write(`⏭️ Već u bazi\n`);
        catSkipped++;
        grandTotalSkippedDb++;
        continue;
      }

      // Provjera u Supabase bazi
      const { data: existing } = await supabase
        .from('praksa')
        .select('id')
        .eq('naziv_datoteke', storedName)
        .limit(1);

      if (existing && existing.length > 0) {
        dbState.storedNames.add(storedName);
        dbState.categoryIndexKeys.add(indexKey);
        process.stdout.write(`⏭️ Već u bazi\n`);
        catSkipped++;
        grandTotalSkippedDb++;
        continue;
      }

      // Podjela u chunkove i embedding
      const chunks = chunkText(anon.anonymizedText);
      let savedChunks = 0;

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
            savedChunks++;
          } else {
            console.error(`\n      ❌ Greška inserta chunk ${j + 1}: ${insertErr.message}`);
          }
        } catch (err: any) {
          console.error(`\n      ❌ Greška embeddinga chunk ${j + 1}: ${err.message}`);
        }
      }

      if (savedChunks > 0) {
        dbState.storedNames.add(storedName);
        dbState.categoryIndexKeys.add(indexKey);
        process.stdout.write(`✅ Uvezeno (${savedChunks} chunkova)\n`);
        catImported++;
        grandTotalNewImported++;
      } else {
        process.stdout.write(`❌ Nije uspjelo spremanje\n`);
      }

      grandTotalProcessed++;
    }

    console.log(`\n✨ Kategorija [${target.categoryTag}] dovršena: ${catImported} novo uvezeno, ${catSkipped} preskočeno.\n`);
  }

  console.log('====================================================');
  console.log('🎉 SVE KATEGORIJE SU USPJEŠNO OBRAĐENE!');
  console.log(`   Ukupno novo uvezenih dokumenata: ${grandTotalNewImported}`);
  console.log(`   Ukupno preskočenih (već u bazi): ${grandTotalSkippedDb}`);
  console.log(`   Ukupno eliminiranih duplikata: ${grandTotalSkippedDuplicates}`);
  console.log('====================================================\n');
}

main().catch(console.error);
