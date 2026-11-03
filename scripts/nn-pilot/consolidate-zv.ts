import fs from 'fs/promises';
import path from 'path';
import { fetchActHtml, parseBaseArticles } from './nn-client';
import { ConsolidatedArticle, ConsolidatedLaw } from './engine';
import { syncLawToDatabase } from './sync-db';

async function main() {
  console.log('🏛️ POKREĆEM KONSOLIDACIJU: Zakon o vlasništvu i drugim stvarnim pravima (ZV)');

  // 1. Preuzmi službeni pročišćeni tekst NN 81/15
  console.log('📥 Preuzimam službeni pročišćeni tekst Hrvatskoga sabora (NN 81/15)...');
  const html81 = await fetchActHtml({
    slug: '2015_07_81_1548',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2015_07_81_1548.html',
  } as any);

  const baseArticles = parseBaseArticles(html81);
  console.log(`📋 Ukupno pronađeno u NN 81/15: ${baseArticles.length} članaka.`);

  // ZV ima članke od 1. do 396. (uključujući npr. 390.a).
  // Iza članka 396. nalaze se prijelazne odredbe prethodnih zakona o izmjenama.
  let lastMainIndex = -1;
  for (let i = 0; i < baseArticles.length; i++) {
    if (baseArticles[i].label.trim() === 'Članak 396.') {
      lastMainIndex = i;
      break;
    }
  }

  if (lastMainIndex === -1) {
    throw new Error('Nisam pronašao završni Članak 396. u pročišćenom tekstu!');
  }

  const mainArticles = baseArticles.slice(0, lastMainIndex + 1);
  console.log(`✅ Zadržano ${mainArticles.length} glavnih članaka ZV-a (Čl. 1. do Čl. 396.).`);

  // 2. Preuzmi i primijeni službeni Ispravak NN 94/17 za članke 71. i 73.
  console.log('📥 Preuzimam i primjenjujem službeni Ispravak pročišćenog teksta (NN 94/17)...');
  const html94 = await fetchActHtml({
    slug: '2017_09_94_2194',
    htmlUrl: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2017_09_94_2194.html',
  } as any);

  const ispravakArticles = parseBaseArticles(html94);
  const ispravakMap = new Map<string, typeof ispravakArticles[0]>();
  for (const ia of ispravakArticles) {
    ispravakMap.set(ia.label.trim().toLowerCase(), ia);
  }

  const consolidatedArticles: ConsolidatedArticle[] = [];

  for (const a of mainArticles) {
    const key = a.label.trim().toLowerCase();
    const ispravak = ispravakMap.get(key);

    if (ispravak) {
      console.log(`   ✏️ Primijenjen ispravak NN 94/17 na ${a.label} (${ispravak.caption || a.caption})`);
      consolidatedArticles.push({
        clanak_broj: a.label,
        naslov: ispravak.caption || a.caption || undefined,
        struktura: a.section || undefined,
        dio: a.dio || undefined,
        glava: a.glava || undefined,
        poglavlje: a.poglavlje || undefined,
        odjeljak: a.odjeljak || undefined,
        tekst: ispravak.text.trim(),
      });
    } else {
      consolidatedArticles.push({
        clanak_broj: a.label,
        naslov: a.caption || undefined,
        struktura: a.section || undefined,
        dio: a.dio || undefined,
        glava: a.glava || undefined,
        poglavlje: a.poglavlje || undefined,
        odjeljak: a.odjeljak || undefined,
        tekst: a.text.trim(),
      });
    }
  }

  const result: ConsolidatedLaw = {
    kratica: 'ZV',
    naziv: 'Zakon o vlasništvu i drugim stvarnim pravima',
    baseNn: 'NN 91/96',
    amendmentsNn: [
      'NN 68/98', 'NN 137/99', 'NN 22/00', 'NN 73/00', 'NN 129/00',
      'NN 114/01', 'NN 79/06', 'NN 141/06', 'NN 146/08', 'NN 38/09',
      'NN 153/09', 'NN 143/12', 'NN 152/14', 'NN 81/15', 'NN 94/17'
    ],
    consolidatedAt: new Date().toISOString(),
    articleCount: consolidatedArticles.length,
    articles: consolidatedArticles,
  };

  const cacheDir = path.resolve('.nn-cache', 'consolidated');
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, 'ZV.json');
  await fs.writeFile(cacheFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`💾 Spremljen konsolidirani tekst ZV u ${cacheFile} (${result.articleCount} članaka).`);

  // 3. Sinkroniziraj u bazu
  console.log('\n📤 Sinkroniziram ZV u Supabase tablicu "zakoni"...');
  await syncLawToDatabase('ZV');
  console.log('🎉 Zakon o vlasništvu i drugim stvarnim pravima uspješno je sinkroniziran u bazu!');
}

main().catch(console.error);
