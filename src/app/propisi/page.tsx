import { supabase } from '@/lib/supabase';
import { PropisiTable, ClanakItem } from './PropisiTable';
import { readStoredPropisiStatus } from '@/lib/propisi-checker';
import { PropisiStatusCard } from '@/components/propisi/PropisiStatusCard';
import structureData from '@/data/propisi-structure.json';

export const revalidate = 0; // Onemogućava caching kako bi uvijek vidjeli najnovije podatke

interface StructureEntry {
  naslov?: string;
  struktura?: string;
  dio?: string;
  glava?: string;
  poglavlje?: string;
  odjeljak?: string;
}

export default async function PropisiPage() {
  const allArticles: ClanakItem[] = [];
  let from = 0;
  const batchSize = 1000;
  let fetchError: string | null = null;
  const structureMap = structureData as Record<string, Record<string, StructureEntry>>;

  // Pokušaj najprije dohvatiti sa stupcima strukture, s automatskim povratom ako stupci još nisu migrirani u bazi
  let selectColumns = 'id, naziv_zakona, clanak_broj, tekst, naslov, struktura, dio, glava, poglavlje, odjeljak';
  let usingExtendedColumns = true;

  while (true) {
    let res = await supabase
      .from('zakoni')
      .select(selectColumns as any)
      .range(from, from + batchSize - 1);

    // Ako baza javi da stupci naslov/struktura ne postoje, vrati se na osnovne stupce
    if (res.error && usingExtendedColumns && res.error.message?.includes('column')) {
      usingExtendedColumns = false;
      selectColumns = 'id, naziv_zakona, clanak_broj, tekst';
      res = await supabase
        .from('zakoni')
        .select(selectColumns as any)
        .range(from, from + batchSize - 1);
    }

    if (res.error) {
      fetchError = res.error.message;
      break;
    }

    const rows = (res.data || []) as any[];
    if (rows.length === 0) break;

    for (const item of rows) {
      const artBroj = (item.clanak_broj || '').trim();
      const cleanNum = artBroj.replace(/^(?:članak|clanak)\s+/i, '').replace(/\.$/, '').trim();

      // Pronađi strukturu u katalogu prema nekoliko mogućih formata ključa
      const lawMeta = structureMap[item.naziv_zakona];
      const meta = lawMeta
        ? lawMeta[artBroj] ||
          lawMeta[`Članak ${cleanNum}.`] ||
          lawMeta[`Članak ${cleanNum}`] ||
          lawMeta[cleanNum]
        : undefined;

      allArticles.push({
        id: item.id,
        naziv_zakona: item.naziv_zakona,
        clanak_broj: item.clanak_broj,
        tekst: item.tekst,
        naslov: item.naslov || meta?.naslov,
        struktura: item.struktura || meta?.struktura,
        dio: item.dio || meta?.dio,
        glava: item.glava || meta?.glava,
        poglavlje: item.poglavlje || meta?.poglavlje,
        odjeljak: item.odjeljak || meta?.odjeljak,
      });
    }

    if (rows.length < batchSize) break;
    from += batchSize;
  }

  const checkStatus = await readStoredPropisiStatus();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
            §
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Pregled baze propisa</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
              Strukturirani zakoni, uredbe i pravilnici iz područja upravnog postupka i vodnog gospodarstva
            </p>
          </div>
        </div>

        {checkStatus && <PropisiStatusCard initialStatus={checkStatus} />}
      </header>

      {fetchError ? (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm">
          Greška pri dohvaćanju baze propisa: {fetchError}
        </div>
      ) : (
        <PropisiTable articles={allArticles} />
      )}
    </div>
  );
}
