import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
// @ts-ignore
import WordExtractor from 'word-extractor';
import {
  type PropisDocRole,
  type ParsedExcelSheet,
  type ParsedDraftStructure,
  type LocalFolderScanEntry,
  type PrimjedbaItem,
  type PrimjedbaKategorijaTijela,
  type PrimjedbaStatus,
} from './izrada-propisa-types';
import { parseNormativeDraft } from './propis-article-parser';

// @ts-ignore
const ExtractorClass = WordExtractor.default || WordExtractor;
const wordExtractor = new ExtractorClass();

export const SUPPORTED_PROPIS_EXTENSIONS = new Set([
  'docx',
  'doc',
  'xlsx',
  'xls',
  'pdf',
  'txt',
]);

function cleanInlineCell(text: string): string {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * Pretvara HTML iz mammoth-a u čisti, čitljivi Markdown koji vjerno čuva tablice (npr. Članak 3. tarife)
 * i strukturu odlomaka/lista, bez gubitka podataka.
 */
function htmlToStructuredText(html: string): { text: string; tablesCount: number } {
  const $ = cheerio.load(html);
  const blocks: string[] = [];
  let tablesCount = 0;

  const rootChildren = $('body').children().toArray();
  for (const el of rootChildren) {
    const tag = (el as any).tagName?.toLowerCase() || '';

    if (tag === 'table') {
      tablesCount += 1;
      const rows: string[][] = [];
      $(el)
        .find('tr')
        .each((_, tr) => {
          const cells: string[] = [];
          $(tr)
            .children('th, td')
            .each((__, td) => {
              // Očuvaj prijelome odlomaka unutar ćelija kao razmak ili "; "
              const cellParagraphs: string[] = [];
              const ps = $(td).find('p');
              if (ps.length > 0) {
                ps.each((___, p) => {
                  const t = cleanInlineCell($(p).text());
                  if (t) cellParagraphs.push(t);
                });
              } else {
                const t = cleanInlineCell($(td).text());
                if (t) cellParagraphs.push(t);
              }
              cells.push(cellParagraphs.join(' '));
            });
          if (cells.some((c) => c.length > 0)) {
            rows.push(cells);
          }
        });

      if (rows.length > 0) {
        const colCount = Math.max(...rows.map((r) => r.length));
        const normalizedRows = rows.map((r) => {
          const copy = [...r];
          while (copy.length < colCount) copy.push('');
          return copy;
        });

        const header = `| ${normalizedRows[0].join(' | ')} |`;
        const sep = `| ${normalizedRows[0].map(() => '---').join(' | ')} |`;
        const body = normalizedRows
          .slice(1)
          .map((r) => `| ${r.join(' | ')} |`)
          .join('\n');

        blocks.push(body ? `${header}\n${sep}\n${body}` : `${header}\n${sep}`);
      }
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items: string[] = [];
      $(el)
        .children('li')
        .each((idx, li) => {
          const t = $(li).text().replace(/\s+/g, ' ').trim();
          if (t) {
            items.push(tag === 'ol' ? `${idx + 1}. ${t}` : `- ${t}`);
          }
        });
      if (items.length > 0) blocks.push(items.join('\n'));
      continue;
    }

    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text) {
      blocks.push(text);
    }
  }

  return {
    text: blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    tablesCount,
  };
}

/**
 * Lokalno parsiranje Excel datoteka (.xlsx / .xls) u čiste Markdown tablice + pregledne listove (0 AI troška).
 */
export function parseExcelBufferLocally(buffer: Buffer): {
  rawText: string;
  sheets: ParsedExcelSheet[];
} {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets: ParsedExcelSheet[] = [];
  const sections: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const matrix = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    });

    // Filtriraj potpuno prazne retke
    const nonEmptyRows: string[][] = [];
    for (const row of matrix) {
      if (!Array.isArray(row)) continue;
      const stringRow = row.map((cell) => {
        if (cell === null || cell === undefined) return '';
        if (typeof cell === 'number') {
          // Zadrži preciznost tarifa (npr. 0.139359 -> 0,139359 ili čisti broj)
          return Number.isInteger(cell) ? String(cell) : String(Number(cell.toFixed(6)));
        }
        return cleanInlineCell(String(cell));
      });
      if (stringRow.some((c) => c.length > 0)) {
        nonEmptyRows.push(stringRow);
      }
    }

    if (nonEmptyRows.length === 0) continue;

    // Odreži prazne završne stupce
    let maxCol = 0;
    for (const r of nonEmptyRows) {
      for (let c = r.length - 1; c >= 0; c--) {
        if (r[c].length > 0) {
          if (c + 1 > maxCol) maxCol = c + 1;
          break;
        }
      }
    }
    const cappedCol = Math.min(maxCol, 24);
    const trimmedRows = nonEmptyRows.slice(0, 250).map((r) => {
      const slice = r.slice(0, cappedCol);
      while (slice.length < cappedCol) slice.push('');
      return slice;
    });

    const headers = trimmedRows[0] || [];
    const mdLines: string[] = [];
    if (trimmedRows.length > 0) {
      mdLines.push(`| ${trimmedRows[0].join(' | ')} |`);
      mdLines.push(`| ${trimmedRows[0].map(() => '---').join(' | ')} |`);
      for (const r of trimmedRows.slice(1)) {
        mdLines.push(`| ${r.join(' | ')} |`);
      }
    }
    const markdown = mdLines.join('\n');

    sheets.push({
      name: sheetName,
      rowCount: nonEmptyRows.length,
      colCount: cappedCol,
      headers,
      previewRows: trimmedRows.slice(0, 60),
      markdown,
    });

    sections.push(`### List: ${sheetName} (${nonEmptyRows.length} redaka)\n\n${markdown}`);
  }

  return {
    rawText: sections.join('\n\n'),
    sheets,
  };
}

export interface LocalParseResult {
  rawText: string;
  needsOcr: boolean;
  htmlTablesCount: number;
  excelSheets?: ParsedExcelSheet[];
  parsedDraft?: ParsedDraftStructure;
}

/**
 * Centralni lokalni parser bez IKAKVOG AI poziva (0 tokena, 0 troška).
 * Podržava: .docx, .doc, .xlsx, .xls, .pdf, .txt
 */
export async function parsePropisBufferLocally(
  buffer: Buffer,
  fileName: string,
  role: PropisDocRole
): Promise<LocalParseResult> {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  let rawText = '';
  let htmlTablesCount = 0;
  let needsOcr = false;
  let excelSheets: ParsedExcelSheet[] | undefined;

  if (ext === 'docx') {
    try {
      const htmlRes = await mammoth.convertToHtml({ buffer });
      const converted = htmlToStructuredText(htmlRes.value || '');
      rawText = converted.text;
      htmlTablesCount = converted.tablesCount;
      if (!rawText.trim()) {
        const rawRes = await mammoth.extractRawText({ buffer });
        rawText = (rawRes.value || '').trim();
      }
    } catch {
      const doc = await wordExtractor.extract(buffer);
      rawText = (doc.getBody() || '').trim();
    }
  } else if (ext === 'doc') {
    const doc = await wordExtractor.extract(buffer);
    rawText = (doc.getBody() || '').trim();
  } else if (ext === 'xlsx' || ext === 'xls') {
    const parsed = parseExcelBufferLocally(buffer);
    rawText = parsed.rawText;
    excelSheets = parsed.sheets;
    htmlTablesCount = parsed.sheets.length;
  } else if (ext === 'pdf') {
    try {
      const pdfData = await pdfParse(buffer);
      rawText = (pdfData.text || '').replace(/\r\n/g, '\n').trim();
    } catch {
      rawText = '';
    }
    const cleanLen = rawText.replace(/\s+/g, '').length;
    if (cleanLen < 50) {
      needsOcr = true;
    }
  } else if (ext === 'txt') {
    rawText = buffer.toString('utf-8').trim();
  } else {
    throw new Error(`Nepodržana vrsta datoteke: .${ext}`);
  }

  let parsedDraft: ParsedDraftStructure | undefined;
  if (role === 'aktualni_nacrt' || role === 'prethodna_verzija') {
    const candidate = parseNormativeDraft(rawText);
    if (candidate.clanci.length > 0 || candidate.preambula.length > 0) {
      parsedDraft = candidate;
    }
  }

  return {
    rawText,
    needsOcr,
    htmlTablesCount,
    excelSheets,
    parsedDraft,
  };
}

// ============================================================================
// HEURISTIČKA AUTO-KATEGORIZACIJA I DETEKCIJA POŠILJATELJA / DATUMA
// ============================================================================

const KNOWN_SENDERS: Array<{ pattern: RegExp; label: string; category: PrimjedbaKategorijaTijela }> = [
  { pattern: /\bUZZ\b|ured\w*\s+za\s+zakonodavstv/i, label: 'Ured za zakonodavstvo Vlade RH', category: 'UZZ' },
  { pattern: /\bMFIN\b|\bMINFIN\b|ministarstv\w*\s+financij/i, label: 'Ministarstvo financija', category: 'TDU' },
  { pattern: /\bMINGO\b|ministarstv\w*\s+gospodarstv/i, label: 'Ministarstvo gospodarstva', category: 'TDU' },
  { pattern: /\bMMPI\b|ministarstv\w*\s+mora|ministarstv\w*\s+promet/i, label: 'Ministarstvo mora, prometa i infrastrukture', category: 'TDU' },
  { pattern: /\bMP[ŠS]R\b|ministarstv\w*\s+poljoprivred/i, label: 'Ministarstvo poljoprivrede, šumarstva i ribarstva', category: 'TDU' },
  { pattern: /\bMPUGDI\b|\bMPGI\b|prostorn\w*\s+ure[đd]enj/i, label: 'Ministarstvo prostornoga uređenja, graditeljstva i državne imovine', category: 'TDU' },
  { pattern: /\bMVEP\b|vanjsk\w*\s+i\s+europsk/i, label: 'Ministarstvo vanjskih i europskih poslova', category: 'TDU' },
  { pattern: /\bUG\s*RH\b|udrug\w*\s+gradova/i, label: 'Udruga gradova u RH', category: 'JLS / Udruge' },
  { pattern: /\bHZO\b|hrvatsk\w*\s+zajednic\w*\s+op[ćc]in/i, label: 'Hrvatska zajednica općina', category: 'JLS / Udruge' },
  { pattern: /\bHZZ\b|\bHZŽ\b|zajednic\w*\s+[žz]upanij/i, label: 'Hrvatska zajednica županija', category: 'JLS / Udruge' },
  { pattern: /\bHGK\b|gospodarsk\w*\s+komor/i, label: 'Hrvatska gospodarska komora', category: 'Gospodarstvo / Dionici' },
  { pattern: /\bHUP\b|udrug\w*\s+poslodavac/i, label: 'Hrvatska udruga poslodavaca', category: 'Gospodarstvo / Dionici' },
  { pattern: /\bHV\b|hrvatsk\w*\s+vod/i, label: 'Hrvatske vode', category: 'TDU' },
];

export function detectSenderFromText(text: string): {
  label?: string;
  category: PrimjedbaKategorijaTijela;
} {
  for (const s of KNOWN_SENDERS) {
    if (s.pattern.test(text)) {
      return { label: s.label, category: s.category };
    }
  }
  return { category: 'Ostalo' };
}

export function extractDateFromFileName(name: string): string | undefined {
  // Traži npr. 11. studenog 2026, 13.5.2026, 13_5_2026, 28102026
  const monthNames: Record<string, string> = {
    siječnja: '01', sijecnja: '01', siječanj: '01',
    veljače: '02', veljace: '02', veljača: '02',
    ožujka: '03', ozujka: '03', ožujak: '03',
    travnja: '04', travanj: '04',
    svibnja: '05', svibanj: '05',
    lipnja: '06', lipanj: '06',
    srpnja: '07', srpanj: '07',
    kolovoza: '08', kolovoz: '08',
    rujna: '09', rujan: '09',
    listopada: '10', listopad: '10',
    studenog: '11', studenoga: '11', studeni: '11',
    prosinca: '12', prosinac: '12',
  };

  const wordDate = name.match(
    /(\d{1,2})\.\s*(siječnj?a|sijecnj?a|siječanj|veljač[ae]|veljac[ae]|ožujk?a|ozujk?a|ožujak|travnj?a|travanj|svibnj?a|svibanj|lipnj?a|lipanj|srpnj?a|srpanj|kolovoz[a]?|rujn?a|rujan|listopad[a]?|studenog[a]?|studeni|prosinc?a|prosinac)\s*(20\d{2})/i
  );
  if (wordDate) {
    const d = wordDate[1].padStart(2, '0');
    const m = monthNames[wordDate[2].toLowerCase()] || '01';
    return `${wordDate[3]}-${m}-${d}`;
  }

  const numDate = name.match(/(?<!\d)(\d{1,2})[._-](\d{1,2})[._-](20\d{2})(?!\d)/);
  if (numDate) {
    const day = Number(numDate[1]);
    const month = Number(numDate[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${numDate[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const compact = name.match(/(?<!\d)(\d{2})(\d{2})(20\d{2})(?!\d)/);
  if (compact) {
    const day = Number(compact[1]);
    const month = Number(compact[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${compact[3]}-${compact[2]}-${compact[1]}`;
    }
  }

  return undefined;
}

export function classifyPropisFile(
  fileName: string,
  relativePath = ''
): {
  role: PropisDocRole;
  sender?: string;
  date?: string;
  recommended: boolean;
} {
  const lower = fileName.toLowerCase();
  const relLower = relativePath.toLowerCase();
  const ext = (lower.split('.').pop() || '').toLowerCase();
  const date = extractDateFromFileName(fileName);
  const senderInfo = detectSenderFromText(fileName);

  // 1. Excel tarife
  if (ext === 'xlsx' || ext === 'xls') {
    const isCoreTariff =
      /tarif|visina naknade|prijedlog_nuv/i.test(lower) && !/6\.2\.2026/i.test(relLower);
    return {
      role: 'excel_tarife',
      date,
      recommended: isCoreTariff,
    };
  }

  // 2. Zapisnici
  if (/zapisnik/i.test(lower) || /zapisnici/i.test(relLower)) {
    const isDocxOrNamed = ext === 'docx' || /zapisnik/i.test(lower);
    return {
      role: 'zapisnik',
      date,
      recommended: isDocxOrNamed,
    };
  }

  // 3. Popratni akti (Tablice primjedbi, FactSheet, Podloge, Obrazloženja, Obrazac PP, PFU, Dopisi, Zaključci)
  if (
    /tablica\s+sa\s+zaprimljenim|factsheet|podloga|obrazlo[žz]enje|obrazac\s*pp|pfu\s+obrazac|tablica\s+promjena|dopis|zaklju[čc]ak|uvodno\s+ek|prikaz\s+realnog|odgovori\s+na\s+primjedbe|odgovor\s+ministarstvu/i.test(
      lower
    )
  ) {
    const isRecommendedSupport =
      (/za kabinet ministrice/i.test(relLower) &&
        /2\.\s*podloga|3\.\s*tablica|4\.\s*factsheet|6\.\s*obrazac/i.test(lower)) ||
      (/studeni 2026/i.test(relLower) && /5\.\s*zaklju|tablica sa zaprimljenim/i.test(lower)) ||
      /tablica sa zaprimljenim.*23_11__2026/i.test(lower);

    return {
      role: 'popratni_akt',
      date,
      recommended: isRecommendedSupport,
    };
  }

  // 4. Mišljenja TDU / UZZ / dionika
  if (
    /mi[šs]ljenje|mi_ljenje|primjedb|o[čc]itovanje/i.test(lower) ||
    (/primjedbe tijela/i.test(relLower) && !/tablica/i.test(lower))
  ) {
    // Izbjegni duplikate iz root mape ako su uredno numerirani u "za kabinet ministrice" ili u "studeni 2026"
    const isInCabinet = /za kabinet ministrice/i.test(relLower);
    const isStudeni = /studeni 2026/i.test(relLower) && ext !== 'doc'; // preferiraj .pdf ili .doc jednom
    const isStudeniDoc = /studeni 2026/i.test(relLower) && ext === 'pdf';
    return {
      role: 'misljenje',
      sender: senderInfo.label,
      date,
      recommended: isInCabinet || isStudeniDoc || (isStudeni && ext === 'docx'),
    };
  }

  // 5. Nacrti teksta propisa (Aktualni vs. Prethodne verzije)
  if (/tekst\s+np\s+uredbe|nakon\s+primjedbi\s+tdu.*np\s+uredbe|uredba\s+nuv/i.test(lower)) {
    const isLatestNov =
      /studeni 2026/i.test(relLower) && /11\.\s*studenog\s*2026\.docx$/i.test(lower);
    const isMayFinal =
      /za kabinet ministrice/i.test(relLower) && /1\.\s*tekst\s+np.*final\.docx$/i.test(lower);
    const isFebSession = /3_2_2026.*za 3\. sjednicu.*\.docx$/i.test(lower);

    return {
      role: isLatestNov ? 'aktualni_nacrt' : 'prethodna_verzija',
      date,
      recommended: isLatestNov || isMayFinal || isFebSession,
    };
  }

  return {
    role: 'popratni_akt',
    sender: senderInfo.label,
    date,
    recommended: false,
  };
}

/**
 * Rekurzivno skenira lokalnu mapu (npr. OneDrive referentnu mapu projekta) bez ikakvog AI poziva.
 */
export function scanLocalPropisFolder(
  folderPath: string,
  alreadyImportedPaths: Set<string>
): LocalFolderScanEntry[] {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return [];
  }

  const results: LocalFolderScanEntry[] = [];

  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('~$') || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      const ext = (entry.name.split('.').pop() || '').toLowerCase();
      if (!SUPPORTED_PROPIS_EXTENSIONS.has(ext)) continue;

      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      const relativePath = path.relative(folderPath, fullPath);
      const folderName = path.dirname(relativePath) === '.' ? '(glavna mapa)' : path.dirname(relativePath);
      const cls = classifyPropisFile(entry.name, relativePath);

      results.push({
        relativePath,
        fullPath,
        fileName: entry.name,
        folderName,
        ext,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        suggestedRole: cls.role,
        suggestedSender: cls.sender,
        suggestedDate: cls.date,
        recommended: cls.recommended,
        alreadyImported: alreadyImportedPaths.has(fullPath.toLowerCase()),
      });
    }
  };

  walk(folderPath);

  // Sortiraj: preporučeno prvo, zatim po ulozi pa po datumu izmjene (novije prvo)
  const roleOrder: Record<PropisDocRole, number> = {
    aktualni_nacrt: 0,
    prethodna_verzija: 1,
    misljenje: 2,
    excel_tarife: 3,
    zapisnik: 4,
    popratni_akt: 5,
  };

  return results.sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (roleOrder[a.suggestedRole] !== roleOrder[b.suggestedRole]) {
      return roleOrder[a.suggestedRole] - roleOrder[b.suggestedRole];
    }
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });
}

// ============================================================================
// LOKALNI UVOZ POSTOJEĆE WORD TABLICE PRIMJEDBI (0 AI TROŠKA)
// ============================================================================

function inferArticleFromCommentText(text: string): string {
  const regex =
    /(?:članak|članka|članku|člankom|čl\.)\s*(\d+(?:\.?[a-z])?)(?=\.|\s|,|;|$)\.?(\s*(?:stavak|stavka|stavku|stavkom|stavke|st\.)\s*(\d+\.?(?:\s*i\s*\d+\.?)?))?/gi;

  const matches: Array<{ art: string; st?: string; score: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const art = m[1].replace(/\.$/, '');
    const st = m[3]?.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
    const after = text.slice(m.index, m.index + m[0].length + 55).toLowerCase();
    // Daj prednost članku koji se odnosi na Prijedlog uredbe/pravilnika/nacrt umjesto matičnog zakona
    let score = 1;
    if (/prijedlog|nacrt|uredb|pravilnik|ovog\s+akta/.test(after)) score += 3;
    if (/zakon\w*\s+o\s+/.test(after)) score -= 2;
    matches.push({ art, st, score });
  }

  if (matches.length === 0) return 'Opće primjedbe';
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  return best.st ? `Članak ${best.art}. st. ${best.st}.` : `Članak ${best.art}.`;
}

function normalizePrimjedbaStatus(raw: string, commentText = ''): PrimjedbaStatus {
  const lower = (raw || '').toLowerCase().trim();
  if (!lower) {
    if (/^\s*(?:nema\s+primjedb|bez\s+primjedb|suglasni\s+smo|daje\s+se\s+suglasnost)/i.test(commentText)) {
      return 'Prima se na znanje';
    }
    return 'Na razmatranju';
  }
  if (/djelomi[čc]no/.test(lower)) return 'Djelomično se prihvaća';
  if (/ne\s+prihva[ćc]a|odbija/.test(lower)) return 'Ne prihvaća se';
  if (/prima\s+se\s+na\s+znanje|primljeno\s+na\s+znanje|bez\s+primjed/.test(lower)) {
    return 'Prima se na znanje';
  }
  if (/prihva[ćc]a|usvaja/.test(lower)) return 'Prihvaća se';
  return 'Na razmatranju';
}

/**
 * Lokalno parsira Word tablicu primjedbi (4 stupca: TDU/Dionici | Primjedbe | Prihvaćenost | Obrazloženje)
 * iz .docx datoteke ili iz već parsiranog Markdown teksta dokumenta (0 AI troška).
 */
export async function parseExistingPrimjedbeFromDocxBuffer(
  buffer: Buffer,
  sourceDocId: string,
  sourceDocName: string
): Promise<Omit<PrimjedbaItem, 'id' | 'createdAt' | 'updatedAt'>[]> {
  const htmlRes = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(htmlRes.value || '');
  const items: Omit<PrimjedbaItem, 'id' | 'createdAt' | 'updatedAt'>[] = [];

  $('table').each((_, table) => {
    let lastTijelo = '';
    $(table)
      .find('tr')
      .each((rowIdx, tr) => {
        const tds = $(tr).children('td, th').toArray();
        if (tds.length < 2) return;

        const getCellParagraphs = (td: any): string[] => {
          const ps: string[] = [];
          const pEls = $(td).find('p');
          if (pEls.length > 0) {
            pEls.each((__, p) => {
              const t = $(p).text().replace(/\s+/g, ' ').trim();
              if (t) ps.push(t);
            });
          } else {
            const t = $(td).text().replace(/\s+/g, ' ').trim();
            if (t) ps.push(t);
          }
          return ps;
        };

        const col0 = getCellParagraphs(tds[0]).join(' ');
        const col1Paras = getCellParagraphs(tds[1]);
        const col2Paras = tds[2] ? getCellParagraphs(tds[2]) : [];
        const col3Paras = tds[3] ? getCellParagraphs(tds[3]) : [];

        // Preskoči zaglavlje tablice
        if (
          rowIdx === 0 &&
          /tdu|dionici|tijelo|predlagatelj/i.test(col0) &&
          /primjedb|mi[šs]ljenj/i.test(col1Paras.join(' '))
        ) {
          return;
        }

        const tijelo = col0 || lastTijelo;
        if (!tijelo && col1Paras.length === 0) return;
        if (col0) lastTijelo = col0;

        const senderInfo = detectSenderFromText(tijelo);

        // Ako ćelija sadrži više zasebnih primjedbi i jednak broj statusa (kao UZZ redak u stvarnoj tablici!),
        // razdvoji ih u pojedinačne strukturirane stavke po člancima!
        if (col1Paras.length > 1 && col2Paras.length === col1Paras.length) {
          for (let i = 0; i < col1Paras.length; i++) {
            const primjedbaTxt = col1Paras[i];
            const statusTxt = col2Paras[i] || '';
            const obrTxt = col3Paras[i] || (i === col1Paras.length - 1 ? col3Paras.slice(i).join('\n\n') : '');
            items.push({
              tijelo,
              kategorijaTijela: senderInfo.category,
              clanakOznaka: inferArticleFromCommentText(primjedbaTxt),
              tekstPrimjedbe: primjedbaTxt,
              status: normalizePrimjedbaStatus(statusTxt, primjedbaTxt),
              obrazlozenje: obrTxt,
              izvorniDokumentId: sourceDocId,
              izvorniDokumentNaziv: sourceDocName,
              izvorUnosa: 'lokalni_docx_uvoz',
            });
          }
        } else {
          const fullPrimjedba = col1Paras.join('\n\n').trim();
          const fullStatus = col2Paras.join(' ').trim();
          const fullObr = col3Paras.join('\n\n').trim();
          if (!fullPrimjedba && !fullObr) return;

          items.push({
            tijelo,
            kategorijaTijela: senderInfo.category,
            clanakOznaka: inferArticleFromCommentText(fullPrimjedba),
            tekstPrimjedbe: fullPrimjedba || '(Bez primjedbi / opće očitovanje)',
            status: normalizePrimjedbaStatus(fullStatus, fullPrimjedba),
            obrazlozenje: fullObr,
            izvorniDokumentId: sourceDocId,
            izvorniDokumentNaziv: sourceDocName,
            izvorUnosa: 'lokalni_docx_uvoz',
          });
        }
      });
  });

  return items;
}

/**
 * Fallback: parsiranje Markdown tablice primjedbi iz spremljenog `rawText` ako izvorni .docx buffer nije na disku.
 */
export function parseExistingPrimjedbeFromMarkdown(
  rawText: string,
  sourceDocId: string,
  sourceDocName: string
): Omit<PrimjedbaItem, 'id' | 'createdAt' | 'updatedAt'>[] {
  const lines = (rawText || '').split(/\r?\n/);
  const items: Omit<PrimjedbaItem, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  let lastTijelo = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
    const cells = trimmed
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, '|').trim());

    if (cells.length < 2) continue;
    if (cells.every((c) => /^[-:\s]+$/.test(c))) continue;
    if (/tdu|dionici|tijelo/i.test(cells[0]) && /primjedb|mi[šs]ljenj/i.test(cells[1])) {
      continue;
    }

    const tijelo = cells[0] || lastTijelo;
    if (cells[0]) lastTijelo = cells[0];
    const tekstPrimjedbe = cells[1] || '';
    const statusRaw = cells[2] || '';
    const obrazlozenje = cells[3] || '';

    if (!tijelo && !tekstPrimjedbe) continue;
    const senderInfo = detectSenderFromText(tijelo);

    items.push({
      tijelo: tijelo || 'Nepoznato tijelo',
      kategorijaTijela: senderInfo.category,
      clanakOznaka: inferArticleFromCommentText(tekstPrimjedbe),
      tekstPrimjedbe: tekstPrimjedbe || '(Bez primjedbi)',
      status: normalizePrimjedbaStatus(statusRaw, tekstPrimjedbe),
      obrazlozenje,
      izvorniDokumentId: sourceDocId,
      izvorniDokumentNaziv: sourceDocName,
      izvorUnosa: 'lokalni_docx_uvoz',
    });
  }

  return items;
}
