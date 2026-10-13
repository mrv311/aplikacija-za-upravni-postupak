import { supabase } from '@/lib/supabase';
import PredmetiTable, { Predmet } from '@/components/PredmetiTable';
import { Archive, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ArhivaPage() {
  const { data: predmeti, error } = await supabase
    .from('predmeti')
    .select('*')
    .eq('status', 'arhiviran')
    .order('datum_zaprimanja', { ascending: false });

  if (error) {
    console.error('Supabase Error fetch arhivirani predmeti:', error);
  }

  const arhiviraniLista: Predmet[] = (predmeti as Predmet[]) || [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Zaglavlje stranice */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 shadow-2xs">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Arhiva predmeta (A/A)
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Riješeni i arhivirani drugostupanjski upravni predmeti (ad acta)
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Prikaz greške ako postoji */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-semibold">Greška pri dohvaćanju arhiviranih predmeta:</p>
            <p className="text-xs text-rose-700 mt-0.5">{error.message}</p>
          </div>
        </div>
      )}

      {/* Interaktivna tablica arhiviranih predmeta s opcijom "Vrati u aktivne" */}
      <PredmetiTable initialPredmeti={arhiviraniLista} type="arhiva" />
    </div>
  );
}
