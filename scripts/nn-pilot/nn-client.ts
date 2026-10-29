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
  /** Dio/glava u kojoj se članak nalazi */
  section: string;
  text: string;
}

const ARTICLE_RE = /^Članak\s+(\d+)\.?\s*([a-zA-Z]{0,2})\.?$/;

export function normalizeArticleKey(num: string, suffix = ''): string {
  return `${parseInt(num, 10)}${suffix.toLowerCase()}`;
}

export function articleLabel(key: string): string {
  const m = key.match(/^(\d+)([a-z]*)$/);
  if (!m) return `Članak ${key}.`;
  return m[2] ? `Članak ${m[1]}.${m[2]}` : `Članak ${m[1]}.`;
}

/**
 * Raščlamba temeljnog (izvornog ili pročišćenog) teksta zakona na članke.
 * Prepoznaje naslove članaka po tekstu ("Članak 12.", "Članak 12.a"), ne samo po klasi,
 * jer se klase razlikuju između godišta NN.
 */
export function parseBaseArticles(html: string): BaseArticle[] {
  const paras = extractParagraphs(html);
  const articles: BaseArticle[] = [];
  let current: BaseArticle | null = null;
  let pendingCaption = '';
  let section = '';
  let started = false;

  for (const p of paras) {
    const m = p.text.match(ARTICLE_RE);
    if (m) {
      started = true;
      if (current) articles.push(current);
      const key = normalizeArticleKey(m[1], m[2]);
      current = { key, label: articleLabel(key), caption: pendingCaption, section, text: '' };
      pendingCaption = '';
      continue;
    }
    if (!started) continue;

    // Naslovi dijelova/glava (centrirani, velika slova ili "Glava ...")
    if (/sred/.test(p.cls) || /^(PRVI|DRUGI|TREĆI|ČETVRTI|PETI|ŠESTI|SEDMI|OSMI|DEVETI|DESETI)\s+DIO/i.test(p.text) || /^Glava\s+[IVXLC]+\./.test(p.text)) {
      section = p.text.replace(/\n/g, ' – ');
      continue;
    }
    // Naslov iznad članka (kurziv) – pripada sljedećem članku
    if (/kurz/.test(p.cls) && p.text.length < 200) {
      pendingCaption = p.text;
      continue;
    }
    // Potpisni blok / klasa na kraju akta
    if (/klasa|potpis/.test(p.cls)) {
      if (current) {
        articles.push(current);
        current = null;
      }
      started = false;
      continue;
    }
    if (current) {
      current.text = current.text ? `${current.text}\n${p.text}` : p.text;
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
