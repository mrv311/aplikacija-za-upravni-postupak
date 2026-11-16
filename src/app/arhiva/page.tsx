import { supabaseServer as supabase } from '@/lib/supabase-server';
import PredmetiTable from '@/components/PredmetiTable';
import { enrichPredmetRow, type EnrichedPredmet } from '@/lib/predmet-meta';
import { Archive, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ArhivaPage() {
  const { data: predmeti, error } = await supabase
    .from('predmeti')
    .select('*, dokumenti(id, tip_dokumenta, storage_url)')
    .eq('status', 'arhiviran')
    .order('datum_zaprimanja', { ascending: false });

  if (error) {
    console.error('Supabase Error fetch arhivirani predmeti:', error);
  }

  const arhiviraniLista: EnrichedPredmet[] = (predmeti || []).map(enrichPredmetRow);

  return (
    <div className="p-4 sm:px-6 sm:py-6 w-full max-w-[1600px] mx-auto space-y-6">
      {/* Zaglavlje stranice */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-2xs shrink-0">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Arhiva predmeta (A/A)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Riješeni i arhivirani drugostupanjski upravni predmeti s evidencijom ishoda
            </p>
          </div>
        </div>
      </header>

      {/* Prikaz greške ako postoji */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-3 text-rose-800 dark:text-rose-200 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <p className="font-semibold">Greška pri dohvaćanju arhiviranih predmeta:</p>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error.message}</p>
          </div>
        </div>
      )}

      {/* Interaktivna tablica arhiviranih predmeta */}
      <PredmetiTable initialPredmeti={arhiviraniLista} type="arhiva" />
    </div>
  );
}
