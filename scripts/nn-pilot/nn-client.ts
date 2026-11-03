/**
 * Klijent za službene Narodne novine (narodne-novine.nn.hr).
 *
 * - Popis akata u pojedinom broju NN (javna stranica pretrage, GET).
 * - Dohvat HTML teksta akta i raščlamba na članke.
 * - ELI metapodaci (POST /api/act) – npr. veza "amends" izmjene prema temeljnom aktu.
 *
 * Poštuje zamolbu NN-a: najviše ~3 upita u sekundi (ovdje namjerno sporije, 1 upit / 700 ms)
 * i lokalno kešira sve odgovore u .nn-cache/ kako se isti dokument ne bi dohvaćao više puta.
 */
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

const BASE = 'https://narodne-novine.nn.hr';
const USER_AGENT = 'UpravniPostupakApp/0.1 (pilot uvoza propisa iz NN; interna upotreba)';
const CACHE_DIR = path.join(process.cwd(), '.nn-cache');
const MIN_INTERVAL_MS = 700;

let lastRequestAt = 0;

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function cached(key: string, producer: () => Promise<string>): Promise<string> {
  const file = path.join(CACHE_DIR, key.replace(/[^a-zA-Z0-9_.-]/g, '_'));
  try {
    return await fs.readFile(file, 'utf-8');
  } catch {}
  const value = await producer();
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, value, 'utf-8');
  return value;
}

async function httpGet(url: string): Promise<string> {
  await throttle();
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} za ${url}`);
  return await res.text();
}

export interface NnActRef {
  year: number;
  issue: number;
  actNum: number;
  /** npr. 2009_04_47_1065 */
  slug: string;
  title: string;
  htmlUrl: string;
  eliUrl: string;
}

/** Popis svih akata službenog dijela u jednom broju NN. */
export async function listIssueActs(year: number, issue: number): Promise<NnActRef[]> {
  const url = `${BASE}/search.aspx?sortiraj=4&kategorija=1&godina=${year}&broj=${issue}&rpp=500&qtype=1&pretraga=da`;
  const html = await cached(`issue_${year}_${issue}.html`, () => httpGet(url));
  const $ = cheerio.load(html);
  const seen = new Map<string, NnActRef>();

  $('a[href*="clanci/sluzbeni/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/clanci\/sluzbeni\/((\d{4})_(\d{2})_(\d+)_(\d+))\.html/);
    if (!m) return;
    $(el).find('.score').remove();
    const title = $(el).text().replace(/\s+/g, ' ').replace(/\s+0$/, '').trim();
    const slug = m[1];
    const existing = seen.get(slug);
    if (existing) {
      if (!existing.title && title) existing.title = title;
      return;
    }
    seen.set(slug, {
      year: parseInt(m[2], 10),
      issue: parseInt(m[4], 10),
      actNum: parseInt(m[5], 10),
      slug,
      title,
      htmlUrl: `${BASE}/clanci/sluzbeni/${slug}.html`,
      eliUrl: `${BASE}/eli/sluzbeni/${m[2]}/${parseInt(m[4], 10)}/${m[5]}`,
    });
  });

  return [...seen.values()];
}

/** Sirovi HTML akta (keširano). */
export async function fetchActHtml(ref: NnActRef): Promise<string> {
  return cached(`act_${ref.slug}.html`, () => httpGet(ref.htmlUrl));
}

export interface ParsedParagraph {
  cls: string;
  text: string;
}

/** Svi odlomci tijela akta, redom, s CSS klasom (za raščlambu). */
export function extractParagraphs(html: string): ParsedParagraph[] {
  const $ = cheerio.load(html);
  const root = $('.sl-content').first();
  const out: ParsedParagraph[] = [];
  root.find('p, td').each((_, el) => {
    // Odlomke unutar tablica uzimamo kao tekst tablice; izbjegni duplikate p unutar td
    if (el.tagName === 'p' && $(el).parents('td').length > 0) return;
    const html = $(el).html() || '';
    const text = cheerio
      .load(`<div>${html.replace(/<br\s*\/?>/gi, '\n')}</div>`)('div')
      .text()
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
    if (!text) return;
    out.push({ cls: ($(el).attr('class') || '').trim(), text });
  });
  return out;
}

/** Puni tekst akta kao običan tekst (za slanje AI-u). */
export function actPlainText(html: string): string {
  return extractParagraphs(html)
    .map((p) => p.text)
    .join('\n');
}

export interface BaseArticle {
  /** Normalizirani broj, npr. "5", "5a" */
  key: string;
  /** Prikaz, npr. "Članak 5.a" */
  label: string;
  /** Naslov iznad članka (npr. "Predmet Zakona") ako postoji */
  caption: string;
  /** Hijerarhijska staza npr. "DIO DRUGI ZEMLJIŠNE KNJIGE › GLAVA I. SASTAV ZEMLJIŠNE KNJIGE" */
  section: string;
  dio?: string;
  glava?: string;
  poglavlje?: string;
  odjeljak?: string;
  text: string;
}

const ARTICLE_RE = /^Članak\s+(\d+)\.?\s*([a-zA-Zčćžšđ]{0,3})\.?$/i;

const DIO_COMPACT_MAP: Record<string, string> = {
  DIOPRVI: 'DIO PRVI',
  DIODRUGI: 'DIO DRUGI',
  DIOTREĆI: 'DIO TREĆI',
  DIOTRECI: 'DIO TREĆI',
  DIOČETVRTI: 'DIO ČETVRTI',
  DIOCETVRTI: 'DIO ČETVRTI',
  DIOPETI: 'DIO PETI',
  DIOŠESTI: 'DIO ŠESTI',
  DIOSESTI: 'DIO ŠESTI',
  DIOSEDMI: 'DIO SEDMI',
  DIOOSMI: 'DIO OSMI',
  DIODEVETI: 'DIO DEVETI',
  DIODESETI: 'DIO DESETI',
};

function cleanStructureText(s: string): string {
  return s.replace(/[ \t\u00a0]+/g, ' ').replace(/\n+/g, ' – ').trim();
}

export function normalizeArticleKey(num: string, suffix = ''): string {
  return `${parseInt(num, 10)}${suffix.toLowerCase()}`;
}

export function articleLabel(key: string): string {
  const m = key.match(/^(\d+)([a-zčćžšđ]*)$/i);
  if (!m) return `Članak ${key}.`;
  return m[2] ? `Članak ${m[1]}.${m[2]}` : `Članak ${m[1]}.`;
}

/**
 * Raščlamba temeljnog (izvornog ili pročišćenog) teksta zakona na članke.
 * Prepoznaje hijerarhijski kontekst (DIO, GLAVA, POGLAVLJE, ODJELJAK) i naslove članaka.
 */
export function parseBaseArticles(html: string): BaseArticle[] {
  const paras = extractParagraphs(html);
  const articles: BaseArticle[] = [];
  let current: BaseArticle | null = null;
  let currentDio = '';
  let currentGlava = '';
  let currentPoglavlje = '';
  let currentOdjeljak = '';
  let pendingCaption = '';
  let inLawBody = false;

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const trimmed = p.text.trim();
    const m = trimmed.match(ARTICLE_RE);

    if (m) {
      inLawBody = true;
      if (current) articles.push(current);

      const breadcrumbs = [currentDio, currentGlava, currentPoglavlje, currentOdjeljak]
        .filter(Boolean)
        .join(' › ');

      const key = normalizeArticleKey(m[1], m[2]);
      current = {
        key,
        label: articleLabel(key),
        caption: pendingCaption,
        section: breadcrumbs,
        dio: currentDio || undefined,
        glava: currentGlava || undefined,
        poglavlje: currentPoglavlje || undefined,
        odjeljak: currentOdjeljak || undefined,
        text: '',
      };
      pendingCaption = '';
      continue;
    }

    if (inLawBody && /klasa|potpis/.test(p.cls)) {
      if (current) {
        articles.push(current);
        current = null;
      }
      inLawBody = false;
      continue;
    }

    const compactUpper = trimmed.replace(/\s+/g, '').toUpperCase();
    const compactDio = DIO_COMPACT_MAP[compactUpper];

    if (!inLawBody) {
      if (
        compactDio ||
        /^(?:DIO\s+[A-ZČĆŽŠĐa-zčćžšđ]+|PRVI\s+DIO|GLAVA\s+[IVXLCDM\d]+|\d+\.\s+[A-ZČĆŽŠĐ\s]{4,})/i.test(trimmed)
      ) {
        inLawBody = true;
      } else {
        continue;
      }
    }

    // DIO (npr. "DIO PRVI", "DIO DRUGI OPĆE ODREDBE", "PRVI DIO", "1. OPĆE ODREDBE", "D I O P R V I")
    if (
      compactDio ||
      /^(?:DIO\s+[A-ZČĆŽŠĐa-zčćžšđ]+|PRVI\s+DIO|DRUGI\s+DIO|TREĆI\s+DIO|ČETVRTI\s+DIO|PETI\s+DIO|ŠESTI\s+DIO|SEDMI\s+DIO|OSMI\s+DIO|DEVETI\s+DIO|DESETI\s+DIO)\b/i.test(trimmed) ||
      (/^[IVXLCDM\d]+\.\s+[A-ZČĆŽŠĐ\s]{4,}$/.test(trimmed) && !trimmed.includes('('))
    ) {
      const dioLabel = compactDio || cleanStructureText(trimmed);
      const nextP = paras[i + 1]?.text.trim() || '';
      if (nextP && nextP === nextP.toUpperCase() && !nextP.startsWith('ČLANAK') && nextP.length < 120) {
        currentDio = `${dioLabel} – ${cleanStructureText(nextP)}`;
        i++;
      } else {
        currentDio = dioLabel;
      }
      currentGlava = '';
      currentPoglavlje = '';
      currentOdjeljak = '';
      continue;
    }

    // GLAVA (npr. "GLAVA I.", "GLAVA I. SASTAV ZEMLJIŠNE KNJIGE")
    if (/^GLAVA\s+[IVXLCDM\d]+\.?\b/i.test(trimmed)) {
      const nextP = paras[i + 1]?.text.trim() || '';
      if (nextP && nextP === nextP.toUpperCase() && !nextP.startsWith('ČLANAK') && nextP.length < 120) {
        currentGlava = `${cleanStructureText(trimmed)} – ${cleanStructureText(nextP)}`;
        i++;
      } else {
        currentGlava = cleanStructureText(trimmed);
      }
      currentPoglavlje = '';
      currentOdjeljak = '';
      continue;
    }

    // POGLAVLJE (npr. "POGLAVLJE I.", "POGLAVLJE 1. OPĆE ODREDBE")
    if (/^POGLAVLJE\s+[IVXLCDM\d]+\.?\b/i.test(trimmed)) {
      currentPoglavlje = cleanStructureText(trimmed);
      currentOdjeljak = '';
      continue;
    }

    // ODJELJAK (npr. "ODJELJAK A", "ODJELJAK 1.", "7.1. GRAĐEVINSKA DOZVOLA")
    if (
      /^ODJELJAK\s+[A-Z\d]+\.?\b/i.test(trimmed) ||
      /^\d+\.\d+\.\s+[A-ZČĆŽŠĐ\s]{4,}$/.test(trimmed)
    ) {
      currentOdjeljak = cleanStructureText(trimmed);
      continue;
    }

    // Naslov članka: prepoznaje kurziv/podnaslov ILI paragraf neposredno ispred "Članak N."
    const isNextArticle = paras[i + 1]?.text.trim().match(ARTICLE_RE);
    const looksLikeCaption =
      trimmed.length < 130 &&
      !trimmed.startsWith('(') &&
      !trimmed.endsWith('.') &&
      !/^(?:DIO|GLAVA|POGLAVLJE|ODJELJAK)/i.test(trimmed);

    if (isNextArticle && looksLikeCaption) {
      pendingCaption = cleanStructureText(trimmed).replace(/^[»"„]+|[«"“]+$/g, '').trim();
      continue;
    }

    if (
      (/kurz/i.test(p.cls) || p.cls.includes('T-10-9-kurz-s') || p.cls.includes('podnaslov')) &&
      trimmed.length < 150 &&
      !trimmed.startsWith('(') &&
      !trimmed.startsWith('1.')
    ) {
      pendingCaption = cleanStructureText(trimmed).replace(/^[»"„]+|[«"“]+$/g, '').trim();
      continue;
    }

    if (current) {
      current.text = current.text ? `${current.text}\n${trimmed}` : trimmed;
    }
  }

  if (current) articles.push(current);
  return articles;
}

/** ELI metapodaci (JSON-LD) – dostupni za novija godišta. Vraća null ako godište nije podržano. */
export async function fetchEliMetadata(ref: NnActRef): Promise<any[] | null> {
  const raw = await cached(`eli_${ref.slug}.json`, async () => {
    await throttle();
    const res = await fetch(`${BASE}/api/act`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({
        part: 'SL',
        year: ref.year,
        number: ref.issue,
        act_num: String(ref.actNum),
        format: 'JSON-LD',
      }),
    });
    return await res.text();
  });
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Iz ELI metapodataka izvuci na koje akte se izmjena odnosi (eli:amends / eli:changes). */
export function eliAmendedActs(meta: any[] | null): string[] {
  if (!meta) return [];
  const out = new Set<string>();
  for (const node of meta) {
    for (const prop of ['http://data.europa.eu/eli/ontology#amends', 'http://data.europa.eu/eli/ontology#changes']) {
      for (const v of node[prop] || []) {
        if (v['@id']) out.add(String(v['@id']).replace('https:/narodne', 'https://narodne'));
      }
    }
  }
  return [...out];
}

/** "NN 47/09, 110/21" -> [{year:2009, issue:47}, {year:2021, issue:110}] */
export function parseNnList(nn: string): { year: number; issue: number }[] {
  const out: { year: number; issue: number }[] = [];
  for (const m of nn.matchAll(/(\d{1,3})\/(\d{2})\b/g)) {
    const yy = parseInt(m[2], 10);
    out.push({ issue: parseInt(m[1], 10), year: yy > 50 ? 1900 + yy : 2000 + yy });
  }
  return out;
}
