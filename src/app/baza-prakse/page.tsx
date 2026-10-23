import { supabase } from '@/lib/supabase';
import { BazaPrakseTable } from './BazaPrakseTable';

export const revalidate = 0; // Onemogućava caching kako bi uvijek vidjeli najnovije podatke

export default async function BazaPraksePage() {
  // Dohvaćamo samo prvi dio (chunk_index: 0) svakog dokumenta.
  // Koristimo paginaciju u blokovima od 1000 kako bismo zaobišli PostgREST default limit
  // i sigurno povukli svih 1300+ dokumenata uz maksimalnu brzinu.
  const docMap = new Map<string, number>();
  let from = 0;
  const batchSize = 1000;
  let fetchError: string | null = null;

  while (true) {
    const { data: chunks, error } = await supabase
      .from('praksa')
      .select('naziv_datoteke, ukupno_chunkova')
      .eq('chunk_index', 0)
      .range(from, from + batchSize - 1);

    if (error) {
      fetchError = error.message;
      break;
    }

    if (!chunks || chunks.length === 0) break;

    for (const chunk of chunks) {
      if (!docMap.has(chunk.naziv_datoteke)) {
        docMap.set(chunk.naziv_datoteke, chunk.ukupno_chunkova || 1);
      }
    }

    if (chunks.length < batchSize) break;
    from += batchSize;
  }
  
  // Pretvaranje Mape natrag u niz za prikaz
  const documents = Array.from(docMap.entries())
    .map(([naziv_datoteke, ukupno_chunkova]) => ({
      naziv_datoteke,
      ukupno_chunkova
    }))
    // Sortiranje abecedno
    .sort((a, b) => a.naziv_datoteke.localeCompare(b.naziv_datoteke));

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pregled baze prakse</h1>
        <p className="text-slate-500 mt-1">Informativni pregled učitanih dokumenata u RAG sustav</p>
      </header>

      {fetchError ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Greška pri dohvaćanju baze: {fetchError}
        </div>
      ) : (
        <BazaPrakseTable documents={documents} />
      )}
    </div>
  );
}
