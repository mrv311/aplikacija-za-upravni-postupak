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

export type PredmetPodrucje = 'NUV' | 'VD' | 'NZZV' | 'Ostalo' | (string & {});

export const PREDMET_PODRUCJA: { value: PredmetPodrucje; label: string; fullLabel: string }[] = [
  { value: 'NUV', label: 'NUV', fullLabel: 'Naknada za uređenje voda (NUV)' },
  { value: 'VD', label: 'VD', fullLabel: 'Vodni doprinos (VD)' },
  { value: 'NZZV', label: 'NZZV', fullLabel: 'Naknada za zaštitu voda (NZZV)' },
  { value: 'Ostalo', label: 'Ostalo', fullLabel: 'Ostali upravni predmeti' },
];

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

export type PredmetIshod =
  | 'Odbijena žalba'
  | 'Poništeno rješenje'
  | 'Odbačena žalba'
  | 'Obustava / Ostalo';

export const PREDMET_ISHODI: {
  value: PredmetIshod;
  label: string;
  badgeClass: string;
}[] = [
  {
    value: 'Odbijena žalba',
    label: 'Odbijena žalba (čl. 116. ZUP)',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    value: 'Poništeno rješenje',
    label: 'Poništeno / izmijenjeno rješenje (čl. 117. ZUP)',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    value: 'Odbačena žalba',
    label: 'Odbačena žalba (čl. 114. ZUP)',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    value: 'Obustava / Ostalo',
    label: 'Obustava postupka / Ostalo',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
];

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
