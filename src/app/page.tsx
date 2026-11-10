import { supabaseServer as supabase } from '@/lib/supabase-server';
import { enrichPredmetRow, type EnrichedPredmet } from '@/lib/predmet-meta';
import { parseExcelSporoviAsync } from '@/lib/upravni-sporovi';
import MainDashboardView from '@/components/MainDashboardView';

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

  // Učitavamo sve žive upravne sporove izravno iz Excel evidencije uz uvažavanje override-a iz baze
  const { sporovi, lastModified, source } = await parseExcelSporoviAsync(false);

  return (
    <MainDashboardView
      initialSporovi={sporovi}
      initialPredmeti={aktivniLista}
      lastModified={lastModified}
      source={source}
    />
  );
}
