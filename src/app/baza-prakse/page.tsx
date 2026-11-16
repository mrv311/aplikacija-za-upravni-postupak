import { supabase } from '@/lib/supabase';
import { BazaPrakseTable } from './BazaPrakseTable';
import { BookOpen } from 'lucide-react';

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-2xs shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Pregled baze prakse
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Anonimizirana drugostupanjska rješenja i presude upravnih sudova RH u RAG sustavu
            </p>
          </div>
        </div>
      </header>

      {fetchError ? (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 p-4 rounded-xl text-sm">
          Greška pri dohvaćanju baze: {fetchError}
        </div>
      ) : (
        <BazaPrakseTable documents={documents} />
      )}
    </div>
  );
}
