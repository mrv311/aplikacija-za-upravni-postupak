import { supabaseServer as dbServer } from './supabase-server';
import { supabase as dbClient } from './supabase';
import {
  META_DOC_TYPE,
  CHAT_DOC_TYPE,
  SLUZBENICI_DOC_TYPE,
  decodePredmetMetaUrl,
  formatIsoDateHr,
} from './predmet-meta';
import type { UpravniSpor } from './upravni-sporovi';

export interface PovezanoDrugostupanjskoRjesenje {
  predmetId: string;
  klasa: string;
  urbroj?: string;
  stranka: string;
  datumZaprimanja?: string;
  datumRjesenja?: string; // npr. "9. studenog 2026." iz zaglavlja rješenja
  datumRjesavanja?: string; // ISO YYYY-MM-DD iz meta.datum_rjesavanja
  datumRjesavanjaFormat?: string; // DD.MM.YYYY.
  ishod?: string; // npr. "Odbijena žalba"
  faza?: string;
  status: string; // 'arhiviran' | 'aktivan' | ...
  doneseno: boolean; // true ako je arhiviran ili ima datum_rjesavanja / ishod
  prvostupanjskaKlasa?: string; // npr. "UP/I-325-10/22-04/0005585"
  matchRazlog: 'klasa_up_ii' | 'klasa_up_i' | 'oib' | 'stranka';
}

export interface PovezanoRjesenjeWithDoc extends PovezanoDrugostupanjskoRjesenje {
  rjesenjeTekst?: string;
}

interface RawPredmetRow {
  id: string;
  klasa: string;
  urbroj?: string | null;
  stranka: string;
  datum_zaprimanja?: string | null;
  status: string;
  dokumenti?: Array<{
    id: string;
    tip_dokumenta: string;
    storage_url: string;
  }>;
}

interface RawDokumentTextRow {
  predmet_id: string;
  tip_dokumenta: string;
  storage_url?: string | null;
  raw_text?: string | null;
}

const NAME_STOP_WORDS = new Set([
  'doo',
  'jdoo',
  'dd',
  'obrt',
  'vl',
  'sa',
  'po',
  'oib',
  'iz',
  'za',
  'od',
  'te',
  'na',
  'po',
  'pp',
  'tuzitelj',
  'tuziteljica',
  'stranka',
]);

export function normalizeHr(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanPartyName(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/\(?\s*OIB\s*:?\s*\d{11}\s*\)?/gi, ' ')
    .replace(/\b(?:d\.o\.o\.|j\.d\.o\.o\.|d\.d\.|sa\s+p\.o\.)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeName(str: string): string[] {
  return normalizeHr(cleanPartyName(str))
    .split(/[\s,.;:()/"'„“\-–]+/)
    .filter((t) => t.length >= 2 && !NAME_STOP_WORDS.has(t));
}

export function isStrongNameMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeHr(cleanPartyName(a));
  const nb = normalizeHr(cleanPartyName(b));
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = tokenizeName(na);
  const tb = tokenizeName(nb);
  if (ta.length === 0 || tb.length === 0) return false;

  const [smaller, larger] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const largerSet = new Set(larger);

  if (smaller.length >= 2) {
    return smaller.every((tok) => largerSet.has(tok));
  }

  return smaller[0].length >= 5 && larger.length === 1 && smaller[0] === larger[0];
}

export function extractUpIiKlase(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/UP\/II-[\dA-Za-z\/-]+/gi) || [];
  const set = new Set<string>();
  for (const m of matches) {
    set.add(m.replace(/[.,;:)\]]+$/, '').toUpperCase());
  }
  return Array.from(set);
}

export function extractUpIKlase(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/UP\/I-[\dA-Za-z\/-]+/gi) || [];
  const set = new Set<string>();
  for (const m of matches) {
    set.add(m.replace(/[.,;:)\]]+$/, '').toUpperCase());
  }
  return Array.from(set);
}

export function extractOib(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(\d{11})\b/);
  return m ? m[1] : undefined;
}

function extractRjesenjeDetailsFromDocs(docs: RawDokumentTextRow[]): {
  urbroj?: string;
  datumRjesenja?: string;
  prvostupanjskeKlase: string[];
  oibs: string[];
  rjesenjeTekst?: string;
} {
  let urbroj: string | undefined;
  let datumRjesenja: string | undefined;
  let rjesenjeTekst: string | undefined;
  const upISet = new Set<string>();
  const oibSet = new Set<string>();

  // Prioritet dokumentu koji je Drugostupanjsko rješenje
  const sortedDocs = [...docs].sort((a, b) => {
    const aIsRj = (a.tip_dokumenta || '').toLowerCase().includes('drugostupanjsko rješenje') ? 0 : 1;
    const bIsRj = (b.tip_dokumenta || '').toLowerCase().includes('drugostupanjsko rješenje') ? 0 : 1;
    return aIsRj - bIsRj;
  });

  for (const doc of sortedDocs) {
    const raw = doc.raw_text || '';
    if (!raw) continue;

    const tipLower = (doc.tip_dokumenta || '').toLowerCase();
    const isDrugostupanjsko =
      tipLower.includes('drugostupanjsko rješenje') ||
      tipLower.includes('drugostupanjsko rjesenje') ||
      doc.storage_url === 'draft://internal';

    if (isDrugostupanjsko) {
      if (!rjesenjeTekst) {
        rjesenjeTekst = raw;
      }
      if (!urbroj) {
        const uMatch = raw.match(/URBROJ:\s*([0-9]+(?:-[0-9A-Za-z]+)+)/i);
        if (uMatch) urbroj = uMatch[1].trim();
      }
      if (!datumRjesenja) {
        const dMatch = raw.match(
          /Zagreb,\s*(\d{1,2}\.\s*[a-zčćđšž]+\s*\d{4}\.?|\d{1,2}\.\d{1,2}\.\d{4}\.?)/i
        );
        if (dMatch) datumRjesenja = dMatch[1].trim().replace(/\.?$/, '.');
      }
    }

    for (const k of extractUpIKlase(raw)) {
      upISet.add(k);
    }

    for (const om of raw.matchAll(/OIB:\s*(\d{11})/gi)) {
      oibSet.add(om[1]);
    }
  }

  return {
    urbroj,
    datumRjesenja,
    prvostupanjskeKlase: Array.from(upISet),
    oibs: Array.from(oibSet),
    rjesenjeTekst,
  };
}

function buildPovezanoFromPredmet(
  predmet: RawPredmetRow,
  docs: RawDokumentTextRow[],
  matchRazlog: PovezanoDrugostupanjskoRjesenje['matchRazlog']
): PovezanoRjesenjeWithDoc {
  const metaDoc = (predmet.dokumenti || []).find((d) => d.tip_dokumenta === META_DOC_TYPE);
  const meta = metaDoc ? decodePredmetMetaUrl(metaDoc.storage_url) : {};
  const details = extractRjesenjeDetailsFromDocs(docs);

  const doneseno =
    predmet.status === 'arhiviran' || Boolean(meta.datum_rjesavanja) || Boolean(meta.ishod);

  const datumRjesavanja = meta.datum_rjesavanja || undefined;
  const datumRjesavanjaFormat = datumRjesavanja ? formatIsoDateHr(datumRjesavanja) : undefined;

  return {
    predmetId: predmet.id,
    klasa: (predmet.klasa || '').trim(),
    urbroj: details.urbroj || (predmet.urbroj || '').trim() || undefined,
    stranka: (predmet.stranka || '').trim(),
    datumZaprimanja: predmet.datum_zaprimanja || undefined,
    datumRjesenja: details.datumRjesenja,
    datumRjesavanja,
    datumRjesavanjaFormat,
    ishod: meta.ishod || undefined,
    faza: meta.faza || undefined,
    status: predmet.status || 'aktivan',
    doneseno,
    prvostupanjskaKlasa: details.prvostupanjskeKlase[0],
    matchRazlog,
    rjesenjeTekst: details.rjesenjeTekst,
  };
}

export function buildAutoNoteForIssuedRjesenje(r: PovezanoDrugostupanjskoRjesenje): string {
  const aktParts = [`KLASA: ${r.klasa}`];
  if (r.urbroj) aktParts.push(`URBROJ: ${r.urbroj}`);
  const datumDio = r.datumRjesenja
    ? ` od ${r.datumRjesenja}`
    : r.datumRjesavanjaFormat
    ? ` od ${r.datumRjesavanjaFormat}`
    : '';
  const ishodDio = r.ishod ? ` (${r.ishod})` : '';

  return `Šutnja uprave — u međuvremenu doneseno drugostupanjsko rješenje ${aktParts.join(', ')}${datumDio}${ishodDio}. Potrebno izraditi odgovor na tužbu (prijedlog obustave spora po čl. 24. st. 3. ZUS-a).`;
}

export function mergeAutoNoteIntoNapomena(
  existingNapomena: string | null | undefined,
  r: PovezanoDrugostupanjskoRjesenje
): string {
  const existing = (existingNapomena || '').trim();
  const autoNote = buildAutoNoteForIssuedRjesenje(r);

  if (existing) {
    const existingLower = existing.toLowerCase();
    const klasaLower = r.klasa.toLowerCase();
    // Ako bilješka već sadrži klasu tog drugostupanjskog rješenja i uputu za odgovor, ne dupliciraj
    if (
      klasaLower &&
      existingLower.includes(klasaLower) &&
      (existingLower.includes('odgovor') || existingLower.includes('drugostupanjsk'))
    ) {
      return existing;
    }

    // Ako je korisnik ručno upisao samo kratku oznaku "šutnja uprave", zamijeni je punom informativnom bilješkom
    if (/^[sš]utnj[aeiu]\s+uprav[en]\.?$/i.test(existing)) {
      return autoNote;
    }

    return `${existing} | ${autoNote}`;
  }

  return autoNote;
}

/**
 * Pronalazi povezani drugostupanjski ZUP predmet u Supabase bazi za pojedini upit
 * (kod uvoza sudskog paketa ili izrade odgovora na tužbu).
 */
export async function findLinkedZupRjesenjeForQuery(params: {
  pobijaniAkt?: string | null;
  prvostupanjskiAkt?: string | null;
  tuzitelj?: string | null;
  oib?: string | null;
  includeDocText?: boolean;
}): Promise<PovezanoRjesenjeWithDoc | null> {
  try {
    const db = dbServer || dbClient;
    if (!db) return null;

    const combinedAkt = `${params.pobijaniAkt || ''} ${params.prvostupanjskiAkt || ''}`.trim();
    const upIiKlase = extractUpIiKlase(combinedAkt);
    const upIKlase = extractUpIKlase(combinedAkt);
    const oib = params.oib || extractOib(params.tuzitelj);

    const { data: predmetiRows, error } = await db
      .from('predmeti')
      .select('id, klasa, urbroj, stranka, datum_zaprimanja, status, dokumenti(id, tip_dokumenta, storage_url)')
      .order('datum_zaprimanja', { ascending: false });

    if (error || !predmetiRows || predmetiRows.length === 0) return null;

    const predmeti = predmetiRows as RawPredmetRow[];
    const predmetById = new Map<string, RawPredmetRow>(predmeti.map((p) => [p.id, p]));

    let matchedPredmet: RawPredmetRow | null = null;
    let matchRazlog: PovezanoDrugostupanjskoRjesenje['matchRazlog'] = 'stranka';

    // 1. Točno podudaranje UP/II klase
    if (upIiKlase.length > 0) {
      for (const k of upIiKlase) {
        const found = predmeti.find((p) => (p.klasa || '').toUpperCase().includes(k));
        if (found) {
          matchedPredmet = found;
          matchRazlog = 'klasa_up_ii';
          break;
        }
      }
    }

    // 2. Podudaranje UP/I klase unutar spisa u bazi (dokumenti.raw_text)
    if (!matchedPredmet && upIKlase.length > 0) {
      for (const upI of upIKlase) {
        const { data: docHits } = await db
          .from('dokumenti')
          .select('predmet_id')
          .neq('tip_dokumenta', CHAT_DOC_TYPE)
          .neq('tip_dokumenta', META_DOC_TYPE)
          .neq('tip_dokumenta', SLUZBENICI_DOC_TYPE)
          .ilike('raw_text', `%${upI}%`)
          .limit(3);

        if (docHits && docHits.length > 0) {
          const hitPred = predmetById.get(docHits[0].predmet_id);
          if (hitPred) {
            matchedPredmet = hitPred;
            matchRazlog = 'klasa_up_i';
            break;
          }
        }
      }
    }

    // 3. Podudaranje OIB-a unutar spisa u bazi (dokumenti.raw_text)
    if (!matchedPredmet && oib) {
      const { data: oibHits } = await db
        .from('dokumenti')
        .select('predmet_id')
        .neq('tip_dokumenta', CHAT_DOC_TYPE)
        .neq('tip_dokumenta', META_DOC_TYPE)
        .neq('tip_dokumenta', SLUZBENICI_DOC_TYPE)
        .ilike('raw_text', `%${oib}%`)
        .limit(5);

      if (oibHits && oibHits.length > 0) {
        // Prednost arhiviranom / riješenom predmetu ako ih ima više za isti OIB
        const candidates = oibHits
          .map((h: { predmet_id: string }) => predmetById.get(h.predmet_id))
          .filter((p): p is RawPredmetRow => Boolean(p));
        const resolved = candidates.find((p) => p.status === 'arhiviran');
        matchedPredmet = resolved || candidates[0] || null;
        if (matchedPredmet) matchRazlog = 'oib';
      }
    }

    // 4. Snažno podudaranje punog imena / naziva stranke
    if (!matchedPredmet && params.tuzitelj) {
      const nameMatches = predmeti.filter((p) => isStrongNameMatch(params.tuzitelj, p.stranka));
      if (nameMatches.length > 0) {
        const resolved = nameMatches.find((p) => p.status === 'arhiviran');
        matchedPredmet = resolved || nameMatches[0];
        matchRazlog = 'stranka';
      }
    }

    if (!matchedPredmet) return null;

    const { data: docsData } = await db
      .from('dokumenti')
      .select('predmet_id, tip_dokumenta, storage_url, raw_text')
      .eq('predmet_id', matchedPredmet.id)
      .neq('tip_dokumenta', CHAT_DOC_TYPE)
      .neq('tip_dokumenta', META_DOC_TYPE)
      .neq('tip_dokumenta', SLUZBENICI_DOC_TYPE);

    const docs = (docsData || []) as RawDokumentTextRow[];
    const details = extractRjesenjeDetailsFromDocs(docs);

    // Zaštita od lažnog spajanja: ako je podudaranje samo po imenu ili OIB-u, a spor ima UP/I klasu
    // dok povezani ZUP predmet ima eksplicitno DRUGAČIJU UP/I klasu (drugi spis iste stranke), ne spajaj!
    if (
      (matchRazlog === 'stranka' || matchRazlog === 'oib') &&
      upIKlase.length > 0 &&
      details.prvostupanjskeKlase.length > 0
    ) {
      const hasOverlap = upIKlase.some((k) => details.prvostupanjskeKlase.includes(k));
      if (!hasOverlap) {
        return null;
      }
    }

    const result = buildPovezanoFromPredmet(matchedPredmet, docs, matchRazlog);
    if (!params.includeDocText) {
      delete result.rjesenjeTekst;
    }
    return result;
  } catch (err) {
    console.warn('Greška pri povezivanju spora sa ZUP predmetima:', err);
    return null;
  }
}

/**
 * Obogaćuje popis upravnih sporova podacima o već donesenim drugostupanjskim rješenjima iz Supabase tablice `predmeti`.
 * Za aktivne neodgovorene tužbe zbog šutnje uprave kod kojih je u međuvremenu doneseno II. rješenje,
 * automatski upisuje tu činjenicu u bilješke (`vrijednostNapomena`) te označava potrebu izrade odgovora na tužbu.
 */
export async function enrichSporoviWithZupRjesenja(sporovi: UpravniSpor[]): Promise<UpravniSpor[]> {
  if (!sporovi || sporovi.length === 0) return sporovi;

  // Zanimaju nas aktivni (neuklonjeni, nepresuđeni) sporovi
  const candidateIndices: number[] = [];
  for (let i = 0; i < sporovi.length; i++) {
    const s = sporovi[i];
    if (!s.isDismissed && !s.isPresudeno) {
      candidateIndices.push(i);
    }
  }
  if (candidateIndices.length === 0) return sporovi;

  try {
    const db = dbServer || dbClient;
    if (!db) return sporovi;

    const { data: predmetiRows, error } = await db
      .from('predmeti')
      .select('id, klasa, urbroj, stranka, datum_zaprimanja, status, dokumenti(id, tip_dokumenta, storage_url)')
      .order('datum_zaprimanja', { ascending: false });

    if (error || !predmetiRows || predmetiRows.length === 0) return sporovi;

    const predmeti = predmetiRows as RawPredmetRow[];
    const predmetById = new Map<string, RawPredmetRow>(predmeti.map((p) => [p.id, p]));

    // Prvi prolaz: brzo povezivanje po UP/II klasi ili punom imenu stranke (bez čitanja raw_text)
    const tentativeCandidates = new Map<
      number,
      {
        predmeti: RawPredmetRow[];
        matchRazlog: PovezanoDrugostupanjskoRjesenje['matchRazlog'];
        sporUpIKlase: string[];
      }
    >();
    const unmatchedWithSignals: Array<{ idx: number; upIKlase: string[]; oib?: string }> = [];

    for (const idx of candidateIndices) {
      const s = sporovi[idx];
      const combinedText = `${s.upIiRjesenje || ''} ${s.vrijednostNapomena || ''}`;
      const upIiKlase = extractUpIiKlase(combinedText);
      const upIKlase = extractUpIKlase(combinedText);
      const oib = s.oib || extractOib(s.tuzitelj);

      let matchedList: RawPredmetRow[] = [];
      let razlog: PovezanoDrugostupanjskoRjesenje['matchRazlog'] = 'stranka';

      if (upIiKlase.length > 0) {
        for (const k of upIiKlase) {
          const found = predmeti.find((p) => (p.klasa || '').toUpperCase().includes(k));
          if (found) {
            matchedList = [found];
            razlog = 'klasa_up_ii';
            break;
          }
        }
      }

      if (matchedList.length === 0 && s.tuzitelj) {
        const nameMatches = predmeti.filter((p) => isStrongNameMatch(s.tuzitelj, p.stranka));
        if (nameMatches.length > 0) {
          matchedList = nameMatches;
          razlog = 'stranka';
        }
      }

      if (matchedList.length > 0) {
        tentativeCandidates.set(idx, { predmeti: matchedList, matchRazlog: razlog, sporUpIKlase: upIKlase });
      } else if (upIKlase.length > 0 || oib) {
        unmatchedWithSignals.push({ idx, upIKlase, oib });
      }
    }

    // Drugi prolaz (samo ako postoje neupareni aktivni sporovi koji imaju UP/I klasu ili OIB)
    if (unmatchedWithSignals.length > 0) {
      const resolvedPredmetIds = predmeti
        .filter((p) => {
          const metaDoc = (p.dokumenti || []).find((d) => d.tip_dokumenta === META_DOC_TYPE);
          const meta = metaDoc ? decodePredmetMetaUrl(metaDoc.storage_url) : {};
          return p.status === 'arhiviran' || Boolean(meta.datum_rjesavanja) || Boolean(meta.ishod);
        })
        .map((p) => p.id);

      if (resolvedPredmetIds.length > 0) {
        const { data: resolvedDocs } = await db
          .from('dokumenti')
          .select('predmet_id, tip_dokumenta, storage_url, raw_text')
          .in('predmet_id', resolvedPredmetIds)
          .neq('tip_dokumenta', CHAT_DOC_TYPE)
          .neq('tip_dokumenta', META_DOC_TYPE)
          .neq('tip_dokumenta', SLUZBENICI_DOC_TYPE);

        const docsByPredmet = new Map<string, RawDokumentTextRow[]>();
        for (const d of (resolvedDocs || []) as RawDokumentTextRow[]) {
          const arr = docsByPredmet.get(d.predmet_id) || [];
          arr.push(d);
          docsByPredmet.set(d.predmet_id, arr);
        }

        for (const item of unmatchedWithSignals) {
          for (const pid of resolvedPredmetIds) {
            const pDocs = docsByPredmet.get(pid) || [];
            const det = extractRjesenjeDetailsFromDocs(pDocs);

            if (item.upIKlase.some((k) => det.prvostupanjskeKlase.includes(k))) {
              const p = predmetById.get(pid);
              if (p) {
                tentativeCandidates.set(item.idx, {
                  predmeti: [p],
                  matchRazlog: 'klasa_up_i',
                  sporUpIKlase: item.upIKlase,
                });
                break;
              }
            }

            if (item.oib && det.oibs.includes(item.oib)) {
              const p = predmetById.get(pid);
              if (p) {
                tentativeCandidates.set(item.idx, {
                  predmeti: [p],
                  matchRazlog: 'oib',
                  sporUpIKlase: item.upIKlase,
                });
                break;
              }
            }
          }
        }
      }
    }

    if (tentativeCandidates.size === 0) return sporovi;

    // Dohvati dokumente za sve uparene predmete u jednom upitu (bez __CHAT__ i __META__)
    const matchedPredmetIds = Array.from(
      new Set(
        Array.from(tentativeCandidates.values()).flatMap((m) => m.predmeti.map((p) => p.id))
      )
    );

    const { data: matchedDocsData } = await db
      .from('dokumenti')
      .select('predmet_id, tip_dokumenta, storage_url, raw_text')
      .in('predmet_id', matchedPredmetIds)
      .neq('tip_dokumenta', CHAT_DOC_TYPE)
      .neq('tip_dokumenta', META_DOC_TYPE)
      .neq('tip_dokumenta', SLUZBENICI_DOC_TYPE);

    const docsMap = new Map<string, RawDokumentTextRow[]>();
    for (const d of (matchedDocsData || []) as RawDokumentTextRow[]) {
      const arr = docsMap.get(d.predmet_id) || [];
      arr.push(d);
      docsMap.set(d.predmet_id, arr);
    }

    const updated = [...sporovi];

    for (const [idx, cand] of tentativeCandidates.entries()) {
      const spor = updated[idx];

      // Odaberi najpouzdaniji predmet iz liste kandidata (prioritet: točna UP/I klasa > arhiviran > prvi bez konflikta)
      let chosenPredmet: RawPredmetRow | null = null;
      let chosenRazlog: PovezanoDrugostupanjskoRjesenje['matchRazlog'] = cand.matchRazlog;

      for (const p of cand.predmeti) {
        const pDocs = docsMap.get(p.id) || [];
        const details = extractRjesenjeDetailsFromDocs(pDocs);

        if (cand.sporUpIKlase.length > 0 && details.prvostupanjskeKlase.length > 0) {
          const hasOverlap = cand.sporUpIKlase.some((k) => details.prvostupanjskeKlase.includes(k));
          if (hasOverlap) {
            chosenPredmet = p;
            chosenRazlog = cand.matchRazlog === 'klasa_up_ii' ? 'klasa_up_ii' : 'klasa_up_i';
            break;
          }
          // Konflikt UP/I klase kod podudaranja po imenu/OIB-u — preskoči ovaj predmet
          if (cand.matchRazlog === 'stranka' || cand.matchRazlog === 'oib') {
            continue;
          }
        }

        if (!chosenPredmet || (p.status === 'arhiviran' && chosenPredmet.status !== 'arhiviran')) {
          chosenPredmet = p;
          chosenRazlog = cand.matchRazlog;
        }
      }

      if (!chosenPredmet) continue;

      const pDocs = docsMap.get(chosenPredmet.id) || [];
      const povezano = buildPovezanoFromPredmet(chosenPredmet, pDocs, chosenRazlog);
      delete povezano.rjesenjeTekst;

      // Ako je šutnja uprave u tijeku (bez presude i bez poslanog odgovora) i II. rješenje je već doneseno:
      if (spor.isSutnjaUprave && !spor.isPresudeno && !spor.isOdgovoreno && povezano.doneseno) {
        const enrichedNapomena = mergeAutoNoteIntoNapomena(spor.vrijednostNapomena, povezano);
        const fazaOpis = `Doneseno II. rješenje (${povezano.klasa}) — potrebno izraditi odgovor na tužbu${
          spor.rokDatum ? ` (rok: ${spor.rokDatum})` : ''
        }`;

        updated[idx] = {
          ...spor,
          povezanoRjesenje: povezano,
          vrijednostNapomena: enrichedNapomena,
          fazaOpis,
        };
      } else {
        updated[idx] = {
          ...spor,
          povezanoRjesenje: povezano,
        };
      }
    }

    return updated;
  } catch (err) {
    console.warn('Greška u enrichSporoviWithZupRjesenja:', err);
    return sporovi;
  }
}
