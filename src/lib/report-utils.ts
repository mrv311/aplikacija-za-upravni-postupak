import type { EnrichedPredmet, PredmetPodrucje, PredmetIshod } from './predmet-meta';

export type ReportPeriodPreset =
  | 'ova-godina'
  | 'prosla-godina'
  | 'kvartal'
  | 'mjesec'
  | 'sve'
  | 'custom';

export interface ReportFilters {
  period: ReportPeriodPreset;
  customOd?: string; // YYYY-MM-DD
  customDo?: string; // YYYY-MM-DD
  podrucje?: string; // 'Sva' | 'NUV' | 'VD' ...
  status?: string; // 'Svi' | 'aktivan' | 'arhiviran' | 'na_potpisu'
  ishod?: string; // 'Svi' | 'Odbijena žalba' ...
  query?: string;
}

export interface ReportMetrics {
  ukupnoPredmeta: number;
  ukupnoZaprimljenoURazdoblju: number;
  ukupnoRijeseno: number;
  ukupnoURadu: number;
  ukupnoNaPotpisu: number;
  stopaRjesavanja: number; // postotak npr. 85.5
  ukupnoURoku: number;
  ukupnoPrekoracenRok: number;
  postotakURoku: number; // postotak npr. 92.3
  prosjecnoTrajanjeRjesavanjaDana: number;
  prosjecnoTrajanjeAktivnihDana: number;
  ishodiBreakdown: Array<{
    ishod: string;
    label: string;
    count: number;
    percentage: number;
    color: string;
  }>;
  podrucjaBreakdown: Array<{
    podrucje: string;
    count: number;
    percentage: number;
    rijeseno: number;
    uRadu: number;
  }>;
  mjesecniTrend: Array<{
    key: string;
    mjesecNaziv: string;
    zaprimljeno: number;
    rijeseno: number;
  }>;
  rizicniPredmeti: EnrichedPredmet[];
}

const HR_MJESECI = [
  'Sij',
  'Velj',
  'Ožu',
  'Tra',
  'Svi',
  'Lip',
  'Srp',
  'Kol',
  'Ruj',
  'Lis',
  'Stu',
  'Pro',
];

export function getDateRangeForPreset(
  preset: ReportPeriodPreset,
  customOd?: string,
  customDo?: string
): { od: Date | null; do: Date | null; label: string } {
  const now = new Date();
  const currentYear = now.getFullYear();

  switch (preset) {
    case 'ova-godina': {
      const od = new Date(currentYear, 0, 1, 0, 0, 0);
      const doDate = new Date(currentYear, 11, 31, 23, 59, 59);
      return { od, do: doDate, label: `Tekuća godina (${currentYear}.)` };
    }
    case 'prosla-godina': {
      const prevYear = currentYear - 1;
      const od = new Date(prevYear, 0, 1, 0, 0, 0);
      const doDate = new Date(prevYear, 11, 31, 23, 59, 59);
      return { od, do: doDate, label: `Prethodna godina (${prevYear}.)` };
    }
    case 'kvartal': {
      const od = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      od.setHours(0, 0, 0, 0);
      return { od, do: now, label: 'Zadnjih 90 dana (kvartal)' };
    }
    case 'mjesec': {
      const od = new Date(currentYear, now.getMonth(), 1, 0, 0, 0);
      const doDate = new Date(currentYear, now.getMonth() + 1, 0, 23, 59, 59);
      const mjNaziv = HR_MJESECI[now.getMonth()];
      return { od, do: doDate, label: `Tekući mjesec (${mjNaziv} ${currentYear}.)` };
    }
    case 'custom': {
      const od = customOd ? new Date(`${customOd}T00:00:00`) : null;
      const doDate = customDo ? new Date(`${customDo}T23:59:59`) : null;
      const odStr = customOd ? new Date(customOd).toLocaleDateString('hr-HR') : 'početka';
      const doStr = customDo ? new Date(customDo).toLocaleDateString('hr-HR') : 'danas';
      return { od, do: doDate, label: `Razdoblje od ${odStr} do ${doStr}` };
    }
    case 'sve':
    default:
      return { od: null, do: null, label: 'Sve vrijeme (cjelokupna evidencija)' };
  }
}

/**
 * Izračunava trajanje rješavanja predmeta u danima i provjerava poštivanje ZUP roka (60 dana).
 */
export function getPredmetDurationInfo(predmet: EnrichedPredmet): {
  days: number;
  isResolved: boolean;
  isOverdue: boolean;
  statusLabel: string;
} {
  const isResolved =
    predmet.status === 'arhiviran' ||
    Boolean(predmet.datum_rjesavanja) ||
    Boolean(predmet.datum_slanja_na_potpis);

  const start = predmet.datum_zaprimanja ? new Date(predmet.datum_zaprimanja) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { days: 0, isResolved, isOverdue: false, statusLabel: 'Nepoznat datum' };
  }

  let end: Date;
  if (isResolved) {
    const rawEnd = predmet.datum_rjesavanja || predmet.datum_slanja_na_potpis;
    end = rawEnd ? new Date(rawEnd) : new Date();
    if (Number.isNaN(end.getTime())) end = new Date();
  } else {
    end = new Date();
  }

  const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const diffDays = Math.max(0, Math.floor((utcEnd - utcStart) / (1000 * 60 * 60 * 24)));

  const isOverdue = diffDays > 60;
  let statusLabel = '';
  if (isResolved) {
    statusLabel = isOverdue
      ? `Riješeno uz prekoračenje (+${diffDays - 60} d.)`
      : `Riješeno u roku (${diffDays} d.)`;
  } else {
    statusLabel = isOverdue
      ? `Prekoračen rok (+${diffDays - 60} d.)`
      : `U roku (${diffDays}/60 d.)`;
  }

  return { days: diffDays, isResolved, isOverdue, statusLabel };
}

/**
 * Filtrira popis predmeta prema zadanim parametrima.
 */
export function filterPredmeti(
  predmeti: EnrichedPredmet[],
  filters: ReportFilters
): EnrichedPredmet[] {
  const { od, do: doDate } = getDateRangeForPreset(
    filters.period,
    filters.customOd,
    filters.customDo
  );

  return predmeti.filter((p) => {
    // 1. Datumski filter po datumu zaprimanja (ili rješavanja ako je arhiviran)
    if (od || doDate) {
      const datumRef = p.datum_zaprimanja ? new Date(p.datum_zaprimanja) : null;
      if (datumRef && !Number.isNaN(datumRef.getTime())) {
        if (od && datumRef < od) return false;
        if (doDate && datumRef > doDate) return false;
      }
    }

    // 2. Područje (NUV, VD, NZZV ili novo dodani postupci)
    if (filters.podrucje && filters.podrucje !== 'Sva') {
      if ((p.podrucje || 'Ostalo').toLowerCase() !== filters.podrucje.toLowerCase()) {
        return false;
      }
    }

    // 3. Status
    if (filters.status && filters.status !== 'Svi') {
      if (filters.status === 'na_potpisu') {
        if (p.faza !== 'Na potpisu') return false;
      } else if (filters.status === 'aktivan') {
        if (p.status !== 'aktivan') return false;
      } else if (filters.status === 'arhiviran') {
        if (p.status !== 'arhiviran') return false;
      }
    }

    // 4. Ishod
    if (filters.ishod && filters.ishod !== 'Svi') {
      if ((p.ishod || '').toLowerCase() !== filters.ishod.toLowerCase()) {
        return false;
      }
    }

    // 5. Pretraga (klasa, urbroj, stranka, napomena)
    if (filters.query && filters.query.trim()) {
      const q = filters.query.toLowerCase().trim();
      const match =
        (p.klasa || '').toLowerCase().includes(q) ||
        (p.urbroj || '').toLowerCase().includes(q) ||
        (p.stranka || '').toLowerCase().includes(q) ||
        (p.napomena || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });
}

/**
 * Računa sve statističke metrike, raspodjele i trendove za filtrirani skup predmeta.
 */
export function calculateReportMetrics(filtered: EnrichedPredmet[]): ReportMetrics {
  const ukupnoPredmeta = filtered.length;

  let ukupnoRijeseno = 0;
  let ukupnoURadu = 0;
  let ukupnoNaPotpisu = 0;
  let ukupnoURoku = 0;
  let ukupnoPrekoracenRok = 0;
  let zbrojDanaRjesavanja = 0;
  let brojPredmetaSaDanima = 0;
  let zbrojDanaAktivnih = 0;
  let brojAktivnihSaDanima = 0;

  const ishodiMap = new Map<string, number>();
  const podrucjaMap = new Map<string, { count: number; rijeseno: number; uRadu: number }>();
  const rizicniPredmeti: EnrichedPredmet[] = [];

  // Mjesečni trend (zadnjih 12 mjeseci ili mjeseci tekuće godine)
  const now = new Date();
  const currentYear = now.getFullYear();
  const mjesecniTrendMap = new Map<string, { zaprimljeno: number; rijeseno: number }>();

  // Inicijaliziraj 12 mjeseci
  for (let m = 0; m < 12; m++) {
    const key = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
    mjesecniTrendMap.set(key, { zaprimljeno: 0, rijeseno: 0 });
  }

  for (const p of filtered) {
    const isResolved =
      p.status === 'arhiviran' ||
      Boolean(p.datum_rjesavanja) ||
      (p.faza === 'Na potpisu' && Boolean(p.datum_slanja_na_potpis));

    const duration = getPredmetDurationInfo(p);

    if (isResolved) {
      ukupnoRijeseno++;
      zbrojDanaRjesavanja += duration.days;
      brojPredmetaSaDanima++;
      if (duration.isOverdue) {
        ukupnoPrekoracenRok++;
      } else {
        ukupnoURoku++;
      }

      // Ishodi
      const ishodKey = p.ishod || 'Neodređen ishod';
      ishodiMap.set(ishodKey, (ishodiMap.get(ishodKey) || 0) + 1);
    } else {
      ukupnoURadu++;
      if (p.faza === 'Na potpisu') {
        ukupnoNaPotpisu++;
      }
      zbrojDanaAktivnih += duration.days;
      brojAktivnihSaDanima++;

      if (duration.isOverdue) {
        ukupnoPrekoracenRok++;
        rizicniPredmeti.push(p);
      } else {
        ukupnoURoku++;
        // Ako je preostalo manje od 15 dana (duration.days >= 45)
        if (duration.days >= 45) {
          rizicniPredmeti.push(p);
        }
      }
    }

    // Područja
    const podrucjeKey = p.podrucje || 'Ostalo';
    const podrucjeData = podrucjaMap.get(podrucjeKey) || { count: 0, rijeseno: 0, uRadu: 0 };
    podrucjeData.count++;
    if (isResolved) podrucjeData.rijeseno++;
    else podrucjeData.uRadu++;
    podrucjaMap.set(podrucjeKey, podrucjeData);

    // Mjesečna dinamika
    if (p.datum_zaprimanja) {
      const zaprDate = new Date(p.datum_zaprimanja);
      if (!Number.isNaN(zaprDate.getTime())) {
        const ym = `${zaprDate.getFullYear()}-${String(zaprDate.getMonth() + 1).padStart(2, '0')}`;
        if (mjesecniTrendMap.has(ym)) {
          const entry = mjesecniTrendMap.get(ym)!;
          entry.zaprimljeno++;
        }
      }
    }

    const datumRj = p.datum_rjesavanja || p.datum_slanja_na_potpis;
    if (datumRj) {
      const rjDate = new Date(datumRj);
      if (!Number.isNaN(rjDate.getTime())) {
        const ym = `${rjDate.getFullYear()}-${String(rjDate.getMonth() + 1).padStart(2, '0')}`;
        if (mjesecniTrendMap.has(ym)) {
          const entry = mjesecniTrendMap.get(ym)!;
          entry.rijeseno++;
        }
      }
    }
  }

  const stopaRjesavanja =
    ukupnoPredmeta > 0 ? Number(((ukupnoRijeseno / ukupnoPredmeta) * 100).toFixed(1)) : 0;
  const postotakURoku =
    ukupnoPredmeta > 0 ? Number(((ukupnoURoku / ukupnoPredmeta) * 100).toFixed(1)) : 100;
  const prosjecnoTrajanjeRjesavanjaDana =
    brojPredmetaSaDanima > 0 ? Math.round(zbrojDanaRjesavanja / brojPredmetaSaDanima) : 0;
  const prosjecnoTrajanjeAktivnihDana =
    brojAktivnihSaDanima > 0 ? Math.round(zbrojDanaAktivnih / brojAktivnihSaDanima) : 0;

  // Boje za ishode
  const ISHOD_COLORS: Record<string, string> = {
    'Odbijena žalba': '#10b981', // emerald-500
    'Poništeno rješenje': '#6366f1', // indigo-500
    'Odbačena žalba': '#f59e0b', // amber-500
    'Obustava / Ostalo': '#64748b', // slate-500
  };

  const ishodiBreakdown = Array.from(ishodiMap.entries())
    .map(([ishod, count]) => ({
      ishod,
      label: ishod,
      count,
      percentage:
        ukupnoRijeseno > 0 ? Number(((count / ukupnoRijeseno) * 100).toFixed(1)) : 0,
      color: ISHOD_COLORS[ishod] || '#94a3b8',
    }))
    .sort((a, b) => b.count - a.count);

  const podrucjaBreakdown = Array.from(podrucjaMap.entries())
    .map(([podrucje, data]) => ({
      podrucje,
      count: data.count,
      percentage:
        ukupnoPredmeta > 0 ? Number(((data.count / ukupnoPredmeta) * 100).toFixed(1)) : 0,
      rijeseno: data.rijeseno,
      uRadu: data.uRadu,
    }))
    .sort((a, b) => b.count - a.count);

  const mjesecniTrend = Array.from(mjesecniTrendMap.entries()).map(([key, data]) => {
    const [, monthStr] = key.split('-');
    const mIndex = parseInt(monthStr, 10) - 1;
    const mjesecNaziv = HR_MJESECI[mIndex] || monthStr;
    return {
      key,
      mjesecNaziv,
      zaprimljeno: data.zaprimljeno,
      rijeseno: data.rijeseno,
    };
  });

  // Sortiraj rizične po prekoračenju / hitnosti
  rizicniPredmeti.sort((a, b) => {
    const da = getPredmetDurationInfo(a).days;
    const db = getPredmetDurationInfo(b).days;
    return db - da;
  });

  return {
    ukupnoPredmeta,
    ukupnoZaprimljenoURazdoblju: ukupnoPredmeta,
    ukupnoRijeseno,
    ukupnoURadu,
    ukupnoNaPotpisu,
    stopaRjesavanja,
    ukupnoURoku,
    ukupnoPrekoracenRok,
    postotakURoku,
    prosjecnoTrajanjeRjesavanjaDana,
    prosjecnoTrajanjeAktivnihDana,
    ishodiBreakdown,
    podrucjaBreakdown,
    mjesecniTrend,
    rizicniPredmeti,
  };
}

/**
 * Izvozi filtrirani skup predmeta u CSV datoteku prilagođenu za hrvatski Excel
 * (s točka-zarezom kao separatorom i UTF-8 BOM predznakom radi č, ć, ž, š, đ).
 */
export function exportReportToCsv(predmeti: EnrichedPredmet[], filename?: string): void {
  const headers = [
    'Klasa',
    'Urbroj',
    'Stranka / Žalitelj',
    'Upravno područje',
    'Status spisa',
    'Faza postupka',
    'Datum zaprimanja',
    'Datum rješavanja / potpisa',
    'Utrošeno dana',
    'Status ZUP roka (60 d.)',
    'Ishod rješenja',
    'Pohranjeno u praksu',
    'Napomena',
  ];

  const rows = predmeti.map((p) => {
    const duration = getPredmetDurationInfo(p);
    const datumZaprimanjaStr = p.datum_zaprimanja
      ? new Date(p.datum_zaprimanja).toLocaleDateString('hr-HR')
      : '';
    const datumRjesavanjaStr = p.datum_rjesavanja || p.datum_slanja_na_potpis
      ? new Date((p.datum_rjesavanja || p.datum_slanja_na_potpis)!).toLocaleDateString('hr-HR')
      : '';
    const zupRokStatus = duration.isOverdue ? 'Prekoračen rok' : 'U zakonskom roku';
    const praksaStr = p.poslano_u_praksu ? 'Da' : 'Ne';

    const escapeCsv = (str: string | undefined | null) => {
      const val = str ? String(str).replace(/"/g, '""').replace(/\r?\n/g, ' ') : '';
      return `"${val}"`;
    };

    return [
      escapeCsv(p.klasa),
      escapeCsv(p.urbroj),
      escapeCsv(p.stranka),
      escapeCsv(p.podrucje || 'Ostalo'),
      escapeCsv(p.status === 'arhiviran' ? 'Arhiviran (A/A)' : 'Aktivan u radu'),
      escapeCsv(p.faza || 'Novo'),
      escapeCsv(datumZaprimanjaStr),
      escapeCsv(datumRjesavanjaStr),
      escapeCsv(String(duration.days)),
      escapeCsv(zupRokStatus),
      escapeCsv(p.ishod || 'U radu / bez ishoda'),
      escapeCsv(praksaStr),
      escapeCsv(p.napomena || ''),
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.map((h) => `"${h}"`).join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const defaultFilename = `Izvjesce_o_radu_${new Date().toISOString().split('T')[0]}.csv`;
  link.setAttribute('href', url);
  link.setAttribute('download', filename || defaultFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
