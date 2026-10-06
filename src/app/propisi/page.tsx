import { supabase } from '@/lib/supabase';
import { PropisiTable } from './PropisiTable';

export const revalidate = 0; // Onemogućava caching kako bi uvijek vidjeli najnovije podatke

export default async function PropisiPage() {
  // Dohvaćamo samo potrebne stupce
  const { data: zakoni, error } = await supabase
    .from('zakoni')
    .select('naziv_zakona');

  // Grupiranje po nazivu zakona koristeći Map za računanje broja članaka
  const docMap = new Map<string, number>();
  
  if (zakoni) {
    for (const zakon of zakoni) {
      if (zakon.naziv_zakona) {
        const trenutno = docMap.get(zakon.naziv_zakona) || 0;
        docMap.set(zakon.naziv_zakona, trenutno + 1);
      }
    }
  }
  
  // Pretvaranje Mape natrag u niz za prikaz
  const documents = Array.from(docMap.entries())
    .map(([naziv_zakona, ukupno_clanaka]) => ({
      naziv_zakona,
      ukupno_clanaka
    }))
    // Sortiranje abecedno
    .sort((a, b) => a.naziv_zakona.localeCompare(b.naziv_zakona));

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pregled baze propisa</h1>
        <p className="text-slate-500 mt-1">Informativni pregled zakona i propisa dostupnih RAG asistentu</p>
      </header>

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Greška pri dohvaćanju baze: {error.message}
        </div>
      ) : (
        <PropisiTable documents={documents} />
      )}
    </div>
  );
}
