export const META_DOC_TYPE = '__META__';
export const CHAT_DOC_TYPE = '__CHAT__';
export const SLUZBENICI_DOC_TYPE = '__SLUZBENICI__';
export const SYSTEM_DOC_TYPES = [META_DOC_TYPE, CHAT_DOC_TYPE, SLUZBENICI_DOC_TYPE] as const;
export const META_URL_PREFIX = 'meta://';

export interface Sluzbenik {
  id: string;
  imePrezime: string;
  radnoMjesto?: string;
  inicijali: string;
  aktivan?: boolean;
}

export const PARAF_VRSTE_AKATA = [
  'Drugostupanjsko rješenje',
  'Dopis — slanje žalbe na nadležni postupak',
  'Dopis — traženje dopune spisa / očitovanja',
  'Odgovor na tužbu (Upravni sud)',
  'Zaključak / Rješenje o obustavi',
  'Ostali dopisi i akti',
] as const;

export type ParafVrstaAkta = (typeof PARAF_VRSTE_AKATA)[number] | (string & {});

export type ParafStatus = 'Parafirano' | 'Parafirano uz izmjene' | 'Vraćeno na doradu';

export const PARAF_STATUSI: {
  value: ParafStatus;
  label: string;
  shortLabel: string;
  badgeClass: string;
}[] = [
  {
    value: 'Parafirano',
    label: 'Parafirano (odobreno bez izmjena)',
    shortLabel: 'Parafirano',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  },
  {
    value: 'Parafirano uz izmjene',
    label: 'Parafirano uz izmjene (korigirano)',
    shortLabel: 'Paraf uz izmjene',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  {
    value: 'Vraćeno na doradu',
    label: 'Vraćeno službeniku na doradu',
    shortLabel: 'Vraćeno na doradu',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
];

export interface ParafZapis {
  id: string;
  datum: string; // YYYY-MM-DD
  vrsta_akta: ParafVrstaAkta;
  status: ParafStatus;
  sluzbenik_ime?: string;
  napomena?: string;
}

export function getInitials(imePrezime: string): string {
  const cleaned = imePrezime.split(',')[0].trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Pretvara pročitani datum (YYYY-MM-DD, DD.MM.YYYY., DD. MM. YYYY. ili DD/MM/YYYY) u ISO YYYY-MM-DD.
 */
export function normalizeDateToIso(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/(\d{1,2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return '';
}

/**
 * Formatira ISO datum (YYYY-MM-DD) u čitljivi hrvatski zapis DD.MM.YYYY. bez pomaka vremenskih zona.
 */
export function formatIsoDateHr(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}.`;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? trimmed : d.toLocaleDateString('hr-HR');
}

export type NadlezniPostupakStatus =
  | ''
  | 'potrebno_poslati'
  | 'poslano'
  | 'vraceno';

export const NADLEZNI_POSTUPAK_STATUSI: {
  value: Exclude<NadlezniPostupakStatus, ''>;
  label: string;
  shortLabel: string;
  badgeClass: string;
}[] = [
  {
    value: 'potrebno_poslati',
    label: 'Potrebno žurno poslati tijelu I. stupnja (čl. 110. ZUP)',
    shortLabel: 'Potrebno poslati',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
  {
    value: 'poslano',
    label: 'Poslano I. stupnju na nadležni postupak (čeka povrat)',
    shortLabel: 'Poslano I. stupnju',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  },
  {
    value: 'vraceno',
    label: 'Spis vraćen s I. stupnja u drugostupanjsko rješavanje',
    shortLabel: 'Vraćeno u rad',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
];

export function isNaNadleznomPostupku(
  predmet: Pick<EnrichedPredmet, 'nadlezni_postupak_status'>
): boolean {
  return (
    predmet.nadlezni_postupak_status === 'potrebno_poslati' ||
    predmet.nadlezni_postupak_status === 'poslano'
  );
}

export type PredmetPodrucjeGroupId = 'naknade' | 'vodopravni' | 'zup_posebni' | 'neupravno_ostalo';

export type PredmetPodrucje =
  | 'NUV'
  | 'VD'
  | 'NZZV'
  | 'NKV'
  | 'KONCESIJA'
  | 'ZJVD'
  | 'VPU'
  | 'VPD'
  | 'VPP'
  | 'POTVRDE_NIG'
  | 'POTVRDE_VG'
  | 'OVRHA'
  | 'TROSKOVI'
  | 'OBNOVA'
  | 'PONISTAVANJE'
  | 'NISTAVOST'
  | 'PRIGOVOR'
  | 'ODUSTANAK'
  | 'NENADLEZNOST'
  | 'POVRACAJ'
  | 'ISPRAVAK'
  | 'POTVRDE_PI'
  | 'OBAVIJEST_ROK'
  | 'NEUPRAVNO'
  | 'Ostalo'
  | (string & {});

export interface PredmetPodrucjeMeta {
  value: PredmetPodrucje;
  label: string;
  fullLabel: string;
  group: PredmetPodrucjeGroupId;
  praksaCategory: string;
  praksaPattern?: RegExp;
  upravnaStvarOpis: string;
  temeljniPropis: 'ZFVG' | 'ZOV' | 'ZUP' | 'NEUPRAVNO';
}

export const PREDMET_PODRUCJA_GRUPE: {
  id: PredmetPodrucjeGroupId;
  label: string;
}[] = [
  { id: 'naknade', label: 'Vodne naknade i koncesije (ZFVG)' },
  { id: 'vodopravni', label: 'Vodno dobro, vodopravni akti i potvrde (Zakon o vodama)' },
  { id: 'zup_posebni', label: 'Posebni ZUP postupci, pravni lijekovi i ovrha' },
  { id: 'neupravno_ostalo', label: 'Neupravni predmeti i ostalo' },
];

export const PREDMET_PODRUCJA: PredmetPodrucjeMeta[] = [
  // 1. Vodne naknade i koncesije (ZFVG)
  {
    value: 'NUV',
    label: 'NUV',
    fullLabel: 'Naknada za uređenje voda (NUV)',
    group: 'naknade',
    praksaCategory: 'Naknada za uređenje voda',
    praksaPattern: /naknada za ure[đd]enje voda|\bnuv\b/i,
    upravnaStvarOpis: 'obračuna naknade za uređenje voda',
    temeljniPropis: 'ZFVG',
  },
  {
    value: 'VD',
    label: 'VD',
    fullLabel: 'Vodni doprinos (VD)',
    group: 'naknade',
    praksaCategory: 'Vodni doprinos',
    praksaPattern: /vodni doprinos|\bvd\b/i,
    upravnaStvarOpis: 'obračuna vodnoga doprinosa',
    temeljniPropis: 'ZFVG',
  },
  {
    value: 'NZZV',
    label: 'NZZV',
    fullLabel: 'Naknada za zaštitu voda (NZZV)',
    group: 'naknade',
    praksaCategory: 'Naknada za zaštitu voda',
    praksaPattern: /za[šs]titu voda|\bnzzv\b/i,
    upravnaStvarOpis: 'obračuna naknade za zaštitu voda',
    temeljniPropis: 'ZFVG',
  },
  {
    value: 'NKV',
    label: 'NKV',
    fullLabel: 'Naknada za korištenje voda (NKV)',
    group: 'naknade',
    praksaCategory: 'Naknada za korištenje voda',
    praksaPattern: /kori[šs]tenje voda|\bnkv\b|\bnzkv\b/i,
    upravnaStvarOpis: 'obračuna naknade za korištenje voda',
    temeljniPropis: 'ZFVG',
  },
  {
    value: 'KONCESIJA',
    label: 'Koncesija',
    fullLabel: 'Naknada za koncesiju',
    group: 'naknade',
    praksaCategory: 'Naknada za koncesiju',
    praksaPattern: /naknada za koncesij|koncesij/i,
    upravnaStvarOpis: 'obračuna naknade za koncesiju',
    temeljniPropis: 'ZFVG',
  },

  // 2. Vodno dobro, vodopravni akti i potvrde (Zakon o vodama)
  {
    value: 'ZJVD',
    label: 'Zakup JVD',
    fullLabel: 'Zakup javnog vodnog dobra',
    group: 'vodopravni',
    praksaCategory: 'Zakup javnog vodnog dobra',
    praksaPattern: /zakup javnog vodnog dobra|\bzjvd\b/i,
    upravnaStvarOpis: 'zakupa javnog vodnog dobra',
    temeljniPropis: 'ZOV',
  },
  {
    value: 'VPU',
    label: 'VPU',
    fullLabel: 'Vodopravni uvjeti',
    group: 'vodopravni',
    praksaCategory: 'Vodopravni uvjeti',
    praksaPattern: /vodopravni uvjet|\bvpu\b/i,
    upravnaStvarOpis: 'izdavanja vodopravnih uvjeta',
    temeljniPropis: 'ZOV',
  },
  {
    value: 'VPD',
    label: 'VPD',
    fullLabel: 'Vodopravne dozvole',
    group: 'vodopravni',
    praksaCategory: 'Vodopravne dozvole',
    praksaPattern: /vodopravn[ea] dozvol|\bvpd\b/i,
    upravnaStvarOpis: 'izdavanja vodopravne dozvole',
    temeljniPropis: 'ZOV',
  },
  {
    value: 'VPP',
    label: 'VPP',
    fullLabel: 'Vodopravna potvrda',
    group: 'vodopravni',
    praksaCategory: 'Vodopravna potvrda',
    praksaPattern: /vodopravn[ea] potvrd|\bvpp\b/i,
    upravnaStvarOpis: 'izdavanja vodopravne potvrde',
    temeljniPropis: 'ZOV',
  },
  {
    value: 'POTVRDE_NIG',
    label: 'Potvrda (NIG)',
    fullLabel: 'Potvrde – nezakonito izgrađene građevine',
    group: 'vodopravni',
    praksaCategory: 'Potvrde - nezakonito izgrađene građevine',
    praksaPattern: /nezakonito izgra[đd]en|ozakonjenj/i,
    upravnaStvarOpis: 'izdavanja potvrde za nezakonito izgrađenu građevinu',
    temeljniPropis: 'ZOV',
  },
  {
    value: 'POTVRDE_VG',
    label: 'Potvrda (VG)',
    fullLabel: 'Potvrde – vodne građevine',
    group: 'vodopravni',
    praksaCategory: 'Potvrde - vodne građevine',
    praksaPattern: /potvrde\s*[-–]\s*vodne gra[đd]evine|vodne gra[đd]evine/i,
    upravnaStvarOpis: 'izdavanja potvrde za vodnu građevinu',
    temeljniPropis: 'ZOV',
  },

  // 3. Posebni ZUP postupci, izvanredni pravni lijekovi i ovrha
  {
    value: 'OVRHA',
    label: 'Ovrha',
    fullLabel: 'Rješenja o ovrsi',
    group: 'zup_posebni',
    praksaCategory: 'Rješenja o ovrsi',
    praksaPattern: /rje[šs]enja o ovrsi|\bovrh[aeu]\b|\bovrsi\b/i,
    upravnaStvarOpis: 'ovrhe u upravnom postupku',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'TROSKOVI',
    label: 'Troškovi',
    fullLabel: 'Troškovi postupka',
    group: 'zup_posebni',
    praksaCategory: 'Troškovi postupka',
    praksaPattern: /tro[šs]kovi postupka|tro[šs]kov/i,
    upravnaStvarOpis: 'naknade troškova upravnog postupka',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'OBNOVA',
    label: 'Obnova',
    fullLabel: 'Obnova postupka',
    group: 'zup_posebni',
    praksaCategory: 'Obnova postupka',
    praksaPattern: /obnova postupka/i,
    upravnaStvarOpis: 'obnove upravnog postupka',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'PONISTAVANJE',
    label: 'Poništ./ukid.',
    fullLabel: 'Poništavanje i ukidanje rješenja (čl. 129.–132. ZUP)',
    group: 'zup_posebni',
    praksaCategory: 'Poništavanje i ukidanje rješenja (ZUP)',
    praksaPattern: /poni[šs]tavanje i ukidanje/i,
    upravnaStvarOpis: 'poništavanja i ukidanja rješenja po čl. 129.–132. ZUP-a',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'NISTAVOST',
    label: 'Ništavost',
    fullLabel: 'Oglašavanje rješenja ništavim',
    group: 'zup_posebni',
    praksaCategory: 'Oglašavanje rješenja ništavim',
    praksaPattern: /ni[šs]tav/i,
    upravnaStvarOpis: 'oglašavanja rješenja ništavim',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'PRIGOVOR',
    label: 'Prigovor',
    fullLabel: 'Rješenja po prigovoru',
    group: 'zup_posebni',
    praksaCategory: 'Rješenja po prigovoru',
    praksaPattern: /po prigovoru|rje[šs]enja po prigovoru/i,
    upravnaStvarOpis: 'rješavanja po prigovoru',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'ODUSTANAK',
    label: 'Odustanak',
    fullLabel: 'Odustanak od zahtjeva',
    group: 'zup_posebni',
    praksaCategory: 'Odustanak od zahtjeva',
    praksaPattern: /odustanak od zahtjeva|odustank/i,
    upravnaStvarOpis: 'obustave postupka zbog odustanka stranke',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'NENADLEZNOST',
    label: 'Nenadležnost',
    fullLabel: 'Nenadležnost',
    group: 'zup_posebni',
    praksaCategory: 'Nenadležnost',
    praksaPattern: /nenadle[žz]nost/i,
    upravnaStvarOpis: 'postupanja povodom nenadležnosti',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'POVRACAJ',
    label: 'Povraćaj',
    fullLabel: 'Povraćaj u prijašnje stanje',
    group: 'zup_posebni',
    praksaCategory: 'Povraćaj u prijašnje stanje',
    praksaPattern: /povra[ćc]aj u prija[šs]nje stanje/i,
    upravnaStvarOpis: 'povraćaja u prijašnje stanje',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'ISPRAVAK',
    label: 'Ispravak (čl.104)',
    fullLabel: 'Otklanjanje pogrešaka u rješenju (čl. 104. ZUP)',
    group: 'zup_posebni',
    praksaCategory: 'Otklanjanje pogrešaka u rješenju (čl. 104. ZUP)',
    praksaPattern: /otklanjanje pogre[šs]aka|ispravak rje[šs]enja|čl\.\s*104/i,
    upravnaStvarOpis: 'otklanjanja pogrešaka u rješenju po čl. 104. ZUP-a',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'POTVRDE_PI',
    label: 'Pravom./izvrš.',
    fullLabel: 'Potvrde o pravomoćnosti i izvršnosti',
    group: 'zup_posebni',
    praksaCategory: 'Potvrde o pravomoćnosti i izvršnosti',
    praksaPattern: /pravomo[ćc]nosti i izvr[šs]nosti/i,
    upravnaStvarOpis: 'izdavanja potvrde o pravomoćnosti i izvršnosti',
    temeljniPropis: 'ZUP',
  },
  {
    value: 'OBAVIJEST_ROK',
    label: 'Obavijest (rok)',
    fullLabel: 'Obavijest o razlozima nedonošenja rješenja',
    group: 'zup_posebni',
    praksaCategory: 'Obavijest o razlozima nedonošenja rješenja',
    praksaPattern: /razlozima nedono[šs]enja/i,
    upravnaStvarOpis: 'obavijesti o razlozima nedonošenja rješenja u roku',
    temeljniPropis: 'ZUP',
  },

  // 4. Neupravno i ostalo
  {
    value: 'NEUPRAVNO',
    label: 'Neupravno',
    fullLabel: 'Neupravni predmeti (mišljenja i naputci)',
    group: 'neupravno_ostalo',
    praksaCategory: 'Mišljenja i naputci (Neupravno)',
    praksaPattern: /mi[šs]ljenja i naputci|neupravno/i,
    upravnaStvarOpis: 'neupravnog očitovanja / pravnog mišljenja',
    temeljniPropis: 'NEUPRAVNO',
  },
  {
    value: 'Ostalo',
    label: 'Ostalo',
    fullLabel: 'Ostali upravni predmeti',
    group: 'neupravno_ostalo',
    praksaCategory: 'Upravni postupak',
    upravnaStvarOpis: 'upravnog postupka',
    temeljniPropis: 'ZUP',
  },
];

const PODRUCJE_META_MAP = new Map<string, PredmetPodrucjeMeta>(
  PREDMET_PODRUCJA.map((p) => [p.value.toUpperCase(), p])
);

export const VALID_PODRUCJE_VALUES: PredmetPodrucje[] = PREDMET_PODRUCJA.map((p) => p.value);

export function getPodrucjeMeta(podrucje: string | null | undefined): PredmetPodrucjeMeta | undefined {
  if (!podrucje) return undefined;
  const trimmed = podrucje.trim();
  const byCode = PODRUCJE_META_MAP.get(trimmed.toUpperCase());
  if (byCode) return byCode;
  const low = trimmed.toLowerCase();
  return PREDMET_PODRUCJA.find(
    (p) =>
      p.label.toLowerCase() === low ||
      p.fullLabel.toLowerCase() === low ||
      p.praksaCategory.toLowerCase() === low
  );
}

export function normalizePodrucjeValue(raw: string | null | undefined): PredmetPodrucje {
  const found = getPodrucjeMeta(raw);
  return found ? found.value : 'Ostalo';
}

export function getPodrucjeLabel(podrucje: string | null | undefined): string {
  const meta = getPodrucjeMeta(podrucje);
  return meta ? meta.label : (podrucje || 'Ostalo');
}

export function getPodrucjeFullLabel(podrucje: string | null | undefined): string {
  const meta = getPodrucjeMeta(podrucje);
  return meta ? meta.fullLabel : (podrucje || 'Ostali upravni predmeti');
}

export function getPodrucjePraksaCategory(podrucje: string | null | undefined): string {
  const meta = getPodrucjeMeta(podrucje);
  return meta ? meta.praksaCategory : 'Upravni postupak';
}

export function getPodrucjeBadgeClass(podrucje: string | null | undefined): string {
  const meta = getPodrucjeMeta(podrucje);
  if (!meta || meta.value === 'Ostalo') {
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
  switch (meta.group) {
    case 'naknade':
      return 'bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200/70 dark:border-blue-800/70';
    case 'vodopravni':
      return 'bg-teal-50/80 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200/70 dark:border-teal-800/70';
    case 'zup_posebni':
      return 'bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200/70 dark:border-indigo-800/70';
    case 'neupravno_ostalo':
      return 'bg-amber-50/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70';
  }
}

export type PredmetFaza = 'Novo' | 'U radu' | 'Čeka dopunu' | 'Na potpisu';

export const PREDMET_FAZE: {
  value: PredmetFaza;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: 'Novo',
    label: 'Novo zaprimljeno',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    value: 'U radu',
    label: 'U radu',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    value: 'Čeka dopunu',
    label: 'Čeka dopunu spisa',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    value: 'Na potpisu',
    label: 'Nacrt na potpisu',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
  },
];

export type PredmetIshodGroupId = 'zalbeni' | 'obustave_procesni' | 'posebni_ostalo';

export type PredmetIshodSummaryBucket = 'odbijeno' | 'ponisteno' | 'ostali';

export type PredmetIshod =
  | 'Odbijena žalba'
  | 'Poništeno rješenje'
  | 'Poništeno i meritorno riješeno / izmijenjeno'
  | 'Djelomično poništeno / izmijenjeno'
  | 'Odbačena žalba'
  | 'Obustava postupka — odustanak od žalbe'
  | 'Obustava postupka — ostali razlozi'
  | 'Oglašeno ništavim'
  | 'Ustupljeno nadležnom tijelu'
  | 'Riješeno po izvanrednom pravnom lijeku'
  | 'Ispravak / Zaključak / Potvrda'
  | 'Neupravni akt / Mišljenje / Dopis'
  | 'Ostalo'
  | 'Obustava / Ostalo'
  | (string & {});

export interface PredmetIshodMeta {
  value: PredmetIshod;
  label: string;
  shortLabel: string;
  group: PredmetIshodGroupId;
  summaryBucket: PredmetIshodSummaryBucket;
  badgeClass: string;
  chartColor: string;
}

export const PREDMET_ISHODI_GRUPE: {
  id: PredmetIshodGroupId;
  label: string;
}[] = [
  { id: 'zalbeni', label: 'Redoviti žalbeni ishodi (čl. 114.–118. ZUP)' },
  { id: 'obustave_procesni', label: 'Obustave i procesni ishodi' },
  { id: 'posebni_ostalo', label: 'Posebni postupci i neupravno' },
];

export const PREDMET_ISHODI: PredmetIshodMeta[] = [
  // 1. Redoviti žalbeni ishodi (čl. 114.–118. ZUP)
  {
    value: 'Odbijena žalba',
    label: 'Odbijena žalba (čl. 116. ZUP)',
    shortLabel: 'Odbijena žalba',
    group: 'zalbeni',
    summaryBucket: 'odbijeno',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    chartColor: '#10b981',
  },
  {
    value: 'Poništeno rješenje',
    label: 'Poništeno rješenje i vraćeno na ponovni postupak (čl. 117. st. 2. ZUP)',
    shortLabel: 'Poništeno i vraćeno',
    group: 'zalbeni',
    summaryBucket: 'ponisteno',
    badgeClass:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
    chartColor: '#6366f1',
  },
  {
    value: 'Poništeno i meritorno riješeno / izmijenjeno',
    label: 'Poništeno i meritorno riješeno / izmijenjeno (čl. 117. st. 1. / čl. 118. ZUP)',
    shortLabel: 'Poništeno / izmijenjeno',
    group: 'zalbeni',
    summaryBucket: 'ponisteno',
    badgeClass:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800',
    chartColor: '#8b5cf6',
  },
  {
    value: 'Djelomično poništeno / izmijenjeno',
    label: 'Djelomično poništeno / izmijenjeno (čl. 117.–118. ZUP)',
    shortLabel: 'Djelomično poništeno',
    group: 'zalbeni',
    summaryBucket: 'ponisteno',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
    chartColor: '#3b82f6',
  },
  {
    value: 'Odbačena žalba',
    label: 'Odbačena žalba (čl. 114. ZUP)',
    shortLabel: 'Odbačena žalba',
    group: 'zalbeni',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    chartColor: '#f59e0b',
  },

  // 2. Obustave i procesni ishodi
  {
    value: 'Obustava postupka — odustanak od žalbe',
    label: 'Obustava postupka — odustanak od žalbe (čl. 115. st. 2. / čl. 46. ZUP)',
    shortLabel: 'Obustava (odustanak od žalbe)',
    group: 'obustave_procesni',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
    chartColor: '#06b6d4',
  },
  {
    value: 'Obustava postupka — ostali razlozi',
    label: 'Obustava postupka — ostali razlozi (čl. 46. / čl. 113. ZUP)',
    shortLabel: 'Obustava (ostalo)',
    group: 'obustave_procesni',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
    chartColor: '#0ea5e9',
  },
  {
    value: 'Oglašeno ništavim',
    label: 'Oglašeno ništavim (čl. 128. ZUP)',
    shortLabel: 'Oglašeno ništavim',
    group: 'obustave_procesni',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    chartColor: '#f43f5e',
  },
  {
    value: 'Ustupljeno nadležnom tijelu',
    label: 'Ustupljeno nadležnom tijelu (čl. 18. ZUP)',
    shortLabel: 'Ustupljeno (nenadležnost)',
    group: 'obustave_procesni',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
    chartColor: '#f97316',
  },

  // 3. Posebni postupci i neupravno
  {
    value: 'Riješeno po izvanrednom pravnom lijeku',
    label: 'Riješeno po izvanrednom pravnom lijeku (čl. 123., 129.–132. ZUP)',
    shortLabel: 'Izvanredni pravni lijek',
    group: 'posebni_ostalo',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
    chartColor: '#a855f7',
  },
  {
    value: 'Ispravak / Zaključak / Potvrda',
    label: 'Ispravak / Zaključak / Potvrda (čl. 104. ZUP, troškovi, potvrde)',
    shortLabel: 'Ispravak / Zaključak / Potvrda',
    group: 'posebni_ostalo',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
    chartColor: '#14b8a6',
  },
  {
    value: 'Neupravni akt / Mišljenje / Dopis',
    label: 'Neupravni akt / Mišljenje / Dopis',
    shortLabel: 'Neupravni akt / Mišljenje',
    group: 'posebni_ostalo',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
    chartColor: '#78716c',
  },
  {
    value: 'Ostalo',
    label: 'Ostalo',
    shortLabel: 'Ostalo',
    group: 'posebni_ostalo',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    chartColor: '#64748b',
  },
];

const LEGACY_ISHOD_META: Record<string, PredmetIshodMeta> = {
  'Obustava / Ostalo': {
    value: 'Obustava / Ostalo',
    label: 'Obustava postupka / Ostalo (stari zapis)',
    shortLabel: 'Obustava / Ostalo',
    group: 'obustave_procesni',
    summaryBucket: 'ostali',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    chartColor: '#64748b',
  },
};

export function getIshodMeta(ishod: string | null | undefined): PredmetIshodMeta | undefined {
  if (!ishod) return undefined;
  const trimmed = ishod.trim();
  const direct = PREDMET_ISHODI.find((i) => i.value === trimmed);
  if (direct) return direct;
  if (LEGACY_ISHOD_META[trimmed]) return LEGACY_ISHOD_META[trimmed];
  const low = trimmed.toLowerCase();
  return PREDMET_ISHODI.find(
    (i) => i.value.toLowerCase() === low || i.shortLabel.toLowerCase() === low
  );
}

export function getIshodSummaryBucket(ishod: string | null | undefined): PredmetIshodSummaryBucket {
  const meta = getIshodMeta(ishod);
  if (meta) return meta.summaryBucket;
  const low = (ishod || '').toLowerCase();
  if (low.includes('odbijen')) return 'odbijeno';
  if (low.includes('poništ') || low.includes('ponist') || low.includes('izmijenj')) return 'ponisteno';
  return 'ostali';
}

export function isObustavaIshod(ishod: string | null | undefined): boolean {
  return (ishod || '').toLowerCase().includes('obustav');
}

/**
 * Automatsko prepoznavanje vjerojatnog ZUP ishoda iz teksta drugostupanjskog akta.
 */
export function detectIshodFromText(rawText: string | null | undefined): PredmetIshod {
  const text = (rawText || '').toLowerCase();
  if (!text.trim()) return 'Odbijena žalba';

  // Fokusiraj se na izreku ako postoji (dio prije "obrazloženje")
  const obrazlozenjeIdx = text.indexOf('obrazloženje');
  const izreka = obrazlozenjeIdx > 80 ? text.slice(0, obrazlozenjeIdx) : text.slice(0, 2500);

  if (/oglašava\s+se\s+ništav|oglašuje\s+se\s+ništav|ništavim\s+se\s+oglašava/.test(izreka)) {
    return 'Oglašeno ništavim';
  }

  if (/obustavlja\s+se|postupak\s+se\s+obustavlja|obustava\s+postupka/.test(izreka)) {
    if (/odustan\w*\s+od\s+žalb|odusta\w*\s+od\s+žalb|povlači\s+žalb|povuk\w*\s+žalb/.test(text)) {
      return 'Obustava postupka — odustanak od žalbe';
    }
    return 'Obustava postupka — ostali razlozi';
  }

  if (/ustupa\s+se\s+na\s+nadležn|oglašava\s+se\s+nenadležn/.test(izreka)) {
    return 'Ustupljeno nadležnom tijelu';
  }

  if (/ispravlja\s+se\s+rješenj|otklanjanj\w*\s+pogreš/.test(izreka)) {
    return 'Ispravak / Zaključak / Potvrda';
  }

  if (/odbacuje\s+se\s+žalb|žalba\s+se\s+odbacuje|odbacuje\s+se\s+kao\s+(?:nepravodobn|nedopušten|izjavljen)/.test(izreka)) {
    return 'Odbačena žalba';
  }

  if (
    /djelomično\s+(?:se\s+)?(?:poništava|uvažava|mijenja|izmjenjuje)/.test(izreka) ||
    (/poništava\s+se/.test(izreka) && /u\s+preostalom\s+dijelu\s+(?:žalba\s+se\s+)?odbija/.test(izreka))
  ) {
    return 'Djelomično poništeno / izmijenjeno';
  }

  if (/poništava\s+se|uvažava\s+se\s+žalb/.test(izreka)) {
    if (/vraća\s+se|ponovn\w+\s+postup/.test(izreka)) {
      return 'Poništeno rješenje';
    }
    if (/mijenja\s+se|zamjenjuje\s+se|rješava\s+se\s+upravna\s+stvar|utvrđuje\s+se/.test(izreka)) {
      return 'Poništeno i meritorno riješeno / izmijenjeno';
    }
    return 'Poništeno rješenje';
  }

  if (/mijenja\s+se\s+rješenj|izmjenjuje\s+se\s+rješenj/.test(izreka)) {
    return 'Poništeno i meritorno riješeno / izmijenjeno';
  }

  if (/odbacuje\s+se/.test(izreka)) {
    return 'Odbačena žalba';
  }

  if (/odbija\s+se/.test(izreka)) {
    return 'Odbijena žalba';
  }

  return 'Odbijena žalba';
}

export const DOKUMENT_VRSTE = [
  'Žalba',
  'Prvostupanjsko rješenje',
  'Dostavnica',
  'Popratni dopis I. stupnja',
  'Košuljica spisa',
  'Dopis — slanje žalbe na nadležni postupak',
  'Punomoć',
  'Drugostupanjsko rješenje',
  'Odgovor na tužbu',
  'Dokaz / Prilog',
  'Kompletni spis',
  'Ostalo',
] as const;

export type DokumentVrsta = (typeof DOKUMENT_VRSTE)[number] | string;

export type IzvorTekstaTip = 'OCR sken' | 'Izvorni tekst' | 'Ručno uređeno';

export interface DecodedDocMeta {
  vrsta: string;
  izvorniNaziv: string | null;
  izvorTeksta: IzvorTekstaTip;
  velicinaPrikaz: string | null;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Kodira bogate metapodatke dokumenta u `tip_dokumenta` tako da budu čitljivi i čovjeku i AI-ju,
 * npr.: "Žalba | zalba_ivan_horvat.pdf [OCR sken • 1.4 MB]"
 */
export function encodeDocLabel(params: {
  vrsta: string;
  izvorniNaziv?: string | null;
  izvorTeksta?: IzvorTekstaTip;
  velicinaBajta?: number | null;
  velicinaPrikaz?: string | null;
}): string {
  const vrstaClean = (params.vrsta || 'Ostalo').replace(/[|\[\]]/g, '').trim();
  const nazivClean = params.izvorniNaziv
    ? params.izvorniNaziv.replace(/[|\[\]]/g, '_').trim()
    : '';
  const izvor = params.izvorTeksta || 'Izvorni tekst';
  const sizeStr =
    params.velicinaPrikaz ||
    (params.velicinaBajta && params.velicinaBajta > 0 ? formatBytes(params.velicinaBajta) : '');

  const bracketParts = [izvor, sizeStr].filter(Boolean).join(' • ');
  if (nazivClean) {
    return `${vrstaClean} | ${nazivClean} [${bracketParts}]`;
  }
  return `${vrstaClean} [${bracketParts}]`;
}

export function decodeDocLabel(rawTipDokumenta: string | null | undefined): DecodedDocMeta {
  const raw = (rawTipDokumenta || 'Ostalo').trim();

  // Format: "Vrsta | naziv.pdf [OCR sken • 1.2 MB]" ili "Vrsta [Izvorni tekst]" ili legacy "Žalba"
  const bracketMatch = raw.match(/\[([^\]]+)\]\s*$/);
  let mainPart = raw;
  let izvorTeksta: IzvorTekstaTip = 'Izvorni tekst';
  let velicinaPrikaz: string | null = null;

  if (bracketMatch) {
    mainPart = raw.slice(0, bracketMatch.index).trim();
    const metaTokens = bracketMatch[1].split('•').map((s) => s.trim());
    if (metaTokens[0] === 'OCR sken' || metaTokens[0] === 'Ručno uređeno' || metaTokens[0] === 'Izvorni tekst') {
      izvorTeksta = metaTokens[0];
    }
    if (metaTokens[1]) {
      velicinaPrikaz = metaTokens[1];
    }
  }

  const pipeIdx = mainPart.indexOf('|');
  if (pipeIdx !== -1) {
    const vrsta = mainPart.slice(0, pipeIdx).trim() || 'Ostalo';
    const izvorniNaziv = mainPart.slice(pipeIdx + 1).trim() || null;
    return { vrsta, izvorniNaziv, izvorTeksta, velicinaPrikaz };
  }

  return {
    vrsta: mainPart || 'Ostalo',
    izvorniNaziv: null,
    izvorTeksta,
    velicinaPrikaz,
  };
}

/**
 * Automatski pogađa ulogu dokumenta u spisu na temelju naziva datoteke.
 */
export function guessDocRoleFromFilename(fileName: string): string {
  const f = fileName.toLowerCase();
  if (
    f.includes('košulj') ||
    f.includes('kosulj') ||
    f.includes('omot') ||
    f.includes('naljepn') ||
    f.includes('koric')
  ) {
    return 'Košuljica spisa';
  }
  if (f.includes('žalba') || f.includes('zalba') || f.includes('prigovor')) return 'Žalba';
  if (f.includes('dostavn') || f.includes('povratnic')) return 'Dostavnica';
  if (f.includes('punomo')) return 'Punomoć';
  if (f.includes('popratn') || f.includes('izvje') || f.includes('dopis')) return 'Popratni dopis I. stupnja';
  if (f.includes('drugostup') || f.includes('up-ii') || f.includes('up_ii')) return 'Drugostupanjsko rješenje';
  if (f.includes('rješenj') || f.includes('rjesenj') || f.includes('prvostup')) return 'Prvostupanjsko rješenje';
  if (f.includes('spis') || f.includes('komplet')) return 'Kompletni spis';
  if (
    f.includes('dozvol') ||
    f.includes('izvadak') ||
    f.includes('obrazac') ||
    f.includes('zapisnik') ||
    f.includes('dokaz')
  ) {
    return 'Dokaz / Prilog';
  }
  return 'Prvostupanjsko rješenje';
}

export interface PredmetExtendedMeta {
  podrucje?: PredmetPodrucje;
  faza?: PredmetFaza;
  ishod?: PredmetIshod;
  datum_rjesavanja?: string;
  datum_slanja_na_potpis?: string;
  datum_predaje_zalbe?: string; // Početak zakonskog ZUP roka (60 dana od predaje žalbe I. stupnju ili izravno II. stupnju)
  datum_predaje_zalbe_izvor?: string;
  napomena?: string;
  poslano_u_praksu?: boolean;
  // Delegiranje službeniku i evidencija parafa
  sluzbenik_id?: string;
  sluzbenik_ime?: string;
  datum_dodjele?: string;
  interni_rok?: string;
  uputa_voditelja?: string;
  parafi?: ParafZapis[];
  // Nadležni postupak (žalbe poslane izravno Ministarstvu -> slanje I. stupnju po čl. 110. ZUP-a)
  nadlezni_postupak_status?: NadlezniPostupakStatus;
  nadlezni_postupak_tijelo?: string;
  nadlezni_postupak_datum_slanja?: string;
  nadlezni_postupak_datum_povratka?: string;
  nadlezni_postupak_napomena?: string;
}

export function encodePredmetMetaUrl(meta: PredmetExtendedMeta): string {
  return `${META_URL_PREFIX}${JSON.stringify(meta)}`;
}

export function decodePredmetMetaUrl(storageUrl: string | null | undefined): PredmetExtendedMeta {
  if (!storageUrl || !storageUrl.startsWith(META_URL_PREFIX)) return {};
  try {
    return JSON.parse(storageUrl.slice(META_URL_PREFIX.length)) as PredmetExtendedMeta;
  } catch {
    return {};
  }
}

export interface EnrichedPredmet {
  id: string;
  klasa: string;
  urbroj: string;
  stranka: string;
  datum_zaprimanja: string;
  status: 'aktivan' | 'arhiviran' | string;
  podrucje: PredmetPodrucje;
  faza: PredmetFaza;
  ishod?: PredmetIshod;
  datum_rjesavanja?: string;
  datum_slanja_na_potpis?: string;
  datum_predaje_zalbe?: string; // Početak zakonskog ZUP roka (60 dana od predaje žalbe I. stupnju ili izravno II. stupnju)
  datum_predaje_zalbe_izvor?: string;
  napomena?: string;
  poslano_u_praksu?: boolean;
  broj_dokumenata: number;
  vrste_dokumenata: string[];
  // Delegiranje službeniku i evidencija parafa
  sluzbenik_id?: string;
  sluzbenik_ime?: string;
  datum_dodjele?: string;
  interni_rok?: string;
  uputa_voditelja?: string;
  parafi: ParafZapis[];
  // Nadležni postupak (žalbe poslane izravno Ministarstvu -> slanje I. stupnju)
  nadlezni_postupak_status: NadlezniPostupakStatus;
  nadlezni_postupak_tijelo?: string;
  nadlezni_postupak_datum_slanja?: string;
  nadlezni_postupak_datum_povratka?: string;
  nadlezni_postupak_napomena?: string;
}

export function enrichPredmetRow(row: any): EnrichedPredmet {
  const allDocs: Array<{ id: string; tip_dokumenta: string; storage_url: string }> = Array.isArray(
    row.dokumenti
  )
    ? row.dokumenti
    : [];

  const metaDoc = allDocs.find((d) => d.tip_dokumenta === META_DOC_TYPE);
  const realDocs = allDocs.filter(
    (d) =>
      d.tip_dokumenta !== META_DOC_TYPE &&
      d.tip_dokumenta !== CHAT_DOC_TYPE &&
      d.tip_dokumenta !== SLUZBENICI_DOC_TYPE
  );
  const meta = metaDoc ? decodePredmetMetaUrl(metaDoc.storage_url) : {};

  // Pokušaj pogoditi područje iz KLASE ako još nije postavljeno
  let defaultPodrucje: PredmetPodrucje = 'Ostalo';
  const klasaLower = (row.klasa || '').toLowerCase();
  if (klasaLower.includes('nuv')) defaultPodrucje = 'NUV';
  else if (klasaLower.includes('vd')) defaultPodrucje = 'VD';

  const vrsteSet = new Set<string>();
  for (const d of realDocs) {
    const parsed = decodeDocLabel(d.tip_dokumenta);
    vrsteSet.add(parsed.vrsta);
  }

  return {
    id: row.id,
    klasa: row.klasa || '',
    urbroj: row.urbroj || '',
    stranka: row.stranka || '',
    datum_zaprimanja: row.datum_zaprimanja || '',
    status: row.status || 'aktivan',
    podrucje: meta.podrucje || defaultPodrucje,
    faza: meta.faza || 'Novo',
    ishod: meta.ishod,
    datum_rjesavanja: meta.datum_rjesavanja,
    datum_slanja_na_potpis: meta.datum_slanja_na_potpis,
    datum_predaje_zalbe: meta.datum_predaje_zalbe || '',
    datum_predaje_zalbe_izvor: meta.datum_predaje_zalbe_izvor || '',
    napomena: meta.napomena || '',
    poslano_u_praksu: Boolean(meta.poslano_u_praksu),
    broj_dokumenata: realDocs.length,
    vrste_dokumenata: Array.from(vrsteSet),
    sluzbenik_id: meta.sluzbenik_id || '',
    sluzbenik_ime: meta.sluzbenik_ime || '',
    datum_dodjele: meta.datum_dodjele || '',
    interni_rok: meta.interni_rok || '',
    uputa_voditelja: meta.uputa_voditelja || '',
    parafi: Array.isArray(meta.parafi) ? meta.parafi : [],
    nadlezni_postupak_status:
      meta.nadlezni_postupak_status === 'potrebno_poslati' ||
      meta.nadlezni_postupak_status === 'poslano' ||
      meta.nadlezni_postupak_status === 'vraceno'
        ? meta.nadlezni_postupak_status
        : '',
    nadlezni_postupak_tijelo: meta.nadlezni_postupak_tijelo || '',
    nadlezni_postupak_datum_slanja: meta.nadlezni_postupak_datum_slanja || '',
    nadlezni_postupak_datum_povratka: meta.nadlezni_postupak_datum_povratka || '',
    nadlezni_postupak_napomena: meta.nadlezni_postupak_napomena || '',
  };
}

export interface ZupDeadlineInfo {
  daysElapsed: number;
  daysRemaining: number;
  deadlineDateFormatted: string;
  urgency: 'normal' | 'warning' | 'overdue';
  label: string;
}

/**
 * Zakonski rok za donošenje i dostavu drugostupanjskog rješenja (čl. 121. st. 1. ZUP-a: 60 dana od dana predaje uredne žalbe).
 * Računa se isključivo od datuma predaje žalbe (prvostupanjskom tijelu ili izravno drugostupanjskom),
 * a ne od naknadnog primitka spisa u Ministarstvu. Ako datum predaje žalbe još nije unesen, vraća null.
 */
export function calculateZupDeadline(
  datumPredajeZalbe: string | null | undefined,
  rokDana = 60
): ZupDeadlineInfo | null {
  if (!datumPredajeZalbe) return null;
  const received = new Date(datumPredajeZalbe);
  if (Number.isNaN(received.getTime())) return null;

  const now = new Date();
  // Usporedba po kalendarskim danima bez utjecaja vremenskih zona
  const utcReceived = Date.UTC(received.getFullYear(), received.getMonth(), received.getDate());
  const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const daysElapsed = Math.floor((utcNow - utcReceived) / (1000 * 60 * 60 * 24));
  const daysRemaining = rokDana - daysElapsed;

  const deadline = new Date(received);
  deadline.setDate(deadline.getDate() + rokDana);
  const deadlineDateFormatted = deadline.toLocaleDateString('hr-HR');

  if (daysRemaining < 0) {
    return {
      daysElapsed,
      daysRemaining,
      deadlineDateFormatted,
      urgency: 'overdue',
      label: `Prekoračen rok (+${Math.abs(daysRemaining)} d.)`,
    };
  }
  if (daysRemaining <= 15) {
    return {
      daysElapsed,
      daysRemaining,
      deadlineDateFormatted,
      urgency: 'warning',
      label: daysRemaining === 0 ? 'Istječe danas!' : `Još ${daysRemaining} d. (rok)`,
    };
  }
  return {
    daysElapsed,
    daysRemaining,
    deadlineDateFormatted,
    urgency: 'normal',
    label: `Preostalo ${daysRemaining} d.`,
  };
}

/**
 * Provjerava označava li naziv ili vrsta dokumenta košuljicu spisa.
 */
export function isKosuljicaRole(vrstaOrName: string | null | undefined): boolean {
  const v = (vrstaOrName || '').toLowerCase();
  return v.includes('košulj') || v.includes('kosulj');
}

/**
 * Vraća true za skenove čiji naziv datoteke ne otkriva izričito drugu vrstu akta
 * (npr. Scan_002.pdf, IMG_1234.jpg), pa bi mogli biti košuljica spisa sa zabilješkama.
 */
export function isAmbiguousScanFilename(fileName: string): boolean {
  const f = fileName.toLowerCase();
  const ext = f.split('.').pop() || '';
  if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) return false;

  const explicitNonKosuljicaMarkers = [
    'žalba',
    'zalba',
    'prigovor',
    'dostavn',
    'povratnic',
    'punomo',
    'popratn',
    'izvje',
    'dopis',
    'drugostup',
    'up-ii',
    'up_ii',
    'rješenj',
    'rjesenj',
    'prvostup',
    'dozvol',
    'izvadak',
    'obrazac',
    'zapisnik',
    'dokaz',
  ];
  return !explicitNonKosuljicaMarkers.some((marker) => f.includes(marker));
}

function normalizeNoteForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:\-—–|()„”"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Provjerava sadrži li postojeća bilješka već novi unos (bez obzira na interpunkciju i veličinu slova).
 */
export function containsNoteNormalized(container: string, snippet: string): boolean {
  const normContainer = normalizeNoteForDedupe(container);
  const normSnippet = normalizeNoteForDedupe(snippet);
  if (!normSnippet) return true;
  if (!normContainer) return false;
  if (normContainer.includes(normSnippet)) return true;

  const clauses = snippet
    .split(/[;\n—]+/)
    .map((c) => normalizeNoteForDedupe(c))
    .filter((c) => c.length >= 2);
  if (clauses.length > 1) {
    return clauses.every((c) => normContainer.includes(c));
  }
  return false;
}

/**
 * Pametno spaja zabilješke s košuljice / rukopisne bilješke s postojećom napomenom predmeta
 * bez gubitka sadržaja i bez dupliranja bez obzira na redoslijed učitavanja dokumenata.
 */
export function mergeKosuljicaNote(params: {
  currentNapomena: string;
  newNote: string;
  isHandwrittenOrJacket: boolean;
  currentIsPureAutoSummary?: boolean;
}): { napomena: string; added: boolean } {
  const current = (params.currentNapomena || '').trim();
  const incoming = (params.newNote || '').trim();

  if (!incoming) {
    return { napomena: current, added: false };
  }

  if (containsNoteNormalized(current, incoming)) {
    return { napomena: current, added: false };
  }

  if (!current) {
    return { napomena: incoming, added: true };
  }

  if (params.isHandwrittenOrJacket) {
    // Ako je dosadašnja napomena bila samo opći AI sažetak s dopisa/žalbe,
    // zabilješku s košuljice stavljamo na početak kako bi odmah bila vidljiva.
    if (params.currentIsPureAutoSummary) {
      return { napomena: `${incoming} — ${current}`, added: true };
    }
    return { napomena: `${current}; ${incoming}`, added: true };
  }

  // Opći sažetak dokumenta (npr. popratni dopis dodan NAKON košuljice)
  return { napomena: `${current} — ${incoming}`, added: true };
}

