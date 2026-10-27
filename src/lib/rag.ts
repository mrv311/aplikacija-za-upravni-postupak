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
 * VAŽNO: tablice u bazi koriste različite dimenzije embeddinga:
 *  - `zakoni`  -> vector(768)  (scripts/scrape-zakon.ts)
 *  - `praksa`  -> vector(3072) (zadana dimenzija gemini-embedding-001)
 * Ako se pošalje kriva dimenzija, Supabase RPC vrati grešku "different vector dimensions"
 * i pretraga tiho vrati 0 rezultata. Zato za svaku tablicu radimo embedding odgovarajuće dimenzije.
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
  'Uredba o visini naknade za uređenje voda': /\bU-?NUV\w*\b/i,
  'Pravilnik o obračunu i naplati naknade za uređenje voda': /\bP-?NUV\w*\b/i,
  'Uredba o visini naknade za zaštitu voda': /\bU-?NZZV\w*\b/i,
  'Uredba o uredskom poslovanju': /\bUUP\w*\b/i,
  'Uredba o Tarifi upravnih pristojbi': /\bUTUP\w*\b/i,
};

export type ZakonClanak = RagZakonSource;
export type PraksaIsjecak = RagPraksaSource;

export function extractMessageText(message: any): string {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.parts)) {
    return message.parts.map((p: any) => p.text || '').join(' ');
  }
  return '';
}

/**
 * Tekst za pretragu: zadnja korisnikova poruka. Ako je kratka (npr. "a što kaže stavak 2?"),
 * dodajemo i prethodno korisnikovo pitanje kako bi pretraga imala kontekst razgovora.
 */
export function buildRetrievalQuery(messages: any[]): string {
  const userMessages = messages.filter((m) => m.role === 'user').map(extractMessageText).filter(Boolean);
  const last = userMessages[userMessages.length - 1] || '';
  const prev = userMessages[userMessages.length - 2];
  if (prev && last.length < 80) return `${prev}\n${last}`;
  return last;
}

/**
 * Gradi pametan upit za semantičku pretragu spisa: stavlja korisnikov upit na vrh,
 * zatim daje prioritet tekstu Žalbe (gdje su žalbeni razlozi) te ključnim dijelovima
 * Prvostupanjskog rješenja i ostalih akata, tako da zaglavlje ne "pojede" bit spora.
 */
export function buildCaseRetrievalQuery(
  queryText: string,
  dokumenti: { tip_dokumenta: string; raw_text: string }[]
): string {
  if (!dokumenti || dokumenti.length === 0) return queryText;

  const sorted = [...dokumenti].sort((a, b) => {
    const score = (tip: string) => {
      const t = tip.toLowerCase();
      if (t.includes('žalba') || t.includes('zalba')) return 0;
      if (t.includes('rješenje') || t.includes('rjesenje')) return 1;
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
    // Uzmi početak (izreka/predmet) i sredinu/kraj (obrazloženje / žalbeni razlozi)
    const headLen = Math.floor(perDocBudget * 0.45);
    const tailLen = perDocBudget - headLen;
    const midStart = Math.max(headLen, Math.floor(raw.length * 0.35));
    return `[${doc.tip_dokumenta}]\n${raw.slice(0, headLen)}\n...\n${raw.slice(midStart, midStart + tailLen)}`;
  });

  return `${queryText}\n\n${snippets.join('\n\n')}`.slice(0, 5000);
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

async function embedQuery(text: string, dimensions: number): Promise<number[]> {
  const { embedding } = await embed({
    model: google.textEmbeddingModel(EMBEDDING_MODEL),
    value: text,
    providerOptions: {
      google: { outputDimensionality: dimensions, taskType: 'RETRIEVAL_QUERY' },
    },
  });
  return embedding;
}

/** Iz naziva zakona ("Zakon o općem upravnom postupku") izvuče dio koji se ne deklinira ("općem upravnom postupku"). */
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

/**
 * Pronalazi reference poput "članka 116. i 117. Zakona o općem upravnom postupku", "čl. 8. ZUP-a",
 * "članak 2." itd. Vraća parove (zakon, broj članka).
 * Ako u blizini reference nema naziva zakona, koristi se `defaultZakon` (ako je zadan).
 */
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

export type KnowledgeResult = {
  zakoni: ZakonClanak[];
  praksa: PraksaIsjecak[];
  dostupniZakoni: string[];
  dostupnaPraksa: string[];
};

/**
 * Grupiranje isječaka prakse po dokumentu: najviše 2 najbolja isječka iz istog akta
 * spajaju se u jedan izvor, čime osiguravamo raznolikost (više različitih odluka/presuda).
 */
function diversifyAndEnrichPraksa(
  rawRows: Array<{ id: number; naziv_datoteke: string; sadrzaj: string; similarity?: number }>,
  filterScope: PraksaFilterScope,
  maxDocs: number
): PraksaIsjecak[] {
  const filtered = rawRows.filter((row) => matchesPraksaScope(row.naziv_datoteke, filterScope));

  const grouped = new Map<
    string,
    {
      id: number;
      naziv_datoteke: string;
      chunks: string[];
      maxSimilarity: number;
    }
  >();

  for (const row of filtered) {
    const existing = grouped.get(row.naziv_datoteke);
    const sim = row.similarity ?? 0;
    if (!existing) {
      if (grouped.size >= maxDocs) continue;
      grouped.set(row.naziv_datoteke, {
        id: row.id,
        naziv_datoteke: row.naziv_datoteke,
        chunks: [row.sadrzaj],
        maxSimilarity: sim,
      });
    } else if (existing.chunks.length < 2) {
      existing.chunks.push(row.sadrzaj);
      if (sim > existing.maxSimilarity) existing.maxSimilarity = sim;
    }
  }

  return Array.from(grouped.values()).map((item) => {
    const meta = parsePraksaMetadata(item.naziv_datoteke);
    return {
      id: item.id,
      naziv_datoteke: item.naziv_datoteke,
      sadrzaj: item.chunks.join('\n\n[...]\n\n'),
      similarity: item.maxSimilarity,
      matchedChunksCount: item.chunks.length,
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

    // Potraži preklapanje između kraja `result` i početka `next` (do 320 znakova)
    const tailWindow = result.slice(-340);
    let overlapFound = 0;
    const maxProbe = Math.min(280, next.length);

    for (let len = maxProbe; len >= 25; len--) {
      const prefix = next.slice(0, len);
      const idx = tailWindow.lastIndexOf(prefix);
      if (idx !== -1 && idx + prefix.length >= tailWindow.length - 8) {
        overlapFound = len + (tailWindow.length - (idx + prefix.length));
        // Sigurnije je odrezati točno ono što se poklapa od početka `next`
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
 * Glavna RAG funkcija:
 *  1. semantička pretraga zakona i prakse (uz opcijski filter područja i diverzifikaciju odluka),
 *  2. izravno dohvaćanje članaka koje korisnik ili spis spominju,
 *  3. "povezivanje": dohvaćanje članaka zakona koje citiraju pronađeni isječci prakse.
 */
export async function searchKnowledge(
  queryText: string,
  opts: {
    zakoniCount?: number;
    praksaCount?: number;
    extraTextForRefs?: string;
    filterScope?: PraksaFilterScope;
  } = {}
): Promise<KnowledgeResult> {
  const {
    zakoniCount = 8,
    praksaCount = 6,
    extraTextForRefs = '',
    filterScope = 'sve',
  } = opts;

  const rpcPraksaCount = filterScope === 'sve' ? Math.max(16, praksaCount * 3) : 45;

  const [emb768, emb3072, dzRes, dpRes] = await Promise.all([
    embedQuery(queryText, ZAKONI_DIM),
    embedQuery(queryText, PRAKSA_DIM),
    supabase.rpc('get_dostupni_zakoni'),
    supabase.rpc('get_dostupna_praksa'),
  ]);

  const dostupniZakoni: string[] = (dzRes.data || []).map((z: any) => z.naziv_zakona);
  const svePrakse: string[] = (dpRes.data || []).map((p: any) => p.naziv_datoteke);
  const dostupnaPraksa = svePrakse.filter((name) => matchesPraksaScope(name, filterScope));

  const [zakoniRes, praksaRes] = await Promise.all([
    supabase.rpc('match_zakoni', {
      query_embedding: emb768,
      match_threshold: 0.52,
      match_count: zakoniCount,
    }),
    supabase.rpc('match_praksa', {
      query_embedding: emb3072,
      match_threshold: 0.36,
      match_count: rpcPraksaCount,
    }),
  ]);

  if (zakoniRes.error) console.error('match_zakoni greška:', zakoniRes.error.message);
  if (praksaRes.error) console.error('match_praksa greška:', praksaRes.error.message);

  const semantickiZakoni: ZakonClanak[] = (zakoniRes.data || []).map((z: any) => ({
    ...z,
    izvor: 'semanticki' as const,
  }));

  const praksa = diversifyAndEnrichPraksa(praksaRes.data || [], filterScope, praksaCount);

  // Članci koje korisnik ili sam spis izravno spominju ("čl. 116. ZUP-a", "čl. 24. ZFVG-a")
  const zakonUPitanju = detectZakon(queryText + '\n' + extraTextForRefs.slice(0, 4000), dostupniZakoni);
  const defaultZakonSpis =
    zakonUPitanju || dostupniZakoni.find((n) => /općem upravnom postupku/i.test(n)) || null;
  const refsPitanje = extractArticleRefs(
    queryText + '\n' + extraTextForRefs,
    dostupniZakoni,
    defaultZakonSpis
  );

  // Članci koje citira pronađena praksa
  const defaultZakonPraksa = dostupniZakoni.find((n) => /općem upravnom postupku/i.test(n)) || null;
  const refsPraksa = extractArticleRefs(
    praksa.map((p) => p.sadrzaj).join('\n'),
    dostupniZakoni,
    defaultZakonPraksa
  );

  const [citiraniPitanje, citiraniPraksa] = await Promise.all([
    fetchArticles(refsPitanje, 'citiran_u_pitanju', 12),
    fetchArticles(refsPraksa, 'citiran_u_praksi', 10),
  ]);

  // Spoji i ukloni duplikate (prioritet: pitanje/spis > semantički > praksa)
  const seen = new Set<string>();
  const zakoni: ZakonClanak[] = [];
  for (const z of [...citiraniPitanje, ...semantickiZakoni, ...citiraniPraksa]) {
    const key = `${z.naziv_zakona}|${z.clanak_broj.replace(/\.$/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    zakoni.push(z);
  }

  console.log(
    `RAG [scope=${filterScope}]: semantički zakoni=${semantickiZakoni.length}, ` +
      `citirani u spisu/pitanju=${citiraniPitanje.length}, citirani u praksi=${citiraniPraksa.length}, ` +
      `različitih odluka prakse=${praksa.length}`
  );

  return { zakoni, praksa, dostupniZakoni, dostupnaPraksa };
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
        } slicnost="${p.similarity ? Math.round(p.similarity * 100) + '%' : 'N/A'}">\n${p.sadrzaj}\n</odluka>`
    )
    .join('\n\n');
}
