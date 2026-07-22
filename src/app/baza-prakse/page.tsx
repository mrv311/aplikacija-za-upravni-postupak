import { supabase } from '@/lib/supabase';
import { BazaPrakseList } from './BazaPrakseList';

export const revalidate = 0; // Onemogućava caching kako bi uvijek vidjeli najnovije podatke

export default async function BazaPraksePage() {
  // Dohvaćamo sve zapise osim embeddinga (vektori su preveliki i nepotrebni za prikaz)
  const { data: praksa, error } = await supabase
    .from('pravna_praksa')
    .select('naslov, kategorija, sadrzaj');

  if (error) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-6">Baza Pravne Prakse</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">
          Greška pri dohvaćanju baze: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Baza Pravne Prakse</h1>
      <p className="text-slate-500 mb-8">Pregled svih zakona i starih rješenja u vektorskoj bazi znanja.</p>

      <BazaPrakseList praksa={praksa || []} />
    </div>
  );
}
