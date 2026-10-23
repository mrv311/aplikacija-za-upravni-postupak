import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { PROPISI_LIST, PropisDef } from '../src/lib/propisi-config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GEMINI_API_KEY =
  process.env.GOOGLE_GEMINI_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mapa službenih izvora na zakon.hr za provjeru svih 14 propisa (uključujući i one uvezene lokalno)
const CHECK_SOURCES: Record<
  string,
  {
    type: 'law_page' | 'pp_index';
    url: string;
    fullTextUrl?: string;
    matchTitle?: string;
  }
> = {
  ZUP: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/65/zakon-o-opcem-upravnom-postupku',
  },
  ZUS: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/101/zakon-o-upravnim-sporovima',
  },
  UUP: {
    type: 'pp_index',
    url: 'https://www.zakon.hr/cms.htm?id=13977',
    fullTextUrl:
      'https://www.zakon.hr/c/podzakonski-propis/49213/nn-75-2021-%282.7.2021.%29%2C-uredba-o-uredskom-poslovanju',
    matchTitle: 'Uredba o uredskom poslovanju',
  },
  UTUP: {
    type: 'pp_index',
    url: 'https://www.zakon.hr/cms.htm?id=54724',
    fullTextUrl:
      'https://www.zakon.hr/c/podzakonski-propis/55507/nn-156-2022-%2830.12.2022.%29%2C-uredba-o-tarifi-upravnih-pristojbi',
    matchTitle: 'Uredba o Tarifi upravnih pristojbi',
  },
  ZOV: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/124/zakon-o-vodama',
  },
  ZFVG: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/238/zakon-o-financiranju-vodnoga-gospodarstva',
  },
  ZVU: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/2105/zakon-o-vodnim-uslugama',
  },
  'U-NUV': {
    type: 'pp_index',
    url: 'https://www.zakon.hr/cms.htm?id=14693',
    matchTitle: 'Uredba o visini naknade za uređenje voda',
  },
  'P-NUV': {
    type: 'pp_index',
    url: 'https://www.zakon.hr/cms.htm?id=14693',
    matchTitle: 'Pravilnik o obračunu i naplati naknade za uređenje voda',
  },
  'U-NZZV': {
    type: 'pp_index',
    url: 'https://www.zakon.hr/cms.htm?id=14693',
    matchTitle: 'Uredba o visini naknade za zaštitu voda',
  },
  ZG: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/690/zakon-o-gradnji',
  },
  ZKG: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/319/zakon-o-komunalnom-gospodarstvu',
  },
  ZPNIZ: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/486/zakon-o-postupanju-s-nezakonito-izgradenim-zgradama',
  },
  OPZ: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/100/opci-porezni-zakon',
  },
};

export interface PropisCheckResult {
  kratica: string;
  naziv: string;
  dbClanciCount: number;
  liveClanciCount: number | null;
  bazaNn: string;
  liveNn: string;
  naSnaziOd: string;
  missingNn: string[];
  extraInBazaNn: string[];
  articleCountMismatch: boolean;
  status: 'AZURNO' | 'ZASTARJELO' | 'UPOZORENJE';
  napomena: string;
  provjeraUrl: string;
  canAutoSync: boolean;
}

function extractNnList(nnString: string): string[] {
  const matches = nnString.match(/\b\d{1,3}\/\d{2}(?:\b|$)/g) || [];
  return [...new Set(matches.map((m) => m.replace(/^0+/, '')))];
}

const htmlCache = new Map<string, string>();
async function fetchHtml(url: string): Promise<string> {
  if (htmlCache.has(url)) return htmlCache.get(url)!;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} za ${url}`);
  }
  const html = await res.text();
  htmlCache.set(url, html);
  return html;
}

function countLiveArticles($: cheerio.CheerioAPI): number {
  let count = 0;
  $('#pretrazitekst .cms-block').each((_, el) => {
    const titleText = $(el).find('.cms-block-title-plain').text().trim();
    if (/^(?:Članak\s+\d+[a-z]?|Tar\.\s*br\.\s*\d+)\.?/i.test(titleText)) {
      count++;
    }
  });
  return count;
}

interface ArticleExtracted {
  clanak_broj: string;
  naslov: string;
  tekst: string;
}

async function parseArticlesFromZakonHrUrl(url: string): Promise<ArticleExtracted[]> {
  const html = await fetchHtml(url);
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

    const clanakMatch = titleText.match(/^Članak\s+(\d+[a-z]?)\.?/i);
    const tarMatch = titleText.match(/^Tar\.\s*br\.\s*(\d+[a-z]?)\.?/i);
    if (!clanakMatch && !tarMatch) return;

    let clanakBroj = clanakMatch
      ? `Članak ${clanakMatch[1].toLowerCase()}.`
      : `Tar. br. ${tarMatch![1].toLowerCase()}.`;

    if (currentSection && clanakMatch) {
      const nnMatch = currentSection.match(/NN\s+\d+\/\d+/i);
      const tag = nnMatch ? `(${nnMatch[0]})` : '(Prijelazne odredbe)';
      if (articles.some((a) => a.clanak_broj === clanakBroj)) {
        clanakBroj = `${clanakBroj} ${tag}`;
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

async function getEmbedding768(text: string, retries = 3): Promise<number[]> {
  if (!genAI) throw new Error('Nedostaje Gemini API ključ za generiranje embeddinga.');
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
      await delay(4000);
    }
  }
  return [];
}

async function autoSyncPropis(r: PropisCheckResult): Promise<number> {
  console.log(`\n🔄 Automatsko ažuriranje propisa [${r.kratica}] ${r.naziv} sa: ${r.provjeraUrl}`);
  const articles = await parseArticlesFromZakonHrUrl(r.provjeraUrl);
  if (articles.length === 0) {
    console.log(`   ⚠️ Nije moguće automatski ekstrahirati članke s poveznice.`);
    return r.dbClanciCount;
  }

  console.log(`   🧩 Ekstrahirano ${articles.length} članaka/stavki. Brišem stare zapise iz baze...`);
  const { error: delError } = await supabase.from('zakoni').delete().eq('naziv_zakona', r.naziv);
  if (delError) {
    throw new Error(`Greška pri brisanju starih članaka za ${r.naziv}: ${delError.message}`);
  }

  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    process.stdout.write(`   💾 Spremam i vektoriziram: ${i + 1}/${articles.length} (${art.clanak_broj})...\r`);
    const textToEmbed = `${r.naziv} ${art.clanak_broj}\n${art.naslov ? art.naslov + '\n' : ''}${art.tekst}`;
    const embedding = await getEmbedding768(textToEmbed);

    const { error: insError } = await supabase.from('zakoni').insert({
      naziv_zakona: r.naziv,
      clanak_broj: art.clanak_broj,
      tekst: art.tekst,
      embedding,
    });

    if (insError) {
      console.error(`\nGreška pri unosu članka ${art.clanak_broj}:`, insError.message);
    }
  }

  console.log(`\n   ✅ Uspješno ažurirano (${articles.length} članaka/stavki)!`);
  return articles.length;
}

async function checkSinglePropis(
  propis: PropisDef,
  dbCounts: Record<string, number>
): Promise<{ result: PropisCheckResult; portalUpdatedInfo: string }> {
  const source = CHECK_SOURCES[propis.kratica];
  const dbClanciCount = dbCounts[propis.naziv] || 0;

  let liveNn = '';
  let naSnaziOd = '';
  let liveClanciCount: number | null = null;
  let portalUpdatedInfo = '';

  if (source.type === 'law_page') {
    const html = await fetchHtml(source.url);
    const $ = cheerio.load(html);

    $('p, div, span').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (!liveNn && /^NN\s+\d+\/\d+/.test(t) && t.length < 200) {
        liveNn = t;
      }
      if (!naSnaziOd && /^na snazi od/i.test(t) && t.length < 100) {
        naSnaziOd = t;
      }
      if (!portalUpdatedInfo && t.startsWith('Baza je ažurirana') && t.length < 120) {
        portalUpdatedInfo = t;
      }
    });

    liveClanciCount = countLiveArticles($);
  } else if (source.type === 'pp_index') {
    const html = await fetchHtml(source.url);
    const $ = cheerio.load(html);

    $('p, li, div').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (
        source.matchTitle &&
        t.includes(source.matchTitle) &&
        !t.toUpperCase().includes('PRESTALO VAŽITI') &&
        !t.toUpperCase().includes('PRESTAO VAŽITI') &&
        t.includes('NN ') &&
        t.length < 250
      ) {
        const parenMatch = t.match(/\((NN[^)]+)\)/);
        if (parenMatch) {
          liveNn = parenMatch[1].replace(/,?\s*PROČIŠĆENI TEKST/i, '').trim();
        }
      }
    });

    if (source.fullTextUrl) {
      const fullHtml = await fetchHtml(source.fullTextUrl);
      const $full = cheerio.load(fullHtml);
      liveClanciCount = countLiveArticles($full);
    }
  }

  const bazaNnList = extractNnList(propis.nn);
  const liveNnList = extractNnList(liveNn);

  const missingNn = liveNnList.filter((x) => !bazaNnList.includes(x));
  const extraInBazaNn = bazaNnList.filter((x) => !liveNnList.includes(x));

  const articleCountMismatch =
    dbClanciCount === 0 ||
    (liveClanciCount !== null && Math.abs(dbClanciCount - liveClanciCount) > 5);

  let status: PropisCheckResult['status'] = 'AZURNO';
  const napomene: string[] = [];

  if (dbClanciCount === 0) {
    status = 'ZASTARJELO';
    napomene.push('Propis nema spremljenih članaka u bazi!');
  }

  if (missingNn.length > 0 && extraInBazaNn.length > 0) {
    status = 'ZASTARJELO';
    napomene.push(
      `Donesen novi propis ili izmjena (na snazi: NN ${liveNnList.join(', ')}; u konfiguraciji stoji: NN ${bazaNnList.join(', ')})`
    );
  } else if (missingNn.length > 0) {
    status = 'ZASTARJELO';
    napomene.push(`Nedostaju nove izmjene: NN ${missingNn.join(', ')}`);
  }

  if (articleCountMismatch && liveClanciCount !== null) {
    if (status === 'AZURNO') status = 'UPOZORENJE';
    napomene.push(`U bazi je ${dbClanciCount} čl., a na portalu ${liveClanciCount} čl./stavki`);
  }

  if (napomene.length === 0) {
    napomene.push('Propis je 100% ažuran i usklađen s Narodnim novinama');
  }

  const canAutoSync = source.type === 'law_page' || Boolean(source.fullTextUrl);

  return {
    result: {
      kratica: propis.kratica,
      naziv: propis.naziv,
      dbClanciCount,
      liveClanciCount,
      bazaNn: propis.nn,
      liveNn: liveNn || propis.nn,
      naSnaziOd,
      missingNn,
      extraInBazaNn,
      articleCountMismatch,
      status,
      napomena: napomene.join(' | '),
      provjeraUrl: source.fullTextUrl || source.url,
      canAutoSync,
    },
    portalUpdatedInfo,
  };
}

async function fetchDbCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('zakoni')
      .select('naziv_zakona')
      .range(from, from + batchSize - 1);

    if (error) throw new Error(`Greška pri čitanju baze: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      counts[row.naziv_zakona] = (counts[row.naziv_zakona] || 0) + 1;
    }

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return counts;
}

async function main() {
  const doFix = process.argv.includes('--fix') || process.argv.includes('--update');

  console.log('================================================================================');
  console.log('🔍 TJEDNA PROVJERA AŽURNOSTI BAZE PROPISA (zakon.hr / Narodne novine)');
  console.log(`📅 Vrijeme provjere: ${new Date().toLocaleString('hr-HR')}`);
  console.log('================================================================================\n');

  let dbCounts = await fetchDbCounts();
  let totalInDb = Object.values(dbCounts).reduce((a, b) => a + b, 0);
  console.log(`📦 Trenutno stanje u Supabase tablici "zakoni": ${totalInDb} članaka u ${Object.keys(dbCounts).length} propisa.\n`);

  let results: PropisCheckResult[] = [];
  let globalPortalInfo = '';

  for (const propis of PROPISI_LIST) {
    process.stdout.write(`⏳ Provjeravam [${propis.kratica}] ${propis.naziv}...\r`);
    const { result, portalUpdatedInfo } = await checkSinglePropis(propis, dbCounts);
    if (portalUpdatedInfo && !globalPortalInfo) globalPortalInfo = portalUpdatedInfo;
    results.push(result);
  }

  console.log(' '.repeat(80));
  if (globalPortalInfo) {
    console.log(`ℹ️  Status izvora: ${globalPortalInfo}\n`);
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(
    `${'KRATICA'.padEnd(8)} | ${'STATUS'.padEnd(13)} | ${'ČL. (BAZA/WEB)'.padEnd(15)} | ${'STANJE / NAPOMENA'}`
  );
  console.log('--------------------------------------------------------------------------------');

  for (const r of results) {
    const icon = r.status === 'AZURNO' ? '✅ AŽURNO' : r.status === 'ZASTARJELO' ? '❌ ZASTARJELO' : '⚠️ PROVJERI';
    const clanciStr = `${r.dbClanciCount}/${r.liveClanciCount ?? r.dbClanciCount}`;
    console.log(
      `${r.kratica.padEnd(8)} | ${icon.padEnd(13)} | ${clanciStr.padEnd(15)} | ${r.napomena}`
    );
  }
  console.log('--------------------------------------------------------------------------------\n');

  let outdated = results.filter((r) => r.status !== 'AZURNO');

  if (doFix && outdated.length > 0) {
    console.log(`🛠️  Pokrenut je "--fix" mod: automatski ažuriram ${outdated.length} propisa...`);
    for (const o of outdated) {
      if (o.canAutoSync) {
        await autoSyncPropis(o);
      }
    }

    // Ponovna provjera nakon ažuriranja
    dbCounts = await fetchDbCounts();
    totalInDb = Object.values(dbCounts).reduce((a, b) => a + b, 0);
    results = [];
    for (const propis of PROPISI_LIST) {
      const { result } = await checkSinglePropis(propis, dbCounts);
      results.push(result);
    }
    outdated = results.filter((r) => r.status !== 'AZURNO');
    console.log(`\n✅ Baza je osvježena! Novo ukupno stanje: ${totalInDb} članaka.\n`);
  }

  if (outdated.length === 0) {
    console.log('🎉 SVI PROPISI U BAZI SU 100% AŽURNI I USKLAĐENI S NARODNIM NOVINAMA!');
  } else {
    console.log(`⚠️  Pronađeno ${outdated.length} propisa koji zahtijevaju ažuriranje ili usklađenje:`);
    for (const o of outdated) {
      console.log(`   🔸 [${o.kratica}] ${o.naziv}`);
      console.log(`      - U bazi/konfiguraciji : ${o.bazaNn} (${o.dbClanciCount} čl.)`);
      console.log(`      - Trenutno na snazi    : ${o.liveNn} (${o.liveClanciCount ?? '?'} čl.) ${o.naSnaziOd ? `[${o.naSnaziOd}]` : ''}`);
      console.log(`      - Detalj               : ${o.napomena}`);
      console.log(`      - Poveznica            : ${o.provjeraUrl}\n`);
    }
    console.log(`💡 Za automatsko ažuriranje svih zastarjelih propisa pokreni: npm run check-propisi -- --fix\n`);
  }

  // Spremi izvještaj u src/data/propisi-status.json kako bi i frontend znao status zadnje provjere
  const statusFilePath = path.join(process.cwd(), 'src', 'data', 'propisi-status.json');
  await fs.mkdir(path.dirname(statusFilePath), { recursive: true });
  await fs.writeFile(
    statusFilePath,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        portalInfo: globalPortalInfo,
        totalArticlesInDb: totalInDb,
        allUpToDate: outdated.length === 0,
        outdatedCount: outdated.length,
        results,
      },
      null,
      2
    ),
    'utf-8'
  );
  console.log(`💾 Izvještaj o provjeri spremljen u: src/data/propisi-status.json`);
}

main().catch((err) => {
  console.error('❌ Greška pri provjeri ažurnosti propisa:', err);
  process.exit(1);
});
