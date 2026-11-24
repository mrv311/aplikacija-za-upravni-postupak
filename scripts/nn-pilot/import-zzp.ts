import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { syncLawToDatabase } from './sync-db';

export const ZZP_NAZIV = 'Zakon o zračnom prometu';
export const ZZP_KRATICA = 'ZZP';
export const ZZP_URL = 'https://www.zakon.hr/z/177/zakon-o-zracnom-prometu';
export const ZZP_NN = 'NN 69/09, 84/11, 54/13, 127/13, 92/14';

interface ParsedZzpArticle {
  clanak_broj: string;
  tekst: string;
  naslov?: string;
  struktura?: string;
  dio?: string;
  glava?: string;
  poglavlje?: string;
  odjeljak?: string;
}

function cleanSpaces(text: string): string {
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function extractBlockContentText($: cheerio.CheerioAPI, $content: cheerio.Cheerio<any>): string {
  const lines: string[] = [];
  const children = $content.children().toArray();
  if (children.length === 0) {
    const raw = cleanSpaces($content.text());
    return raw;
  }

  for (const child of children) {
    const tag = ((child as any).tagName || '').toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      $(child)
        .children('li')
        .each((idx, li) => {
          const t = cleanSpaces($(li).text());
          if (t) lines.push(tag === 'ol' ? `${idx + 1}. ${t}` : `- ${t}`);
        });
      continue;
    }
    if (tag === 'table') {
      $(child)
        .find('tr')
        .each((_, tr) => {
          const row = $(tr)
            .children('th, td')
            .map((__, td) => cleanSpaces($(td).text()))
            .get()
            .filter(Boolean)
            .join(' | ');
          if (row) lines.push(row);
        });
      continue;
    }
    const t = cleanSpaces($(child).text());
    if (t) lines.push(t);
  }

  return lines.join('\n').trim();
}

function normalizeArticleLabel(raw: string): string {
  const clean = cleanSpaces(raw);
  const m = clean.match(/^Članak\s+(\d+)\s*\.?\s*([a-z])?\.?$/i);
  if (!m) return clean;
  return m[2] ? `Članak ${m[1]}.${m[2].toLowerCase()}` : `Članak ${m[1]}.`;
}

async function fetchAndParseZzp(): Promise<ParsedZzpArticle[]> {
  console.log(`🌐 Dohvaćam pročišćeni tekst s: ${ZZP_URL}`);
  const res = await fetch(ZZP_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'hr-HR,hr;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} pri dohvaćanju ${ZZP_URL}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const blocks = $('#pretrazitekst > .cms-block').toArray();
  if (blocks.length === 0) {
    throw new Error('Nisu pronađeni .cms-block elementi unutar #pretrazitekst.');
  }

  const articles: ParsedZzpArticle[] = [];
  let currentDio = '';
  let currentGlava = '';
  let currentOdjeljak = '';

  for (const el of blocks) {
    const $b = $(el);
    const titleEl = $b.find('.cms-block-title-text, .cms-block-title-plain').first();
    const titleClass = titleEl.find('[class]').first().attr('class') || titleEl.attr('class') || '';
    const titleText = cleanSpaces(titleEl.text());
    if (!titleText) continue;

    // Zaustavi se prije zasebnih prijelaznih i završnih odredbi iz pojedinih NN novela
    // (one ponovno koriste brojeve članaka npr. Članak 16., Članak 82. koji bi se preklapali s glavnim zakonom)
    if (/^Prijelazne\s+i\s+zavr[šs]ne\s+odredbe\s+iz\s+NN/i.test(titleText)) {
      console.log(`⏹️ Zaustavljam parsiranje na bloku novela: "${titleText}"`);
      break;
    }

    // Strukturni naslovi (DIO, Glava, Odjeljak)
    if (!/^Članak\s+\d+/i.test(titleText)) {
      if (titleClass.includes('cms-zakon-h3') || /^DIO\s+/i.test(titleText)) {
        currentDio = titleText;
        currentGlava = '';
        currentOdjeljak = '';
      } else if (/^Glava\s+/i.test(titleText)) {
        currentGlava = titleText;
        currentOdjeljak = '';
      } else if (/^Odjeljak\s+/i.test(titleText) || titleClass.includes('cms-zakon-h5')) {
        currentOdjeljak = titleText;
      } else if (titleClass.includes('cms-zakon-h4')) {
        currentGlava = titleText;
        currentOdjeljak = '';
      }
      continue;
    }

    const clanakBroj = normalizeArticleLabel(titleText);
    const naslov = cleanSpaces($b.find('.cms-block-subtitle').text()) || undefined;
    const bodyText = extractBlockContentText($, $b.find('.cms-block-content').first());
    const finalText = bodyText || 'Brisan.';

    const strukturaParts = [currentDio, currentGlava, currentOdjeljak].filter(Boolean);
    const struktura = strukturaParts.length > 0 ? strukturaParts.join(' > ') : undefined;

    articles.push({
      clanak_broj: clanakBroj,
      tekst: finalText,
      naslov,
      struktura,
      dio: currentDio || undefined,
      glava: currentGlava || undefined,
      odjeljak: currentOdjeljak || undefined,
    });
  }

  return articles;
}

async function updatePropisiStructureJson(articles: ParsedZzpArticle[]) {
  const structPath = path.resolve('src', 'data', 'propisi-structure.json');
  const existing = JSON.parse(fs.readFileSync(structPath, 'utf-8'));

  existing[ZZP_NAZIV] = {};
  for (const a of articles) {
    existing[ZZP_NAZIV][a.clanak_broj] = {
      naslov: a.naslov || undefined,
      struktura: a.struktura || undefined,
      dio: a.dio || undefined,
      glava: a.glava || undefined,
      poglavlje: a.poglavlje || undefined,
      odjeljak: a.odjeljak || undefined,
    };
  }

  fs.writeFileSync(structPath, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`📚 Ažuriran src/data/propisi-structure.json s ${articles.length} članaka za ${ZZP_NAZIV}.`);
}

async function main() {
  console.log(`🏗️ POKREĆEM UVOZ: ${ZZP_NAZIV} (${ZZP_NN})`);
  const articles = await fetchAndParseZzp();
  console.log(`✅ Uspješno raščlanjeno: ${articles.length} članaka.`);

  // Spremi u .nn-cache/consolidated/ZZP.json (isti format kao svi ostali zakoni)
  const consolidated = {
    kratica: ZZP_KRATICA,
    naziv: ZZP_NAZIV,
    baseNn: 'NN 69/09',
    amendmentsNn: ['NN 84/11', 'NN 54/13', 'NN 127/13', 'NN 92/14'],
    consolidatedAt: new Date().toISOString(),
    articleCount: articles.length,
    articles,
  };
  const cachePath = path.resolve('.nn-cache', 'consolidated', `${ZZP_KRATICA}.json`);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(consolidated, null, 2), 'utf-8');
  console.log(`💾 Spremljen pročišćeni keš u ${cachePath}`);

  // Ažuriraj propisi-structure.json
  await updatePropisiStructureJson(articles);

  // Sinkroniziraj u Supabase tablicu 'zakoni' s 768-dim embeddingom
  await syncLawToDatabase(ZZP_KRATICA);
  console.log(`🎉 ${ZZP_NAZIV} (${ZZP_NN}) uspješno je spremljen u Supabase bazu!`);
}

main().catch((err) => {
  console.error('❌ Greška pri uvozu ZZP-a:', err);
  process.exit(1);
});
