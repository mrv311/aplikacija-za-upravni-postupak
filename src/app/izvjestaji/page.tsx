import type { Metadata } from 'next';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import IzvjestajiView from '@/components/izvjestaji/IzvjestajiView';
import { enrichPredmetRow, type EnrichedPredmet } from '@/lib/predmet-meta';
import { AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Izvještaji i analitika | Upravni postupak',
  description: 'Statistički pregled, poštivanje ZUP rokova, struktura odluka i službeni izvozi',
};

export default async function IzvjestajiPage() {
  const { data: predmeti, error } = await supabase
    .from('predmeti')
    .select('*, dokumenti(id, tip_dokumenta, storage_url)')
    .order('datum_zaprimanja', { ascending: false });

  if (error) {
    console.error('Supabase Error fetch predmeti za izvještaje:', error);
  }

  const allPredmeti: EnrichedPredmet[] = (predmeti || []).map(enrichPredmetRow);

  return (
    <div>
      {error && (
        <div className="m-8 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div>
            <p className="font-semibold">Greška pri dohvaćanju evidencije za izvještaje:</p>
            <p className="text-xs text-rose-700 mt-0.5">{error.message}</p>
          </div>
        </div>
      )}

      <IzvjestajiView initialPredmeti={allPredmeti} />
    </div>
  );
}
