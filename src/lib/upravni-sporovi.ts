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
  status: 'neplaceno' | 'poslan_nalog' | 'placeno' | 'nema_troskova';
  rokPlacanja?: string;
  rokPlacanjaDate?: string;
  danaDoRoka?: number | null;
  hitnost: 'isteklo' | 'danas' | 'kriticno' | 'hitno' | 'u_roku' | 'rijeseno' | 'nema';
  opis: string;
  bojaOznake?: 'zuto' | 'smedje' | 'zeleno' | 'crveno' | 'nema';
  nalogDatum?: string;
  izvorPolje?: string;
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
  hasManualOverride?: boolean;
}

export const SPOROVI_OVERRIDES_PATH = path.join(process.cwd(), 'data', 'upravni-sporovi-overrides.json');

export interface SporOverride {
  aktUpIiPoPresudi?: string;
  odgovorNaTuzbu?: string;
  presudaTroskovi?: string;
  datumZapPresude?: string;
  zalbaPresuda?: string;
  visokiUpravniSud?: string;
  rjesavatelj?: string;
  vrijednostNapomena?: string;
  updatedAt?: string;
}

export function getSporoviOverrides(): Record<string, SporOverride> {
  if (fs.existsSync(SPOROVI_OVERRIDES_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SPOROVI_OVERRIDES_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

export function saveSporOverride(identifier: string, updates: SporOverride): void {
  const overrides = getSporoviOverrides();
  overrides[identifier] = {
    ...(overrides[identifier] || {}),
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  const dir = path.dirname(SPOROVI_OVERRIDES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SPOROVI_OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf8');
}

export function applySporOverrides(spor: UpravniSpor, overrides: Record<string, SporOverride>): UpravniSpor {
  const key = spor.poslovniBroj || spor.id;
  const ov = overrides[key] || (spor.poslovniBroj ? overrides[spor.poslovniBroj] : undefined) || overrides[spor.id];
  if (!ov) return spor;

  const aktUpIiPoPresudi = ov.aktUpIiPoPresudi !== undefined ? ov.aktUpIiPoPresudi : spor.aktUpIiPoPresudi;
  const odgovorNaTuzbu = ov.odgovorNaTuzbu !== undefined ? ov.odgovorNaTuzbu : spor.odgovorNaTuzbu;
  const presudaTroskovi = ov.presudaTroskovi !== undefined ? ov.presudaTroskovi : spor.presudaTroskovi;
  const datumZapPresude = ov.datumZapPresude !== undefined ? ov.datumZapPresude : spor.datumZapPresude;
  const zalbaPresuda = ov.zalbaPresuda !== undefined ? ov.zalbaPresuda : spor.zalbaPresuda;
  const visokiUpravniSud = ov.visokiUpravniSud !== undefined ? ov.visokiUpravniSud : spor.visokiUpravniSud;
  const rjesavatelj = ov.rjesavatelj !== undefined ? ov.rjesavatelj : spor.rjesavatelj;
  const vrijednostNapomena = ov.vrijednostNapomena !== undefined ? ov.vrijednostNapomena : spor.vrijednostNapomena;

  const isPresudeno = !!presudaTroskovi && presudaTroskovi.trim().length > 0;
  const isOdgovoreno = !!odgovorNaTuzbu && (
    odgovorNaTuzbu.toLowerCase().includes('odgovor') ||
    odgovorNaTuzbu.toLowerCase().includes('posl') ||
    odgovorNaTuzbu.toLowerCase().includes('dostavlj') ||
    odgovorNaTuzbu.toLowerCase().includes('kp')
  );

  let fazaOpis = spor.fazaOpis;
  if (isPresudeno) {
    if (spor.isSutnjaUprave && aktUpIiPoPresudi) {
      fazaOpis = `Presuđeno — Akt po presudi: ${aktUpIiPoPresudi}`;
    } else {
      fazaOpis = `Dovršeno / Presuđeno: ${presudaTroskovi}`;
    }
  } else if (aktUpIiPoPresudi) {
    fazaOpis = `Donesen akt: ${aktUpIiPoPresudi}`;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const troskoviInfo = parseTroskoviInfo(
    presudaTroskovi,
    aktUpIiPoPresudi,
    zalbaPresuda,
    vrijednostNapomena,
    datumZapPresude,
    today,
    spor.troskoviInfo?.bojaOznake ? { M: spor.troskoviInfo.bojaOznake } : undefined
  );

  return {
    ...spor,
    aktUpIiPoPresudi,
    odgovorNaTuzbu,
    presudaTroskovi,
    datumZapPresude,
    zalbaPresuda,
    visokiUpravniSud,
    rjesavatelj,
    vrijednostNapomena,
    isPresudeno,
    isOdgovoreno,
    fazaOpis,
    troskoviInfo,
    hasManualOverride: true,
  };
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
  today: Date,
  cellColors?: { J?: string; L?: string; M?: string; O?: string }
): TroskoviInfo {
  const combined = `${presuda} ${aktPoPresudi} ${zalba} ${napomena}`.trim();
  const lower = combined.toLowerCase();

  const hasYellow =
    cellColors &&
    (cellColors.L === 'zuto' ||
      cellColors.M === 'zuto' ||
      cellColors.O === 'zuto' ||
      cellColors.J === 'zuto');
  const hasBrown =
    cellColors &&
    (cellColors.L === 'smedje' ||
      cellColors.M === 'smedje' ||
      cellColors.O === 'smedje' ||
      cellColors.J === 'smedje');
  const hasGreen =
    cellColors &&
    (cellColors.L === 'zeleno' ||
      cellColors.M === 'zeleno' ||
      cellColors.O === 'zeleno' ||
      cellColors.J === 'zeleno');

  let bojaOznake: TroskoviInfo['bojaOznake'] = 'nema';
  if (hasYellow) bojaOznake = 'zuto';
  else if (hasBrown) bojaOznake = 'smedje';
  else if (hasGreen) bojaOznake = 'zeleno';

  if (!combined && bojaOznake === 'nema') {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  if (
    bojaOznake === 'nema' &&
    (lower.includes('nema troškova') ||
      lower.includes('nema troskova') ||
      lower.includes('bez troškova'))
  ) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  // Detect which field holds costs
  let izvorPolje: string | undefined;
  if (/1250|eur|€|troš|tros|kn|kuna|nalog/i.test(zalba) || cellColors?.M === 'zuto' || cellColors?.M === 'smedje') {
    izvorPolje = 'Stupac M (Žalba / Troškovi)';
  } else if (/1250|eur|€|troš|tros|kn|kuna|nalog/i.test(aktPoPresudi) || cellColors?.L === 'zuto' || cellColors?.L === 'smedje') {
    izvorPolje = 'Stupac L (Akt UP/II)';
  } else if (/1250|eur|€|troš|tros|kn|kuna|nalog/i.test(napomena) || cellColors?.O === 'zuto' || cellColors?.O === 'smedje') {
    izvorPolje = 'Stupac O (Napomena)';
  } else if (/1250|eur|€|troš|tros|kn|kuna|nalog/i.test(presuda) || cellColors?.J === 'zuto' || cellColors?.J === 'smedje') {
    izvorPolje = 'Stupac J (Presuda)';
  }

  // Look for amount: e.g. "1250 EUR", "1250,00 EUR", "1250,00 eura", "625 eur", "1875 eur", "2500 EUR", "3.125,00 kn", "3125 kn", or standard "1250"
  const iznosMatch =
    combined.match(/(\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\b\d+(?:[.,]\d{2})?)\s*(?:EUR|eur|€|eura|kuna|kn)\b/i) ||
    combined.match(/\b(1250|2500|3750|625|1875|5000)\b/);

  let iznos = iznosMatch ? iznosMatch[0].trim() : undefined;
  if (iznos && /^\d+$/.test(iznos)) {
    iznos = `${iznos} EUR`;
  }

  const isAwarded =
    !!iznos ||
    lower.includes('trošak') ||
    lower.includes('troškov') ||
    bojaOznake === 'zuto' ||
    bojaOznake === 'smedje';

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
    lower.includes('isplaćeno') ||
    bojaOznake === 'zeleno';

  const hasNalog = lower.includes('nalog') || bojaOznake === 'smedje';

  let status: TroskoviInfo['status'] = 'neplaceno';
  if (isPaid) status = 'placeno';
  else if (hasNalog) status = 'poslan_nalog';
  else if (bojaOznake === 'zuto') status = 'neplaceno';

  // Nalog datum
  const nalogMatch = combined.match(/nalog\s+(\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\.?)/i);
  const nalogDatum = nalogMatch ? nalogMatch[1] : undefined;

  let rokDate: Date | null = null;
  let rokStr: string | null = null;
  let opis = iznos ? `Dosuđeni troškovi: ${iznos}` : 'Dosuđeni troškovi spora';

  // Check explicit deadline in text (e.g. "rok 1.12.2026." or "rok 15.10.2026." or "do 21.11.2024.")
  const explicitDeadline = extractDeadline(combined);
  if (explicitDeadline.deadlineDate) {
    rokDate = explicitDeadline.deadlineDate;
    rokStr = explicitDeadline.deadlineStr;
    opis += ` (rok: ${rokStr})`;
  } else if (datumZapPresudeStr && !isPaid && !hasNalog) {
    // Presuda prvostupanjskog upravnog suda: 15 dana za žalbu + 15 dana paricijski rok = 30 dana od primitka
    const zapDate = parseCroatianDate(datumZapPresudeStr);
    if (zapDate) {
      const target = new Date(zapDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      rokDate = target;
      rokStr = `${rokDate.getDate()}.${rokDate.getMonth() + 1}.${rokDate.getFullYear()}.`;
      opis += ` (rok cca ${rokStr})`;
    }
  }

  let danaDoRoka: number | null = null;
  let hitnost: TroskoviInfo['hitnost'] = 'nema';

  if (isPaid) {
    hitnost = 'rijeseno';
    opis += ' — PLAĆENO';
  } else if (hasNalog) {
    hitnost = 'rijeseno';
    opis += nalogDatum ? ` — Nalog poslan ${nalogDatum}` : ' — Nalog poslan računovodstvu';
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
    iznos: iznos || (bojaOznake === 'zuto' || bojaOznake === 'smedje' ? '1.250 EUR' : undefined),
    status,
    rokPlacanja: rokStr || undefined,
    rokPlacanjaDate: rokDate ? rokDate.toISOString() : undefined,
    danaDoRoka,
    hitnost,
    opis,
    bojaOznake,
    nalogDatum,
    izvorPolje,
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

  const overrides = getSporoviOverrides();

  // Use cache if alive and not force refresh
  if (!forceRefresh && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const sample = cached.sporovi?.find((s: UpravniSpor) => s.tuzitelj?.includes('MORAVICE'));
      const hasModernCosts = sample && sample.troskoviInfo?.bojaOznake;
      if (hasModernCosts && (!canReadLive || cached.fileMtime === fileMtime)) {
        const merged = (cached.sporovi || []).map((s: UpravniSpor) => applySporOverrides(s, overrides));
        return { sporovi: merged, lastModified: cached.fileMtime || new Date().toISOString(), source: 'cache' };
      }
    } catch {
      // continue to parse
    }
  }

  if (!canReadLive && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const merged = (cached.sporovi || []).map((s: UpravniSpor) => applySporOverrides(s, overrides));
    return { sporovi: merged, lastModified: cached.fileMtime || '', source: 'cache' };
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

    // Parse styles.xml for cell highlight colors (yellow = unpaid cost, brown = sent order to accounting, green = paid)
    const stylesXmlPath = path.join(xlDir, 'styles.xml');
    const cellXfsFills: number[] = [];
    const fillColors: Record<number, 'zuto' | 'smedje' | 'zeleno' | 'crveno' | 'ostalo'> = {};

    if (fs.existsSync(stylesXmlPath)) {
      const stylesXml = fs.readFileSync(stylesXmlPath, 'utf8');
      const fillsMatch = stylesXml.match(/<fills[^>]*>([\s\S]*?)<\/fills>/);
      const rawFills: string[] = [];
      if (fillsMatch) {
        for (const f of fillsMatch[1].matchAll(/<fill>([\s\S]*?)<\/fill>/g)) {
          rawFills.push(f[1]);
        }
      }
      rawFills.forEach((fXml, idx) => {
        if (fXml.includes('FFFFFF00') || fXml.includes('FFFFC000')) {
          fillColors[idx] = 'zuto';
        } else if (
          fXml.includes('theme="9"') ||
          fXml.includes('theme="5"') ||
          fXml.includes('theme="6"') ||
          fXml.includes('theme="7"')
        ) {
          fillColors[idx] = 'smedje';
        } else if (fXml.includes('FF92D050')) {
          fillColors[idx] = 'zeleno';
        } else if (fXml.includes('FFFF0000')) {
          fillColors[idx] = 'crveno';
        } else {
          fillColors[idx] = 'ostalo';
        }
      });

      const cellXfsMatch = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/);
      if (cellXfsMatch) {
        for (const x of cellXfsMatch[1].matchAll(/<xf\s+([^>]*)\/?>/g)) {
          const m = x[1].match(/fillId="(\d+)"/);
          cellXfsFills.push(m ? parseInt(m[1], 10) : 0);
        }
      }
    }

    const xml = fs.readFileSync(path.join(xlDir, 'worksheets', 'sheet1.xml'), 'utf8');
    const sporovi: UpravniSpor[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const rMatch of xml.matchAll(/<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowNum = parseInt(rMatch[1], 10);
      if (rowNum < 5) continue; // headers are on row 4

      const cMatches = rMatch[2].matchAll(/<c\s+([^>]+)>(?:<v>([^<]*)<\/v>)?<\/c>/g);
      const cells: Record<string, string> = {};
      const cellColors: Record<string, 'zuto' | 'smedje' | 'zeleno' | 'crveno' | 'ostalo'> = {};

      for (const c of cMatches) {
        const attrs = c[1];
        const val = c[2];
        const colMatch = attrs.match(/r="([A-Z]+)\d+"/);
        if (!colMatch) continue;
        const col = colMatch[1];
        const sMatch = attrs.match(/s="(\d+)"/);
        const tMatch = attrs.match(/t="([^"]*)"/);

        let text = val;
        if (tMatch && tMatch[1] === 's' && text !== undefined) {
          text = strings[parseInt(text, 10)] || '';
        }
        cells[col] = (text || '').trim();

        if (sMatch) {
          const sIdx = parseInt(sMatch[1], 10);
          const fId = cellXfsFills[sIdx] ?? 0;
          cellColors[col] = fillColors[fId] || 'ostalo';
        }
      }

      const aVal = (cells['A'] || '').trim();
      const bVal = (cells['B'] || '').trim();
      const sud = (cells['C'] || '').trim();
      const poslBroj = (cells['D'] || '').trim();

      // Skip empty or separator rows (e.g. "2026", "2025")
      if (!poslBroj && (!bVal || /^\d{4}$/.test(aVal))) continue;
      if (!poslBroj && !bVal) continue;

      const tuziteljRaw = bVal || aVal;
      if (!tuziteljRaw || /^\d{4}$/.test(tuziteljRaw)) continue;

      let rbr = rowNum - 4;
      if (aVal && /^\d+$/.test(aVal)) {
        rbr = parseInt(aVal, 10);
      }

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
        today,
        cellColors
      );

      sporovi.push({
        id: `spor-${rowNum}`,
        rbr,
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

    const finalSporovi = sporovi.map((s) => applySporOverrides(s, overrides));

    // Save to cache
    const cacheData = {
      fileMtime,
      savedAt: new Date().toISOString(),
      count: finalSporovi.length,
      sporovi: finalSporovi,
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');

    return { sporovi: finalSporovi, lastModified: fileMtime, source: 'live' };
  } catch (err) {
    console.error('Error parsing live Excel sporovi:', err);
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const merged = (cached.sporovi || []).map((s: UpravniSpor) => applySporOverrides(s, overrides));
      return { sporovi: merged, lastModified: cached.fileMtime || '', source: 'cache' };
    }
    return { sporovi: [], lastModified: '', source: 'cache' };
  }
}
