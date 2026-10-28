import { supabaseServer as supabase } from '@/lib/supabase-server';
import NewPredmetButton from '@/components/NewPredmetButton';
import PredmetiTable from '@/components/PredmetiTable';
import { enrichPredmetRow, type EnrichedPredmet } from '@/lib/predmet-meta';
import { Inbox, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { data: predmeti, error } = await supabase
    .from('predmeti')
    .select('*, dokumenti(id, tip_dokumenta, storage_url)')
    .eq('status', 'aktivan')
    .order('datum_zaprimanja', { ascending: false });

  if (error) {
    console.error('Supabase Error fetch aktivni predmeti:', error);
  }

  const aktivniLista: EnrichedPredmet[] = (predmeti || []).map(enrichPredmetRow);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Zaglavlje stranice */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-2xs">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Aktivni predmeti</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Drugostupanjski upravni predmeti u radu, praćenje zakonskog roka (60 dana) i faza obrade
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NewPredmetButton />
        </div>
      </header>

      {/* Prikaz greške ako postoji */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-semibold">Greška pri dohvaćanju aktivnih predmeta:</p>
            <p className="text-xs text-rose-700 mt-0.5">{error.message}</p>
          </div>
        </div>
      )}

      {/* Interaktivna tablica s praćenjem ZUP roka, fazama, uređivanjem, arhiviranjem i brisanjem */}
      <PredmetiTable initialPredmeti={aktivniLista} type="aktivni" />
    </div>
  );
}
