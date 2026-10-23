import { supabase } from '@/lib/supabase';
import { PropisiTable, ClanakItem } from './PropisiTable';

export const revalidate = 0; // Onemogućava caching kako bi uvijek vidjeli najnovije podatke

export default async function PropisiPage() {
  // Paginirani dohvat članaka u blokovima od 1000 kako bismo zaobišli PostgREST limit
  const allArticles: ClanakItem[] = [];
  let from = 0;
  const batchSize = 1000;
  let fetchError: string | null = null;

  while (true) {
    const { data, error } = await supabase
      .from('zakoni')
      .select('id, naziv_zakona, clanak_broj, tekst')
      .range(from, from + batchSize - 1);

    if (error) {
      fetchError = error.message;
      break;
    }

    if (!data || data.length === 0) break;

    for (const item of data) {
      allArticles.push({
        id: item.id,
        naziv_zakona: item.naziv_zakona,
        clanak_broj: item.clanak_broj,
        tekst: item.tekst,
      });
    }

    if (data.length < batchSize) break;
    from += batchSize;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            §
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pregled baze propisa</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Strukturirani zakoni, uredbe i pravilnici iz područja upravnog postupka i vodnog gospodarstva
            </p>
          </div>
        </div>
      </header>

      {fetchError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
          Greška pri dohvaćanju baze propisa: {fetchError}
        </div>
      ) : (
        <PropisiTable articles={allArticles} />
      )}
    </div>
  );
}
