import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { loadEnvConfig } from '@next/env';

// Učitavanje .env varijabli (uključuje .env.local)
loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_KEY || process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Nedostaju Supabase varijable u .env datoteci (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ Nedostaje Google Gemini Key u .env datoteci (GOOGLE_GEMINI_KEY ili GOOGLE_API_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DATA_DIR = path.join(process.cwd(), 'data', 'praksa');
const CHUNK_MIN_SIZE = 1000;
const CHUNK_MAX_SIZE = 1500;
const CHUNK_OVERLAP = 200;

// Funkcija za čitanje teksta iz datoteke
async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } else if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } else if (ext === '.doc') {
    console.warn(`\n⚠️ Upozorenje: .doc format je zastario i možda neće biti ispravno učitan (${path.basename(filePath)}). Preporučuje se konverzija u .docx.`);
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (e) {
      console.error(`❌ Greška pri čitanju .doc datoteke ${filePath}. Molimo spremite kao .docx.`);
      return "";
    }
  } else if (ext === '.txt') {
    return await fs.readFile(filePath, 'utf-8');
  }

  console.warn(`⚠️ Nepodržan format datoteke: ${ext} (${path.basename(filePath)})`);
  return "";
}

// Funkcija za chunking teksta (1000-1500 znakova, overlap 200)
function chunkText(text: string, maxSize: number = CHUNK_MAX_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  // Očisti tekst od previše praznina
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];

  if (cleanText.length <= maxSize) {
    return [cleanText];
  }

  let currentIndex = 0;

  while (currentIndex < cleanText.length) {
    let endIndex = currentIndex + maxSize;

    if (endIndex >= cleanText.length) {
      chunks.push(cleanText.substring(currentIndex));
      break;
    }

    // Tražimo kraj rečenice unutar zadnjih 100 znakova chunka
    const searchArea = cleanText.substring(endIndex - 100, endIndex);
    const match = searchArea.match(/[.!?]\s/);

    if (match && match.index !== undefined) {
      // Režemo nakon kraja rečenice
      endIndex = endIndex - 100 + match.index + 1;
    } else {
      // Ako nema kraja rečenice, režemo na zadnjem razmaku
      const lastSpaceIndex = cleanText.lastIndexOf(' ', endIndex);
      if (lastSpaceIndex > currentIndex + (maxSize / 2)) {
        endIndex = lastSpaceIndex;
      }
    }

    chunks.push(cleanText.substring(currentIndex, endIndex).trim());

    // Pomičemo se unaprijed, uzimajući overlap
    currentIndex = endIndex - overlap;

    // Pokušaj pronaći najbližu točku u overlapu kako ne bismo počeli chunk na pola rečenice
    const overlapArea = cleanText.substring(currentIndex, endIndex);
    const overlapMatch = overlapArea.match(/[.!?]\s/);
    if (overlapMatch && overlapMatch.index !== undefined) {
      currentIndex = currentIndex + overlapMatch.index + 2;
    }
  }

  return chunks.filter(c => c.trim().length > 0);
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function getEmbedding(text: string): Promise<number[]> {
  // Koristimo službeni SDK umjesto problematičnog fetch poziva
  const aiModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
  const result = await aiModel.embedContent({
    content: { role: 'user', parts: [{ text }] },
    // @ts-ignore - Osiguravamo točno 768 dimenzija koje baka traži
    outputDimensionality: 768
  } as any);
  return result.embedding.values;
}

// Glavna skripta
async function main() {
  console.log("🚀 Započinjem procesiranje dokumenata...");

  try {
    await fs.access(DATA_DIR);
  } catch (error) {
    console.error(`📁 Mapa ${DATA_DIR} ne postoji. Kreiram je...`);
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`💡 Molimo dodajte dokumente u ./data/praksa i ponovno pokrenite skriptu.`);
    return;
  }

  const files = await fs.readdir(DATA_DIR);
  const supportedFiles = files.filter(f => /\.(pdf|docx?|txt)$/i.test(f));

  if (supportedFiles.length === 0) {
    console.log(`ℹ️ Nema podržanih dokumenata u ${DATA_DIR}. Podržani formati: .pdf, .docx, .doc`);
    return;
  }

  console.log(`📄 Pronađeno ${supportedFiles.length} dokumenata za obradu.`);

  for (let i = 0; i < supportedFiles.length; i++) {
    const file = supportedFiles[i];
    const filePath = path.join(DATA_DIR, file);

    console.log(`\n[${i + 1}/${supportedFiles.length}] ⏳ Obrađujem dokument: ${file}...`);

    try {
      const text = await extractTextFromFile(filePath);
      if (!text || text.trim().length === 0) {
        console.log(`⏭️ Preskačem ${file}: Nije pronađen tekst.`);
        continue;
      }

      const chunks = chunkText(text);
      console.log(`🧩 Dokument podijeljen na ${chunks.length} chunkova.`);

      let successfulChunks = 0;

      for (let j = 0; j < chunks.length; j++) {
        const chunkText = chunks[j];

        try {
          // Delay zbog rate limit-a (npr. 1000ms po chunku kod besplatnog tier-a)
          await delay(1000);

          const embedding = await getEmbedding(chunkText);

          // Spremanje u Supabase - prilagođeno našoj SQL strukturi
          const { error } = await supabase.from('praksa').insert({
            sadrzaj: chunkText,
            naziv_datoteke: file,
            chunk_index: j,
            ukupno_chunkova: chunks.length,
            embedding: embedding
          });
          if (error) {
            console.error(`\n❌ Greška pri spremanju chunka ${j + 1} u bazu:`, error.message);
          } else {
            successfulChunks++;
            process.stdout.write(`\r✅ Spremljeno ${successfulChunks}/${chunks.length} chunkova...`);
          }

        } catch (err: any) {
          console.error(`\n❌ Greška pri procesiranju chunka ${j + 1}:`, err.message);
        }
      }
      console.log(`\n🎉 Završeno spremanje za: ${file}. Uspješno: ${successfulChunks}/${chunks.length}`);

    } catch (err: any) {
      console.error(`❌ Greška pri obradi dokumenta ${file}:`, err.message);
    }
  }

  console.log("\n✅ Gotovo! Svi dokumenti su procesirani.");
}

main().catch(console.error);
