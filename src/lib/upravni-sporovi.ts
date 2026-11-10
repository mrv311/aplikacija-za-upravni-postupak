import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { supabaseServer as dbServer } from './supabase-server';
import { supabase as dbClient } from './supabase';

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
  isDismissed?: boolean;
  dismissedReason?: string;
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
  isDismissed?: boolean;
  dismissedReason?: string;
  updatedAt?: string;
}

export function getSporoviOverridesFromFile(): Record<string, SporOverride> {
  if (fs.existsSync(SPOROVI_OVERRIDES_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SPOROVI_OVERRIDES_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

let cachedDbOverrides: Record<string, SporOverride> | null = null;
let lastDbFetchTime = 0;

export async function getSporoviOverridesAsync(): Promise<Record<string, SporOverride>> {
  const fileOverrides = getSporoviOverridesFromFile();
  const now = Date.now();
  if (cachedDbOverrides && now - lastDbFetchTime < 5000) {
    return { ...fileOverrides, ...cachedDbOverrides };
  }

  try {
    const db = dbServer || dbClient;
    if (db) {
      const { data, error } = await db
        .from('pravna_praksa')
        .select('sadrzaj')
        .eq('naslov', 'UPRAVNI_SPOROVI_OVERRIDES')
        .maybeSingle();

      if (!error && data?.sadrzaj) {
        const dbOverrides = JSON.parse(data.sadrzaj);
        cachedDbOverrides = dbOverrides;
        lastDbFetchTime = now;
        return { ...fileOverrides, ...dbOverrides };
      }
    }
  } catch (err) {
    console.warn('Greška pri dohvaćanju sporovi overrides iz Supabase:', err);
  }

  return fileOverrides;
}

export async function saveSporOverrideAsync(
  identifier: string,
  updates: SporOverride
): Promise<Record<string, SporOverride>> {
  const current = await getSporoviOverridesAsync();
  current[identifier] = {
    ...(current[identifier] || {}),
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // 1. Spremi u Supabase
  try {
    const db = dbServer || dbClient;
    if (db) {
      const sadrzaj = JSON.stringify(current, null, 2);
      const { data: existing } = await db
        .from('pravna_praksa')
        .select('id')
        .eq('naslov', 'UPRAVNI_SPOROVI_OVERRIDES')
        .maybeSingle();

      if (existing?.id) {
        await db
          .from('pravna_praksa')
          .update({ sadrzaj, kategorija: 'SYSTEM_OVERRIDES' })
          .eq('id', existing.id);
      } else {
        await db
          .from('pravna_praksa')
          .insert({
            naslov: 'UPRAVNI_SPOROVI_OVERRIDES',
            kategorija: 'SYSTEM_OVERRIDES',
            sadrzaj,
          });
      }
    }
  } catch (dbErr) {
    console.error('Greška pri spremanju sporovi overrides u Supabase:', dbErr);
  }

  // 2. Spremi u lokalnu datoteku (ako je filesystem read-write, npr. lokalni dev)
  try {
    const dir = path.dirname(SPOROVI_OVERRIDES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SPOROVI_OVERRIDES_PATH, JSON.stringify(current, null, 2), 'utf8');
  } catch {
    // Na Vercelu je filesystem read-only (EROFS), što je normalno i ignoriramo
  }

  cachedDbOverrides = current;
  lastDbFetchTime = Date.now();
  return current;
}

export function getSporoviOverrides(): Record<string, SporOverride> {
  const file = getSporoviOverridesFromFile();
  if (cachedDbOverrides) {
    return { ...file, ...cachedDbOverrides };
  }
  return file;
}

export function saveSporOverride(identifier: string, updates: SporOverride): void {
  const overrides = getSporoviOverrides();
  overrides[identifier] = {
    ...(overrides[identifier] || {}),
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  try {
    const dir = path.dirname(SPOROVI_OVERRIDES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SPOROVI_OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf8');
  } catch {
    // Ignore read-only fs error on Vercel
  }
}

export const SPOROVI_CUSTOM_PATH = path.join(process.cwd(), 'data', 'upravni-sporovi-custom.json');

export function getCustomSporoviFromFile(): UpravniSpor[] {
  if (fs.existsSync(SPOROVI_CUSTOM_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SPOROVI_CUSTOM_PATH, 'utf8'));
    } catch {
      return [];
    }
  }
  return [];
}

let cachedCustomSporovi: UpravniSpor[] | null = null;
let lastCustomFetchTime = 0;

export async function getCustomSporoviAsync(): Promise<UpravniSpor[]> {
  const fileSporovi = getCustomSporoviFromFile();
  const now = Date.now();
  if (cachedCustomSporovi && now - lastCustomFetchTime < 5000) {
    const map = new Map<string, UpravniSpor>();
    fileSporovi.forEach((s) => map.set(s.poslovniBroj || s.id, s));
    cachedCustomSporovi.forEach((s) => map.set(s.poslovniBroj || s.id, s));
    return Array.from(map.values());
  }

  try {
    const db = dbServer || dbClient;
    if (db) {
      const { data, error } = await db
        .from('pravna_praksa')
        .select('sadrzaj')
        .eq('naslov', 'UPRAVNI_SPOROVI_CUSTOM')
        .maybeSingle();

      if (!error && data?.sadrzaj) {
        const dbSporovi: UpravniSpor[] = JSON.parse(data.sadrzaj);
        cachedCustomSporovi = dbSporovi;
        lastCustomFetchTime = now;
        const map = new Map<string, UpravniSpor>();
        fileSporovi.forEach((s) => map.set(s.poslovniBroj || s.id, s));
        dbSporovi.forEach((s) => map.set(s.poslovniBroj || s.id, s));
        return Array.from(map.values());
      }
    }
  } catch (err) {
    console.warn('Greška pri dohvaćanju custom sporova iz Supabase:', err);
  }

  return fileSporovi;
}

export async function saveCustomSporAsync(newOrUpdated: UpravniSpor): Promise<UpravniSpor[]> {
  const current = await getCustomSporoviAsync();
  const existingIdx = current.findIndex(
    (s) =>
      (newOrUpdated.poslovniBroj && s.poslovniBroj === newOrUpdated.poslovniBroj) ||
      s.id === newOrUpdated.id
  );

  let updatedList: UpravniSpor[];
  if (existingIdx >= 0) {
    updatedList = [...current];
    updatedList[existingIdx] = { ...updatedList[existingIdx], ...newOrUpdated };
  } else {
    updatedList = [newOrUpdated, ...current];
  }

  // 1. Spremi u Supabase
  try {
    const db = dbServer || dbClient;
    if (db) {
      const sadrzaj = JSON.stringify(updatedList, null, 2);
      const { data: existing } = await db
        .from('pravna_praksa')
        .select('id')
        .eq('naslov', 'UPRAVNI_SPOROVI_CUSTOM')
        .maybeSingle();

      if (existing?.id) {
        await db
          .from('pravna_praksa')
          .update({ sadrzaj, kategorija: 'SYSTEM_CUSTOM_SPOROVI' })
          .eq('id', existing.id);
      } else {
        await db
          .from('pravna_praksa')
          .insert({
            naslov: 'UPRAVNI_SPOROVI_CUSTOM',
            kategorija: 'SYSTEM_CUSTOM_SPOROVI',
            sadrzaj,
          });
      }
    }
  } catch (dbErr) {
    console.error('Greška pri spremanju custom sporova u Supabase:', dbErr);
  }

  // 2. Sigurno spremi lokalno ako filesystem dopušta
  try {
    const dir = path.dirname(SPOROVI_CUSTOM_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SPOROVI_CUSTOM_PATH, JSON.stringify(updatedList, null, 2), 'utf8');
  } catch {
    // Ignoriraj EROFS na Vercelu
  }

  cachedCustomSporovi = updatedList;
  lastCustomFetchTime = Date.now();
  return updatedList;
}

export function applySporOverrides(spor: UpravniSpor, overrides: Record<string, SporOverride>): UpravniSpor {
  const key = spor.poslovniBroj || spor.id;
  let ov =
    overrides[key] ||
    (spor.poslovniBroj ? overrides[spor.poslovniBroj] : undefined) ||
    (spor.poslovniBroj ? overrides[spor.poslovniBroj.trim()] : undefined) ||
    (spor.id ? overrides[spor.id] : undefined);

  if (!ov && spor.poslovniBroj) {
    const pbLower = spor.poslovniBroj.toLowerCase().trim();
    for (const [k, v] of Object.entries(overrides)) {
      if (k.toLowerCase().trim() === pbLower) {
        ov = v;
        break;
      }
    }
  }

  if (!ov) return spor;

  if (ov.isDismissed) {
    return {
      ...spor,
      isDismissed: true,
      dismissedReason: ov.dismissedReason || 'Uklonjeno iz aktivnih sporova',
      hitnost: 'rijeseno',
      danaDoRoka: null,
      rokDatum: null,
      rokDatumObj: null,
      fazaOpis: ov.dismissedReason ? `Uklonjeno: ${ov.dismissedReason}` : 'Uklonjeno iz aktivnih sporova',
      hasManualOverride: true,
    };
  }

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

export function extractDeadline(text: string): { deadlineDate: Date | null; deadlineStr: string | null } {
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

export function extractCostAmount(text: string): string | undefined {
  if (!text) return undefined;

  // 1. Iznos praćen valutom: npr. "2.812,5 kn", "331,8 EUR", "1250 eur", "10.156,25kn", "1.250,00 kn", "750,00 EUR"
  const m1 = text.match(
    /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:EUR|eur|€|eura|kn|kuna)\b/i
  );
  if (m1) return m1[0].trim();

  // 2. Iznos praćen riječju "troškovi" ili "trošak": npr. "3.125,00 troškovi"
  const m2 = text.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:troš|tros)/i);
  if (m2) {
    const val = m2[1].trim();
    const curr = text.toLowerCase().includes('eur') ? ' EUR' : ' kn';
    return `${val}${curr}`;
  }

  // 3. Iznos praćen riječju "nalog": npr. "2812,5 nalog" ili "1250 - nalog"
  const m3 = text.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:-\s*)?nalog/i);
  if (m3) {
    const val = m3[1].trim();
    const num = parseFloat(val.replace(/\./g, '').replace(',', '.'));
    const curr = text.toLowerCase().includes('eur') || num <= 2000 ? ' EUR' : ' kn';
    return `${val}${curr}`;
  }

  // 4. Standardni iznosi troškova u praksi (1250, 2500, 3750, 625, 1875 u eurima; 3125, 6250 u kunama)
  const m4 = text.match(/\b(1250|2500|3750|625|1875)\b/);
  if (m4) return `${m4[1]} EUR`;

  const m5 = text.match(/\b(3125|6250)\b/);
  if (m5) return `${m5[1]} kn`;

  return undefined;
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
  const combined = `${napomena} ${aktPoPresudi} ${zalba} ${presuda}`.trim();
  const lower = combined.toLowerCase();

  // 1. Ako u polju Razno / Napomena nije ništa upisano i nema spomena troškova u ostalim poljima:
  // NEMA TROŠKOVA (zelena boja je korisnikova oznaka pozitivnog ishoda spora za ministarstvo!)
  if (!napomena && !lower.includes('trošak') && !lower.includes('troškov') && !lower.includes('nalog')) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  // 2. Eksplicitno navedeno da nema troškova ili je zahtjev odbijen
  if (
    lower.includes('nema troškova') ||
    lower.includes('nema troskova') ||
    lower.includes('bez troškova') ||
    lower.includes('odbijen zahtjev za troškove') ||
    lower.includes('odbijeni troškovi') ||
    lower.includes('odbijen trošak')
  ) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  // 3. Mjesečne naknade (npr. "309,89 kn/mj.", "2.862,50/mjesečno" - to je vodni doprinos, a ne trošak spora)
  if ((napomena.includes('/mj') || napomena.includes('mjesečno')) && !lower.includes('troš')) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  // 4. Pronađi točan iznos troška
  const iznos = extractCostAmount(combined);
  const hasCostWord = lower.includes('trošak') || lower.includes('troškov') || lower.includes('nalog');

  // Ako nema ni iznosa ni riječi trošak/nalog u tekstu: NEMA TROŠKOVA
  // (nema veze što je neko polje obojano u zeleno ili drugu boju!)
  if (!iznos && !hasCostWord) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  // Preskoči čiste vrijednosti predmeta (npr. 335.228.00 kn) ako se ne spominje trošak
  if (!hasCostWord && !/eur|€|1250|2500|3750|625|1875/i.test(combined)) {
    return {
      imaTroskova: false,
      status: 'nema_troskova',
      hitnost: 'nema',
      opis: 'Nema dosuđenih troškova spora',
    };
  }

  // Status plaćanja:
  // Korisnik je tražio:
  // "distinkcija između plaćeno (zeleno) i nalog poslan (smeđe), htio bih da to sve bude zeleno označeno, možemo to nazvati nalog poslan xy datuma - plaćeno"
  const isPaid = lower.includes('plaćeno') || lower.includes('placeno') || lower.includes('podmireno');
  const hasNalog = lower.includes('nalog') || (cellColors && cellColors.O === 'smedje');
  const isYellow =
    (cellColors && (cellColors.O === 'zuto' || cellColors.L === 'zuto' || cellColors.M === 'zuto')) ||
    (lower.includes('rok') && !isPaid && !hasNalog);

  let status: TroskoviInfo['status'] = 'neplaceno';
  let bojaOznake: TroskoviInfo['bojaOznake'] = 'zuto';

  if (isPaid || hasNalog || (cellColors && cellColors.O === 'zeleno')) {
    status = isPaid ? 'placeno' : 'poslan_nalog';
    bojaOznake = 'zeleno'; // Sve riješeno označavamo zelenom bojom prema korisnikovom zahtjevu
  } else if (isYellow) {
    status = 'neplaceno';
    bojaOznake = 'zuto';
  }

  const nalogMatch = combined.match(/nalog\s+(\d{1,2}\.\d{1,2}\.(?:\d{2,4})?\.?)/i);
  const nalogDatum = nalogMatch ? nalogMatch[1] : undefined;

  let rokDate: Date | null = null;
  let rokStr: string | null = null;
  let opis = iznos ? `Dosuđeni troškovi: ${iznos}` : 'Dosuđeni troškovi spora';

  // Provjeri eksplicitni rok u tekstu (npr. "rok 15.10.2026." ili "do 21.11.2024.")
  const explicitDeadline = extractDeadline(combined);
  if (explicitDeadline.deadlineDate) {
    rokDate = explicitDeadline.deadlineDate;
    rokStr = explicitDeadline.deadlineStr;
    opis += ` (rok: ${rokStr})`;
  } else if (datumZapPresudeStr && !isPaid && !hasNalog) {
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

  if (isPaid || hasNalog) {
    hitnost = 'rijeseno';
    if (nalogDatum) {
      opis = `${iznos ? `${iznos} — ` : ''}Nalog poslan ${nalogDatum} - plaćeno`;
    } else if (hasNalog) {
      opis = `${iznos ? `${iznos} — ` : ''}Nalog poslan - plaćeno`;
    } else {
      opis = `${iznos ? `${iznos} — ` : ''}Plaćeno`;
    }
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

  // Prepoznaj stupac izvora
  let izvorPolje: string | undefined;
  if (napomena) izvorPolje = 'Stupac O (Razno / Napomena)';
  else if (aktPoPresudi) izvorPolje = 'Stupac L (Akt UP/II)';
  else if (zalba) izvorPolje = 'Stupac M (Žalba)';
  else if (presuda) izvorPolje = 'Stupac J (Presuda)';

  return {
    imaTroskova: true,
    iznos,
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

export function parseExcelSporovi(
  forceRefresh = false,
  providedOverrides?: Record<string, SporOverride>,
  providedCustomSporovi?: UpravniSpor[]
): {
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

  const overrides = providedOverrides || getSporoviOverrides();
  const customSporovi = providedCustomSporovi || getCustomSporoviFromFile();

  const mergeWithCustom = (baseList: UpravniSpor[]) => {
    if (!customSporovi || customSporovi.length === 0) {
      return baseList.map((s) => applySporOverrides(s, overrides));
    }
    const map = new Map<string, UpravniSpor>();
    const maxBaseRbr = baseList.length > 0 ? Math.max(...baseList.map((s) => s.rbr || 0)) : 350;

    // First custom sporovi so they appear first or override base
    // Osiguraj da custom novouneseni sporovi imaju visok rbr (>= 1000) kako bi pri sortiranju 'Najnoviji prvi' bili na vrhu
    customSporovi.forEach((s, idx) => {
      const fixedRbr = s.rbr && s.rbr > 1 ? Math.max(s.rbr, maxBaseRbr + 1 + idx) : Math.max(1000, maxBaseRbr + 1 + idx);
      const fixedSpor = { ...s, rbr: fixedRbr };
      map.set(fixedSpor.poslovniBroj || fixedSpor.id, fixedSpor);
    });
    baseList.forEach((s) => {
      const key = s.poslovniBroj || s.id;
      if (!map.has(key)) {
        map.set(key, s);
      }
    });
    return Array.from(map.values()).map((s) => applySporOverrides(s, overrides));
  };

  // Use cache if alive and not force refresh
  if (!forceRefresh && fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const sample = cached.sporovi?.find((s: UpravniSpor) => s.tuzitelj?.includes('MORAVICE'));
      const hasModernCosts = sample && sample.troskoviInfo?.bojaOznake;
      if (hasModernCosts && (!canReadLive || cached.fileMtime === fileMtime)) {
        const merged = mergeWithCustom(cached.sporovi || []);
        return { sporovi: merged, lastModified: cached.fileMtime || new Date().toISOString(), source: 'cache' };
      }
    } catch {
      // continue to parse
    }
  }

  if (!canReadLive && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const merged = mergeWithCustom(cached.sporovi || []);
    return { sporovi: merged, lastModified: cached.fileMtime || '', source: 'cache' };
  }

  if (!canReadLive) {
    return { sporovi: mergeWithCustom([]), lastModified: '', source: 'cache' };
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

    const finalSporovi = mergeWithCustom(sporovi);

    // Save to cache safely (wrapped in try-catch so it never fails on read-only environments)
    try {
      const cacheData = {
        fileMtime,
        savedAt: new Date().toISOString(),
        count: finalSporovi.length,
        sporovi: finalSporovi,
      };
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    } catch {
      // Ignoriraj EROFS na poslužitelju
    }

    return { sporovi: finalSporovi, lastModified: fileMtime, source: 'live' };
  } catch (err) {
    console.error('Error parsing live Excel sporovi:', err);
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      const merged = mergeWithCustom(cached.sporovi || []);
      return { sporovi: merged, lastModified: cached.fileMtime || '', source: 'cache' };
    }
    return { sporovi: mergeWithCustom([]), lastModified: '', source: 'cache' };
  }
}

export async function parseExcelSporoviAsync(forceRefresh = false): Promise<{
  sporovi: UpravniSpor[];
  lastModified: string;
  source: 'live' | 'cache';
}> {
  const [overrides, customSporovi] = await Promise.all([
    getSporoviOverridesAsync(),
    getCustomSporoviAsync(),
  ]);
  return parseExcelSporovi(forceRefresh, overrides, customSporovi);
}
