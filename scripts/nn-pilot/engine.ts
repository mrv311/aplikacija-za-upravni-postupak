import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { fetchActHtml, parseBaseArticles, extractParagraphs } from './nn-client';

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

export interface LawAmendment {
  slug: string;
  nn: string;
  title?: string;
}

export interface LawDef {
  kratica: string;
  naziv: string;
  baseSlug: string;
  baseNn: string;
  amendments: LawAmendment[];
}

export interface ConsolidatedArticle {
  clanak_broj: string;
  tekst: string;
}

export interface ConsolidatedLaw {
  kratica: string;
  naziv: string;
  baseNn: string;
  amendmentsNn: string[];
  consolidatedAt: string;
  articleCount: number;
  articles: ConsolidatedArticle[];
}

interface ArticlePatch {
  targetArticleKey: string;
  type: string;
  updatedFullArticleText: string;
}

export interface ParsedAmendArticle {
  num: number;
  label: string;
  text: string;
  targetKeys: string[];
}

/** Prirodno sortiranje članaka zakona (npr. 1, 2, ..., 9, 9a, 9b, 10, ..., 37, 37a, 38). */
export function compareArticleKeys(a: string, b: string): number {
  const normA = a.replace(/^(?:članak|clanak)\s+/i, '').replace(/\.$/, '').trim().toLowerCase();
  const normB = b.replace(/^(?:članak|clanak)\s+/i, '').replace(/\.$/, '').trim().toLowerCase();

  const matchA = normA.match(/^(\d+)([a-zčćžšđ]?)$/i);
  const matchB = normB.match(/^(\d+)([a-zčćžšđ]?)$/i);

  if (matchA && matchB) {
    const numA = parseInt(matchA[1], 10);
    const numB = parseInt(matchB[1], 10);
    if (numA !== numB) return numA - numB;
    return (matchA[2] || '').localeCompare(matchB[2] || '');
  }

  return normA.localeCompare(normB, undefined, { numeric: true });
}

export function formatArticleLabel(key: string): string {
  const cleanKey = key.replace(/^(?:članak|clanak)\s+/i, '').replace(/\.$/, '').trim();
  return `Članak ${cleanKey}.`;
}

/**
 * Precizno raščlanjuje zakon o izmjenama i dopunama.
 * Svaki članak izmjene (Članak 1., Članak 2., ...) obuhvaća sve pripadajuće stavke i umetnute članke.
 */
export function parseAmendmentArticles(html: string): ParsedAmendArticle[] {
  const paras = extractParagraphs(html);
  const result: ParsedAmendArticle[] = [];
  let currentArticle: { num: number; label: string; lines: string[] } | null = null;

  for (const p of paras) {
    const trimmed = p.text.trim();
    // Prepoznaj početak članka zakona o izmjenama (isključivo Članak N. gdje je N cijeli broj)
    const m = trimmed.match(/^Članak\s+(\d+)\.\s*$/i);
    if (m) {
      if (currentArticle) {
        const fullText = currentArticle.lines.join('\n\n').trim();
        const targetKeys = extractTargetKeys(fullText);
        result.push({
          num: currentArticle.num,
          label: currentArticle.label,
          text: fullText,
          targetKeys,
        });
      }
      currentArticle = {
        num: parseInt(m[1], 10),
        label: `Članak ${m[1]}.`,
        lines: [],
      };
    } else if (currentArticle) {
      currentArticle.lines.push(trimmed);
    }
  }

  if (currentArticle) {
    const fullText = currentArticle.lines.join('\n\n').trim();
    const targetKeys = extractTargetKeys(fullText);
    result.push({
      num: currentArticle.num,
      label: currentArticle.label,
      text: fullText,
      targetKeys,
    });
  }

  return result;
}

/**
 * Izvlači ključeve ciljanih članaka koje tekst spominje (npr. "u članku 8.", "članak 74.a").
 */
export function extractTargetKeys(text: string): string[] {
  const matches = [
    ...text.matchAll(/(?:u\s+članku|članak|članka|iza\s+članka|ispred\s+članka)\s+(\d+(?:\.[a-zčćžšđ]|[a-zčćžšđ])?)/gi),
  ].map((m) => m[1].replace(/\./g, '').toLowerCase());
  return Array.from(new Set(matches));
}

/**
 * Prepoznaje je li članak izmjene operativan (mijenja/dodaje/briše tekst) ili samo prijelazna odredba o stupanju na snagu.
 */
function isOperativeAmendment(a: ParsedAmendArticle): boolean {
  if (a.targetKeys.length === 0) return false;
  const first120 = a.text.substring(0, 120).toLowerCase();
  if (first120.includes('stupa na snagu') && first120.includes('danom objave') && !first120.includes('u članku')) {
    return false;
  }
  return true;
}

/**
 * Primjenjuje pojedinačni zakon o izmjenama i dopunama na trenutnu mapu članaka.
 * Obrađuje operativne članke u stabilnim serijama po 5-6 članaka.
 */
async function applyAmendment(
  currentArticles: Map<string, string>,
  amendSlug: string,
  amendNn: string,
  lawNaziv: string
): Promise<Map<string, string>> {
  console.log(`\n⚙️ Primjenjujem izmjenu ${amendNn} (${amendSlug})...`);
  const amendHtml = await fetchActHtml({
    slug: amendSlug,
    htmlUrl: `https://narodne-novine.nn.hr/clanci/sluzbeni/${amendSlug}.html`,
  } as any);

  const amendArticles = parseAmendmentArticles(amendHtml);
  if (amendArticles.length === 0) {
    console.warn(`   ⚠️ Nisu pronađeni članci u izmjeni ${amendNn}!`);
    return currentArticles;
  }

  const operative = amendArticles.filter(isOperativeAmendment);
  console.log(`   📋 Pronađeno ${amendArticles.length} članaka izmjene (${operative.length} operativnih).`);

  if (operative.length === 0) {
    console.log(`   ℹ️ Nema operativnih članaka koji mijenjaju postojeći tekst.`);
    return currentArticles;
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.8-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.0,
    },
  });

  const updatedMap = new Map(currentArticles);
  const BATCH_SIZE = 6;
  const totalBatches = Math.ceil(operative.length / BATCH_SIZE);

  for (let b = 0; b < operative.length; b += BATCH_SIZE) {
    const batch = operative.slice(b, b + BATCH_SIZE);
    const batchNum = Math.floor(b / BATCH_SIZE) + 1;
    const batchLabels = batch.map((x) => x.label).join(', ');

    // Prikupi sve ciljane članke iz ove serije
    const targetKeysSet = new Set<string>();
    for (const a of batch) {
      a.targetKeys.forEach((k) => targetKeysSet.add(k));
    }

    // Pripremi tekst ciljanih članaka
    const relevantBaseSummary = Array.from(targetKeysSet)
      .map((k) => {
        const text = updatedMap.get(k);
        return text ? `--- Članak ${k}. ---\n${text}` : `--- Članak ${k}. (još ne postoji u zakonu) ---`;
      })
      .join('\n\n');

    const amendBatchText = batch.map((a) => `=== ${a.label} ===\n${a.text}`).join('\n\n');

    const prompt = `Ti si vrhunski pravni redaktor za pročišćavanje zakona Republike Hrvatske.
Tvoj zadatak je točno primijeniti ove članke izmjene (${batchLabels}) iz akta ${amendNn} na zakon "${lawNaziv}".

TRENUTNI TEKSTOVI ČLANAKA KOJI SE MIJENJAJU:
${relevantBaseSummary || '(nema postojećih tekstova - svi su novi)'}

ČLANCI IZMJENE I DOPUNE (${amendNn}):
${amendBatchText}

ZADATAK:
1. Za svaki članak temeljnog zakona koji je izmijenjen, zamijenjen ili dopunjen, izradi novi potpun tekst sa svim stavcima.
2. Ako se dodaje novi članak (npr. "74a"), postavi targetArticleKey na "74a" i u updatedFullArticleText stavi puni tekst tog novog članka.
3. Ako se članak briše, postavi targetArticleKey i stavi updatedFullArticleText na "BRISAN" ili type na "brisanje".

Vrati isključivo JSON polje objekata:
[
  {
    "targetArticleKey": "broj_članka (npr. '8' ili '74a')",
    "type": "izmjena_stavka" | "zamjena_clanka" | "dodavanje_clanka" | "brisanje",
    "updatedFullArticleText": "Cjeloviti ažurirani tekst članka..."
  }
]`;

    try {
      const res = await model.generateContent(prompt);
      const patches: ArticlePatch[] = JSON.parse(res.response.text());

      for (const patch of patches) {
        const key = patch.targetArticleKey.replace(/^(?:članak|clanak)\s+/i, '').replace(/\.$/, '').trim().toLowerCase();
        if (patch.updatedFullArticleText.trim() === 'BRISAN' || patch.type === 'brisanje') {
          updatedMap.delete(key);
          console.log(`   ❌ Obrisan Članak ${key}.`);
        } else {
          updatedMap.set(key, patch.updatedFullArticleText.trim());
          console.log(`   ✏️ [${amendNn} | serija ${batchNum}/${totalBatches}] Ažuriran/Dodan Članak ${key}.`);
        }
      }
    } catch (err: any) {
      console.error(`   ⚠️ Greška pri primjeni serije ${batchLabels}:`, err.message);
    }
  }

  console.log(`   ✅ Nakon ${amendNn}: ukupno ${updatedMap.size} važećih članaka.`);
  return updatedMap;
}

/**
 * Glavna funkcija za konsolidaciju zakona. Kešira u .nn-cache/consolidated/{kratica}.json.
 */
export async function consolidateLaw(
  law: LawDef,
  options: { force?: boolean } = {}
): Promise<ConsolidatedLaw> {
  const cacheFile = path.resolve('.nn-cache', 'consolidated', `${law.kratica.toUpperCase()}.json`);

  if (!options.force) {
    try {
      const raw = await fs.readFile(cacheFile, 'utf-8');
      const cached = JSON.parse(raw) as ConsolidatedLaw;
      console.log(`⚡ Učitavam već konsolidirani ${law.kratica} iz keša (${cached.articles.length} članaka).`);
      return cached;
    } catch {}
  }

  console.log(`\n=============================================================`);
  console.log(`🚀 POKREĆEM KONSOLIDACIJU: ${law.kratica} – ${law.naziv}`);
  console.log(`   Temeljni: ${law.baseNn} (${law.baseSlug})`);
  console.log(`   Izmjene (${law.amendments.length}): ${law.amendments.map((a) => a.nn).join(', ')}`);
  console.log(`=============================================================`);

  // 1. Učitaj temeljni akt
  const baseHtml = await fetchActHtml({
    slug: law.baseSlug,
    htmlUrl: `https://narodne-novine.nn.hr/clanci/sluzbeni/${law.baseSlug}.html`,
  } as any);

  const parsedBase = parseBaseArticles(baseHtml);
  console.log(`✅ Učitano ${parsedBase.length} temeljnih članaka iz ${law.baseNn}.`);

  let currentMap = new Map<string, string>();
  for (const a of parsedBase) {
    const cleanKey = a.key.replace(/^(?:članak|clanak)\s+/i, '').replace(/\.$/, '').trim().toLowerCase();
    currentMap.set(cleanKey, a.text);
  }

  // 2. Primjenjuj izmjene kronološki
  for (const amend of law.amendments) {
    currentMap = await applyAmendment(currentMap, amend.slug, amend.nn, law.naziv);
  }

  // 3. Sortiraj članke prirodnim redoslijedom
  const sortedKeys = Array.from(currentMap.keys()).sort(compareArticleKeys);
  const articles: ConsolidatedArticle[] = sortedKeys.map((key) => ({
    clanak_broj: formatArticleLabel(key),
    tekst: currentMap.get(key) || '',
  }));

  const consolidated: ConsolidatedLaw = {
    kratica: law.kratica,
    naziv: law.naziv,
    baseNn: law.baseNn,
    amendmentsNn: law.amendments.map((a) => a.nn),
    consolidatedAt: new Date().toISOString(),
    articleCount: articles.length,
    articles,
  };

  // 4. Spremi u keš
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(consolidated, null, 2), 'utf-8');
  console.log(`💾 Spremljen pročišćeni tekst u ${cacheFile} (${articles.length} članaka).`);

  return consolidated;
}
