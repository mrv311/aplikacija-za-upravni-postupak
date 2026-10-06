import { supabase } from '@/lib/supabase';
import { BazaPrakseTable } from './BazaPrakseTable';

export const revalidate = 0; // Onemogućava caching kako bi uvijek vidjeli najnovije podatke

export default async function BazaPraksePage() {
  // Dohvaćamo samo potrebne stupce kako bismo izbjegli povlačenje ogromnih vektora
  const { data: chunks, error } = await supabase
    .from('praksa')
    .select('naziv_datoteke, ukupno_chunkova');

  // Grupiranje po nazivu datoteke koristeći Map
  const docMap = new Map<string, number>();
  
  if (chunks) {
    for (const chunk of chunks) {
      if (!docMap.has(chunk.naziv_datoteke)) {
        docMap.set(chunk.naziv_datoteke, chunk.ukupno_chunkova || 1);
      }
    }
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

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Greška pri dohvaćanju baze: {error.message}
        </div>
      ) : (
        <BazaPrakseTable documents={documents} />
      )}
    </div>
  );
}
