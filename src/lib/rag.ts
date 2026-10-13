import { supabaseServer as supabase } from '@/lib/supabase-server';
import { google } from '@ai-sdk/google';
import { embed } from 'ai';

/**
 * VAŽNO: tablice u bazi koriste različite dimenzije embeddinga:
 *  - `zakoni`  -> vector(768)  (scripts/scrape-zakon.ts)
 *  - `praksa`  -> vector(3072) (stariji seed, zadana dimenzija gemini-embedding-001)
 * Ako se pošalje kriva dimenzija, Supabase RPC vrati grešku "different vector dimensions"
 * i pretraga tiho vrati 0 rezultata. Zato za svaku tablicu radimo embedding odgovarajuće dimenzije.
 */
const ZAKONI_DIM = 768;
const PRAKSA_DIM = 3072;

const EMBEDDING_MODEL = 'gemini-embedding-001';

// Kratice koje se često koriste u rješenjima i presudama
const KRATICE_ZAKONA: Record<string, RegExp> = {
  'Zakon o općem upravnom postupku': /\bZUP\w*\b/,
  'Zakon o upravnim sporovima': /\bZUS\w*\b/,
};

export type ZakonClanak = {
  id: number;
  naziv_zakona: string;
  clanak_broj: string;
  tekst: string;
  similarity?: number;
  izvor: 'semanticki' | 'citiran_u_pitanju' | 'citiran_u_praksi';
};

export type PraksaIsjecak = {
  id: number;
  naziv_datoteke: string;
  sadrzaj: string;
  similarity?: number;
};

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
  return naziv.replace(/^zakon\s+o\s+/i, '').toLowerCase();
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
  const re = /(?<![a-zA-ZčćžšđČĆŽŠĐ])(?:članak|članka|članku|člankom|članaka|člancima|članci|čl\.)\s*((?:\d+[a-z]?\.?(?:\s*(?:stavak|stavka|st\.|točka|točke|toč\.|t\.)\s*\d+\.?)*\s*(?:,|i|te|ili)?\s*)+)/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Ukloni "stavak X", "točka Y" da ostanu samo brojevi članaka
    const numsPart = m[1].replace(/(?:stavak|stavka|st\.|točka|točke|toč\.|t\.)\s*\d+\.?/gi, ' ');
    const brojevi = numsPart.match(/\d+[a-z]?/g) || [];

    const window = text.slice(m.index, m.index + m[0].length + 160);
    const zakon = detectZakon(window, nazivi) || defaultZakon;
    if (!zakon) continue;

    for (const broj of brojevi) {
      refs.push({ zakon, broj });
    }
  }

  // Dedupe
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
  izvor: ZakonClanak['izvor'],
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
 * Glavna RAG funkcija:
 *  1. semantička pretraga zakona i prakse (s ispravnim dimenzijama),
 *  2. izravno dohvaćanje članaka koje korisnik spominje u pitanju,
 *  3. "povezivanje": dohvaćanje članaka zakona koje citiraju pronađeni isječci prakse.
 */
export async function searchKnowledge(
  queryText: string,
  opts: { zakoniCount?: number; praksaCount?: number; extraTextForRefs?: string } = {}
): Promise<KnowledgeResult> {
  const { zakoniCount = 8, praksaCount = 5, extraTextForRefs = '' } = opts;

  const [emb768, emb3072, dzRes, dpRes] = await Promise.all([
    embedQuery(queryText, ZAKONI_DIM),
    embedQuery(queryText, PRAKSA_DIM),
    supabase.rpc('get_dostupni_zakoni'),
    supabase.rpc('get_dostupna_praksa'),
  ]);

  const dostupniZakoni: string[] = (dzRes.data || []).map((z: any) => z.naziv_zakona);
  const dostupnaPraksa: string[] = (dpRes.data || []).map((p: any) => p.naziv_datoteke);

  const [zakoniRes, praksaRes] = await Promise.all([
    supabase.rpc('match_zakoni', { query_embedding: emb768, match_threshold: 0.55, match_count: zakoniCount }),
    supabase.rpc('match_praksa', { query_embedding: emb3072, match_threshold: 0.4, match_count: praksaCount }),
  ]);

  if (zakoniRes.error) console.error('match_zakoni greška:', zakoniRes.error.message);
  if (praksaRes.error) console.error('match_praksa greška:', praksaRes.error.message);

  const semantickiZakoni: ZakonClanak[] = (zakoniRes.data || []).map((z: any) => ({ ...z, izvor: 'semanticki' }));
  const praksa: PraksaIsjecak[] = praksaRes.data || [];

  // Članci koje korisnik izravno spominje ("što kaže članak 2. ZUP-a?")
  const zakonUPitanju = detectZakon(queryText, dostupniZakoni);
  const refsPitanje = extractArticleRefs(queryText + '\n' + extraTextForRefs, dostupniZakoni, zakonUPitanju);

  // Članci koje citira pronađena praksa (rješenja u upravnom postupku najčešće se pozivaju na ZUP)
  const defaultZakonPraksa = dostupniZakoni.find((n) => /općem upravnom postupku/i.test(n)) || null;
  const refsPraksa = extractArticleRefs(praksa.map((p) => p.sadrzaj).join('\n'), dostupniZakoni, defaultZakonPraksa);

  const [citiraniPitanje, citiraniPraksa] = await Promise.all([
    fetchArticles(refsPitanje, 'citiran_u_pitanju', 10),
    fetchArticles(refsPraksa, 'citiran_u_praksi', 10),
  ]);

  // Spoji i ukloni duplikate (prioritet: pitanje > semantički > praksa)
  const seen = new Set<string>();
  const zakoni: ZakonClanak[] = [];
  for (const z of [...citiraniPitanje, ...semantickiZakoni, ...citiraniPraksa]) {
    const key = `${z.naziv_zakona}|${z.clanak_broj.replace(/\.$/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    zakoni.push(z);
  }

  console.log(
    `RAG: semantički zakoni=${semantickiZakoni.length}, citirani u pitanju=${citiraniPitanje.length}, ` +
      `citirani u praksi=${citiraniPraksa.length}, praksa=${praksa.length}`
  );

  return { zakoni, praksa, dostupniZakoni, dostupnaPraksa };
}

const IZVOR_LABEL: Record<ZakonClanak['izvor'], string> = {
  semanticki: 'pronađeno pretragom',
  citiran_u_pitanju: 'spomenuto u pitanju',
  citiran_u_praksi: 'citirano u sudskoj praksi',
};

export function formatZakoni(zakoni: ZakonClanak[]): string {
  if (zakoni.length === 0) return 'Nema relevantnih članaka zakona.';
  return zakoni
    .map((z) => `<clanak zakon="${z.naziv_zakona}" broj="${z.clanak_broj}" izvor="${IZVOR_LABEL[z.izvor]}">\n${z.tekst}\n</clanak>`)
    .join('\n\n');
}

export function formatPraksa(praksa: PraksaIsjecak[]): string {
  if (praksa.length === 0) return 'Nema relevantne sudske prakse.';
  return praksa
    .map((p) => `<isjecak dokument="${p.naziv_datoteke}">\n${p.sadrzaj}\n</isjecak>`)
    .join('\n\n');
}
