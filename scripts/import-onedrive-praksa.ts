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

const DEFAULT_FOLDER =
  'C:\\Users\\dmalbasa\\OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije\\P O S A O\\ŽALBE NA VODNE NAKNADE\\VODNI DOPRINOS\\2019';

const CHUNK_MAX_SIZE = 1400;
const CHUNK_OVERLAP = 200;

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

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

async function main() {
  const targetFolder = process.argv[2] || DEFAULT_FOLDER;
  console.log('📂 Ciljna mapa za uvoz prakse:');
  console.log(`   ${targetFolder}\n`);

  try {
    await fs.access(targetFolder);
  } catch {
    console.error(`❌ Mapa ne postoji ili nije dostupna: ${targetFolder}`);
    process.exit(1);
  }

  const allFiles = await fs.readdir(targetFolder);
  const files = allFiles.filter((f) => /\.(doc|docx|pdf|txt)$/i.test(f) && !f.startsWith('~$'));

  console.log(`📄 Pronađeno podržanih dokumenata: ${files.length}\n`);

  if (files.length === 0) {
    console.log('Nema dokumenata za obradu.');
    return;
  }

  let totalDocsProcessed = 0;
  let totalChunksInserted = 0;
  let skippedDocs = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(targetFolder, file);

    console.log(`[${i + 1}/${files.length}] 🔍 Provjeravam: ${file}`);

    // Provjera postoji li već u bazi
    const { data: existing, error: checkErr } = await supabase
      .from('praksa')
      .select('id')
      .eq('naziv_datoteke', file)
      .limit(1);

    if (checkErr) {
      console.error(`   ⚠️ Greška provjere baze: ${checkErr.message}`);
    } else if (existing && existing.length > 0) {
      console.log(`   ⏭️ Već postoji u bazi, preskačem.`);
      skippedDocs++;
      continue;
    }

    try {
      const rawText = await extractText(filePath);
      if (!rawText || rawText.trim().length < 80) {
        console.log(`   ⚠️ Tekst je prekratak ili prazan, preskačem.`);
        continue;
      }

      const chunks = chunkText(rawText);
      console.log(`   🧩 Ekstrahirano ${rawText.length} znakova, generirano ${chunks.length} chunkova.`);

      let savedCount = 0;
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j];

        // Kratka pauza radi stabilnosti Gemini API rate limita
        await delay(500);

        try {
          const embedding = await getEmbedding(chunk);

          const { error: insertErr } = await supabase.from('praksa').insert({
            naziv_datoteke: file,
            sadrzaj: chunk,
            chunk_index: j,
            ukupno_chunkova: chunks.length,
            embedding: embedding,
          });

          if (insertErr) {
            console.error(`   ❌ Greška pri upisu chunka ${j + 1}: ${insertErr.message}`);
          } else {
            savedCount++;
            totalChunksInserted++;
            process.stdout.write(`\r   💾 Spremljeno: ${savedCount}/${chunks.length} chunkova...`);
          }
        } catch (embedErr: any) {
          console.error(`\n   ❌ Greška pri kreiranju embeddinga za chunk ${j + 1}: ${embedErr.message}`);
        }
      }

      console.log(`\n   ✅ Dokument uspješno uvezen (${savedCount}/${chunks.length} chunkova).\n`);
      totalDocsProcessed++;
    } catch (docErr: any) {
      console.error(`   ❌ Greška pri obradi datoteke: ${docErr.message}\n`);
    }
  }

  console.log('====================================================');
  console.log(`🎉 Uvoz završen!`);
  console.log(`   Ukupno obrađeno novih dokumenata: ${totalDocsProcessed}`);
  console.log(`   Ukupno spremljeno vektorskih dijelova (chunkova): ${totalChunksInserted}`);
  console.log(`   Preskočeno (već postojalo u bazi): ${skippedDocs}`);
  console.log('====================================================');
}

main().catch(console.error);
