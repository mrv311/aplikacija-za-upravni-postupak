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
  targetArticleKey: string; // npr. "15", "75", "83"
  amendmentArticleNum: number; // npr. 1 (članak 1. izmjena)
  type: 'zamjena_cijelog_clanka' | 'zamjena_stavka' | 'dodavanje_stavka' | 'brisanje_rijeci' | 'ostalo';
  updatedFullArticleText: string;
}

export async function consolidateZup() {
  console.log('📖 1. Učitavam temeljni tekst ZUP-a iz NN 47/2009...');
  const baseHtml = await fetchActHtml({
    slug: '2009_04_47_1065',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2009_04_47_1065.html',
  } as any);

  const baseArticles = parseBaseArticles(baseHtml);
  console.log(`   ✅ Učitano ${baseArticles.length} temeljnih članaka (Čl. 1. – Čl. 171.).`);

  console.log('\n📜 2. Učitavam tekst izmjena i dopuna iz NN 110/2021...');
  const amendHtml = await fetchActHtml({
    slug: '2021_10_110_1930',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2021_10_110_1930.html',
  } as any);
  const amendParas = extractParagraphs(amendHtml);
  const amendText = amendParas.map((p) => p.text).join('\n');
  console.log(`   ✅ Tekst izmjena učitan (${amendText.length} znakova).`);

  // Identificiraj koji članci temeljnog teksta se mijenjaju
  console.log('\n🤖 3. Pozivam Gemini za primjenu izmjena na članke...');
  const model = genAI.getGenerativeModel({
    model: 'gemini-3.8-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.0,
    },
  });

  const prompt = `Ti si stručni pravni redaktor za pročišćavanje zakona Republike Hrvatske.
Tvoj zadatak je primijeniti Zakon o izmjenama i dopuni Zakona o općem upravnom postupku (NN 110/21) na temeljni tekst zakona (NN 47/09).

TEMELJNI ČLANCI KOJI SE MIJENJAJU U NN 110/21:
${[15, 19, 23, 24, 26, 59, 63, 71, 75, 83, 89, 94, 98, 138, 165, 166, 167]
  .map((k) => {
    const art = baseArticles.find((a) => a.key === String(k));
    return `--- Članak ${k}. (NN 47/09) ---\n${art?.text || ''}\n`;
  })
  .join('\n')}

TEKST ZAKONA O IZMJENAMA I DOPUNI (NN 110/21):
${amendText}

ZADATAK:
Za svaki od članaka koji se mijenjaju (članci 15, 19, 23, 24, 26, 59, 63, 71, 75, 83, 89, 94, 98, 138, 165, 166, 167):
Izradi cjeloviti, točan, novi tekst članka nakon primjene izmjene iz NN 110/21.
Pazi na:
- Zamjenu točnih riječi (npr. brisanje riječi "središnje")
- Dodavanje novih stavaka i renumeraciju postojećih stavaka (npr. u čl. 83. dodaje se stavak 3., dosadašnji stavci 3. i 4. postaju 4. i 5.)
- Cjelovitu zamjenu članaka (npr. čl. 75., 94., 98., 138., 166., 167.)

Vrati JSON polje:
[
  {
    "targetArticleKey": "15",
    "amendmentArticleNum": 1,
    "type": "zamjena_stavka",
    "updatedFullArticleText": "Cjeloviti novi tekst članka 15. sa svim stavcima..."
  },
  ...
]`;

  const res = await model.generateContent(prompt);
  const rawJson = res.response.text();
  const patches: ArticlePatch[] = JSON.parse(rawJson);

  console.log(`   ✅ Gemini je vratio ${patches.length} uređenih članaka.`);

  // Kreiraj pročišćeni tekst
  const articleMap = new Map<string, string>();
  for (const art of baseArticles) {
    articleMap.set(art.key, art.text);
  }

  for (const patch of patches) {
    if (articleMap.has(patch.targetArticleKey)) {
      articleMap.set(patch.targetArticleKey, patch.updatedFullArticleText);
      console.log(`   ✏️ Ažuriran Članak ${patch.targetArticleKey}. (izmjena čl. ${patch.amendmentArticleNum}. NN 110/21)`);
    } else {
      console.warn(`   ⚠️ Članak ${patch.targetArticleKey} nije pronađen u temeljnom tekstu!`);
    }
  }

  // Prikaz primjera usporedbe za Članak 75. (elektronička komunikacija) i Članak 98. (sastavni dijelovi rješenja)
  console.log('\n====================================================');
  console.log('🔍 PROVJERA REZULTATA NA KLJUČNIM ČLANCIMA:');
  console.log('====================================================');

  console.log('\n--- Članak 75. (Elektronička komunikacija - novi pročišćeni tekst): ---');
  console.log(articleMap.get('75'));

  console.log('\n--- Članak 83. (Dostava u korisnički pretinac - novi pročišćeni tekst): ---');
  console.log(articleMap.get('83'));

  console.log('\n====================================================');
  console.log(`🎉 Pročišćeni ZUP ima ukupno ${articleMap.size} članaka.`);
  console.log('   Verzija 1: NN 47/09 (1.1.2010. – 31.12.2021.)');
  console.log('   Verzija 2: NN 47/09 + NN 110/21 (od 1.1.2022. nadalje)');
  console.log('====================================================');

  // Spremi u keš .nn-cache/consolidated/ZUP.json
  const fs = await import('fs/promises');
  const path = await import('path');
  const sortedKeys = Array.from(articleMap.keys()).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const consolidated = {
    kratica: 'ZUP',
    naziv: 'Zakon o općem upravnom postupku',
    baseNn: 'NN 47/09',
    amendmentsNn: ['NN 110/21'],
    consolidatedAt: new Date().toISOString(),
    articleCount: articleMap.size,
    articles: sortedKeys.map((k) => ({
      clanak_broj: `Članak ${k}.`,
      tekst: articleMap.get(k) || '',
    })),
  };
  const outPath = path.resolve('.nn-cache', 'consolidated', 'ZUP.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(consolidated, null, 2), 'utf-8');
  console.log(`💾 Spremljen ZUP u ${outPath} (${consolidated.articleCount} članaka).`);
}

consolidateZup().catch(console.error);
