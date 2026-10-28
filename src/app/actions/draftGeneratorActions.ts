'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { supabase as supabaseClient } from '@/lib/supabase';
import { google } from '@/lib/google';
import { generateText } from 'ai';
import { searchKnowledge, formatZakoni, stitchChunks } from '@/lib/rag';
import { parsePraksaMetadata } from '@/lib/ai-types';
import {
  META_DOC_TYPE,
  CHAT_DOC_TYPE,
  decodeDocLabel,
  decodePredmetMetaUrl,
  type PredmetIshod,
} from '@/lib/predmet-meta';
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
  vrsta: 'Sudska presuda' | 'Drugostupanjsko rješenje';
  podrucje: string;
  godina: string | null;
  ishod: string;
  sadrzajPreview: string;
  puniSadrzaj?: string;
  similarity?: number;
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
  } | null;
  docs: Array<{ id: string; tip_dokumenta: string; raw_text: string }>;
  recommendedPractice: RecommendedPracticeItem[];
  error?: string;
}

/**
 * Pretražuje bazu sudske i upravne prakse po ključnim riječima (naziv, stranka, klasa, tema).
 * Vraća grupirane odluke (spojene po nazivu dokumenta).
 */
export async function searchPraksaForDraft(
  query: string,
  limit = 12
): Promise<RecommendedPracticeItem[]> {
  if (!query || !query.trim()) return [];

  try {
    const q = query.trim();
    // 1. Pretraži po nazivu datoteke
    const { data: titleMatches, error: tErr } = await db
      .from('praksa')
      .select('id, naziv_datoteke, chunk_index, sadrzaj')
      .ilike('naziv_datoteke', `%${q}%`)
      .order('chunk_index', { ascending: true })
      .limit(limit * 3);

    if (tErr) console.error('searchPraksaForDraft title error:', tErr);

    const mapByName = new Map<string, RecommendedPracticeItem>();

    for (const row of titleMatches || []) {
      if (!mapByName.has(row.naziv_datoteke)) {
        const meta = parsePraksaMetadata(row.naziv_datoteke);
        const clean = (row.sadrzaj || '').replace(/\s+/g, ' ').trim();
        mapByName.set(row.naziv_datoteke, {
          id: row.id,
          nazivDatoteke: row.naziv_datoteke,
          kratkiNaziv: meta.kratkiNaziv,
          vrsta: meta.vrsta,
          podrucje: meta.podrucje,
          godina: meta.godina,
          ishod: meta.ishod,
          sadrzajPreview: clean.slice(0, 220) + (clean.length > 220 ? '...' : ''),
        });
      }
    }

    // 2. Ako imamo malo rezultata, pretraži i po sadržaju
    if (mapByName.size < limit) {
      const { data: contentMatches } = await db
        .from('praksa')
        .select('id, naziv_datoteke, chunk_index, sadrzaj')
        .ilike('sadrzaj', `%${q}%`)
        .order('chunk_index', { ascending: true })
        .limit(limit * 2);

      for (const row of contentMatches || []) {
        if (!mapByName.has(row.naziv_datoteke)) {
          const meta = parsePraksaMetadata(row.naziv_datoteke);
          const clean = (row.sadrzaj || '').replace(/\s+/g, ' ').trim();
          mapByName.set(row.naziv_datoteke, {
            id: row.id,
            nazivDatoteke: row.naziv_datoteke,
            kratkiNaziv: meta.kratkiNaziv,
            vrsta: meta.vrsta,
            podrucje: meta.podrucje,
            godina: meta.godina,
            ishod: meta.ishod,
            sadrzajPreview: clean.slice(0, 220) + (clean.length > 220 ? '...' : ''),
          });
        }
      }
    }

    return Array.from(mapByName.values()).slice(0, limit);
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
 * Dohvaća kontekst predmeta, učitane dokumente i pronalazi analognu praksu iz baze
 * kao pripremu za generiranje nacrta akta.
 */
export async function getDraftingContext(predmetId: string): Promise<DraftingContextResult> {
  if (!predmetId) {
    return { predmet: null, docs: [], recommendedPractice: [], error: 'ID predmeta je obavezan.' };
  }

  try {
    const [{ data: rawPredmet, error: pError }, { data: rawDocs, error: dError }] =
      await Promise.all([
        db.from('predmeti').select('*').eq('id', predmetId).maybeSingle(),
        db.from('dokumenti').select('id, tip_dokumenta, raw_text').eq('predmet_id', predmetId),
      ]);

    if (pError || !rawPredmet) {
      return {
        predmet: null,
        docs: [],
        recommendedPractice: [],
        error: 'Predmet nije pronađen u bazi.',
      };
    }

    const docs = (rawDocs || []).filter(
      (d) =>
        d.tip_dokumenta !== META_DOC_TYPE &&
        d.tip_dokumenta !== CHAT_DOC_TYPE &&
        d.raw_text &&
        d.raw_text.trim().length > 0
    );

    // Semantička RAG pretraga za analognu praksu na temelju teksta iz spisa (žalba, rješenje)
    const combinedSpisText = docs
      .map((d) => `[${d.tip_dokumenta}]\n${(d.raw_text || '').slice(0, 3000)}`)
      .join('\n\n')
      .slice(0, 8000);

    const queryForPractice =
      combinedSpisText.trim().length > 30
        ? `Upravni postupak žalba ${rawPredmet.stranka || ''} ${combinedSpisText.slice(0, 800)}`
        : `Upravni postupak rješavanje žalbe ${rawPredmet.klasa || ''}`;

    const { praksa } = await searchKnowledge(queryForPractice, {
      filterScope: 'sve',
      zakoniCount: 4,
      praksaCount: 8,
      extraTextForRefs: combinedSpisText,
    });

    const recommendedPractice: RecommendedPracticeItem[] = (praksa || []).map((p) => {
      const parsed = parsePraksaMetadata(p.naziv_datoteke);
      const cleanSnippet = (p.sadrzaj || '').replace(/\s+/g, ' ').trim();
      return {
        id: p.id,
        nazivDatoteke: p.naziv_datoteke,
        kratkiNaziv: parsed.kratkiNaziv,
        vrsta: parsed.vrsta,
        podrucje: parsed.podrucje,
        godina: parsed.godina,
        ishod: parsed.ishod,
        sadrzajPreview: cleanSnippet.slice(0, 240) + (cleanSnippet.length > 240 ? '...' : ''),
        similarity: p.similarity,
      };
    });

    return {
      predmet: {
        id: rawPredmet.id,
        klasa: rawPredmet.klasa || '',
        stranka: rawPredmet.stranka || '',
        datum_zaprimanja: rawPredmet.datum_zaprimanja || '',
        status: rawPredmet.status || 'aktivan',
        podrucje: 'NUV',
      },
      docs,
      recommendedPractice,
    };
  } catch (err: any) {
    console.error('getDraftingContext Error:', err);
    return {
      predmet: null,
      docs: [],
      recommendedPractice: [],
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
  uputeSavjetnika?: string;
  modelPreference?: 'flash' | 'pro';
  citirajCijeluZalbu?: boolean; // po defaultu true: doslovno citira cjelokupnu žalbu u navodnim znakovima
}

const ISHOD_OPIS: Record<NacrtIshodTip, { naslov: string; zupClanak: string; uputaZaAi: string }> = {
  odbijanje: {
    naslov: 'Odbijanje žalbe (čl. 116. ZUP-a)',
    zupClanak: 'članak 116. ZUP-a',
    uputaZaAi:
      'Žalba se ODBIJA kao neosnovana. Prvostupanjsko rješenje Hrvatskih voda je zakonito i pravilno doneseno, a žalbeni navodi su neutemeljeni i ne dovode u sumnju pravilnost utvrđenog činjeničnog stanja niti zakonitost obračuna.',
  },
  ponistavanje_vracanje: {
    naslov: 'Poništavanje rješenja i vraćanje na ponovni postupak (čl. 117. st. 2. ZUP-a)',
    zupClanak: 'članak 117. stavak 2. ZUP-a',
    uputaZaAi:
      'Pobijano rješenje Hrvatskih voda se PONIŠTAVA i predmet se VRAĆA na ponovni postupak. Obrazloži u čemu je prvostupanjsko tijelo pogriješilo (nepotpuno utvrđeno činjenično stanje, povreda prava stranke na izjašnjenje ili pogrešna primjena materijalnog propisa) i daj jasne upute što prvostupanjsko tijelo u ponovnom postupku mora utvrditi.',
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
      'Žalba se UVAŽAVA i pobijano rješenje se MJENJA u pobijanom dijelu (npr. ispravak obračunate površine ili koeficijenta) na temelju nespornih isprava u spisu, bez potrebe vraćanja na ponovni postupak.',
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
    uputeSavjetnika = '',
    modelPreference = 'flash',
    citirajCijeluZalbu = true,
  } = payload;

  if (!predmetId) return { success: false, error: 'ID predmeta je obavezan.' };

  try {
    const { predmet, docs, error } = await getDraftingContext(predmetId);
    if (error || !predmet) {
      return { success: false, error: error || 'Predmet nije pronađen.' };
    }

    // Pronađi dokument žalbe u spisu
    const zalbaDoc = docs.find((d) => {
      const meta = decodeDocLabel(d.tip_dokumenta);
      const v = (meta.vrsta || '').toLowerCase();
      const n = (meta.izvorniNaziv || '').toLowerCase();
      const raw = (d.tip_dokumenta || '').toLowerCase();
      return v.includes('žalb') || n.includes('žalb') || raw.includes('žalb');
    });

    // Puni, nerezani i normalizirani tekst žalbe za doslovno citiranje
    const rawTekstZalbe = zalbaDoc?.raw_text?.trim() || '';
    const puniTekstZalbe = normalizeExtractedLegalText(rawTekstZalbe);

    // Dohvati puni tekst odabranih rješenja iz baze
    const stitchedPractices: Array<{ title: string; fullText: string }> = [];
    for (const name of selectedPracticeNames.slice(0, 3)) {
      const fullText = await getFullStitchedPracticeText(name);
      if (fullText) {
        stitchedPractices.push({ title: name, fullText });
      }
    }

    // Spoji ostale dokumente iz spisa predmeta (rješenje prvog stupnja, popratni dopis, itd.)
    const ostaliDokumenti = zalbaDoc ? docs.filter((d) => d.id !== zalbaDoc.id) : docs;
    const spisSummary = ostaliDokumenti
      .map((d) => `[${d.tip_dokumenta}]:\n${normalizeExtractedLegalText(d.raw_text || '').slice(0, 6000)}`)
      .join('\n\n')
      .slice(0, 16000);

    const ishodConfig = ISHOD_OPIS[ishod] || ISHOD_OPIS.odbijanje;

    // Dohvati i mjerodavne članke zakona
    const { zakoni } = await searchKnowledge(
      `${ishodConfig.zupClanak} žalba ${predmet.stranka} ${(puniTekstZalbe || spisSummary).slice(0, 500)}`,
      {
        filterScope: 'sve',
        zakoniCount: 8,
        praksaCount: 1,
        extraTextForRefs: puniTekstZalbe || spisSummary,
      }
    );

    const zakoniTekst = formatZakoni(zakoni);

    // Formiraj blok oglednih akata koji služe kao stilska i pravna špranca
    let referenceBlueprints = '';
    if (stitchedPractices.length > 0) {
      referenceBlueprints += stitchedPractices
        .map(
          (p, idx) =>
            `=== OGLEDNI PRIMJER RJEŠENJA IZ BAZE #${idx + 1}: ${p.title} ===\n${p.fullText.slice(
              0,
              6500
            )}\n`
        )
        .join('\n\n');
    }

    if (manualReferenceActs.length > 0) {
      referenceBlueprints += '\n\n' + manualReferenceActs
        .map(
          (act, idx) =>
            `=== RUČNO DODANI OGLEDNI AKT #${idx + 1}: ${act.title} ===\n${act.content.slice(
              0,
              6500
            )}\n`
        )
        .join('\n\n');
    }

    const chosenModelName =
      modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

    const systemPrompt = `Ti si viši upravni savjetnik u drugostupanjskom tijelu (sektorski savjetnik za vode, naknadu za uređenje voda i vodni doprinos) u Republici Hrvatskoj.
Tvoj zadatak je sastaviti NOVO DRUGOSTUPANJSKO RJEŠENJE povodom žalbe.

IZUZETNO VAŽNO PRAVILO:
Tvoj stil pisanja, struktura rečenica, pravna logika, slijed odlomaka i argumentacija MORAJU DOSLJEDNO PRATITI OGLEDNE PRIMJERE RJEŠENJA OVOG SAVJETNIKA PRILOŽENE U NASTAVKU!
Nemoj izmišljati proizvoljne naslove poput "I. Prikaz pobijanog rješenja" ili "II. Žalbeni navodi", nego koristi točan prirodni tijek odlomaka kakav ovaj savjetnik koristi u svojim pravomoćnim odlukama.

FORMAT I IZGLED:
- KORISNIKOV INTERNI SUSTAV UPRAVLJANJA DOKUMENTIMA VEĆ GENERIRA MEMORANDUM I ADRESE.
- ZATO ZAPOČNI ODMAH S UVODOM (pravna osnova, stranka, pobijani akt), ZATIM IZREKOM (R J E Š E N J E), OBRAZLOŽENJEM (O b r a z l o ž e n j e) I UPUTOM O PRAVNOM LIJEKU.
- PIŠI KAO ČISTI TEKST SA STANDARDNIM ODLOMCIMA. BEZ ZVJEZDICA (**) I BEZ OZNAKA (###) U TIJELU TEKSTA, KAKO BI KORISNIK MOGAO ODMAH KOPIRATI I ZALIJEPITI TEKST U INTERNI SUSTAV.
- KRITIČNO PRAVILO ZA FORMATIRANJE CITIRANE ŽALBE:
  Citirani tekst žalbe u obrazloženju MORA TEĆI U NORMALNIM, POVEZANIM ODLOMCIMA I REČENICAMA!
  NITI SLUČAJNO nemoj stavljati svaku pojedinu riječ u zaseban redak (to je tehnička greška PDF/OCR ekstrakcije)!
  Riječi unutar iste rečenice moraju biti odvojene običnim razmakom u istom retku. Novi red u citatu koristi ISKLJUČIVO na kraju cjelovitog odlomka ili kod novih točaka (npr. I., II., III.).

AUTENTIČNA STRUKTURA I FRAZEOLOGIJA OVOG SAVJETNIKA:

1. UVOD:
"Ministarstvo zaštite okoliša i zelene tranzicije, na temelju članka 70. stavka 2. Zakona o financiranju vodnoga gospodarstva („Narodne novine“, broj: 153/09, 90/11, 56/13, 119/15, 120/16, 127/17, 66/19 i 36/24) [ili članka 116. Zakona o općem upravnom postupku („Narodne novine“, broj 47/09 i 110/21)], povodom žalbe podnositelja [Naziv/Ime stranke, adresa], izjavljene protiv rješenja Hrvatskih voda [KLASA, URBROJ, datum pobijanog rješenja], u upravnoj stvari obračuna [naknade za uređenje voda / vodnog doprinosa], donosi

R J E Š E N J E

[Izreka prema traženom ishodu, npr.: Odbija se žalba podnositelja [Stranka], izjavljena protiv rješenja Hrvatskih voda KLASA: ..., URBROJ: ... od [datum].]"

2. O b r a z l o ž e n j e:
- Odlomak 1: "Rješenjem prvog stupnja identificiranim u izreci ovog rješenja, obvezniku [Stranka], utvrđen je [mjesečni iznos naknade za uređenje voda od X EUR / iznos vodnog doprinosa], za [stambeni/poslovni prostor], površine [X m²] (Tarifni razred X, visina naknade X EUR/m2/mj.), na adresi [Adresa], s obvezom plaćanja utvrđenog iznosa od [datum]."
- Odlomak 2: "Protiv tog rješenja pravodobno je i od ovlaštene osobe izjavljena žalba koja je dopuštena."
- Odlomak 3: ${
  citirajCijeluZalbu
    ? `CITIRANJE ŽALBE (IZRIČITO STALNO PRAVILO OVOG SAVJETNIKA):
  Ovaj savjetnik u svojim rješenjima PO DEFAULTU UVJEK DOSLOVNO CITIRA CJELOKUPNU ŽALBU u navodnim znakovima („...“) bez ikakvih izmjena, prepričavanja ili kraćenja!
  Mora glasiti točno ovako:

  U žalbi žalitelj navodi sljedeće:

  „[Ovdje doslovno, u cijelosti i od riječi do riječi prepisati cjelokupni izvorni tekst žalbe žalitelja iz spisa pod navodnim znakovima, ali u NORMALNIM TEČNIM REČENICAMA I ODLOMCIMA, bez rascjepkanih riječi u zasebnim redovima. Ne sažimati, ne parafrazirati i ne mijenjati tekst žalbe!]“`
    : `"U žalbi žalitelj u bitnome navodi da [detaljno, točno i vjerno prikazati sve žalbene tvrdnje žalitelja iz spisa]. Konačno, žalitelj predlaže usvajanje žalbe i [poništenje pobijanog rješenja / oslobađanje od plaćanja]."`
}
- Odlomak 4: "Prvostupanjsko tijelo je, sukladno pravilima o postupanju po žalbi, dopisom [KLASA, URBROJ, datum ako postoji u spisu] dostavilo spis predmeta s izjavljenom žalbom na rješavanje drugostupanjskom tijelu. U svom mišljenju ocijenilo je žalbu dopuštenom i pravodobnom, ali neosnovanom."
- Odlomak 5: "Ovo drugostupanjsko tijelo ispitalo je zakonitost i ocijenilo svrhovitost pobijanog rješenja u granicama zahtjeva iz žalbe, pazeći po službenoj dužnosti na nadležnost i postojanje razloga za oglašivanje rješenja ništavim, sukladno članku 115. Zakona o općem upravnom postupku („Narodne novine“, broj: 47/09 i 110/21), a nakon detaljnog uvida u cjelokupni spis predmeta utvrđeno je da žalba nije osnovana." [ili je osnovana ako se poništava]
- Odlomci 6+: "Naime, Zakon o financiranju vodnoga gospodarstva, člankom 13. stavkom 1. propisuje da... a člankom 14. stavkom 1. da je obveznik naknade za uređenje voda vlasnik ili drugi zakoniti posjednik nekretnine... Također, Zakon o financiranju vodnoga gospodarstva u članku 17. stavku 1. propisuje da na nekretnine na koje se obračunava i naplaćuje komunalna naknada... obračunava se prema podacima iz očevidnika za obračun komunalne naknade..."
  [Ovdje temeljito i argumentirano pobijaj svaki navod iz citirane žalbe točno onim pravnim stilom koji je prikazan u priloženim oglednim primjercima ovog savjetnika. Poveži stanje spisa s mjerodavnim propisima i stavom Visokog upravnog suda RH].
- Završni odlomak: "Slijedom svega navedenog, kako žalbenim navodima nije dovedena u sumnju zakonitost pobijanog rješenja, to je na temelju članka 116. stavka 1. točke 1. Zakona o općem upravnom postupku, riješeno kao u izreci ovog rješenja."

3. UPUTA O PRAVNOM LIJEKU:
"UPUTA O PRAVNOM LIJEKU: Protiv ovog rješenja ne može se izjaviti žalba, ali se može pokrenuti upravni spor. Upravni spor pokreće se tužbom u roku od 30 dana od dana dostave rješenja. Tužba se podnosi nadležnom Upravnom sudu neposredno u pisanom obliku, usmeno na zapisnik ili se šalje poštom odnosno dostavlja elektronički."`;

    const userPrompt = `PODACI O NOVOM PREDMETU:
Stranka: ${predmet.stranka}
KLASA: ${predmet.klasa}

TRAŽENI ISHOD ODLUKE:
${ishodConfig.naslov}
Uputa za odluku: ${ishodConfig.uputaZaAi}

${uputeSavjetnika ? `DODATNE UPUTE I FOKUS SAVJETNIKA:\n${uputeSavjetnika}\n` : ''}

${
  puniTekstZalbe
    ? `=== DOKUMENT IZJAVLJENE ŽALBE (IZVORNI TEKST ZA CITIRANJE) ===\n${puniTekstZalbe}\n=============================================================\n`
    : ''
}
OSTALI DOKUMENTI IZ NOVOG SPISA (Rješenje Hrvatskih voda I. stupnja, popratni dopis, dostavnica):
${spisSummary || 'Nema ostalih učitanih dokumenata spisa.'}

MJERODAVNI PROPISI IZ BAZE:
${zakoniTekst}

OGLEDNI PRIMJERI RJEŠENJA OVOG SAVJETNIKA IZ BAZE (KORISTI KAO DIREKTNI UZOR ZA LOGIKU, STRUKTURU I ARGUMENTACIJU):
${referenceBlueprints || 'Nema odabranih oglednih rješenja — primijeni gornju autentičnu strukturu savjetnika.'}

Sastavi cjeloviti tekst novog rješenja koji vjerno preslikava gornju autentičnu logiku i stil savjetnika.`;

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

    const modelName = modelPreference === 'pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

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
