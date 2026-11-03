import fs from 'fs';
import path from 'path';
import { parseBaseArticles, fetchActHtml } from './nn-pilot/nn-client';

interface ArticleStructureMeta {
  naslov?: string;
  struktura?: string;
  dio?: string;
  glava?: string;
  poglavlje?: string;
  odjeljak?: string;
}

const LAW_BASE_SLUGS: Record<string, { slug: string; url: string }> = {
  'Zakon o zemljišnim knjigama': {
    slug: '2019_06_63_1234',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2019_06_63_1234.html',
  },
  'Zakon o općem upravnom postupku': {
    slug: '2009_04_47_1065',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2009_04_47_1065.html',
  },
  'Zakon o upravnim sporovima': {
    slug: '2024_03_36_564',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2024_03_36_564.html',
  },
  'Zakon o gradnji': {
    slug: '2013_12_153_3221',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2013_12_153_3221.html',
  },
  'Zakon o komunalnom gospodarstvu': {
    slug: '2018_07_68_1393',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2018_07_68_1393.html',
  },
  'Zakon o sustavu državne uprave': {
    slug: '2019_07_66_1290',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2019_07_66_1290.html',
  },
  'Uredba o uredskom poslovanju': {
    slug: '2021_07_75_1415',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2021_07_75_1415.html',
  },
  'Uredba o Tarifi upravnih pristojbi': {
    slug: '2022_12_156_2520',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2022_12_156_2520.html',
  },
  'Zakon o pravu na pristup informacijama': {
    slug: '2013_02_25_403',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2013_02_25_403.html',
  },
  'Opći porezni zakon': {
    slug: '2016_12_115_2519',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2016_12_115_2519.html',
  },
  'Pravilnik o načinu obračuna površine i obujma u projektima zgrada': {
    slug: '2010_07_90_2544',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2010_07_90_2544.html',
  },
  'Zakon o postupanju s nezakonito izgrađenim zgradama': {
    slug: '2012_07_86_1963',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2012_07_86_1963.html',
  },
  'Zakon o vodama': {
    slug: '2019_07_66_1285',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2019_07_66_1285.html',
  },
  'Zakon o vodnim uslugama': {
    slug: '2019_07_66_1286',
    url: 'https://narodne-novine.nn.hr/clanci/sluzbeni/2019_07_66_1286.html',
  },
};

async function build() {
  console.log('🏗️ Generiram proširenu strukturu propisa RH...');
  const structureData: Record<string, Record<string, ArticleStructureMeta>> = {};

  for (const [nazivZakona, meta] of Object.entries(LAW_BASE_SLUGS)) {
    try {
      console.log(`\nObrađujem: ${nazivZakona} (${meta.slug})...`);
      const html = await fetchActHtml({
        slug: meta.slug,
        htmlUrl: meta.url,
      } as any);

      const articles = parseBaseArticles(html);
      structureData[nazivZakona] = {};

      for (const a of articles) {
        structureData[nazivZakona][a.label] = {
          naslov: a.caption || undefined,
          struktura: a.section || undefined,
          dio: a.dio || undefined,
          glava: a.glava || undefined,
          poglavlje: a.poglavlje || undefined,
          odjeljak: a.odjeljak || undefined,
        };
      }

      console.log(`  ✅ ${articles.length} članaka obrađeno (${articles.filter(a => a.section).length} sa strukturom).`);
    } catch (err: any) {
      console.error(`  ❌ Greška za ${nazivZakona}:`, err.message);
    }
  }

  const outPath = path.resolve('src/data/propisi-structure.json');
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, JSON.stringify(structureData, null, 2), 'utf-8');
  console.log(`\n🎉 Spremljena struktura u: ${outPath}`);
}

build().catch(console.error);
