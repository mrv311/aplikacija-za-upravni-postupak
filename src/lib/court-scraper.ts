import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

export const BASE_COURT_URL = 'https://odluke.sudovi.hr';
export const DATA_COURT_DIR = path.join(process.cwd(), 'data', 'sudska-praksa');

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7',
};

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

export interface ScrapedDocMetadata {
  id: string;
  brojOdluke: string;
  sud: string;
  sudKratki: string;
  datum: string;
  godina: string;
  vrstaOdluke: string;
  pravomocnost: string;
  ecli: string;
  stvarnoKazalo: string[];
  zakonskoKazalo: string[];
  ishod: string;
  categoryTag: string;
  folderName: string;
  url: string;
  safeFileName: string;
  cleanText: string;
}

export interface PortalSearchSummaryItem {
  id: string;
  brojOdluke: string;
  sud: string;
  datum: string;
  vrsta: string;
  ishod: string;
  title: string;
  snippet: string;
  url: string;
  alreadyImported?: boolean;
}

// Kratki prepoznatljivi naziv suda
export function formatSudShort(sud: string): string {
  if (/Visoki upravni sud/i.test(sud) || /VUSRH/i.test(sud)) return 'VUSRH';
  if (/Upravni sud u Zagrebu/i.test(sud)) return 'Upravni sud u Zagrebu';
  if (/Upravni sud u Splitu/i.test(sud)) return 'Upravni sud u Splitu';
  if (/Upravni sud u Rijeci/i.test(sud)) return 'Upravni sud u Rijeci';
  if (/Upravni sud u Osijeku/i.test(sud)) return 'Upravni sud u Osijeku';
  if (/Vrhovni sud/i.test(sud) || /VSRH/i.test(sud)) return 'VSRH';
  if (/Ustavni sud/i.test(sud) || /USRH/i.test(sud)) return 'Ustavni sud RH';
  return sud.trim() || 'Upravni sud';
}

// Prepoznavanje ishoda iz izreke i teksta
export function detectIshod(text: string, vrstaOdluke: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('poništava se') || lower.includes('usvaja se tužbeni zahtjev') || lower.includes('uvažava se tužba')) {
    return 'Poništeno rješenje';
  }
  if (lower.includes('odbija se tužbeni zahtjev') || lower.includes('odbija se tužba') || lower.includes('odbija se žalba')) {
    return 'Odbijena tužba';
  }
  if (lower.includes('obustavlja se postupak') || lower.includes('obustava postupka')) {
    return lower.includes('troškov') ? 'Obustava postupka (dosuđeni troškovi)' : 'Obustava postupka';
  }
  if (lower.includes('odbacuje se')) {
    return 'Odbačena tužba';
  }
  return vrstaOdluke || 'Presuda';
}

// Određivanje mape na disku i oznake kategorije
export function detectCategory(query: string, text: string, defaultCat?: string): { folderName: string; categoryTag: string } {
  if (defaultCat) {
    const catLower = defaultCat.toLowerCase();
    if (catLower.includes('doprinos')) return { folderName: '01_Vodni_doprinos', categoryTag: 'Vodni doprinos' };
    if (catLower.includes('uređenj') || catLower.includes('uredenj')) return { folderName: '02_Naknada_za_uredjenje_voda', categoryTag: 'Naknada za uređenje voda' };
    if (catLower.includes('zaštit') || catLower.includes('zastit')) return { folderName: '03_Naknada_za_zastitu_voda', categoryTag: 'Naknada za zaštitu voda' };
    if (catLower.includes('troškov') || catLower.includes('šutnj') || catLower.includes('sutnj')) return { folderName: '04_Sutnja_uprave_i_troskovi', categoryTag: 'Troškovi postupka' };
    if (catLower.includes('obnov') || catLower.includes('poništ') || catLower.includes('ništav') || catLower.includes('zup')) {
      return { folderName: '05_Obnova_postupka_i_pravni_lijekovi', categoryTag: 'Obnova postupka i pravni lijekovi' };
    }
    if (catLower.includes('ozakonj') || catLower.includes('gradnj') || catLower.includes('zpniz')) {
      return { folderName: '06_Ozakonjenje_i_gradjenje', categoryTag: 'Ozakonjenje i građenje' };
    }
    if (catLower.includes('okoliš') || catLower.includes('okolis') || catLower.includes('prirod') || catLower.includes('otpad')) {
      return { folderName: '07_Zastita_okolisa_i_prirode', categoryTag: 'Zaštita okoliša i prirode' };
    }
  }

  const combined = (query + ' ' + text.slice(0, 4000)).toLowerCase();

  if (combined.includes('vodni doprinos') || combined.includes('vodnog doprinosa') || combined.includes('vodnoga doprinosa')) {
    return { folderName: '01_Vodni_doprinos', categoryTag: 'Vodni doprinos' };
  }
  if (combined.includes('uređenje voda') || combined.includes('uređenja voda') || combined.includes('naknada za uređenje')) {
    return { folderName: '02_Naknada_za_uredjenje_voda', categoryTag: 'Naknada za uređenje voda' };
  }
  if (combined.includes('zaštitu voda') || combined.includes('zaštite voda') || combined.includes('naknada za zaštitu')) {
    return { folderName: '03_Naknada_za_zastitu_voda', categoryTag: 'Naknada za zaštitu voda' };
  }
  if (combined.includes('šutnj') || combined.includes('sutnj') || (combined.includes('troškov') && combined.includes('obustav'))) {
    return { folderName: '04_Sutnja_uprave_i_troskovi', categoryTag: 'Troškovi postupka' };
  }
  if (
    combined.includes('obnova postupka') ||
    combined.includes('obnove postupka') ||
    combined.includes('poništavanje i ukidanje') ||
    combined.includes('oglašavanje ništavim') ||
    combined.includes('povrat u prijašnje stanje')
  ) {
    return { folderName: '05_Obnova_postupka_i_pravni_lijekovi', categoryTag: 'Obnova postupka i pravni lijekovi' };
  }
  if (
    combined.includes('nezakonito izgrađen') ||
    combined.includes('ozakonjenj') ||
    combined.includes('građevinska dozvola') ||
    combined.includes('uporabna dozvola') ||
    combined.includes('rješenje o izvedenom stanju')
  ) {
    return { folderName: '06_Ozakonjenje_i_gradjenje', categoryTag: 'Ozakonjenje i građenje' };
  }
  if (
    combined.includes('procjena utjecaja na okoliš') ||
    combined.includes('gospodarenje otpadom') ||
    combined.includes('zaštita prirode') ||
    combined.includes('okolišn')
  ) {
    return { folderName: '07_Zastita_okolisa_i_prirode', categoryTag: 'Zaštita okoliša i prirode' };
  }
  if (combined.includes('korištenje voda') || combined.includes('korištenja voda')) {
    return { folderName: '01_Vodni_doprinos', categoryTag: 'Naknada za korištenje voda' };
  }

  return { folderName: '08_Ostali_upravni_sporovi', categoryTag: 'Ostali upravni sporovi' };
}

// Dohvat i parsiranje pojedinačne odluke s portala
export async function fetchDocumentDetails(
  docId: string,
  queryHint = '',
  defaultCat?: string
): Promise<ScrapedDocMetadata | null> {
  const url = `${BASE_COURT_URL}/Document/View?id=${docId}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`      ⚠️ Greška ${res.status} za dokument ${docId}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const brojOdluke =
      $('.view-decisionnumber').text().trim() ||
      $('title').text().split(',')[0].trim() ||
      docId;

    const titleText = $('.view-decision-title').text().replace(/\s+/g, ' ').trim();
    const datum = $('.view-decisiondate').text().trim();
    const pravomocnost = $('.final-decision').text().trim();

    // Određivanje suda
    let sud = 'Upravni sud';
    if (/Visoki upravni sud/i.test(titleText) || /VUSRH/i.test(html)) {
      sud = 'Visoki upravni sud Republike Hrvatske';
    } else if (/Upravni sud u Zagrebu/i.test(titleText) || /Upravni sud u Zagrebu/i.test(html)) {
      sud = 'Upravni sud u Zagrebu';
    } else if (/Upravni sud u Splitu/i.test(titleText) || /Upravni sud u Splitu/i.test(html)) {
      sud = 'Upravni sud u Splitu';
    } else if (/Upravni sud u Rijeci/i.test(titleText) || /Upravni sud u Rijeci/i.test(html)) {
      sud = 'Upravni sud u Rijeci';
    } else if (/Upravni sud u Osijeku/i.test(titleText) || /Upravni sud u Osijeku/i.test(html)) {
      sud = 'Upravni sud u Osijeku';
    } else if (/Vrhovni sud/i.test(titleText) || /VSRH/i.test(html)) {
      sud = 'Vrhovni sud Republike Hrvatske';
    } else if (/Ustavni sud/i.test(titleText) || /USRH/i.test(html)) {
      sud = 'Ustavni sud Republike Hrvatske';
    }

    // Čišćenje i formatiranje teksta odluke
    const textEl = $('.decision-text').clone();
    textEl.find('style, script').remove();
    textEl.find('br').replaceWith('\n');
    textEl.find('p, div, tr').each((_, el) => {
      $(el).append('\n');
    });

    const cleanText = textEl.text().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!cleanText || cleanText.length < 80) {
      return null;
    }

    // ECLI
    const ecliMatch = html.match(/ECLI:[A-Z0-9:]+/i);
    const ecli = ecliMatch ? ecliMatch[0] : '';

    // Godina
    const yearMatch = datum.match(/\b(20\d{2}|19\d{2})\b/) || brojOdluke.match(/[\/-](20\d{2}|19\d{2})\b/);
    const godina = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

    // Kazala
    const stvarnoKazalo: string[] = [];
    $('.metadata-content-part').each((_, el) => {
      const t = $(el).text().trim();
      if (t && !stvarnoKazalo.includes(t)) stvarnoKazalo.push(t);
    });

    const ishod = detectIshod(cleanText, pravomocnost || 'Presuda');
    const { folderName, categoryTag } = detectCategory(queryHint, cleanText, defaultCat);
    const sudKratki = formatSudShort(sud);
    const safeFileName = sanitizeFileName(`${sudKratki}_${brojOdluke}`);

    return {
      id: docId,
      brojOdluke,
      sud,
      sudKratki,
      datum,
      godina,
      vrstaOdluke: pravomocnost || 'Presuda',
      pravomocnost,
      ecli,
      stvarnoKazalo,
      zakonskoKazalo: [],
      ishod,
      categoryTag,
      folderName,
      url,
      safeFileName,
      cleanText,
    };
  } catch (err: any) {
    console.error(`      ❌ Greška dohvata ${docId}:`, err.message);
    return null;
  }
}

// Pretraga i prikupljanje ID-jeva s portala
export async function searchCourtPortal(query: string, maxPages = 5): Promise<string[]> {
  const docIds = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const searchUrl = `${BASE_COURT_URL}/Document/DisplayList?q=${encodeURIComponent(query)}&page=${page}`;
    try {
      const res = await fetch(searchUrl, { headers: HEADERS });
      if (!res.ok) break;

      const html = await res.text();
      const matches = html.match(/\/Document\/View\?id=([a-f0-9\-]+)/gi) || [];

      let newCount = 0;
      for (const m of matches) {
        const idMatch = m.match(/id=([a-f0-9\-]+)/i);
        if (idMatch && idMatch[1]) {
          if (!docIds.has(idMatch[1])) {
            docIds.add(idMatch[1]);
            newCount++;
          }
        }
      }

      if (newCount === 0 || matches.length === 0) {
        break;
      }

      await delay(400);
    } catch (err: any) {
      console.warn(`      ⚠️ Greška pretrage stranice ${page}:`, err.message);
      break;
    }
  }

  return Array.from(docIds);
}

// Pretraga s izdvajanjem sažetaka za UI prikaz
export async function searchCourtPortalItems(query: string, limit = 15): Promise<PortalSearchSummaryItem[]> {
  const results: PortalSearchSummaryItem[] = [];
  const maxPages = Math.ceil(limit / 5) + 1;

  for (let page = 1; page <= maxPages; page++) {
    if (results.length >= limit) break;
    const searchUrl = `${BASE_COURT_URL}/Document/DisplayList?q=${encodeURIComponent(query)}&page=${page}`;
    try {
      const res = await fetch(searchUrl, { headers: HEADERS });
      if (!res.ok) break;

      const html = await res.text();
      const $ = cheerio.load(html);

      const itemsOnPage: { id: string; title: string; snippet: string; datum: string }[] = [];

      // Portal renderira rezultate u listi ili karticama
      $('.search-result-item, .list-group-item, tr').each((_, el) => {
        const link = $(el).find('a[href*="/Document/View?id="]');
        if (link.length > 0) {
          const href = link.attr('href') || '';
          const idMatch = href.match(/id=([a-f0-9\-]+)/i);
          if (idMatch && idMatch[1]) {
            const title = link.text().replace(/\s+/g, ' ').trim();
            const fullText = $(el).text().replace(/\s+/g, ' ').trim();
            itemsOnPage.push({
              id: idMatch[1],
              title,
              snippet: fullText.slice(0, 260),
              datum: '',
            });
          }
        }
      });

      // Fallback ako struktura DOM-a nema search-result-item
      if (itemsOnPage.length === 0) {
        const matches = html.match(/\/Document\/View\?id=([a-f0-9\-]+)/gi) || [];
        for (const m of matches) {
          const idMatch = m.match(/id=([a-f0-9\-]+)/i);
          if (idMatch && idMatch[1] && !itemsOnPage.some((it) => it.id === idMatch[1])) {
            itemsOnPage.push({
              id: idMatch[1],
              title: `Odluka ${idMatch[1].slice(0, 8)}`,
              snippet: '',
              datum: '',
            });
          }
        }
      }

      for (const it of itemsOnPage) {
        if (results.length >= limit) break;
        if (!results.some((r) => r.id === it.id)) {
          // Dohvat osnovnih metapodataka
          const doc = await fetchDocumentDetails(it.id, query);
          if (doc) {
            results.push({
              id: doc.id,
              brojOdluke: doc.brojOdluke,
              sud: doc.sudKratki,
              datum: doc.datum || doc.godina,
              vrsta: doc.vrstaOdluke,
              ishod: doc.ishod,
              title: `${doc.sudKratki} - ${doc.brojOdluke}`,
              snippet: doc.cleanText.slice(0, 280) + '...',
              url: doc.url,
            });
          }
          await delay(250);
        }
      }

      await delay(300);
    } catch (err: any) {
      console.warn('Greška pri searchCourtPortalItems:', err.message);
      break;
    }
  }

  return results;
}

// Spremanje odluke na lokalni disk
export async function saveDecisionLocally(doc: ScrapedDocMetadata): Promise<{ jsonPath: string; txtPath: string }> {
  const targetFolder = path.join(DATA_COURT_DIR, doc.folderName, doc.godina);
  await fs.mkdir(targetFolder, { recursive: true });

  const jsonPath = path.join(targetFolder, `${doc.safeFileName}.json`);
  const txtPath = path.join(targetFolder, `${doc.safeFileName}.txt`);

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        id: doc.id,
        brojOdluke: doc.brojOdluke,
        sud: doc.sud,
        sudKratki: doc.sudKratki,
        datum: doc.datum,
        godina: doc.godina,
        vrstaOdluke: doc.vrstaOdluke,
        pravomocnost: doc.pravomocnost,
        ecli: doc.ecli,
        ishod: doc.ishod,
        kategorija: doc.categoryTag,
        stvarnoKazalo: doc.stvarnoKazalo,
        zakonskoKazalo: doc.zakonskoKazalo,
        izvorniUrl: doc.url,
        datumPreuzimanja: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  );

  const header = `======================================================================
REPUBLIKA HRVATSKA - SUDSKA PRAKSA
SUD:         ${doc.sud} (${doc.sudKratki})
POSLOVNI BROJ: ${doc.brojOdluke}
DATUM:       ${doc.datum}
VRSTA AKTA:  ${doc.vrstaOdluke}
ISHOD:       ${doc.ishod}
KATEGORIJA:  ${doc.categoryTag}
ECLI:        ${doc.ecli || 'N/A'}
IZVOR:       ${doc.url}
======================================================================\n\n`;

  await fs.writeFile(txtPath, header + doc.cleanText, 'utf-8');

  return { jsonPath, txtPath };
}
