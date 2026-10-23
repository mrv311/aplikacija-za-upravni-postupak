import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
// @ts-ignore
import WordExtractor from 'word-extractor';
import { PROPISI_LIST, PropisDef } from '../src/lib/propisi-config';

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
const LOCAL_PROPISI_DIR = path.join(
  USER_PROFILE,
  'OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije',
  'P O S A O',
  'P R O P I S I'
);

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function getEmbedding768(text: string, retries = 3): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await model.embedContent({
        content: { role: 'user', parts: [{ text }] },
        // @ts-ignore
        outputDimensionality: 768,
      } as any);
      return res.embedding.values;
    } catch (err: any) {
      if (attempt === retries || !err.message?.includes('429')) throw err;
      console.log(`\n      ⏳ Rate limit (429), pauza 4s (pokušaj ${attempt}/${retries})...`);
      await delay(4000);
    }
  }
  return [];
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
        text: 'Ti si asistent za ekstrakciju teksta pravnih propisa. Prepiši točan i potpun tekst ove Uredbe/Pravilnika po člancima. Nemoj komentirati, samo vrati čisti tekst.',
      },
    ]);
    return result.response.text() || '';
  } catch (err: any) {
    console.error(`      ⚠️ Gemini OCR greška: ${err.message}`);
    return '';
  }
}

interface ArticleExtracted {
  clanak_broj: string;
  naslov: string;
  tekst: string;
}

// 1. Parser za zakon.hr
async function parseFromZakonHr(url: string): Promise<ArticleExtracted[]> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Greška pri dohvaćanju zakon.hr: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe').remove();

  const container = $('#pretrazitekst');
  const blocks = container.find('.cms-block');
  const articles: ArticleExtracted[] = [];
  let currentSection = '';

  blocks.each((_, el) => {
    const titleEl = $(el).find('.cms-block-title-plain');
    const titleText = titleEl.text().trim();

    if (titleText.toLowerCase().includes('prijelazne') || titleText.toLowerCase().includes('završne')) {
      currentSection = titleText;
    }

    // Tražimo "Članak X." ili "Članak Xa."
    const match = titleText.match(/^Članak\s+(\d+[a-z]?)\.?/i);
    if (!match) return;

    let clanakBroj = `Članak ${match[1].toLowerCase()}.`;
    if (currentSection) {
      const nnMatch = currentSection.match(/NN\s+\d+\/\d+/i);
      const tag = nnMatch ? ` (${nnMatch[0]})` : '';
      if (articles.some((a) => a.clanak_broj === clanakBroj)) {
        clanakBroj = `${clanakBroj} ${tag || '(Prijelazne odredbe)'}`;
      }
    }

    const clone = $(el).clone();
    clone.find('.cms-block-title-plain').remove();

    let bodyText = clone.text().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    bodyText = bodyText.replace(/\n\s*\n+/g, '\n\n').trim();

    const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean);
    let naslov = '';
    let content = bodyText;

    if (lines.length > 1 && lines[0].length < 100 && !lines[0].startsWith('(')) {
      naslov = lines[0];
      content = lines.slice(1).join('\n\n');
    }

    const fullTekst = naslov ? `${naslov}\n\n${content}` : content;

    articles.push({
      clanak_broj: clanakBroj,
      naslov,
      tekst: fullTekst,
    });
  });

  return articles;
}

// 2. Parser za lokalne datoteke (.docx, .doc, .pdf)
async function parseFromLocalFile(filePath: string): Promise<ArticleExtracted[]> {
  const ext = path.extname(filePath).toLowerCase();
  let rawText = '';

  if (ext === '.docx') {
    const res = await mammoth.extractRawText({ path: filePath });
    rawText = res.value || '';
  } else if (ext === '.doc') {
    const doc = await extractor.extract(filePath);
    rawText = doc.getBody() || '';
  } else if (ext === '.pdf') {
    const buf = await fs.readFile(filePath);
    const data = await pdfParse(buf);
    rawText = data.text || '';
    if (rawText.trim().length < 1500) {
      console.log(`   (OCR obrada skeniranog PDF-a preko Gemini 3.8 Flash)...`);
      rawText = await ocrPdfWithGemini(filePath);
    }
  }

  if (!rawText || rawText.trim().length < 50) return [];

  // Normalizacija oznaka članaka
  const clean = rawText
    .replace(/ˇ\s*C/g, 'Č')
    .replace(/ˇ\s*c/g, 'č')
    .replace(/ČLANAK/g, 'Članak')
    .replace(/CLANAK/g, 'Članak')
    .replace(/###\s*Članak/gi, 'Članak')
    .replace(/Članak\s+(\d+[a-z]?)\s*\./gi, 'Članak $1.');

  const parts = clean.split(/(?=(?:^|\n|\r)\s*Članak\s+\d+[a-z]?\.)/i);
  const articles: ArticleExtracted[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^Članak\s+(\d+[a-z]?)\./i);
    if (!match) continue;

    const clanakBroj = `Članak ${match[1].toLowerCase()}.`;
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);

    let naslov = '';
    let content = trimmed;

    // Ako iza "Članak X." odmah stoji kratki naslov članka
    if (lines.length > 2 && lines[1].length < 100 && !lines[1].startsWith('(')) {
      naslov = lines[1];
      content = [lines[0], lines.slice(1).join('\n\n')].join('\n\n');
    }

    articles.push({
      clanak_broj: clanakBroj,
      naslov,
      tekst: content,
    });
  }

  return articles;
}

async function main() {
  const doReset = process.argv.includes('--reset') || true;

  console.log('====================================================');
  console.log('🏛️  IZGRADNJA BAZE PROPISA OD NULE');
  console.log('====================================================\n');

  if (doReset) {
    console.log('🧹 Čistim postojeće zapise iz tablice "zakoni"...');
    const { error: delErr } = await supabase.from('zakoni').delete().neq('id', 0);
    if (delErr) {
      console.error('Greška pri brisanju stare baze zakona:', delErr.message);
    } else {
      console.log('✅ Stara baza propisa uspješno ispražnjena.\n');
    }
  }

  let totalArticlesSaved = 0;
  const stats: Record<string, number> = {};

  for (let idx = 0; idx < PROPISI_LIST.length; idx++) {
    const propis = PROPISI_LIST[idx];
    console.log(`----------------------------------------------------`);
    console.log(`[${idx + 1}/${PROPISI_LIST.length}] 📜 ${propis.naziv} (${propis.kratica})`);
    console.log(`    📁 Područje: ${propis.podrucje} | Izvor: ${propis.izvor}`);

    let articles: ArticleExtracted[] = [];

    try {
      if (propis.izvor === 'zakon.hr' && propis.url) {
        articles = await parseFromZakonHr(propis.url);
      } else if (propis.izvor === 'lokalno' && propis.lokalnaDatoteka) {
        const fullLocalPath = path.join(LOCAL_PROPISI_DIR, propis.lokalnaDatoteka);
        articles = await parseFromLocalFile(fullLocalPath);
      }

      console.log(`    🧩 Ekstrahirano ${articles.length} članaka.`);

      let savedCount = 0;
      for (let j = 0; j < articles.length; j++) {
        const art = articles[j];
        await delay(350); // pauza radi Gemini rate limita

        try {
          const embedding = await getEmbedding768(art.tekst);
          const { error: insErr } = await supabase.from('zakoni').insert({
            naziv_zakona: propis.naziv,
            clanak_broj: art.clanak_broj,
            tekst: art.tekst,
            embedding: embedding,
          });

          if (!insErr) {
            savedCount++;
            process.stdout.write(`\r    💾 Spremljeno: ${savedCount}/${articles.length} članaka...`);
          } else {
            console.error(`\n    ❌ Greška pri upisu ${art.clanak_broj}: ${insErr.message}`);
          }
        } catch (embedErr: any) {
          console.error(`\n    ❌ Greška embeddinga ${art.clanak_broj}: ${embedErr.message}`);
        }
      }

      console.log(`\n    ✅ Propis uspješno spremljen (${savedCount} članaka).\n`);
      totalArticlesSaved += savedCount;
      stats[propis.kratica] = savedCount;
    } catch (err: any) {
      console.error(`    ❌ Greška obrade propisa: ${err.message}\n`);
    }
  }

  console.log('====================================================');
  console.log('🎉 KOMPLETNA BAZA PROPISA JE IZGRAĐENA!');
  console.log(`   Ukupno spremljeno članaka: ${totalArticlesSaved}`);
  console.log('   Distribucija po propisima:');
  for (const [kratica, count] of Object.entries(stats)) {
    console.log(`    - ${kratica.padEnd(8)} : ${count} članaka`);
  }
  console.log('====================================================\n');
}

main().catch(console.error);
