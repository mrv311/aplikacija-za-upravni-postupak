import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
// @ts-ignore
import WordExtractor from 'word-extractor';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_KEY || process.env.GOOGLE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Nedostaju Supabase varijable u .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error('❌ Nedostaje Gemini API ključ (GOOGLE_GEMINI_KEY ili GOOGLE_API_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// @ts-ignore
const ExtractorClass = WordExtractor.default || WordExtractor;
const extractor = new ExtractorClass();

const DEFAULT_PARENT =
  'C:\\Users\\dmalbasa\\OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije\\P O S A O\\ŽALBE NA VODNE NAKNADE\\VODNI DOPRINOS';

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

async function getEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const res = await model.embedContent(text);
  return res.embedding.values;
}

async function processSingleFile(filePath: string, storedName: string): Promise<boolean> {
  // Provjera postoji li već u bazi
  const { data: existing } = await supabase
    .from('praksa')
    .select('id')
    .eq('naziv_datoteke', storedName)
    .limit(1);

  if (existing && existing.length > 0) {
    return false; // Već uvezeno
  }

  const rawText = await extractText(filePath);
  if (!rawText || rawText.trim().length < 80) {
    return false;
  }

  const chunks = chunkText(rawText);
  let savedCount = 0;

  for (let j = 0; j < chunks.length; j++) {
    const chunk = chunks[j];
    await delay(400); // 400ms delay

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

async function main() {
  const parentFolder = process.argv[2] || DEFAULT_PARENT;
  
  let categoryTag = 'Vodni doprinos';
  if (process.argv[3]) {
    categoryTag = process.argv[3];
  } else if (/NAKNADA ZA URE[ĐD]ENJE VODA/i.test(parentFolder)) {
    categoryTag = 'Naknada za uređenje voda';
  } else if (/NAKNADA ZA KORI[ŠS]TENJE VODA/i.test(parentFolder)) {
    categoryTag = 'Naknada za korištenje voda';
  } else if (/NAKNADA ZA ZA[ŠS]TITU VODA/i.test(parentFolder)) {
    categoryTag = 'Naknada za zaštitu voda';
  }

  console.log('📂 Glavna mapa za uvoz:');
  console.log(`   ${parentFolder}`);
  console.log(`🏷️  Kategorija / Područje: ${categoryTag}\n`);

  try {
    await fs.access(parentFolder);
  } catch {
    console.error(`❌ Mapa ne postoji ili nije dostupna: ${parentFolder}`);
    process.exit(1);
  }

  const entries = await fs.readdir(parentFolder, { withFileTypes: true });

  // Filtriraj samo podmape čije je ime 4 znamenke (godina: 2006-2026), preskoči npr. "RJEŠENJA"
  const yearFolders = entries
    .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
    .map((e) => e.name)
    // Sortiraj od najnovijih prema starijim godinama (2026 -> 2006)
    .sort((a, b) => parseInt(b) - parseInt(a));

  console.log(`📅 Pronađene mape godina (${yearFolders.length}):`);
  console.log(`   ${yearFolders.join(', ')}\n`);

  let grandTotalDocs = 0;
  let grandTotalSkipped = 0;

  for (const year of yearFolders) {
    const folderPath = path.join(parentFolder, year);
    const filesInFolder = await fs.readdir(folderPath);
    const supportedFiles = filesInFolder.filter(
      (f) => /\.(doc|docx|pdf|txt)$/i.test(f) && !f.startsWith('~$')
    );

    console.log(`====================================================`);
    console.log(`📁 [${categoryTag}] Godina ${year} (${supportedFiles.length} spisa u mapi)...`);

    let yearImported = 0;
    let yearSkipped = 0;

    for (let i = 0; i < supportedFiles.length; i++) {
      const file = supportedFiles[i];
      const filePath = path.join(folderPath, file);
      // Format: [Naknada za uređenje voda - 2026] 01-Ministarstvo...
      const storedName = `[${categoryTag} - ${year}] ${file}`;

      process.stdout.write(`   [${i + 1}/${supportedFiles.length}] ${file.substring(0, 50)}... `);

      const success = await processSingleFile(filePath, storedName);
      if (success) {
        process.stdout.write(`✅ Uvezeno\n`);
        yearImported++;
        grandTotalDocs++;
      } else {
        process.stdout.write(`⏭️ Preskočeno (već postoji ili nečitljivo)\n`);
        yearSkipped++;
        grandTotalSkipped++;
      }
    }

    console.log(`✨ Godina ${year} dovršena: ${yearImported} uvezeno, ${yearSkipped} preskočeno.\n`);
  }

  console.log('====================================================');
  console.log(`🎉 UKUPAN UVOZ ZA [${categoryTag}] ZAVRŠEN!`);
  console.log(`   Ukupno novo uvezeno rješenja: ${grandTotalDocs}`);
  console.log(`   Ukupno preskočeno (već postojalo): ${grandTotalSkipped}`);
  console.log('====================================================');
}

main().catch(console.error);
