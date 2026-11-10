import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export const EXCEL_SPOROVI_PATH =
  'C:\\Users\\dmalbasa\\OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije\\P O S A O\\UPRAVNI SPOROVI\\TABLICA - upravni sporovi\\TABLICA - U P R A V N I  S P O R O V I.xlsx';

export const E_KOMUNIKACIJA_PATH =
  'C:\\Users\\dmalbasa\\OneDrive - Ministarstvo zaštite okoliša i zelene tranzicije\\P O S A O\\UPRAVNI SPOROVI\\e_komunikacija sa sudovima';

export interface TroskoviInfo {
  imaTroskova: boolean;
  iznos?: string;
  status: 'neplaceno' | 'placeno' | 'poslan_nalog' | 'nema_troskova';
  rokPlacanja?: string;
  rokPlacanjaDate?: string;
  danaDoRoka?: number | null;
  hitnost: 'isteklo' | 'danas' | 'kriticno' | 'hitno' | 'u_roku' | 'rijeseno' | 'nema';
  opis: string;
}

export interface UpravniSpor {
  id: string;
  rbr: number;
  rowNum: number;
  tuzitelj: string;
  oib?: string;
  sud: string;
  poslovniBroj: string;
  upIiRjesenje: string;
  predmet: string;
  rjesavatelj: string;
  tuzbaPreuzeta: string;
  odgovorNaTuzbu: string;
  presudaTroskovi: string;
  datumZapPresude: string;
  aktUpIiPoPresudi: string;
  zalbaPresuda: string;
  visokiUpravniSud: string;
  vrijednostNapomena: string;
  // Computed helpers
  isSutnjaUprave: boolean;
  isOdgovoreno: boolean;
  isPresudeno: boolean;
  rokDatum?: string | null;
  rokDatumObj?: string | null;
  danaDoRoka?: number | null;
  hitnost: 'isteklo' | 'danas' | 'kriticno' | 'hitno' | 'u_roku' | 'rijeseno' | 'nepoznato';
  fazaOpis: string;
  troskoviInfo?: TroskoviInfo;
}

const MONTHS_HR: Record<string, number> = {
  siječnja: 0,
  sij: 0,
  veljače: 1,
  velj: 1,
  ožujka: 2,
  ožu: 2,
  travnja: 3,
  tra: 3,
  svibnja: 4,
  svi: 4,
  lipnja: 5,
  lip: 5,
  srpnja: 6,
  srp: 6,
  kolovoza: 7,
  kol: 7,
  rujna: 8,
  ruj: 8,
  listopada: 9,
  lis: 9,
  studenoga: 10,
  studenog: 10,
  stu: 10,
  prosinca: 11,
  pro: 11,
};

export function parseCroatianDate(str: string): Date | null {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  // Pattern: DD.MM.YYYY. or DD.MM.YY.
  const dmy = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,5})\.?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    let year = parseInt(dmy[3], 10);
    if (year === 20226) year = 2026;
    else if (year < 100) year += 2000;
    if (year >= 2000 && year <= 2040 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Pattern: DD. [mjesec] YYYY.
  for (const [mName, mIdx] of Object.entries(MONTHS_HR)) {
    if (s.includes(mName)) {
      const match = s.match(new RegExp(`(\\d{1,2})\\.?\\s*${mName}\\s*(\\d{4})\\.?`));
      if (match) {
        return new Date(parseInt(match[2], 10), mIdx, parseInt(match[1], 10));
      }
    }
  }

  return null;
}

function extractDeadline(text: string): { deadlineDate: Date | null; deadlineStr: string | null } {
  if (!text) return { deadlineDate: null, deadlineStr: null };

  // Look for "rok DD.MM.YYYY" or "do DD.MM.YYYY"
  const patterns = [
    /(?:rok|do)\s+(\d{1,2}\.\d{1,2}\.\d{2,4}\.?)/i,
    /rok\s+(\d{1,2}\.\s*[a-žčćđš]+\s*\d{4}\.?)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const d = parseCroatianDate(m[1]);
      if (d) return { deadlineDate: d, deadlineStr: m[1] };
    }
  }

  // Fallback: any date in text
  const anyD = parseCroatianDate(text);
  if (anyD) return { deadlineDate: anyD, deadlineStr: text.trim() };

  return { deadlineDate: null, deadlineStr: null };
}

export function parseTroskoviInfo(
  presuda: string,
  aktPoPresudi: string,
  zalba: string,
  napomena: string,
  datumZapPresudeStr: string,
  today: Date
): TroskoviInfo {
  const combined = `${presuda} ${aktPoPresudi} ${zalba} ${napomena}`.trim();
  const lower = combined.toLowerCase();

  if (
    !lower ||
    lower.includes('nema troškova') ||
    lower.includes('nema troskova') ||
    lower.includes('bez troškova')
  ) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  // Look for amount: e.g. "1250 EUR", "1250,00 EUR", "625 eur", "1875 eur", "2500 EUR", "3.125,00 kn", "3125 kn"
  const iznosMatch =
    combined.match(/(\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\b\d+)\s*(?:EUR|eur|€)/) ||
    combined.match(/(\b\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\b\d+)\s*(?:kn|kuna)/i);

  const iznos = iznosMatch ? iznosMatch[0].trim() : undefined;
  const isAwarded = !!iznos || lower.includes('trošak') || lower.includes('troškov');

  if (!isAwarded) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema zabilježenih troškova',
    };
  }

  const isPaid =
    lower.includes('plaćeno') ||
    lower.includes('placeno') ||
    lower.includes('podmireno') ||
    lower.includes('isplaćeno');
  const hasNalog = lower.includes('nalog');

  let status: TroskoviInfo['status'] = 'neplaceno';
  if (isPaid) status = 'placeno';
  else if (hasNalog) status = 'poslan_nalog';

  let rokDate: Date | null = null;
  let rokStr: string | null = null;
  let opis = iznos ? `Dosuđeni troškovi: ${iznos}` : 'Dosuđeni troškovi spora';

  // Check explicit deadline in text (e.g. "rok 1.12.2026." or "rok 15.10.2026.")
  const explicitDeadline = extractDeadline(combined);
  if (explicitDeadline.deadlineDate) {
    rokDate = explicitDeadline.deadlineDate;
    rokStr = explicitDeadline.deadlineStr;
    opis += ` (rok: ${rokStr})`;
  } else if (datumZapPresudeStr) {
    // "15 dana od pravomoćnosti"
    // Presuda prvostupanjskog upravnog suda: 15 dana za žalbu + 15 dana paricijski rok = 30 dana od primitka!
    const zapDate = parseCroatianDate(datumZapPresudeStr);
    if (zapDate) {
      const target = new Date(zapDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      rokDate = target;
      rokStr = `${rokDate.getDate()}.${rokDate.getMonth() + 1}.${rokDate.getFullYear()}.`;
      opis += ` (15 d pravomoćnost + 15 d paricijski rok = ${rokStr})`;
    }
  }

  let danaDoRoka: number | null = null;
  let hitnost: TroskoviInfo['hitnost'] = 'nema';

  if (isPaid || hasNalog) {
    hitnost = 'rijeseno';
    if (isPaid) opis += ' — PLAĆENO';
    else if (hasNalog) opis += ' — Nalog poslan računovodstvu';
  } else if (rokDate) {
    const target = new Date(rokDate);
    target.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - today.getTime();
    danaDoRoka = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (danaDoRoka < 0) hitnost = 'isteklo';
    else if (danaDoRoka === 0) hitnost = 'danas';
    else if (danaDoRoka <= 5) hitnost = 'kriticno';
    else if (danaDoRoka <= 15) hitnost = 'hitno';
    else hitnost = 'u_roku';
  }

  return {
    imaTroskova: true,
    iznos,
    status,
    rokPlacanja: rokStr || undefined,
    rokPlacanjaDate: rokDate ? rokDate.toISOString() : undefined,
    danaDoRoka,
    hitnost,
    opis,
  };
}

export function parseExcelSporovi(forceRefresh = false): {
  sporovi: UpravniSpor[];
  lastModified: string;
  source: 'live' | 'cache';
} {
  const cachePath = path.join(process.cwd(), 'data', 'upravni-sporovi-cache.json');
  const tempDir = path.join(process.cwd(), 'data', 'excel_temp');
  const tempZip = path.join(tempDir, 'sporovi.zip');
  const unpackDir = path.join(tempDir, 'unpacked');

  let fileMtime = '';
  let canReadLive = false;

  try {
    if (fs.existsSync(EXCEL_SPOROVI_PATH)) {
      const stat = fs.statSync(EXCEL_SPOROVI_PATH);
      fileMtime = stat.mtime.toISOString();
      canReadLive = true;
    }
  } catch {
    canReadLive = false;
  }

  // Use cache if alive and not force refresh
  if (!forceRefresh && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (!canReadLive || cached.fileMtime === fileMtime) {
        return { sporovi: cached.sporovi, lastModified: cached.fileMtime || new Date().toISOString(), source: 'cache' };
      }
    } catch {
      // continue to parse
    }
  }

  if (!canReadLive && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return { sporovi: cached.sporovi, lastModified: cached.fileMtime || '', source: 'cache' };
  }

  if (!canReadLive) {
    return { sporovi: [], lastModified: '', source: 'cache' };
  }

  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    // PowerShell Copy handles OneDrive / Excel open file locks cleanly
    execSync(
      `powershell -NoProfile -Command "Copy-Item -LiteralPath '${EXCEL_SPOROVI_PATH}' -Destination '${tempZip}' -Force; Expand-Archive -LiteralPath '${tempZip}' -DestinationPath '${unpackDir}' -Force"`
    );

    const xlDir = path.join(unpackDir, 'xl');
    const sstXml = fs.readFileSync(path.join(xlDir, 'sharedStrings.xml'), 'utf8');
    const strings: string[] = [];
    for (const m of sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      strings.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
    }

    const xml = fs.readFileSync(path.join(xlDir, 'worksheets', 'sheet1.xml'), 'utf8');
    const sporovi: UpravniSpor[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const rMatch of xml.matchAll(/<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowNum = parseInt(rMatch[1], 10);
      if (rowNum < 5) continue; // headers are on row 4

      const cMatches = rMatch[2].matchAll(
        /<c\s+r="([A-Z]+)\d+"(?:[^t]*t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>)?<\/c>/g
      );
      const cells: Record<string, string> = {};
      for (const c of cMatches) {
        let text = c[3];
        if (c[2] === 's' && text !== undefined) {
          text = strings[parseInt(text, 10)] || '';
        }
        cells[c[1]] = (text || '').trim();
      }

      const tuziteljRaw = cells['A'] || cells['B'] || '';
      const sud = cells['C'] || '';
      const poslBroj = cells['D'] || '';
      if (!tuziteljRaw && !poslBroj) continue;
      if (!poslBroj && /^\d{4}$/.test(tuziteljRaw.trim())) continue;

      // Extract OIB
      const oibMatch = tuziteljRaw.match(/OIB:\s*(\d{11})/i);
      const oib = oibMatch ? oibMatch[1] : undefined;
      const cleanTuzitelj = tuziteljRaw.replace(/\(OIB:.*?\)/i, '').trim();

      const upIi = cells['E'] || '';
      const odgovor = cells['I'] || '';
      const presuda = cells['J'] || '';
      const datumZapPresude = cells['K'] || '';
      const aktPoPresudi = cells['L'] || '';

      const isSutnja =
        upIi.toLowerCase().includes('šutnja') ||
        tuziteljRaw.toLowerCase().includes('šutnja') ||
        (cells['F'] || '').toLowerCase().includes('šutnja');

      const isPresudeno = !!(presuda || datumZapPresude || aktPoPresudi);
      const isOdgovoreno =
        odgovor.toLowerCase().includes('odgovor') ||
        odgovor.toLowerCase().includes('poslan') ||
        odgovor.toLowerCase().includes('odg.') ||
        odgovor.toLowerCase().includes('kp');

      // Check deadline for answer or for post-verdict act
      let rokDatumObj: Date | null = null;
      let rokDatumStr: string | null = null;
      let fazaOpis = 'Čeka se odgovor na tužbu';

      if (isPresudeno) {
        fazaOpis = presuda ? `Presuda: ${presuda}` : 'Presuđeno';
        // Check deadline for act upon judgment (e.g. "rok 13.11.2026")
        if (aktPoPresudi && aktPoPresudi.toLowerCase().includes('rok')) {
          const actDeadline = extractDeadline(aktPoPresudi);
          if (actDeadline.deadlineDate) {
            rokDatumObj = actDeadline.deadlineDate;
            rokDatumStr = actDeadline.deadlineStr;
            fazaOpis = `Donošenje akta po presudi (${aktPoPresudi})`;
          }
        }
      } else if (isOdgovoreno) {
        fazaOpis = 'Odgovor na tužbu poslan — čeka se odluka suda';
      } else {
        const dInfo = extractDeadline(odgovor);
        rokDatumObj = dInfo.deadlineDate;
        rokDatumStr = dInfo.deadlineStr;
      }

      let danaDoRoka: number | null = null;
      let hitnost: UpravniSpor['hitnost'] = 'nepoznato';

      if (isPresudeno && !rokDatumObj) {
        hitnost = 'rijeseno';
      } else if (isOdgovoreno && !rokDatumObj) {
        hitnost = 'rijeseno';
      } else if (rokDatumObj) {
        const target = new Date(rokDatumObj);
        target.setHours(0, 0, 0, 0);
        const diffMs = target.getTime() - today.getTime();
        danaDoRoka = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (danaDoRoka < 0) hitnost = 'isteklo';
        else if (danaDoRoka === 0) hitnost = 'danas';
        else if (danaDoRoka <= 3) hitnost = 'kriticno';
        else if (danaDoRoka <= 10) hitnost = 'hitno';
        else hitnost = 'u_roku';
      }

      const troskoviInfo = parseTroskoviInfo(
        presuda,
        aktPoPresudi,
        cells['M'] || '',
        cells['O'] || '',
        datumZapPresude,
        today
      );

      sporovi.push({
        id: `spor-${rowNum}`,
        rbr: rowNum - 4,
        rowNum,
        tuzitelj: cleanTuzitelj || tuziteljRaw,
        oib,
        sud,
        poslovniBroj: poslBroj,
        upIiRjesenje: upIi,
        predmet: cells['F'] || '',
        rjesavatelj: cells['G'] || '',
        tuzbaPreuzeta: cells['H'] || '',
        odgovorNaTuzbu: odgovor,
        presudaTroskovi: presuda,
        datumZapPresude,
        aktUpIiPoPresudi: aktPoPresudi,
        zalbaPresuda: cells['M'] || '',
        visokiUpravniSud: cells['N'] || '',
        vrijednostNapomena: cells['O'] || '',
        isSutnjaUprave: isSutnja,
        isOdgovoreno,
        isPresudeno,
        rokDatum: rokDatumStr,
        rokDatumObj: rokDatumObj ? rokDatumObj.toISOString() : null,
        danaDoRoka,
        hitnost,
        fazaOpis,
        troskoviInfo,
      });
    }

    // Save to cache
    const cacheData = {
      fileMtime,
      savedAt: new Date().toISOString(),
      count: sporovi.length,
      sporovi,
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');

    return { sporovi, lastModified: fileMtime, source: 'live' };
  } catch (err) {
    console.error('Error parsing live Excel sporovi:', err);
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      return { sporovi: cached.sporovi, lastModified: cached.fileMtime || '', source: 'cache' };
    }
    return { sporovi: [], lastModified: '', source: 'cache' };
  }
}
