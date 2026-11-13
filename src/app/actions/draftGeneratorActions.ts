'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { supabase as supabaseClient } from '@/lib/supabase';
import { google } from '@/lib/google';
import { generateText } from 'ai';
import {
  searchKnowledge,
  formatZakoni,
  stitchChunks,
  croatianStem,
  getPraksaCatalog,
} from '@/lib/rag';
import { parsePraksaMetadata } from '@/lib/ai-types';
import {
  META_DOC_TYPE,
  CHAT_DOC_TYPE,
  SLUZBENICI_DOC_TYPE,
  decodeDocLabel,
  decodePredmetMetaUrl,
  type PredmetIshod,
} from '@/lib/predmet-meta';
import {
  buildAuthenticAdvisorStructurePrompt,
  detectCompetentAdministrativeCourt,
} from '@/lib/advisor-blueprint';
import { saveDraftToSpis } from '@/app/actions/chatActions';
import { updatePredmetFaza } from '@/app/actions/predmetActions';
import {
  parseFileBufferWithOcrFallback,
  previewAnonymizedForPraksa,
  confirmPublishToPraksa,
} from '@/app/actions/documentActions';
import { normalizeExtractedLegalText, cleanDraftActFormatting } from '@/lib/text-formatter';

const db = supabaseServer || supabaseClient;

export interface RecommendedPracticeItem {
  id: number;
  nazivDatoteke: string;
  kratkiNaziv: string;
  vrsta: 'Sudska presuda' | 'Drugostupanjsko rješenje' | 'Odgovor na tužbu';
  podrucje: string;
  godina: string | null;
  ishod: string;
  sadrzajPreview: string;
  puniSadrzaj?: string;
  similarity?: number;
  matchedKeywords?: string[];
}

export interface ManualReferenceAct {
  id: string;
  title: string;
  content: string;
}

export interface DraftingContextResult {
  predmet: {
    id: string;
    klasa: string;
    stranka: string;
    datum_zaprimanja: string;
    status: string;
    podrucje: string;
    napomena?: string;
    uputa_voditelja?: string;
  } | null;
  docs: Array<{ id: string; tip_dokumenta: string; raw_text: string }>;
  recommendedPractice: RecommendedPracticeItem[];
  extractedKeywords: string[];
  error?: string;
}

/**
 * Pretražuje bazu upravne i sudske prakse po jednoj ili više ključnih riječi
 * koristeći hrvatske korijene riječi (stemming) i bodovanje preklapanja pojmova.
 */
export async function searchPraksaForDraft(
  query: string,
  limit = 15
): Promise<RecommendedPracticeItem[]> {
  if (!query || !query.trim()) return [];

  try {
    const rawTokens = query
      .trim()
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    if (rawTokens.length === 0) return [];

    const tokenInfos = rawTokens.slice(0, 6).map((tok) => ({
      original: tok,
      stem: tok.length >= 4 ? croatianStem(tok) : tok.toLowerCase(),
    }));

    const catalog = await getPraksaCatalog();

    // 1. Pogoci u naslovu odluke (iz memorijskog kataloga svih 1.600 odluka)
    const titleMatchedDocs = new Map<string, { score: number; matched: string[] }>();
    for (const item of catalog) {
      const lowerTitle = item.naziv_datoteke.toLowerCase();
      const matched: string[] = [];
      let score = 0;
      for (const ti of tokenInfos) {
        if (lowerTitle.includes(ti.stem) || lowerTitle.includes(ti.original.toLowerCase())) {
          matched.push(ti.original);
          score += 3.5;
        }
      }
      if (score > 0) {
        titleMatchedDocs.set(item.naziv_datoteke, { score, matched });
      }
    }

    // 2. Paralelna pretraga sadržaja po korijenima svih unesenih ključnih riječi
    const [contentResList, titlePreviewRes] = await Promise.all([
      Promise.all(
        tokenInfos.map((ti) =>
          db
            .from('praksa')
            .select('id, naziv_datoteke, chunk_index, sadrzaj')
            .ilike('sadrzaj', `%${ti.stem}%`)
            .order('id', { ascending: false })
            .limit(75)
            .then((r) => ({ ti, rows: r.data || [] }))
        )
      ),
      titleMatchedDocs.size > 0
        ? db
            .from('praksa')
            .select('id, naziv_datoteke, chunk_index, sadrzaj')
            .in(
              'naziv_datoteke',
              [...titleMatchedDocs.entries()]
                .sort((a, b) => b[1].score - a[1].score)
                .slice(0, 20)
                .map((e) => e[0])
            )
            .eq('chunk_index', 0)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const docAgg = new Map<
      string,
      {
        id: number;
        nazivDatoteke: string;
        score: number;
        matchedSet: Set<string>;
        bestSnippet: string;
      }
    >();

    for (const row of titlePreviewRes.data || []) {
      const tInfo = titleMatchedDocs.get(row.naziv_datoteke);
      docAgg.set(row.naziv_datoteke, {
        id: row.id,
        nazivDatoteke: row.naziv_datoteke,
        score: tInfo?.score || 3.0,
        matchedSet: new Set(tInfo?.matched || []),
        bestSnippet: row.sadrzaj || '',
      });
    }

    for (const { ti, rows } of contentResList) {
      if (rows.length === 0) continue;
      const rarity = rows.length <= 12 ? 2.5 : rows.length <= 35 ? 1.8 : 1.1;
      for (const row of rows) {
        const existing = docAgg.get(row.naziv_datoteke);
        if (!existing) {
          docAgg.set(row.naziv_datoteke, {
            id: row.id,
            nazivDatoteke: row.naziv_datoteke,
            score: rarity,
            matchedSet: new Set([ti.original]),
            bestSnippet: row.sadrzaj || '',
          });
        } else {
          if (!existing.matchedSet.has(ti.original)) {
            existing.matchedSet.add(ti.original);
            existing.score += rarity * 1.6; // snažan bonus za dokumente koji sadrže SVE tražene riječi
            existing.bestSnippet = row.sadrzaj || existing.bestSnippet;
          } else {
            existing.score += 0.15;
          }
        }
      }
    }

    const sorted = Array.from(docAgg.values())
      .sort((a, b) => {
        if (b.matchedSet.size !== a.matchedSet.size) {
          return b.matchedSet.size - a.matchedSet.size;
        }
        return b.score - a.score;
      })
      .slice(0, limit);

    return sorted.map((d) => {
      const meta = parsePraksaMetadata(d.nazivDatoteke, d.bestSnippet);
      const clean = d.bestSnippet.replace(/\s+/g, ' ').trim();
      return {
        id: d.id,
        nazivDatoteke: d.nazivDatoteke,
        kratkiNaziv: meta.kratkiNaziv,
        vrsta: meta.vrsta,
        podrucje: meta.podrucje,
        godina: meta.godina,
        ishod: meta.ishod,
        sadrzajPreview: clean.slice(0, 240) + (clean.length > 240 ? '...' : ''),
        matchedKeywords: Array.from(d.matchedSet),
      };
    });
  } catch (err) {
    console.error('searchPraksaForDraft error:', err);
    return [];
  }
}

/**
 * Dohvaća puni rekonstruirani tekst odluke iz tablice `praksa` spajanjem svih njenih chunkova.
 */
async function getFullStitchedPracticeText(nazivDatoteke: string): Promise<string> {
  try {
    const { data } = await db
      .from('praksa')
      .select('chunk_index, sadrzaj')
      .eq('naziv_datoteke', nazivDatoteke)
      .order('chunk_index', { ascending: true });

    if (!data || data.length === 0) return '';
    const chunks = data.map((d: any) => d.sadrzaj || '');
    return stitchChunks(chunks);
  } catch (e) {
    console.error('getFullStitchedPracticeText error:', e);
    return '';
  }
}

/**
 * Dohvaća kontekst predmeta, učitane dokumente, izvlači ključne riječi iz spisa i napomene
 * te pronalazi najsličnija rješenja iz baze prakse.
 */
export async function getDraftingContext(
  predmetId: string,
  opts?: {
    customKeywords?: string[];
    preferredIshod?: NacrtIshodTip;
  }
): Promise<DraftingContextResult> {
  if (!predmetId) {
    return {
      predmet: null,
      docs: [],
      recommendedPractice: [],
      extractedKeywords: [],
      error: 'ID predmeta je obavezan.',
    };
  }

  try {
    const [{ data: rawPredmet, error: pError }, { data: rawDocs }] = await Promise.all([
      db.from('predmeti').select('*').eq('id', predmetId).maybeSingle(),
      db
        .from('dokumenti')
        .select('id, tip_dokumenta, storage_url, raw_text')
        .eq('predmet_id', predmetId),
    ]);

    if (pError || !rawPredmet) {
      return {
        predmet: null,
        docs: [],
        recommendedPractice: [],
        extractedKeywords: [],
        error: 'Predmet nije pronađen u bazi.',
      };
    }

    const metaDoc = (rawDocs || []).find((d: any) => d.tip_dokumenta === META_DOC_TYPE);
    const meta = metaDoc ? decodePredmetMetaUrl(metaDoc.storage_url) : {};
    const casePodrucje = meta.podrucje || 'NUV';
    const combinedNotes = [meta.napomena, meta.uputa_voditelja].filter(Boolean).join(' | ');

    const docs = (rawDocs || []).filter(
      (d: any) =>
        d.tip_dokumenta !== META_DOC_TYPE &&
        d.tip_dokumenta !== CHAT_DOC_TYPE &&
        d.tip_dokumenta !== SLUZBENICI_DOC_TYPE &&
        d.raw_text &&
        d.raw_text.trim().length > 0
    );

    const zalbaDoc = docs.find((d: any) => {
      const docMeta = decodeDocLabel(d.tip_dokumenta);
      const v = (docMeta.vrsta || '').toLowerCase();
      if (v.includes('košulj')) return false;
      const n = (docMeta.izvorniNaziv || '').toLowerCase();
      const raw = (d.tip_dokumenta || '').toLowerCase();
      return v.includes('žalb') || n.includes('žalb') || raw.includes('žalb');
    });

    const zalbaText = zalbaDoc?.raw_text || '';
    const combinedSpisText = docs
      .map((d: any) => `[${d.tip_dokumenta}]\n${(d.raw_text || '').slice(0, 3500)}`)
      .join('\n\n')
      .slice(0, 10000);

    const mappedIshod: 'Odbijena žalba' | 'Poništeno rješenje' | undefined =
      opts?.preferredIshod === 'ponistavanje_vracanje' || opts?.preferredIshod === 'usvajanje_izmjena'
        ? 'Poništeno rješenje'
        : opts?.preferredIshod === 'odbijanje' ||
          opts?.preferredIshod === 'odbacivanje_nepravodobna' ||
          opts?.preferredIshod === 'odbacivanje_nedopustena'
        ? 'Odbijena žalba'
        : undefined;

    const queryParts = [
      opts?.customKeywords?.length ? opts.customKeywords.join(' ') : '',
      combinedNotes,
      zalbaText ? zalbaText.slice(0, 1500) : combinedSpisText.slice(0, 1500),
      rawPredmet.stranka || '',
    ]
      .filter(Boolean)
      .join('\n');

    const queryForPractice =
      queryParts.trim().length > 10
        ? queryParts
        : `Upravni postupak rješavanje žalbe ${casePodrucje} ${rawPredmet.klasa || ''}`;

    const { praksa, extractedKeywords } = await searchKnowledge(queryForPractice, {
      filterScope: 'sve',
      zakoniCount: 0, // Zakone dohvaćamo kod samog generiranja nacrta radi maksimalne brzine otvaranja modala
      praksaCount: 10,
      extraTextForRefs: combinedSpisText,
      explicitKeywords: opts?.customKeywords,
      napomena: combinedNotes,
      casePodrucje,
      zalbaText,
      preferredIshod: mappedIshod,
      preferAdvisorDecisions: true,
    });

    const recommendedPractice: RecommendedPracticeItem[] = (praksa || []).map((p) => {
      const cleanSnippet = (p.sadrzaj || '').replace(/\s+/g, ' ').trim();
      return {
        id: p.id,
        nazivDatoteke: p.naziv_datoteke,
        kratkiNaziv: p.kratkiNaziv,
        vrsta: p.vrsta,
        podrucje: p.podrucje,
        godina: p.godina,
        ishod: p.ishod,
        sadrzajPreview: cleanSnippet.slice(0, 240) + (cleanSnippet.length > 240 ? '...' : ''),
        similarity: p.similarity,
        matchedKeywords: p.matchedKeywords,
      };
    });

    return {
      predmet: {
        id: rawPredmet.id,
        klasa: rawPredmet.klasa || '',
        stranka: rawPredmet.stranka || '',
        datum_zaprimanja: rawPredmet.datum_zaprimanja || '',
        status: rawPredmet.status || 'aktivan',
        podrucje: casePodrucje,
        napomena: meta.napomena,
        uputa_voditelja: meta.uputa_voditelja,
      },
      docs,
      recommendedPractice,
      extractedKeywords,
    };
  } catch (err: any) {
    console.error('getDraftingContext Error:', err);
    return {
      predmet: null,
      docs: [],
      recommendedPractice: [],
      extractedKeywords: [],
      error: err.message || 'Greška pri pripremi podataka za nacrt.',
    };
  }
}

export type NacrtIshodTip =
  | 'odbijanje'
  | 'ponistavanje_vracanje'
  | 'odbacivanje_nepravodobna'
  | 'odbacivanje_nedopustena'
  | 'usvajanje_izmjena';

export interface GenerateDraftPayload {
  predmetId: string;
  ishod: NacrtIshodTip;
  selectedPracticeNames: string[]; // točni nazivi odabranih odluka iz baze
  manualReferenceActs?: ManualReferenceAct[]; // ručno uneseni/zalijepljeni ogledni akti
  customKeywords?: string[];
  uputeSavjetnika?: string;
  modelPreference?: 'flash' | 'pro';
  citirajCijeluZalbu?: boolean; // po defaultu true: doslovno citira cjelokupnu žalbu u navodnim znakovima
}

const ISHOD_OPIS: Record<NacrtIshodTip, { naslov: string; zupClanak: string; uputaZaAi: string }> = {
  odbijanje: {
    naslov: 'Odbijanje žalbe (čl. 116. st. 1. t. 1. ZUP-a)',
    zupClanak: 'članak 116. stavak 1. točka 1. ZUP-a',
    uputaZaAi:
      'Žalba se ODBIJA kao neosnovana. Prvostupanjsko rješenje Hrvatskih voda je zakonito i pravilno doneseno, a žalbeni navodi su neutemeljeni i ne dovode u sumnju pravilnost utvrđenog činjeničnog stanja niti zakonitost obračuna.',
  },
  ponistavanje_vracanje: {
    naslov: 'Poništavanje rješenja i vraćanje na ponovni postupak (čl. 117. st. 1. t. 1. i st. 2. ZUP-a)',
    zupClanak: 'članak 117. stavak 1. točka 1. i stavak 2. ZUP-a',
    uputaZaAi:
      'Pobijano rješenje Hrvatskih voda se PONIŠTAVA (točka 1. izreke) i predmet se VRAĆA prvostupanjskom tijelu na ponovni postupak (točka 2. izreke). Obrazloži u čemu je prvostupanjsko tijelo pogriješilo (nepotpuno utvrđeno činjenično stanje po čl. 8. i čl. 49. ZUP-a, povreda prava stranke na izjašnjenje po čl. 51. ZUP-a ili pogrešna primjena materijalnog propisa) i daj jasnu uputu što Hrvatske vode u ponovnom ispitnom postupku moraju utvrditi.',
  },
  odbacivanje_nepravodobna: {
    naslov: 'Odbacivanje žalbe kao nepravodobne (čl. 114. st. 1. ZUP-a)',
    zupClanak: 'članak 114. stavak 1. ZUP-a',
    uputaZaAi:
      'Žalba se ODBACUJE kao nepravodobna jer je izjavljena nakon proteka zakonskog roka od 15 dana od dana dostave rješenja. Precizno navedi datum dostave (prema dostavnici/povratnici), zadnji dan zakonskog roka i stvarni datum predaje žalbe pošti/tijelu.',
  },
  odbacivanje_nedopustena: {
    naslov: 'Odbacivanje žalbe kao nedopuštene / izjavljene od neovlaštene osobe (čl. 114. st. 1. ZUP-a)',
    zupClanak: 'članak 114. stavak 1. ZUP-a',
    uputaZaAi:
      'Žalba se ODBACUJE kao nedopuštena ili izjavljena od neovlaštene osobe (čl. 114. ZUP-a). Obrazloži nedostatak pravnog interesa ili nedostatak valjane punomoći.',
  },
  usvajanje_izmjena: {
    naslov: 'Usvajanje žalbe i izmjena rješenja (čl. 117. st. 1. ZUP-a)',
    zupClanak: 'članak 117. stavak 1. ZUP-a',
    uputaZaAi:
      'Žalba se UVAŽAVA i pobijano rješenje se MIJENJA u pobijanom dijelu (npr. ispravak obračunate površine ili koeficijenta) na temelju nespornih isprava u spisu, bez potrebe vraćanja na ponovni postupak.',
  },
};

/**
 * Generira tekst drugostupanjskog akta koji STROGO SLIJEDI LOGIKU, STRUKTURU I FRAZEOLOGIJU
 * prethodnih pravomoćnih rješenja ovog sektorskog savjetnika iz baze ili ručno ubačenih oglednih akata.
 */
export async function generateLegalDraft(payload: GenerateDraftPayload): Promise<{
  success: boolean;
  draftText?: string;
  citedPracticeTitles?: string[];
  error?: string;
}> {
  const {
    predmetId,
    ishod,
    selectedPracticeNames = [],
    manualReferenceActs = [],
    customKeywords = [],
    uputeSavjetnika = '',
    modelPreference = 'flash',
    citirajCijeluZalbu = true,
  } = payload;

  if (!predmetId) return { success: false, error: 'ID predmeta je obavezan.' };

  try {
    const { predmet, docs, recommendedPractice, error } = await getDraftingContext(predmetId, {
      customKeywords,
      preferredIshod: ishod,
    });
    if (error || !predmet) {
      return { success: false, error: error || 'Predmet nije pronađen.' };
    }

    // Pronađi dokument žalbe u spisu
    const zalbaDoc = docs.find((d) => {
      const meta = decodeDocLabel(d.tip_dokumenta);
      const v = (meta.vrsta || '').toLowerCase();
      if (v.includes('košulj')) return false;
      const n = (meta.izvorniNaziv || '').toLowerCase();
      const raw = (d.tip_dokumenta || '').toLowerCase();
      return v.includes('žalb') || n.includes('žalb') || raw.includes('žalb');
    });

    const rawTekstZalbe = zalbaDoc?.raw_text?.trim() || '';
    const puniTekstZalbe = normalizeExtractedLegalText(rawTekstZalbe);

    // Ako korisnik nije ručno označio nijedan uzorak, automatski uzmi 2 najsličnija rješenja savjetnika iz baze!
    let practiceNamesToUse = [...selectedPracticeNames];
    if (practiceNamesToUse.length === 0 && manualReferenceActs.length === 0 && recommendedPractice.length > 0) {
      const topAdvisor = recommendedPractice
        .filter((r) => r.vrsta === 'Drugostupanjsko rješenje')
        .slice(0, 2)
        .map((r) => r.nazivDatoteke);
      const topSudska = recommendedPractice
        .filter((r) => r.vrsta === 'Sudska presuda')
        .slice(0, 1)
        .map((r) => r.nazivDatoteke);
      practiceNamesToUse = [...topAdvisor, ...topSudska];
    }

    // Dohvati puni tekst odabranih odluka iz baze
    const stitchedPractices: Array<{ title: string; fullText: string }> = [];
    for (const name of practiceNamesToUse.slice(0, 3)) {
      const fullText = await getFullStitchedPracticeText(name);
      if (fullText) {
        stitchedPractices.push({ title: name, fullText });
      }
    }

    const ostaliDokumenti = zalbaDoc ? docs.filter((d) => d.id !== zalbaDoc.id) : docs;
    const spisSummary = ostaliDokumenti
      .map((d) => `[${d.tip_dokumenta}]:\n${normalizeExtractedLegalText(d.raw_text || '').slice(0, 7000)}`)
      .join('\n\n')
      .slice(0, 18000);

    const ishodConfig = ISHOD_OPIS[ishod] || ISHOD_OPIS.odbijanje;
    const combinedNotes = [predmet.napomena, predmet.uputa_voditelja, uputeSavjetnika]
      .filter(Boolean)
      .join('\n');

    // Dohvati mjerodavne članke zakona (uključujući članke citirane u spisu i u odabranim oglednim rješenjima!)
    const extraRefsCorpus = [
      puniTekstZalbe,
      spisSummary,
      ...stitchedPractices.map((p) => p.fullText.slice(0, 4000)),
    ].join('\n');

    const { zakoni } = await searchKnowledge(
      `${ishodConfig.zupClanak} ${combinedNotes} ${predmet.stranka} ${(puniTekstZalbe || spisSummary).slice(0, 600)}`,
      {
        filterScope: 'sve',
        zakoniCount: 10,
        praksaCount: 0,
        extraTextForRefs: extraRefsCorpus,
        explicitKeywords: customKeywords,
        napomena: combinedNotes,
        casePodrucje: predmet.podrucje,
      }
    );

    const zakoniTekst = formatZakoni(zakoni);

    // Prepoznaj mjesno nadležni Upravni sud prema adresi u spisu
    const nadlezniSudHint = detectCompetentAdministrativeCourt(
      `${predmet.stranka}\n${puniTekstZalbe.slice(0, 1200)}\n${spisSummary.slice(0, 1500)}`
    );

    let referenceBlueprints = '';
    if (stitchedPractices.length > 0) {
      referenceBlueprints += stitchedPractices
        .map(
          (p, idx) =>
            `=== OGLEDNA ODLUKA IZ BAZE PRAKSE #${idx + 1}: ${p.title} ===\n${p.fullText.slice(
              0,
              8000
            )}\n`
        )
        .join('\n\n');
    }

    if (manualReferenceActs.length > 0) {
      referenceBlueprints +=
        '\n\n' +
        manualReferenceActs
          .map(
            (act, idx) =>
              `=== RUČNO DODANI OGLEDNI AKT #${idx + 1}: ${act.title} ===\n${act.content.slice(
                0,
                8000
              )}\n`
          )
          .join('\n\n');
    }

    const chosenModelName =
      modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

    const authenticBlueprintBlock = buildAuthenticAdvisorStructurePrompt({
      citirajCijeluZalbu,
      nadlezniSudHint,
      podrucje: predmet.podrucje,
    });

    const systemPrompt = `Ti si viši upravni savjetnik / sektorski savjetnik u drugostupanjskom tijelu (Ministarstvo zaštite okoliša i zelene tranzicije) u Republici Hrvatskoj.
Tvoj zadatak je sastaviti NOVO DRUGOSTUPANJSKO RJEŠENJE povodom žalbe.

IZUZETNO VAŽNO PRAVILO:
Tvoj stil pisanja, struktura rečenica, pravna logika, prijelazi između odlomaka i argumentacija MORAJU DOSLJEDNO PRATITI AUTENTIČNU VIŠEGODIŠNJU STRUKTURU OVOG SAVJETNIKA I PRILOŽENE OGLEDNE ODLUKE IZ BAZE PRAKSE!

FORMAT I IZGLED:
- Korisnikov uredski sustav sam generira zaglavlje/memorandum na vrhu, pa započni s uvodnim odlomkom ("Ministarstvo zaštite okoliša i zelene tranzicije..."), zatim "R J E Š E N J E", zatim "O b r a z l o ž e n j e", zatim "UPUTA O PRAVNOM LIJEKU:", potpis i "DOSTAVITI:".
- Piši kao ČISTI TEKST sa standardnim odlomcima — BEZ Markdown zvjezdica (**) i BEZ oznaka naslova (###).
- KRITIČNO PRAVILO ZA FORMATIRANJE CITIRANE ŽALBE:
  Citirani tekst žalbe u obrazloženju MORA TEĆI U NORMALNIM, POVEZANIM ODLOMCIMA I REČENICAMA! Nikada ne stavljaj svaku pojedinu riječ u zaseban redak.

${authenticBlueprintBlock}`;

    const userPrompt = `PODACI O NOVOM PREDMETU:
Stranka: ${predmet.stranka}
KLASA drugostupanjskog spisa: ${predmet.klasa}
Upravno područje: ${predmet.podrucje}
${predmet.napomena ? `Napomena o predmetu: ${predmet.napomena}` : ''}
${predmet.uputa_voditelja ? `Uputa voditelja: ${predmet.uputa_voditelja}` : ''}

TRAŽENI ISHOD ODLUKE:
${ishodConfig.naslov}
Uputa za odluku: ${ishodConfig.uputaZaAi}

${uputeSavjetnika ? `DODATNE UPUTE SAVJETNIKA ZA OVAJ NACRT:\n${uputeSavjetnika}\n` : ''}

${
  puniTekstZalbe
    ? `=== DOKUMENT IZJAVLJENE ŽALBE (IZVORNI TEKST ZA CITIRANJE) ===\n${puniTekstZalbe}\n=============================================================\n`
    : ''
}
OSTALI DOKUMENTI IZ SPISA (Rješenje Hrvatskih voda I. stupnja, popratni dopis, dostavnica, kompletni spis):
${spisSummary || 'Nema ostalih učitanih dokumenata spisa.'}

MJERODAVNI ČLANCI ZAKONA I UREDBI IZ BAZE:
${zakoniTekst}

OGLEDNA RJEŠENJA I PRAKSA OVOG SAVJETNIKA IZ BAZE PRAKSE (KORISTI KAO IZRAVNI UZOR ZA STRUKTURU, LOGIKU I PRAVNU ARGUMENTACIJU):
${referenceBlueprints || 'Primijeni gornju autentičnu višegodišnju strukturu savjetnika.'}

Sastavi cjeloviti tekst novog drugostupanjskog rješenja u točnoj autentičnoj strukturi ovog savjetnika.`;

    const { text } = await generateText({
      model: google(chosenModelName),
      system: systemPrompt,
      prompt: userPrompt,
    });

    const cleanDraft = cleanDraftActFormatting(
      (text || '')
        .replace(/^```[a-z]*\s*/i, '')
        .replace(/```$/i, '')
        .trim()
    );

    const citedTitles = [
      ...stitchedPractices.map((p) => p.title),
      ...manualReferenceActs.map((a) => a.title),
    ];

    return {
      success: true,
      draftText: cleanDraft,
      citedPracticeTitles: citedTitles,
    };
  } catch (err: any) {
    console.error('generateLegalDraft Error:', err);
    return { success: false, error: err.message || 'Greška pri generiranju nacrta akta.' };
  }
}

/**
 * Brza dorada generiranog nacrta (npr. skraćivanje, pojačavanje argumenata, dopuna prakse).
 */
export async function refineLegalDraft(params: {
  currentText: string;
  instruction: string;
  modelPreference?: 'flash' | 'pro';
}): Promise<{ success: boolean; refinedText?: string; error?: string }> {
  const { currentText, instruction, modelPreference = 'flash' } = params;

  if (!currentText.trim() || !instruction.trim()) {
    return { success: false, error: 'Nedostaje postojeći tekst ili uputa za doradu.' };
  }

  try {
    const chosenModelName =
      modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

    const { text } = await generateText({
      model: google(chosenModelName),
      system: `Ti si viši upravni savjetnik za vode i drugostupanjski postupak.
Prilagodi i doradi priloženi tekst drugostupanjskog akta prema točnoj uputi korisnika.
Zadrži autentični stil savjetnika (Uvod, Izreka, Obrazloženje, Uputa o pravnom lijeku) kao čisti tekst bez zvjezdica, oznaka i memoranduma. Vrati isključivo dorađeni tekst.`,
      prompt: `POSTOJEĆI TEKST AKTA:\n${currentText}\n\nUPUTA ZA DORADU:\n${instruction}\n\nDorađeni tekst:`,
    });

    const clean = (text || '')
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    return { success: true, refinedText: clean };
  } catch (err: any) {
    console.error('refineLegalDraft Error:', err);
    return { success: false, error: err.message || 'Greška pri doradi nacrta.' };
  }
}

/**
 * Sprema generirani nacrt akta izravno u dokumente spisa predmeta i automatski
 * ažurira radnu fazu predmeta u "Na potpisu".
 */
export async function saveDraftActToCase(params: {
  predmetId: string;
  draftText: string;
  docTitle?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { predmetId, draftText, docTitle } = params;
  if (!predmetId || !draftText.trim()) {
    return { success: false, error: 'Nedostaje ID predmeta ili tekst nacrta.' };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const title = docTitle || `Nacrt_rjesenja_${today}.txt`;

    const saveRes = await saveDraftToSpis({
      predmetId,
      docRole: 'Drugostupanjsko rješenje',
      naziv: title,
      text: draftText,
    });

    if (saveRes.error) {
      return { success: false, error: saveRes.error };
    }

    // Automatski prebaci radnu fazu predmeta u "Na potpisu"
    await updatePredmetFaza(predmetId, 'Na potpisu');

    return { success: true };
  } catch (err: any) {
    console.error('saveDraftActToCase Error:', err);
    return { success: false, error: err.message || 'Greška pri spremanju nacrta.' };
  }
}

/**
 * Učitava i parsira priloženu oglednu datoteku (PDF, Word DOCX/DOC, TXT ili skeniranu sliku)
 * te vraća ekstrahirani tekst spreman za korištenje kao predložak/uzorak za izradu nacrta.
 * Podržava i automatski OCR za skenirane dokumente preko postojećeg sustava.
 */
export async function parseReferenceDocumentFile(formData: FormData): Promise<{
  success: boolean;
  title?: string;
  text?: string;
  charCount?: number;
  izvorTeksta?: string;
  error?: string;
}> {
  try {
    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'Datoteka nije priložena.' };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { rawText, izvorTeksta } = await parseFileBufferWithOcrFallback(
      buffer,
      file.name,
      file.type,
      false
    );

    const trimmed = normalizeExtractedLegalText(rawText || '').trim();
    if (!trimmed) {
      return {
        success: false,
        error: 'Datoteka ne sadrži čitljiv tekst ili dokument nije prepoznat.',
      };
    }

    // Čišćenje naziva datoteke u pregledan naslov
    const cleanTitle = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[_\\-]+/g, ' ')
      .trim();

    return {
      success: true,
      title: cleanTitle || file.name,
      text: trimmed,
      charCount: trimmed.length,
      izvorTeksta,
    };
  } catch (err: any) {
    console.error('parseReferenceDocumentFile Error:', err);
    return {
      success: false,
      error: err?.message || 'Greška pri čitanju datoteke.',
    };
  }
}

/**
 * AI Pravna revizija završenog rješenja:
 * Uspoređuje dostavljeni tekst akta sa žalbom i prvostupanjskim rješenjem iz spisa.
 */
export async function runLegalReviewAction(payload: {
  predmetId: string;
  actText: string;
  modelPreference?: 'flash' | 'pro';
}): Promise<{
  success: boolean;
  reviewText?: string;
  error?: string;
}> {
  const { predmetId, actText, modelPreference = 'pro' } = payload;
  if (!predmetId) return { success: false, error: 'ID predmeta je obavezan.' };
  if (!actText || actText.trim().length < 30) {
    return { success: false, error: 'Molimo unesite ili učitajte tekst rješenja za pregled.' };
  }

  try {
    const { predmet, docs, error } = await getDraftingContext(predmetId);
    if (error || !predmet) {
      return { success: false, error: error || 'Predmet nije pronađen.' };
    }

    // Pronađi dokument žalbe u spisu
    const zalbaDoc = docs.find((d) => {
      const meta = decodeDocLabel(d.tip_dokumenta);
      const v = (meta.vrsta || '').toLowerCase();
      if (v.includes('košulj')) return false;
      const n = (meta.izvorniNaziv || '').toLowerCase();
      const raw = (d.tip_dokumenta || '').toLowerCase();
      return v.includes('žalb') || n.includes('žalb') || raw.includes('žalb');
    });

    const tekstZalbe = zalbaDoc?.raw_text ? normalizeExtractedLegalText(zalbaDoc.raw_text) : '';
    const prvostupanjskoDoc = docs.find((d) => {
      const meta = decodeDocLabel(d.tip_dokumenta);
      return (
        meta.vrsta.toLowerCase().includes('prvostup') ||
        meta.vrsta.toLowerCase().includes('rješenj')
      );
    });
    const tekstPrvostupanjskog = prvostupanjskoDoc?.raw_text
      ? normalizeExtractedLegalText(prvostupanjskoDoc.raw_text).slice(0, 10000)
      : '';

    const modelName =
      modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

    const systemPrompt = `Ti si vrhunski viši upravni savjetnik u drugostupanjskom upravnom postupku u Ministarstvu (Republika Hrvatska).
Tvoj zadatak je provesti detaljnu, objektivnu i strogu pravnu reviziju (kontrolu kvalitete) ZAVRŠENOG NACRTA RJEŠENJA kojeg je savjetnik pripremio.

Nacrt rješenja moraš detaljno usporediti sa ŽALBOM žalitelja i spisom predmeta.

Struktura tvog odgovora MORA biti točno ovakva:

### 1. ODGOVOR NA SVE ŽALBENE NAVODE
- Navedi taksativno svaki bitan žalbeni navod iz žalbe.
- Za svaki navod označi: [OBRAĐENO] ili [PROPUŠTENO / NEDOREČENO].
- UPOZORENJE: Ako ijedan bitan prigovor žalitelja nije jasno i argumentirano otklonjen u obrazloženju, naglasi to kao kritičan propust koji može dovesti do usvajanja tužbe pred Visokim upravnim sudom (povreda prava na obrazloženu odluku).

### 2. ZAKONITOST I MATERIJALNO PRAVO
- Jesu li pravilno pozvani članci Zakona o općem upravnom postupku (čl. 116. za odbijanje, čl. 117. za poništenje/izmjenu, čl. 114. za odbacivanje)?
- Jesu li pravilno primijenjeni materijalni propisi (Zakon o vodama, Zakon o financiranju vodnoga gospodarstva, odgovarajući Pravilnik)?
- Postoje li pitanja zastare (OPZ), nadležnosti ili postupovnih rokova?

### 3. USKLAĐENOST IZREKE I OBRAZLOŽENJA
- Je li izreka (dispozitiv) jasna, nedvosmislena i pravno izvršiva?
- Podudara li se ishod u izreci u potpunosti s razlozima iznesenim u obrazloženju?
- Je li uputa o pravnom lijeku točna (upravni spor tužbom nadležnom upravnom sudu u roku od 30 dana)?

### 4. ZAVRŠNA OCJENA I PREPORUKA
- 🟢 **SPREMNO ZA POTPIS** (ako je rješenje u potpunosti zakonito, potpuno i argumentirano) ILI
- 🟡 **POTREBNA DORADA PRIJE POTPISA** (navedi točno koje odlomke, rečenice ili članke treba dopuniti).`;

    const userPrompt = `SPIS PREDMETA:
Klasa: ${predmet.klasa}
Stranka: ${predmet.stranka}
Područje: ${predmet.podrucje}

IZVORNA ŽALBA STRANKE:
„„„
${tekstZalbe || 'Nema posebnog dokumenta žalbe u spisu — provjeri prema ostalim dokumentima.'}
„„„

POBIJANO PRVOSTUPANJSKO RJEŠENJE (IZVADAK):
„„„
${tekstPrvostupanjskog || 'Nema posebnog prvostupanjskog akta u spisu.'}
„„„

========================================
ZAVRŠENI NACRT RJEŠENJA KOJEG JE SAVJETNIK DOSTAVIO NA PREGLED:
========================================
${actText}
========================================

Provedi detaljnu pravnu reviziju ovog nacrta po zadanim točkama.`;

    const { text } = await generateText({
      model: google(modelName),
      system: systemPrompt,
      prompt: userPrompt,
    });

    return {
      success: true,
      reviewText: text,
    };
  } catch (err: any) {
    console.error('runLegalReviewAction Error:', err);
    return {
      success: false,
      error: err.message || 'Greška pri provođenju pravne revizije.',
    };
  }
}

/**
 * Objavljuje pregledani akt izravno u Bazu prakse uz GDPR anonimizaciju.
 */
export async function publishReviewedActToPraksa(payload: {
  predmetId: string;
  actText: string;
  naslov?: string;
  ishod?: PredmetIshod;
}): Promise<{ success: boolean; error?: string; insertedTitle?: string }> {
  const { predmetId, actText, naslov, ishod = 'Odbijena žalba' } = payload;
  if (!actText || actText.trim().length < 60) {
    return { success: false, error: 'Tekst rješenja je prekratak za objavu u praksi.' };
  }

  try {
    const { data: predmet } = await db
      .from('predmeti')
      .select('id, klasa, stranka, datum_zaprimanja, dokumenti(storage_url, tip_dokumenta)')
      .eq('id', predmetId)
      .single();

    const metaDoc = (predmet?.dokumenti || []).find((d: any) => d.tip_dokumenta === META_DOC_TYPE);
    const meta = metaDoc ? decodePredmetMetaUrl(metaDoc.storage_url) : {};
    const podrucje = meta.podrucje || 'NUV';
    const godina = (predmet?.datum_zaprimanja || new Date().toISOString()).split('-')[0];

    // Korak 1: Anonimizacija preko overrideText
    const anonymizeRes = await previewAnonymizedForPraksa({
      predmetId,
      overrideText: actText,
      podrucje,
      ishod,
      godina,
    });

    const proposedTitle =
      naslov ||
      anonymizeRes.proposedTitle ||
      `[${podrucje} - ${godina}] Rješenje - ${ishod.toLowerCase()}`;
    const cleanAnonymizedText = anonymizeRes.anonymizedText || actText;

    // Korak 2: Upis u tablicu praksa
    const pubRes = await confirmPublishToPraksa({
      predmetId,
      nazivDatoteke: proposedTitle,
      anonymizedText: cleanAnonymizedText,
    });

    if (pubRes.error) {
      return { success: false, error: pubRes.error };
    }

    // Označi poslano_u_praksu u metapodacima predmeta
    await updatePredmetFaza(predmetId, meta.faza || 'U radu');

    return {
      success: true,
      insertedTitle: proposedTitle,
    };
  } catch (err: any) {
    console.error('publishReviewedActToPraksa Error:', err);
    return { success: false, error: err.message || 'Greška pri objavi u praksu.' };
  }
}
