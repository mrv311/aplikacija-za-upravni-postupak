import { supabaseServer as supabase } from '@/lib/supabase-server';
import { google } from '@/lib/google';
import { embed } from 'ai';
import {
  type PraksaFilterScope,
  type RagPraksaSource,
  type RagZakonSource,
  type ZakonIzvorTip,
  parsePraksaMetadata,
} from '@/lib/ai-types';

/**
 * VAŽNO:
 *  - `zakoni` koristi `vector(768)` -> `match_zakoni` RPC radi trenutno (~150ms).
 *  - `praksa` ima ~11.000 chunkova s `vector(3072)` (~135 MB TOAST vektora bez HNSW indeksa
 *    jer pgvector ograničava standardni vector indeks na 2000 dimenzija). Poziv `match_praksa`
 *    preko cijele tablice probija PostgREST statement timeout i vraća 0 rezultata.
 *  - Zato za `praksa` koristimo HIBRIDNI SUSTAV PRETRAGE:
 *      1) Automatsko prepoznavanje pravnih instituta i hrvatskih korijena riječi (stemova) iz spisa/upita
 *      2) Paralelna IDF pretraga po ključnim riječima i metapodacima predmeta (~200-400ms, bez čitanja TOAST vektora)
 *      3) Točni 3072-dimenzionalni vektorski (kosinusni) reranking nad top kandidatima po primarnom ključu (~350ms)
 */
const ZAKONI_DIM = 768;
const PRAKSA_DIM = 3072;

const EMBEDDING_MODEL = 'gemini-embedding-001';

// Kratice koje se često koriste u rješenjima i presudama
const KRATICE_ZAKONA: Record<string, RegExp> = {
  'Zakon o općem upravnom postupku': /\bZUP\w*\b/i,
  'Zakon o upravnim sporovima': /\bZUS\w*\b/i,
  'Zakon o vodama': /\bZOV\w*\b/i,
  'Zakon o financiranju vodnoga gospodarstva': /\bZFVG\w*\b/i,
  'Zakon o vodnim uslugama': /\bZVU\w*\b/i,
  'Opći porezni zakon': /\bOPZ\w*\b/i,
  'Zakon o gradnji': /\bZG\w*\b/i,
  'Zakon o komunalnom gospodarstvu': /\bZKG\w*\b/i,
  'Zakon o postupanju s nezakonito izgrađenim zgradama': /\bZPNIZ\w*\b/i,
  'Zakon o vlasništvu i drugim stvarnim pravima': /\bZV\b|\bZVDSP\w*\b/i,
  'Zakon o zemljišnim knjigama': /\bZZK\w*\b/i,
  'Zakon o obveznim odnosima': /\bZOO\w*\b/i,
  'Ovršni zakon': /\bOZ\b/i,
  'Zakon o nasljeđivanju': /\bZN\b/i,
  'Uredba o visini naknade za uređenje voda': /\bU-?NUV\w*\b/i,
  'Pravilnik o obračunu i naplati naknade za uređenje voda': /\bP-?NUV\w*\b/i,
  'Uredba o visini vodnoga doprinosa': /\bU-?VD\w*\b/i,
  'Pravilnik o obračunu i naplati vodnoga doprinosa': /\bP-?VD\w*\b/i,
  'Uredba o visini naknade za zaštitu voda': /\bU-?NZZV\w*\b/i,
  'Uredba o uredskom poslovanju': /\bUUP\w*\b/i,
  'Uredba o Tarifi upravnih pristojbi': /\bUTUP\w*\b/i,
};

export type ZakonClanak = RagZakonSource;
export type PraksaIsjecak = RagPraksaSource;

export interface ExtractedKeyword {
  label: string;
  stem: string;
  weight: number;
}

/**
 * Katalog specifičnih pravnih instituta i čestih žalbenih razloga u upravnom postupku i vodnom gospodarstvu.
 */
const LEGAL_CONCEPT_PATTERNS: Array<{
  regex: RegExp;
  label: string;
  stem: string;
  weight: number;
}> = [
  { regex: /\bodvjetni[čć]k\w+\s+(?:djelatnost\w*|ured\w*|pisarnic\w*)/i, label: 'odvjetnička djelatnost', stem: 'odvjetničk%djelatnost', weight: 3.6 },
  { regex: /\btemeljn\w+\s+djelatnost\w*|\bnkd\b/i, label: 'temeljna djelatnost (NKD)', stem: 'temeljnoj djelatnosti', weight: 3.2 },
  { regex: /\bsuvlasni[čćkštv]\w*/i, label: 'suvlasništvo / solidarna obveza', stem: 'suvlasni', weight: 2.8 },
  { regex: /\bsolidarn\w+/i, label: 'solidarni obveznici', stem: 'solidarn', weight: 2.6 },
  { regex: /\bstamben\w+\s+prostor\w*|\bu\s+stanu\b|\bstan\s+površine/i, label: 'stambeni prostor', stem: 'stamben', weight: 2.3 },
  { regex: /\bspremi[šs]t\w*/i, label: 'spremište / pripadak', stem: 'spremišt', weight: 2.9 },
  { regex: /\btavan\w*/i, label: 'tavanski prostor', stem: 'tavan', weight: 2.9 },
  { regex: /\bgara[žz]\w*/i, label: 'garažni prostor', stem: 'garaž', weight: 2.8 },
  { regex: /\bpodrum\w*/i, label: 'podrumski prostor', stem: 'podrum', weight: 2.6 },
  { regex: /\botvoren\w+\s+prostor\w*|\botvoren\w+\s+građevin\w*/i, label: 'otvoreni prostor', stem: 'otvoreni prostor', weight: 2.7 },
  { regex: /\bo[čc]evidnik\w*/i, label: 'očevidnik komunalne naknade', stem: 'očevidnik', weight: 2.5 },
  { regex: /\bkomunaln\w+\s+naknad\w*/i, label: 'komunalna naknada', stem: 'komunaln', weight: 2.1 },
  { regex: /\bnedono[šs]enj\w+\s+rje[šs]enj\w*/i, label: 'nedonošenje rješenja u roku', stem: 'nedonošenj', weight: 3.5 },
  { regex: /\b[šs]utnj\w+\s+uprav\w*|\b[šs]utnj\w+\s+administracij\w*/i, label: 'šutnja uprave', stem: 'šutnj', weight: 3.5 },
  { regex: /\bzastar\w+/i, label: 'zastara', stem: 'zastar', weight: 3.3 },
  { regex: /\bodbac\w+|\bodba[čc]en\w+/i, label: 'odbacivanje podneska / žalbe (čl. 114. ZUP)', stem: 'odbac', weight: 3.1 },
  { regex: /\bupravn\w+\s+stvar\w*/i, label: 'pojam upravne stvari (čl. 2. ZUP)', stem: 'upravna stvar', weight: 3.1 },
  { regex: /\bnepravodobn\w+/i, label: 'nepravodobna žalba', stem: 'nepravodob', weight: 3.2 },
  { regex: /\bnedopu[šs]ten\w+/i, label: 'nedopuštena žalba', stem: 'nedopušten', weight: 3.1 },
  { regex: /\bdostavnic\w*|\buredn\w+\s+dostav\w*/i, label: 'urednost dostave / dostavnica', stem: 'dostavnic', weight: 2.6 },
  { regex: /\bpunomo[ćc]\w*|\bneovla[šs]ten\w+\s+osob\w*/i, label: 'punomoć / ovlaštena osoba', stem: 'punomoć', weight: 2.8 },
  { regex: /\bispitn\w+\s+postup\w*/i, label: 'ispitni postupak (čl. 51. ZUP)', stem: 'ispitni postupak', weight: 2.4 },
  { regex: /\bo[čc]evid\b|\bo[čc]evida\b|\bo[čc]evidom\b/i, label: 'očevid na licu mjesta', stem: 'očevid', weight: 2.5 },
  { regex: /\bvje[šs]ta[čc]\w*/i, label: 'vještačenje', stem: 'vještač', weight: 2.8 },
  { regex: /\bkupoprodaj\w*|\bpromjen\w+\s+vlasni\w*/i, label: 'kupoprodaja / promjena vlasnika', stem: 'kupoprodaj', weight: 2.9 },
  { regex: /\bugovor\w*\s+o\s+zakup\w*|\bzakupnik\w*|\bnajmoprim\w*/i, label: 'ugovor o zakupu / najmu', stem: 'zakup', weight: 2.8 },
  { regex: /\bste[čc]aj\w*/i, label: 'stečajni postupak', stem: 'stečaj', weight: 3.1 },
  { regex: /\blikvidacij\w*/i, label: 'likvidacija', stem: 'likvidacij', weight: 3.0 },
  { regex: /\bnasljed\w*|\bostavin\w*|\bpravn\w+\s+sljedni\w*/i, label: 'nasljeđivanje / pravni slijednik', stem: 'nasljed', weight: 3.1 },
  { regex: /\bdr[žz]avn\w+\s+nekretnin\w*|\bprostornoga\s+uređenja,\s+graditeljstva\s+i\s+državne\s+imovine/i, label: 'državne nekretnine', stem: 'državne nekretnine', weight: 3.2 },
  { regex: /\bpoljoprivredn\w+\s+zemlji[šs]t\w*/i, label: 'poljoprivredno zemljište', stem: 'poljoprivredn', weight: 3.0 },
  { regex: /\bru[šs]evin\w*|\bneupotrebljiv\w*|\bneuseljiv\w*/i, label: 'ruševina / neuseljivost objekta', stem: 'neupotrebljiv', weight: 3.1 },
  { regex: /\bpotres\w*/i, label: 'oštećenje u potresu', stem: 'potres', weight: 3.2 },
  { regex: /\bozakonjen\w*|\bizvedenom\s+stanju/i, label: 'ozakonjenje / izvedeno stanje', stem: 'ozakonjen', weight: 2.9 },
  { regex: /\bpravomo[ćc]nost\w*\s+građevinsk\w+/i, label: 'pravomoćnost građevinske dozvole', stem: 'pravomoćnost', weight: 3.1 },
  { regex: /\bizmjen\w+\s+i\s+dopun\w+\s+građevinsk\w*/i, label: 'izmjena građevinske dozvole', stem: 'izmjene i dopune', weight: 2.9 },
  { regex: /\biskaz\w*\s+mjera|\bobujam\b|\bobujma\b/i, label: 'iskaz mjera / obujam građevine', stem: 'iskaz mjera', weight: 2.9 },
  { regex: /\bprojektant\w*|\bglavn\w+\s+projekt\w*/i, label: 'glavni projekt / projektant', stem: 'projektant', weight: 2.6 },
  { regex: /\bobustav\w+\s+postupk\w*|\bobustav\w+\s+gradnj\w*|\bodustan\w+\s+od\s+gradnj\w*/i, label: 'obustava postupka / odustanak', stem: 'obustav', weight: 2.8 },
  { regex: /\bkorekcijsk\w+\s+koeficijent\w*/i, label: 'korekcijski koeficijent', stem: 'korekcijsk', weight: 2.7 },
  { regex: /\btarifn\w+\s+razred\w*/i, label: 'tarifni razred', stem: 'tarifni razred', weight: 2.4 },
  { regex: /\beta[žz]\w+/i, label: 'etažno vlasništvo', stem: 'etaž', weight: 2.7 },
  { regex: /\bzemlji[šs]n\w*\s*knji[žz]\w*|\bzk\.?\s*ul/i, label: 'zemljišne knjige', stem: 'zemljišn', weight: 2.2 },
  { regex: /\bjavn\w+\s+isprav\w*|\bteret\s+dokaza/i, label: 'javna isprava / teret dokaza', stem: 'javne isprave', weight: 2.8 },
  { regex: /\boborinsk\w+\s+vod\w*/i, label: 'oborinske vode', stem: 'oborinsk', weight: 3.0 },
  { regex: /\bjavn\w+\s+vodn\w+\s+dobr\w*/i, label: 'javno vodno dobro', stem: 'vodnog dobra', weight: 3.1 },
  { regex: /\bkoncesij\w*/i, label: 'naknada za koncesiju', stem: 'koncesij', weight: 3.2 },
  { regex: /\bza[šs]tit\w+\s+voda/i, label: 'naknada za zaštitu voda', stem: 'zaštitu voda', weight: 2.9 },
  { regex: /\bkori[šs]tenj\w+\s+voda/i, label: 'naknada za korištenje voda', stem: 'korištenje voda', weight: 2.9 },
  { regex: /\bobnov\w+\s+postupk\w*/i, label: 'obnova postupka', stem: 'obnov', weight: 3.2 },
  { regex: /\bni[šs]tav\w+\s+rje[šs]enj\w*|\bogla[šs]\w+\s+rje[šs]enj\w+\s+ni[šs]tav/i, label: 'oglašavanje rješenja ništavim', stem: 'ništav', weight: 3.3 },
  { regex: /\bčl(?:anak|anka|\.)\s*129\b|\bukidanj\w+\s+zakonit\w*/i, label: 'poništavanje i ukidanje (čl. 129. ZUP)', stem: '129.', weight: 3.2 },
  { regex: /\btro[šs]kov\w+\s+postupk\w*|\btro[šs]kov\w+\s+upravnog\s+spora/i, label: 'troškovi postupka', stem: 'troškov', weight: 2.9 },
  { regex: /\bodgovor\w*\s+na\s+tu[žz]b\w*/i, label: 'odgovor na tužbu', stem: 'odgovor na tužbu', weight: 3.2 },
];

/**
 * Opći birokratski i pravni stopwordi koji se pojavljuju u gotovo svakom rješenju i ne nose razlikovnu vrijednost.
 */
const LEGAL_STOPWORDS = new Set([
  'republika', 'hrvatska', 'hrvatske', 'hrvatskoj', 'hrvatskim', 'ministarstvo', 'ministarstva',
  'zaštite', 'okoliša', 'zelene', 'tranzicije', 'gospodarstva', 'održivog', 'razvoja', 'poljoprivrede',
  'vode', 'vodama', 'vodnog', 'vodnoga', 'vodnih', 'vodno', 'uređenje', 'uređenja', 'doprinos', 'doprinosa',
  'naknada', 'naknade', 'naknadu', 'naknadi', 'obračun', 'obračuna', 'obračunu', 'plaćanje', 'plaćanja',
  'rješenje', 'rješenja', 'rješenjem', 'rješenju', 'pobijano', 'pobijanog', 'pobijanim', 'prvostupanjsko',
  'prvostupanjskog', 'prvostupanjskom', 'drugostupanjsko', 'drugostupanjskog', 'drugostupanjskom',
  'tijelo', 'tijela', 'tijelu', 'žalba', 'žalbe', 'žalbi', 'žalbu', 'žalbom', 'žalitelj', 'žalitelja',
  'žaliteljica', 'žaliteljice', 'žalitelju', 'podnositelj', 'podnositelja', 'podnositeljica', 'stranka',
  'stranke', 'stranci', 'obveznik', 'obveznika', 'obvezniku', 'predmet', 'predmeta', 'predmetu', 'spis',
  'spisa', 'spisu', 'klasa', 'urbroj', 'broj', 'broja', 'datum', 'dana', 'godine', 'godina', 'zagreb',
  'zagrebu', 'članak', 'članka', 'članku', 'člankom', 'stavak', 'stavka', 'stavku', 'stavkom', 'točka',
  'točke', 'točkom', 'zakon', 'zakona', 'zakonu', 'zakonom', 'uredba', 'uredbe', 'pravilnik', 'pravilnika',
  'narodne', 'novine', 'općem', 'upravnom', 'upravni', 'upravnog', 'upravnoj', 'upravne', 'postupak',
  'postupka', 'postupku', 'spor', 'spora', 'sporu', 'sud', 'suda', 'sudu', 'visoki', 'visokog', 'izreka',
  'izreci', 'obrazloženje', 'obrazloženja', 'obrazloženju', 'uputa', 'pravnom', 'lijeku', 'osnovana',
  'neosnovana', 'odbija', 'poništava', 'vraća', 'donosi', 'navodi', 'navodima', 'ističe', 'smatra',
  'predlaže', 'temelju', 'sukladno', 'odredbi', 'odredbama', 'propisano', 'propisuje', 'utvrđeno',
  'utvrdilo', 'činjenično', 'stanje', 'materijalnog', 'prava', 'pravilno', 'zakonito', 'izjavljena',
  'protiv', 'kojim', 'kojem', 'kojeg', 'koja', 'koje', 'koji', 'koju', 'kako', 'tako', 'zbog', 'radi',
  'ovog', 'ovoga', 'ovom', 'ovoj', 'ove', 'ovaj', 'svoje', 'svojim', 'svom', 'nije', 'jesu', 'biti',
  'bila', 'bilo', 'bili', 'može', 'mogu', 'mora', 'treba', 'valja', 'slijedom', 'navedenog', 'svega',
  'između', 'ostalog', 'odnosno', 'međutim', 'nadalje', 'također', 'stoga', 'budući', 'prema', 'samo',
  'više', 'nego', 'kroz', 'prije', 'poslije', 'nakon', 'prilikom', 'povodom', 'vezi', 'oko', 'kod',
  'kada', 'gdje', 'nego', 'niti', 'ipak', 'ovdje', 'tamo', 'vrsta', 'iznos', 'iznosa', 'iznosu', 'eura',
  'kuna', 'mjesečno', 'ukupno', 'adresa', 'adresi', 'ulica', 'ulici', 'pravna', 'osoba', 'fizička',
  'vodnogospodarski', 'odjel', 'ispostava', 'mali', 'sliv', 'pismohrana', 'dostaviti', 'stranica',
  'primljeno', 'klasifikacijska', 'oznaka', 'urudžbeni', 'elektronički', 'potpis', 'savjetnik',
  'praksa', 'praksi', 'praksu', 'prakse', 'primjenjuje', 'primjenjuju', 'primjena', 'primjeni',
  'stvar', 'stvari', 'smatra', 'smatraju', 'pitanje', 'pitanja', 'slučaj', 'slučaju', 'konkretnom',
  'voda', 'nekretnina', 'nekretnine', 'nekretnini', 'nekretninu', 'nekretninama', 'prostor', 'prostora',
  'prostoru', 'prostorom', 'prostori', 'djelatnost', 'djelatnosti', 'vidi', 'presuda', 'presude', 'presudu',
  'presudom', 'propisanom', 'propisani', 'propisana', 'roku', 'roka', 'aktom', 'akta', 'aktu',
  'odvjetnik', 'odvjetnika', 'odvjetniku', 'odvjetnica', 'odvjetnice', 'punomoćnik', 'punomoćnika',
  'tužitelj', 'tužitelja', 'tužitelju', 'tuženik', 'tuženika', 'tuženiku', 'radi', 'koji', 'koja',
]);

/**
 * Jednostavan i robustan hrvatski stemmer za pretragu korijena riječi kroz sve padeže.
 */
export function croatianStem(word: string): string {
  const clean = word
    .toLowerCase()
    .replace(/[^a-zčćžšđ0-9]/gi, '')
    .trim();

  if (clean.length <= 4) return clean;

  const suffixes = [
    'ovima', 'evima', 'ijama', 'anjima', 'enjima', 'ostima',
    'skoga', 'skome', 'skima', 'čkoga', 'čkome',
    'ama', 'ima', 'om', 'em', 'og', 'eg', 'oj', 'ih', 'im', 'uh', 'mu',
    'ost', 'osti', 'ošću', 'anje', 'anja', 'anju', 'enje', 'enja', 'enju',
    'ska', 'ske', 'ski', 'sko', 'sku', 'čka', 'čke', 'čki', 'čko', 'čku',
    'na', 'ne', 'ni', 'no', 'nu', 'a', 'e', 'i', 'o', 'u',
  ];

  for (const suf of suffixes) {
    if (clean.endsWith(suf) && clean.length - suf.length >= 4) {
      return clean.slice(0, clean.length - suf.length);
    }
  }
  return clean;
}

/**
 * Izvlači najvažnije pravne pojmove i ključne riječi iz korisnikovog upita, napomene voditelja i teksta spisa.
 */
export function extractCaseKeywords(params: {
  explicitKeywords?: string[];
  queryText?: string;
  napomena?: string;
  podrucje?: string;
  zalbaText?: string;
  spisText?: string;
  maxKeywords?: number;
}): ExtractedKeyword[] {
  const {
    explicitKeywords = [],
    queryText = '',
    napomena = '',
    zalbaText = '',
    spisText = '',
    maxKeywords = 10,
  } = params;

  const resultMap = new Map<string, ExtractedKeyword>();

  const addKw = (label: string, stem: string, weight: number) => {
    const normStem = stem.trim().toLowerCase();
    if (normStem.length < 3) return;
    const existing = resultMap.get(normStem);
    if (!existing || weight > existing.weight) {
      resultMap.set(normStem, { label: label.trim(), stem: normStem, weight });
    }
  };

  // 1. Ručno zadane ključne riječi korisnika (najviši prioritet)
  for (const rawKw of explicitKeywords) {
    const trimmed = rawKw.trim();
    if (!trimmed) continue;
    if (trimmed.includes(' ')) {
      // Višerječni izraz — koristi korijen glavnih riječi ili sam izraz
      const words = trimmed.split(/\s+/).filter((w) => w.length >= 3);
      if (words.length === 2) {
        addKw(trimmed, `${croatianStem(words[0])}%${croatianStem(words[1])}`, 4.5);
      } else {
        addKw(trimmed, trimmed.toLowerCase(), 4.5);
      }
    } else {
      addKw(trimmed, croatianStem(trimmed), 4.5);
    }
  }

  // 2. Prepoznavanje domenskih pravnih instituta (prvo u napomeni i upitu, zatim u žalbi i spisu)
  const highPriorityText = `${napomena}\n${queryText}`;
  const fullCorpus = `${highPriorityText}\n${zalbaText.slice(0, 12000)}\n${spisText.slice(0, 8000)}`;

  for (const concept of LEGAL_CONCEPT_PATTERNS) {
    if (concept.regex.test(highPriorityText)) {
      addKw(concept.label, concept.stem, concept.weight + 1.2);
    } else if (concept.regex.test(fullCorpus)) {
      addKw(concept.label, concept.stem, concept.weight);
    }
  }

  // 3. Ekstrakcija specifičnih pojmova iz napomene voditelja i korisnikovog upita (npr. "Budimir", "bazen", "solarne")
  const tokenizeDistinctive = (text: string, baseWeight: number, maxTake: number) => {
    const words = text
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => /^[a-zčćžšđ]{4,}$/i.test(w));

    const freq = new Map<string, { surface: string; count: number }>();
    for (const w of words) {
      const lower = w.toLowerCase();
      if (LEGAL_STOPWORDS.has(lower)) continue;
      const stem = croatianStem(lower);
      if (stem.length < 4 || LEGAL_STOPWORDS.has(stem)) continue;
      const prev = freq.get(stem);
      if (prev) {
        prev.count += 1;
      } else {
        freq.set(stem, { surface: lower, count: 1 });
      }
    }

    const sorted = [...freq.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, maxTake);

    for (const [stem, info] of sorted) {
      if (!resultMap.has(stem)) {
        addKw(info.surface, stem, baseWeight + Math.min(0.6, info.count * 0.15));
      }
    }
  };

  if (napomena.trim()) tokenizeDistinctive(napomena, 3.4, 5);
  if (queryText.trim()) tokenizeDistinctive(queryText, 2.9, 5);
  if (zalbaText.trim()) tokenizeDistinctive(zalbaText.slice(0, 6000), 1.7, 5);
  else if (spisText.trim()) tokenizeDistinctive(spisText.slice(0, 5000), 1.5, 4);

  return [...resultMap.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxKeywords);
}

// ============================================================================
// MEMORIJSKI KATALOG NASLOVA PRAKSE (1.600 odluka, TTL 5 min)
// ============================================================================
interface PraksaCatalogItem {
  id: number;
  naziv_datoteke: string;
}

let cachedCatalog: { items: PraksaCatalogItem[]; expiresAt: number } | null = null;

export function invalidatePraksaCatalog() {
  cachedCatalog = null;
}

export async function getPraksaCatalog(): Promise<PraksaCatalogItem[]> {
  if (cachedCatalog && Date.now() < cachedCatalog.expiresAt && cachedCatalog.items.length > 0) {
    return cachedCatalog.items;
  }

  const all: PraksaCatalogItem[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('praksa')
      .select('id, naziv_datoteke')
      .eq('chunk_index', 0)
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error || !data || data.length === 0) break;
    for (const row of data) {
      all.push({ id: row.id, naziv_datoteke: row.naziv_datoteke });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const dedupMap = new Map<string, PraksaCatalogItem>();
  for (const item of all) {
    if (!dedupMap.has(item.naziv_datoteke)) {
      dedupMap.set(item.naziv_datoteke, item);
    }
  }

  const items = Array.from(dedupMap.values());
  cachedCatalog = {
    items,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return items;
}

function parseVector(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export function extractMessageText(message: any): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.parts)) {
    return message.parts.map((p: any) => p.text || '').join(' ');
  }
  return '';
}

export function buildRetrievalQuery(messages: any[]): string {
  const userMessages = messages.filter((m) => m.role === 'user').map(extractMessageText).filter(Boolean);
  const last = userMessages[userMessages.length - 1] || '';
  const prev = userMessages[userMessages.length - 2];
  if (prev && last.length < 80) return `${prev}\n${last}`;
  return last;
}

export function buildCaseRetrievalQuery(
  queryText: string,
  dokumenti: { tip_dokumenta: string; raw_text: string }[],
  napomena?: string
): string {
  const prefix = napomena ? `${queryText}\nNapomena o predmetu: ${napomena}` : queryText;
  if (!dokumenti || dokumenti.length === 0) return prefix;

  const sorted = [...dokumenti].sort((a, b) => {
    const score = (tip: string) => {
      const t = tip.toLowerCase();
      if (t.includes('žalba') || t.includes('zalba')) return 0;
      if (t.includes('rješenje') || t.includes('rjesenje') || t.includes('spis')) return 1;
      return 2;
    };
    return score(a.tip_dokumenta) - score(b.tip_dokumenta);
  });

  const perDocBudget = Math.max(900, Math.floor(4200 / sorted.length));
  const snippets = sorted.map((doc) => {
    const raw = (doc.raw_text || '').trim();
    if (raw.length <= perDocBudget) {
      return `[${doc.tip_dokumenta}]\n${raw}`;
    }
    const headLen = Math.floor(perDocBudget * 0.45);
    const tailLen = perDocBudget - headLen;
    const midStart = Math.max(headLen, Math.floor(raw.length * 0.35));
    return `[${doc.tip_dokumenta}]\n${raw.slice(0, headLen)}\n...\n${raw.slice(midStart, midStart + tailLen)}`;
  });

  return `${prefix}\n\n${snippets.join('\n\n')}`.slice(0, 5000);
}

export function matchesPraksaScope(nazivDatoteke: string, scope: PraksaFilterScope): boolean {
  if (!scope || scope === 'sve') return true;
  const isSudska = /upravnih sudova|upravni spor|presud/i.test(nazivDatoteke);

  switch (scope) {
    case 'nuv':
      return /naknada za ure[đd]enje voda|\bnuv\b/i.test(nazivDatoteke);
    case 'vd':
      return /vodni doprinos|\bvd\b/i.test(nazivDatoteke);
    case 'sudska':
      return isSudska;
    case 'upravna':
      return !isSudska;
    default:
      return true;
  }
}

function matchesCasePodrucje(nazivDatoteke: string, podrucje?: string): boolean {
  if (!podrucje || podrucje === 'Ostalo') return false;
  if (podrucje === 'NUV') return /naknada za ure[đd]enje voda|\bnuv\b/i.test(nazivDatoteke);
  if (podrucje === 'VD') return /vodni doprinos|\bvd\b/i.test(nazivDatoteke);
  if (podrucje === 'NZZV') return /za[šs]titu voda|\bnzzv\b/i.test(nazivDatoteke);
  return false;
}

async function embedQuery(text: string, dimensions: number): Promise<number[] | null> {
  try {
    const { embedding } = await embed({
      model: google.textEmbeddingModel(EMBEDDING_MODEL),
      value: text.slice(0, 6000),
      providerOptions: {
        google: { outputDimensionality: dimensions, taskType: 'RETRIEVAL_QUERY' },
      },
    });
    return embedding;
  } catch (err: any) {
    console.error(`embedQuery (${dimensions}d) greška:`, err?.message || err);
    return null;
  }
}

function zakonTail(naziv: string): string {
  return naziv.replace(/^(?:zakon|uredba|pravilnik)\s+o\s+/i, '').toLowerCase();
}

function detectZakon(text: string, nazivi: string[]): string | null {
  const lower = text.toLowerCase();
  for (const naziv of nazivi) {
    const tail = zakonTail(naziv);
    if (tail && lower.includes(tail)) return naziv;
    const kratica = KRATICE_ZAKONA[naziv];
    if (kratica && kratica.test(text)) return naziv;
  }
  return null;
}

export function extractArticleRefs(
  text: string,
  nazivi: string[],
  defaultZakon: string | null
): { zakon: string; broj: string }[] {
  const refs: { zakon: string; broj: string }[] = [];
  const re =
    /(?<![a-zA-ZčćžšđČĆŽŠĐ])(?:članak|članka|članku|člankom|članaka|člancima|članci|čl\.)\s*((?:\d+[a-z]?\.?(?:\s*(?:stavak|stavka|st\.|točka|točke|toč\.|t\.)\s*\d+\.?)*\s*(?:,|i|te|ili)?\s*)+)/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const numsPart = m[1].replace(/(?:stavak|stavka|st\.|točka|točke|toč\.|t\.)\s*\d+\.?/gi, ' ');
    const brojevi = numsPart.match(/\d+[a-z]?/g) || [];

    const window = text.slice(m.index, m.index + m[0].length + 160);
    const zakon = detectZakon(window, nazivi) || defaultZakon;
    if (!zakon) continue;

    for (const broj of brojevi) {
      refs.push({ zakon, broj });
    }
  }

  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.zakon}|${r.broj}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchArticles(
  refs: { zakon: string; broj: string }[],
  izvor: ZakonIzvorTip,
  limit = 12
): Promise<ZakonClanak[]> {
  if (refs.length === 0) return [];
  const byZakon = new Map<string, string[]>();
  for (const r of refs.slice(0, limit)) {
    const list = byZakon.get(r.zakon) || [];
    list.push(`Članak ${r.broj}.`, `Članak ${r.broj}`);
    byZakon.set(r.zakon, list);
  }

  const results = await Promise.all(
    [...byZakon.entries()].map(([zakon, clanci]) =>
      supabase
        .from('zakoni')
        .select('id, naziv_zakona, clanak_broj, tekst')
        .eq('naziv_zakona', zakon)
        .in('clanak_broj', clanci)
    )
  );

  const out: ZakonClanak[] = [];
  for (const r of results) {
    if (r.error) {
      console.error('Greška pri dohvaćanju citiranih članaka:', r.error.message);
      continue;
    }
    for (const row of r.data || []) out.push({ ...(row as any), izvor });
  }
  return out;
}

/**
 * Hibridna pretraga Baze prakse:
 * Spaja paralelnu IDF pretragu po ključnim riječima (bez čitanja sporih TOAST vektora na cijeloj tablici)
 * s egzaktnim 3072-dim vektorskim rerankingom po primarnom ključu za najbolje kandidate.
 */
export async function searchPraksaHybrid(params: {
  queryText: string;
  keywords: ExtractedKeyword[];
  catalog: PraksaCatalogItem[];
  filterScope?: PraksaFilterScope;
  casePodrucje?: string;
  preferredIshod?: 'Odbijena žalba' | 'Poništeno rješenje';
  preferAdvisorDecisions?: boolean;
  praksaCount?: number;
  queryEmbedding3072?: number[] | null;
}): Promise<PraksaIsjecak[]> {
  const {
    keywords,
    catalog,
    filterScope = 'sve',
    casePodrucje,
    preferredIshod,
    preferAdvisorDecisions = false,
    praksaCount = 6,
    queryEmbedding3072 = null,
  } = params;

  const activeStems = keywords.slice(0, 10);

  // 1. Paralelna pretraga sadržaja po svakom korijenu riječi (najnovije odluke prve!)
  const stemQueries = activeStems.map((kw) =>
    supabase
      .from('praksa')
      .select('id, naziv_datoteke, chunk_index, sadrzaj')
      .ilike('sadrzaj', `%${kw.stem}%`)
      .order('id', { ascending: false })
      .limit(80)
      .then((res) => ({ kw, rows: res.data || [] }))
  );

  // 2. Usporedno pretraži i naslove u memorijskom katalogu (0ms) za imena stranaka, gradove ili kategorije
  const titleMatchedNames = new Set<string>();
  const titleKeywordsMap = new Map<string, string[]>();
  for (const item of catalog) {
    if (!matchesPraksaScope(item.naziv_datoteke, filterScope)) continue;
    const lowerTitle = item.naziv_datoteke.toLowerCase();
    for (const kw of activeStems) {
      const probe = kw.stem.replace(/%/g, ' ');
      if (probe.length >= 4 && lowerTitle.includes(probe)) {
        titleMatchedNames.add(item.naziv_datoteke);
        const list = titleKeywordsMap.get(item.naziv_datoteke) || [];
        if (!list.includes(kw.label)) list.push(kw.label);
        titleKeywordsMap.set(item.naziv_datoteke, list);
      }
    }
  }

  const [perStemResults, titleChunksRes] = await Promise.all([
    Promise.all(stemQueries),
    titleMatchedNames.size > 0
      ? supabase
          .from('praksa')
          .select('id, naziv_datoteke, chunk_index, sadrzaj')
          .in('naziv_datoteke', Array.from(titleMatchedNames).slice(0, 25))
          .lte('chunk_index', 2)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  interface CandidateChunk {
    id: number;
    naziv_datoteke: string;
    chunk_index: number;
    sadrzaj: string;
    lexScore: number;
    matchedLabels: Set<string>;
  }

  const chunkMap = new Map<number, CandidateChunk>();
  const docMatchedLabels = new Map<string, Set<string>>();
  const docLexicalTotal = new Map<string, number>();

  const registerDocLabel = (docName: string, label: string, addScore: number) => {
    let set = docMatchedLabels.get(docName);
    if (!set) {
      set = new Set<string>();
      docMatchedLabels.set(docName, set);
    }
    const isNewConceptForDoc = !set.has(label);
    set.add(label);
    const prevScore = docLexicalTotal.get(docName) || 0;
    // Veliki bonus kad isti spis sadrži VIŠE RAZLIČITIH ključnih riječi iz predmeta!
    docLexicalTotal.set(docName, prevScore + (isNewConceptForDoc ? addScore * 1.35 : addScore * 0.15));
  };

  for (const { kw, rows } of perStemResults) {
    if (rows.length === 0) continue;
    const filteredRows = rows.filter((r) => matchesPraksaScope(r.naziv_datoteke, filterScope));
    if (filteredRows.length === 0) continue;

    // IDF faktor rijetkosti pojma: rijedak pravni pojam nosi znatno veću težinu od općenitog
    const rarityFactor =
      filteredRows.length <= 8
        ? 1.9
        : filteredRows.length <= 22
        ? 1.5
        : filteredRows.length <= 45
        ? 1.2
        : 0.9;
    const weightedPoints = kw.weight * rarityFactor;

    for (const row of filteredRows) {
      registerDocLabel(row.naziv_datoteke, kw.label, weightedPoints);
      const existing = chunkMap.get(row.id);
      if (!existing) {
        chunkMap.set(row.id, {
          id: row.id,
          naziv_datoteke: row.naziv_datoteke,
          chunk_index: row.chunk_index,
          sadrzaj: row.sadrzaj,
          lexScore: weightedPoints,
          matchedLabels: new Set([kw.label]),
        });
      } else {
        existing.lexScore += weightedPoints * 1.25;
        existing.matchedLabels.add(kw.label);
      }
    }
  }

  for (const row of titleChunksRes.data || []) {
    if (!matchesPraksaScope(row.naziv_datoteke, filterScope)) continue;
    const tLabels = titleKeywordsMap.get(row.naziv_datoteke) || [];
    for (const lbl of tLabels) {
      registerDocLabel(row.naziv_datoteke, lbl, 3.0);
    }
    if (!chunkMap.has(row.id)) {
      chunkMap.set(row.id, {
        id: row.id,
        naziv_datoteke: row.naziv_datoteke,
        chunk_index: row.chunk_index,
        sadrzaj: row.sadrzaj,
        lexScore: 3.0,
        matchedLabels: new Set(tLabels),
      });
    }
  }

  // 3. Fallback: ako upit ima vrlo malo leksičkih pogodaka, dodaj najnovija rješenja iz istog upravnog područja
  if (chunkMap.size < 18 && catalog.length > 0) {
    const fallbackTitles = catalog
      .filter(
        (c) =>
          matchesPraksaScope(c.naziv_datoteke, filterScope) &&
          (!casePodrucje ||
            casePodrucje === 'Ostalo' ||
            matchesCasePodrucje(c.naziv_datoteke, casePodrucje))
      )
      .slice(0, 20)
      .map((c) => c.naziv_datoteke);

    if (fallbackTitles.length > 0) {
      const { data: fbRows } = await supabase
        .from('praksa')
        .select('id, naziv_datoteke, chunk_index, sadrzaj')
        .in('naziv_datoteke', fallbackTitles)
        .in('chunk_index', [0, 2])
        .limit(36);

      for (const row of fbRows || []) {
        if (!chunkMap.has(row.id)) {
          chunkMap.set(row.id, {
            id: row.id,
            naziv_datoteke: row.naziv_datoteke,
            chunk_index: row.chunk_index,
            sadrzaj: row.sadrzaj,
            lexScore: 0.8,
            matchedLabels: new Set(),
          });
        }
      }
    }
  }

  if (chunkMap.size === 0) return [];

  // 4. Odaberi top ~68 chunkova za točni 3072-dim vektorski reranking (po primarnom ključu < 500ms!)
  const allCandidates = Array.from(chunkMap.values()).map((c) => {
    const docBonus = (docLexicalTotal.get(c.naziv_datoteke) || 0) * 0.45;
    const areaBonus = matchesCasePodrucje(c.naziv_datoteke, casePodrucje) ? 2.5 : 0;
    const isAdvisorRjesenje = !/upravnih sudova|upravni spor|presud/i.test(c.naziv_datoteke);
    const advisorBonus = preferAdvisorDecisions && isAdvisorRjesenje ? 2.0 : 0;
    return {
      ...c,
      preRankScore: c.lexScore + docBonus + areaBonus + advisorBonus,
    };
  });

  allCandidates.sort((a, b) => b.preRankScore - a.preRankScore);
  const topForVectors = allCandidates.slice(0, 68);

  const vectorSimilarityById = new Map<number, number>();
  if (queryEmbedding3072 && topForVectors.length > 0) {
    const ids = topForVectors.map((c) => c.id);
    const { data: vecRows, error: vecErr } = await supabase
      .from('praksa')
      .select('id, embedding')
      .in('id', ids);

    if (vecErr) {
      console.warn('Upozorenje pri PK dohvatu vektora prakse:', vecErr.message);
    } else {
      for (const vr of vecRows || []) {
        const vec = parseVector(vr.embedding);
        if (vec && vec.length === queryEmbedding3072.length) {
          vectorSimilarityById.set(vr.id, cosineSimilarity(queryEmbedding3072, vec));
        }
      }
    }
  }

  // Normalizacija leksičkog rezultata u raspon [0, 1] radi kombiniranja s kosinusnom sličnošću
  const maxPreRank = Math.max(1, ...topForVectors.map((c) => c.preRankScore));

  // 5. Grupiraj po dokumentu (do 2 najbolja chunka po odluci) i izračunaj završni hibridni score
  const groupedDocs = new Map<
    string,
    {
      id: number;
      naziv_datoteke: string;
      chunks: Array<{ chunk_index: number; sadrzaj: string; score: number }>;
      hybridScore: number;
      cosineSim: number;
      matchedKeywords: string[];
    }
  >();

  for (const cand of topForVectors) {
    const cos = vectorSimilarityById.get(cand.id) ?? 0;
    const normLex = Math.min(1, cand.preRankScore / Math.max(12, maxPreRank));
    const meta = parsePraksaMetadata(cand.naziv_datoteke, cand.sadrzaj);

    let bonus = 0;
    if (matchesCasePodrucje(cand.naziv_datoteke, casePodrucje)) bonus += 0.07;
    if (preferredIshod && meta.ishod === preferredIshod) bonus += 0.05;
    if (meta.godina && Number(meta.godina) >= 2022) bonus += 0.04; // novija praksa (EUR, važeći ZUP/ZFVG)
    if (preferAdvisorDecisions && meta.vrsta === 'Drugostupanjsko rješenje') bonus += 0.06;

    const combined =
      cos > 0
        ? Math.min(0.98, cos * 0.52 + normLex * 0.42 + bonus)
        : Math.min(0.95, 0.45 + normLex * 0.45 + bonus);

    const existing = groupedDocs.get(cand.naziv_datoteke);
    const docLabels = Array.from(docMatchedLabels.get(cand.naziv_datoteke) || []);

    if (!existing) {
      groupedDocs.set(cand.naziv_datoteke, {
        id: cand.id,
        naziv_datoteke: cand.naziv_datoteke,
        chunks: [{ chunk_index: cand.chunk_index, sadrzaj: cand.sadrzaj, score: combined }],
        hybridScore: combined,
        cosineSim: cos,
        matchedKeywords: docLabels,
      });
    } else {
      if (combined > existing.hybridScore) existing.hybridScore = combined;
      if (cos > existing.cosineSim) existing.cosineSim = cos;
      if (
        existing.chunks.length < 2 &&
        !existing.chunks.some((ch) => ch.chunk_index === cand.chunk_index)
      ) {
        existing.chunks.push({
          chunk_index: cand.chunk_index,
          sadrzaj: cand.sadrzaj,
          score: combined,
        });
      }
    }
  }

  const allDocsRanked = Array.from(groupedDocs.values()).sort(
    (a, b) => b.hybridScore - a.hybridScore
  );

  // Ako se traži nacrt ili rad na spisu (`preferAdvisorDecisions`), osiguraj da korisnik dobije
  // i svoja vlastita drugostupanjska rješenja (radi strukture i stila) i relevantnu sudsku praksu!
  let selectedDocs = allDocsRanked.slice(0, praksaCount);
  if (preferAdvisorDecisions && filterScope === 'sve' && allDocsRanked.length > praksaCount) {
    const advisorDocs = allDocsRanked.filter(
      (d) =>
        parsePraksaMetadata(d.naziv_datoteke, d.chunks[0]?.sadrzaj).vrsta ===
        'Drugostupanjsko rješenje'
    );
    const otherDocs = allDocsRanked.filter(
      (d) =>
        parsePraksaMetadata(d.naziv_datoteke, d.chunks[0]?.sadrzaj).vrsta !==
        'Drugostupanjsko rješenje'
    );

    const minAdvisor = Math.min(advisorDocs.length, Math.max(2, Math.ceil(praksaCount * 0.6)));
    const picked = new Map<string, (typeof allDocsRanked)[number]>();
    for (const d of advisorDocs.slice(0, minAdvisor)) picked.set(d.naziv_datoteke, d);
    for (const d of [...otherDocs, ...advisorDocs]) {
      if (picked.size >= praksaCount) break;
      if (!picked.has(d.naziv_datoteke)) picked.set(d.naziv_datoteke, d);
    }
    selectedDocs = Array.from(picked.values()).sort((a, b) => b.hybridScore - a.hybridScore);
  }

  return selectedDocs.map((doc) => {
    const orderedChunks = [...doc.chunks].sort((a, b) => a.chunk_index - b.chunk_index);
    const mergedText = orderedChunks.map((c) => c.sadrzaj).join('\n\n[...]\n\n');
    const meta = parsePraksaMetadata(doc.naziv_datoteke, orderedChunks[0]?.sadrzaj);
    return {
      id: doc.id,
      naziv_datoteke: doc.naziv_datoteke,
      sadrzaj: mergedText,
      similarity: doc.hybridScore,
      matchedChunksCount: orderedChunks.length,
      matchedKeywords: doc.matchedKeywords.slice(0, 6),
      ...meta,
    };
  });
}

/**
 * Spaja uzastopne chunkove dokumenta uklanjajući preklapajući tekst (~200 znakova overlapa).
 */
export function stitchChunks(chunks: string[]): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return chunks[0];

  let result = chunks[0].trim();
  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i].trim();
    if (!next) continue;

    const tailWindow = result.slice(-340);
    let overlapFound = 0;
    const maxProbe = Math.min(280, next.length);

    for (let len = maxProbe; len >= 25; len--) {
      const prefix = next.slice(0, len);
      const idx = tailWindow.lastIndexOf(prefix);
      if (idx !== -1 && idx + prefix.length >= tailWindow.length - 8) {
        const exactTail = result.slice(-(tailWindow.length - idx));
        if (next.startsWith(exactTail)) {
          overlapFound = exactTail.length;
          break;
        }
      }
    }

    if (overlapFound > 0) {
      result += next.slice(overlapFound);
    } else {
      result += '\n\n' + next;
    }
  }
  return result;
}

/**
 * Dohvaća cjeloviti spojeni tekst odluke iz tablice `praksa` po nazivu datoteke.
 */
export async function getFullPracticeTextByName(nazivDatoteke: string): Promise<string> {
  if (!nazivDatoteke) return '';
  const { data, error } = await supabase
    .from('praksa')
    .select('chunk_index, sadrzaj')
    .eq('naziv_datoteke', nazivDatoteke)
    .order('chunk_index', { ascending: true });

  if (error || !data || data.length === 0) return '';
  return stitchChunks(data.map((r: any) => r.sadrzaj || ''));
}

export type KnowledgeResult = {
  zakoni: ZakonClanak[];
  praksa: PraksaIsjecak[];
  dostupniZakoni: string[];
  dostupnaPraksa: string[];
  extractedKeywords: string[];
};

/**
 * Glavna RAG funkcija:
 *  1. Hibridna pretraga Baze prakse (ključne riječi + korijeni riječi + područje + 3072-dim vektorski reranking),
 *  2. Semantička pretraga zakona (768-dim) + izravno dohvaćanje citiranih članaka iz spisa i pronađene prakse.
 */
export async function searchKnowledge(
  queryText: string,
  opts: {
    zakoniCount?: number;
    praksaCount?: number;
    extraTextForRefs?: string;
    filterScope?: PraksaFilterScope;
    explicitKeywords?: string[];
    napomena?: string;
    casePodrucje?: string;
    zalbaText?: string;
    preferredIshod?: 'Odbijena žalba' | 'Poništeno rješenje';
    preferAdvisorDecisions?: boolean;
  } = {}
): Promise<KnowledgeResult> {
  const {
    zakoniCount = 8,
    praksaCount = 6,
    extraTextForRefs = '',
    filterScope = 'sve',
    explicitKeywords = [],
    napomena = '',
    casePodrucje,
    zalbaText = '',
    preferredIshod,
    preferAdvisorDecisions = false,
  } = opts;

  const extracted = extractCaseKeywords({
    explicitKeywords,
    queryText,
    napomena,
    podrucje: casePodrucje,
    zalbaText,
    spisText: extraTextForRefs,
    maxKeywords: 10,
  });

  const [emb768, emb3072, dzRes, catalog] = await Promise.all([
    zakoniCount > 0 ? embedQuery(queryText, ZAKONI_DIM) : Promise.resolve(null),
    praksaCount > 0 ? embedQuery(queryText, PRAKSA_DIM) : Promise.resolve(null),
    supabase.rpc('get_dostupni_zakoni'),
    getPraksaCatalog(),
  ]);

  const dostupniZakoni: string[] = (dzRes.data || []).map((z: any) => z.naziv_zakona);
  const dostupnaPraksa = catalog
    .map((c) => c.naziv_datoteke)
    .filter((name) => matchesPraksaScope(name, filterScope));

  const [zakoniRes, praksa] = await Promise.all([
    emb768 && zakoniCount > 0
      ? supabase.rpc('match_zakoni', {
          query_embedding: emb768,
          match_threshold: 0.5,
          match_count: zakoniCount,
        })
      : Promise.resolve({ data: [], error: null }),
    praksaCount > 0
      ? searchPraksaHybrid({
          queryText,
          keywords: extracted,
          catalog,
          filterScope,
          casePodrucje,
          preferredIshod,
          preferAdvisorDecisions,
          praksaCount,
          queryEmbedding3072: emb3072,
        })
      : Promise.resolve([] as PraksaIsjecak[]),
  ]);

  if (zakoniRes.error) console.error('match_zakoni greška:', zakoniRes.error.message);

  const semantickiZakoni: ZakonClanak[] = (zakoniRes.data || []).map((z: any) => ({
    ...z,
    izvor: 'semanticki' as const,
  }));

  let zakoni: ZakonClanak[] = [];
  if (zakoniCount > 0) {
    const zakonUPitanju = detectZakon(
      queryText + '\n' + extraTextForRefs.slice(0, 4000),
      dostupniZakoni
    );
    const defaultZakonSpis =
      zakonUPitanju || dostupniZakoni.find((n) => /općem upravnom postupku/i.test(n)) || null;
    const refsPitanje = extractArticleRefs(
      queryText + '\n' + extraTextForRefs,
      dostupniZakoni,
      defaultZakonSpis
    );

    const defaultZakonPraksa =
      dostupniZakoni.find((n) => /općem upravnom postupku/i.test(n)) || null;
    const refsPraksa = extractArticleRefs(
      praksa.map((p) => p.sadrzaj).join('\n'),
      dostupniZakoni,
      defaultZakonPraksa
    );

    const [citiraniPitanje, citiraniPraksa] = await Promise.all([
      fetchArticles(refsPitanje, 'citiran_u_pitanju', 12),
      fetchArticles(refsPraksa, 'citiran_u_praksi', 10),
    ]);

    const seen = new Set<string>();
    for (const z of [...citiraniPitanje, ...semantickiZakoni, ...citiraniPraksa]) {
      const key = `${z.naziv_zakona}|${z.clanak_broj.replace(/\.$/, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      zakoni.push(z);
    }
  }

  console.log(
    `RAG [scope=${filterScope}, podrucje=${casePodrucje || '-'}]: ` +
      `ključne riječi=[${extracted.map((k) => k.label).join(', ')}], ` +
      `zakoni=${zakoni.length}, odluka prakse=${praksa.length}`
  );

  return {
    zakoni,
    praksa,
    dostupniZakoni,
    dostupnaPraksa,
    extractedKeywords: extracted.map((k) => k.label),
  };
}

const IZVOR_LABEL: Record<ZakonClanak['izvor'], string> = {
  semanticki: 'pronađeno semantičkom pretragom',
  citiran_u_pitanju: 'citirano u spisu ili upitu',
  citiran_u_praksi: 'citirano u pronađenoj praksi',
};

export function formatZakoni(zakoni: ZakonClanak[]): string {
  if (zakoni.length === 0) return 'Nema relevantnih članaka zakona.';
  return zakoni
    .map(
      (z) =>
        `<clanak zakon="${z.naziv_zakona}" broj="${z.clanak_broj}" izvor="${IZVOR_LABEL[z.izvor]}">\n${z.tekst}\n</clanak>`
    )
    .join('\n\n');
}

export function formatPraksa(praksa: PraksaIsjecak[]): string {
  if (praksa.length === 0) return 'Nema relevantne upravne ni sudske prakse za odabrani filtar.';
  return praksa
    .map(
      (p) =>
        `<odluka naziv="${p.naziv_datoteke}" vrsta="${p.vrsta}" podrucje="${p.podrucje}"${
          p.godina ? ` godina="${p.godina}"` : ''
        } podudarnost="${p.similarity ? Math.round(p.similarity * 100) + '%' : 'N/A'}"${
          p.matchedKeywords && p.matchedKeywords.length > 0
            ? ` kljucne_rijeci="${p.matchedKeywords.join(', ')}"`
            : ''
        }>\n${p.sadrzaj}\n</odluka>`
    )
    .join('\n\n');
}
