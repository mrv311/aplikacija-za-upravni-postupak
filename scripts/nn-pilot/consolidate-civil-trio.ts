import fs from 'fs/promises';
import path from 'path';
import { fetchActHtml, parseBaseArticles } from './nn-client';
import { ConsolidatedArticle, ConsolidatedLaw } from './engine';
import { syncLawToDatabase } from './sync-db';

interface TrioLawDef {
  kratica: string;
  naziv: string;
  baseSlug: string;
  baseNn: string;
  amendmentsNn: string[];
}

const TRIO_LAWS: TrioLawDef[] = [
  {
    kratica: 'ZN',
    naziv: 'Zakon o nasljeđivanju',
    baseSlug: '2003_03_48_604',
    baseNn: 'NN 48/03',
    amendmentsNn: ['NN 163/03', 'NN 35/05', 'NN 127/13', 'NN 33/15', 'NN 14/19'],
  },
  {
    kratica: 'OZ',
    naziv: 'Ovršni zakon',
    baseSlug: '2012_10_112_2421',
    baseNn: 'NN 112/12',
    amendmentsNn: ['NN 25/13', 'NN 93/14', 'NN 55/16', 'NN 73/17', 'NN 131/20', 'NN 114/22', 'NN 6/24'],
  },
  {
    kratica: 'ZOO',
    naziv: 'Zakon o obveznim odnosima',
    baseSlug: '2005_03_35_707',
    baseNn: 'NN 35/05',
    amendmentsNn: ['NN 41/08', 'NN 125/11', 'NN 78/15', 'NN 29/18', 'NN 126/21', 'NN 114/22', 'NN 156/22', 'NN 155/23'],
  },
];

async function processLaw(def: TrioLawDef) {
  console.log(`\n=============================================================`);
  console.log(`🏛️ OBRADA: ${def.kratica} – ${def.naziv} (${def.baseNn})`);
  console.log(`=============================================================`);

  const html = await fetchActHtml({
    slug: def.baseSlug,
    htmlUrl: `https://narodne-novine.nn.hr/clanci/sluzbeni/${def.baseSlug}.html`,
  } as any);

  const baseArticles = parseBaseArticles(html);
  console.log(`📋 Učitano ${baseArticles.length} članaka iz temeljnog akta.`);

  const consolidatedArticles: ConsolidatedArticle[] = baseArticles.map((a) => ({
    clanak_broj: a.label,
    naslov: a.caption || undefined,
    struktura: a.section || undefined,
    dio: a.dio || undefined,
    glava: a.glava || undefined,
    poglavlje: a.poglavlje || undefined,
    odjeljak: a.odjeljak || undefined,
    tekst: a.text.trim(),
  }));

  const lawObj: ConsolidatedLaw = {
    kratica: def.kratica,
    naziv: def.naziv,
    baseNn: def.baseNn,
    amendmentsNn: def.amendmentsNn,
    consolidatedAt: new Date().toISOString(),
    articleCount: consolidatedArticles.length,
    articles: consolidatedArticles,
  };

  const cacheDir = path.resolve('.nn-cache', 'consolidated');
  await fs.mkdir(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, `${def.kratica}.json`);
  await fs.writeFile(cacheFile, JSON.stringify(lawObj, null, 2), 'utf-8');
  console.log(`💾 Spremljen JSON: ${cacheFile} (${lawObj.articleCount} članaka).`);

  console.log(`📤 Sinkroniziram ${def.kratica} u Supabase tablicu 'zakoni'...`);
  await syncLawToDatabase(def.kratica);
  console.log(`🎉 ${def.naziv} uspješno sinkroniziran!`);
}

async function main() {
  for (const law of TRIO_LAWS) {
    await processLaw(law);
  }
  console.log('\n🌟 ZAVRŠENA KONSOLIDACIJA ZA SVA TRI ZAKONA (ZN, OZ, ZOO)!');
}

main().catch(console.error);
