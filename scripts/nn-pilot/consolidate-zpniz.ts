import { GoogleGenerativeAI } from '@google/generative-ai';
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

interface ArticlePatch {
  targetArticleKey: string;
  type: string;
  updatedFullArticleText: string;
}

async function applyAmendment(
  currentArticles: Map<string, string>,
  amendSlug: string,
  amendNn: string
): Promise<Map<string, string>> {
  console.log(`\n⚙️ Primjenjujem izmjenu ${amendNn} (${amendSlug})...`);
  const amendHtml = await fetchActHtml({
    slug: amendSlug,
    htmlUrl: `https://narodne-novine.nn.hr/clanci/sluzbeni/${amendSlug}.html`,
  } as any);

  const paras = extractParagraphs(amendHtml);
  const amendText = paras.map((p) => p.text).join('\n');

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.8-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.0,
    },
  });

  // Pošalji popis članaka koji trenutno postoje
  const currentSummary = Array.from(currentArticles.entries())
    .map(([key, text]) => `--- Članak ${key}. ---\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}`)
    .join('\n\n');

  const prompt = `Ti si vrhunski pravni redaktor za pročišćavanje zakona Republike Hrvatske.
Tvoj zadatak je točno primijeniti Zakon o izmjenama i dopunama (${amendNn}) na trenutni tekst zakona.

TRENUTNI ČLANCI ZAKONA:
${currentSummary}

TEKST ZAKONA O IZMJENAMA I DOPUNAMA (${amendNn}):
${amendText}

ZADATAK:
Pažljivo pročitaj svaki članak izmjene (${amendNn}).
Za svaki članak temeljnog zakona koji je izmijenjen, dopunjen ili zamijenjen:
1. Izradi cjeloviti novi tekst članka nakon primjene izmjene.
2. Ako se dodaje novi članak (npr. Članak 10.a ili 10a), označi targetArticleKey kao npr. "10a".
3. Ako se članak briše, postavi updatedFullArticleText na "BRISAN" ili prazan string.

Vrati JSON polje objekata:
[
  {
    "targetArticleKey": "broj_članka (npr. '6' ili '10a')",
    "type": "izmjena_stavka" | "zamjena_clanka" | "dodavanje_clanka" | "brisanje",
    "updatedFullArticleText": "Cjeloviti ažurirani tekst članka..."
  }
]`;

  const res = await model.generateContent(prompt);
  const patches: ArticlePatch[] = JSON.parse(res.response.text());

  const updatedMap = new Map(currentArticles);
  for (const patch of patches) {
    if (patch.updatedFullArticleText.trim() === 'BRISAN' || patch.type === 'brisanje') {
      updatedMap.delete(patch.targetArticleKey);
      console.log(`   ❌ Obrisan Članak ${patch.targetArticleKey}.`);
    } else {
      updatedMap.set(patch.targetArticleKey, patch.updatedFullArticleText);
      console.log(`   ✏️ Ažuriran/Dodan Članak ${patch.targetArticleKey}.`);
    }
  }

  console.log(`   ✅ Nakon ${amendNn}: ukupno ${updatedMap.size} članaka.`);
  return updatedMap;
}

async function runZpniz() {
  console.log('📖 1. Učitavam temeljni ZPNIZ iz NN 86/2012...');
  const baseHtml = await fetchActHtml({
    slug: '2012_07_86_1963',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2012_07_86_1963.html',
  } as any);

  const baseArticles = parseBaseArticles(baseHtml);
  console.log(`   ✅ Učitano ${baseArticles.length} temeljnih članaka (Čl. 1. – Čl. 47.).`);

  let currentMap = new Map<string, string>();
  for (const a of baseArticles) {
    currentMap.set(a.key, a.text);
  }

  // Kronološki primijeni izmjene
  const amends = [
    { slug: '2013_12_143_3070', nn: 'NN 143/13' },
    { slug: '2017_07_65_1495', nn: 'NN 65/17' },
    { slug: '2019_02_14_280', nn: 'NN 14/19' },
    { slug: '2026_05_48_583', nn: 'NN 48/26' },
  ];

  for (const amend of amends) {
    currentMap = await applyAmendment(currentMap, amend.slug, amend.nn);
  }

  console.log('\n====================================================');
  console.log(`🎉 ZAVRŠENA KONSOLIDACIJA ZPNIZ-a!`);
  console.log(`   Ukupno važećih članaka u pročišćenom tekstu: ${currentMap.size}`);
  console.log('====================================================');

  console.log('\n--- Primjer: Članak 1. ---');
  console.log(currentMap.get('1')?.substring(0, 300) + '...');

  console.log('\n--- Primjer: Članak 10. (rok za ozakonjenje / naknada) ---');
  console.log(currentMap.get('10')?.substring(0, 400) + '...');

  // Spremi u keš .nn-cache/consolidated/ZPNIZ.json
  const fs = await import('fs/promises');
  const path = await import('path');
  const { compareArticleKeys, formatArticleLabel } = await import('./engine');
  const sortedKeys = Array.from(currentMap.keys()).sort(compareArticleKeys);
  const consolidated = {
    kratica: 'ZPNIZ',
    naziv: 'Zakon o postupanju s nezakonito izgrađenim zgradama',
    baseNn: 'NN 86/12',
    amendmentsNn: ['NN 143/13', 'NN 65/17', 'NN 14/19', 'NN 48/26'],
    consolidatedAt: new Date().toISOString(),
    articleCount: currentMap.size,
    articles: sortedKeys.map((k) => ({
      clanak_broj: formatArticleLabel(k),
      tekst: currentMap.get(k) || '',
    })),
  };
  const outPath = path.resolve('.nn-cache', 'consolidated', 'ZPNIZ.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(consolidated, null, 2), 'utf-8');
  console.log(`💾 Spremljen ZPNIZ u ${outPath} (${consolidated.articleCount} članaka).`);
}

runZpniz().catch(console.error);
