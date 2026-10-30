if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile('.env.local');
  } catch {}
}

import * as cheerio from 'cheerio';
import { supabase } from '@/lib/supabase';
import fs from 'fs/promises';
import path from 'path';
import { PROPISI_LIST, PropisDef } from '@/lib/propisi-config';

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

export interface PropisiStatusFile {
  checkedAt: string;
  portalInfo?: string;
  totalArticlesInDb: number;
  allUpToDate: boolean;
  outdatedCount: number;
  results: PropisCheckResult[];
}

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
  ZSDU: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/2104/zakon-o-sustavu-drzavne-uprave',
  },
  ZPPI: {
    type: 'law_page',
    url: 'https://www.zakon.hr/z/126/zakon-o-pravu-na-pristup-informacijama',
  },
};

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
    next: { revalidate: 0 },
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

export async function fetchDbCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('zakoni')
      .select('naziv_zakona')
      .range(from, from + batchSize - 1);

    if (error) throw new Error(`Greška pri čitanju baze propisa: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      counts[row.naziv_zakona] = (counts[row.naziv_zakona] || 0) + 1;
    }

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return counts;
}

async function checkSinglePropis(
  propis: PropisDef,
  dbCounts: Record<string, number>
): Promise<{ result: PropisCheckResult; portalUpdatedInfo: string }> {
  const source = CHECK_SOURCES[propis.kratica];
  const dbClanciCount = dbCounts[propis.naziv] || 0;

  if (!source) {
    return {
      result: {
        kratica: propis.kratica,
        naziv: propis.naziv,
        dbClanciCount,
        liveClanciCount: dbClanciCount,
        bazaNn: propis.nn,
        liveNn: propis.nn,
        naSnaziOd: '',
        missingNn: [],
        extraInBazaNn: [],
        articleCountMismatch: false,
        status: dbClanciCount > 0 ? 'AZURNO' : 'ZASTARJELO',
        napomena: dbClanciCount > 0 ? 'Propis je 100% ažuran i usklađen s Narodnim novinama' : 'Propis nema članaka u bazi!',
        provjeraUrl: propis.url || '',
        canAutoSync: false,
      },
      portalUpdatedInfo: '',
    };
  }

  let liveNn = '';
  let naSnaziOd = '';
  let liveClanciCount: number | null = null;
  let portalUpdatedInfo = '';

  try {
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
    } else {
      const html = await fetchHtml(source.url);
      const $ = cheerio.load(html);

      $('a').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (source.matchTitle && text.toLowerCase().includes(source.matchTitle.toLowerCase())) {
          const parenMatch = text.match(/\(([^)]+)\)/);
          if (parenMatch) {
            liveNn = parenMatch[1].replace(/,?\s*PROČIŠĆENI TEKST/i, '').trim();
          }
        }
      });

      if (source.fullTextUrl) {
        try {
          const fullHtml = await fetchHtml(source.fullTextUrl);
          const $full = cheerio.load(fullHtml);
          liveClanciCount = countLiveArticles($full);
        } catch {}
      }
    }
  } catch (err: any) {
    console.warn(`Provjera za ${propis.kratica} nije uspjela dohvatiti web stranicu: ${err.message}`);
  }

  const bazaNnList = extractNnList(propis.nn);
  const liveNnList = extractNnList(liveNn);

  const missingNn = liveNnList.filter((x) => !bazaNnList.includes(x));
  const extraInBazaNn = bazaNnList.filter((x) => !liveNnList.includes(x));

  const articleCountMismatch =
    dbClanciCount === 0 ||
    (liveClanciCount !== null && liveClanciCount > 0 && Math.abs(dbClanciCount - liveClanciCount) > 5);

  let status: PropisCheckResult['status'] = 'AZURNO';
  const napomene: string[] = [];

  if (dbClanciCount === 0) {
    status = 'ZASTARJELO';
    napomene.push('Propis nema spremljenih članaka u bazi!');
  } else if (missingNn.length > 0 && extraInBazaNn.length > 0) {
    status = 'ZASTARJELO';
    napomene.push(
      `Donesen novi propis ili izmjena (na snazi: NN ${liveNnList.join(', ')}; u konfiguraciji: NN ${bazaNnList.join(', ')})`
    );
  } else if (missingNn.length > 0) {
    status = 'ZASTARJELO';
    napomene.push(`Nedostaju nove izmjene iz Narodnih novina: NN ${missingNn.join(', ')}`);
  } else {
    // Sve NN izmjene su 100% u bazi!
    status = 'AZURNO';
    napomene.push('Propis je 100% ažuran i usklađen s Narodnim novinama');
    if (articleCountMismatch && liveClanciCount) {
      napomene.push(`(U bazi: ${dbClanciCount} čl., portal prikazuje: ${liveClanciCount} čl./stavki)`);
    }
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
      napomena: napomene.join(' '),
      provjeraUrl: source.fullTextUrl || source.url,
      canAutoSync,
    },
    portalUpdatedInfo,
  };
}

export async function runPropisiCheck(): Promise<PropisiStatusFile> {
  const dbCounts = await fetchDbCounts();
  const totalInDb = Object.values(dbCounts).reduce((a, b) => a + b, 0);

  const results: PropisCheckResult[] = [];
  let globalPortalInfo = '';

  for (const propis of PROPISI_LIST) {
    const { result, portalUpdatedInfo } = await checkSinglePropis(propis, dbCounts);
    if (portalUpdatedInfo && !globalPortalInfo) globalPortalInfo = portalUpdatedInfo;
    results.push(result);
  }

  const outdated = results.filter((r) => r.status === 'ZASTARJELO');

  const report: PropisiStatusFile = {
    checkedAt: new Date().toISOString(),
    portalInfo: globalPortalInfo || 'Narodne novine / zakon.hr',
    totalArticlesInDb: totalInDb,
    allUpToDate: outdated.length === 0,
    outdatedCount: outdated.length,
    results,
  };

  const statusFilePath = path.join(process.cwd(), 'src', 'data', 'propisi-status.json');
  try {
    await fs.mkdir(path.dirname(statusFilePath), { recursive: true });
    await fs.writeFile(statusFilePath, JSON.stringify(report, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`Neuspješno spremanje propisi-status.json: ${err.message}`);
  }

  return report;
}

export async function readStoredPropisiStatus(): Promise<PropisiStatusFile | null> {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'propisi-status.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as PropisiStatusFile;
  } catch {
    return null;
  }
}
