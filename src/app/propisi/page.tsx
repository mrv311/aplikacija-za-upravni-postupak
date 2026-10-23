import { supabase } from '@/lib/supabase';
import { PropisiTable, ClanakItem } from './PropisiTable';
import fs from 'fs/promises';
import path from 'path';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export const revalidate = 0; // Onemogućava caching kako bi uvijek vidjeli najnovije podatke

interface PropisiStatusFile {
  checkedAt: string;
  portalInfo?: string;
  totalArticlesInDb: number;
  allUpToDate: boolean;
  outdatedCount: number;
  results: {
    kratica: string;
    naziv: string;
    status: 'AZURNO' | 'ZASTARJELO' | 'UPOZORENJE';
    napomena: string;
  }[];
}

async function getPropisiStatus(): Promise<PropisiStatusFile | null> {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'propisi-status.json');
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as PropisiStatusFile;
  } catch {
    return null;
  }
}

export default async function PropisiPage() {
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

  const checkStatus = await getPropisiStatus();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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

        {checkStatus && (
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs font-medium ${
              checkStatus.allUpToDate
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                : 'bg-amber-50/80 border-amber-200 text-amber-800'
            }`}
          >
            {checkStatus.allUpToDate ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <div>
              <div className="font-semibold">
                {checkStatus.allUpToDate
                  ? 'Svi propisi (14/14) su 100% ažurni s Narodnim novinama'
                  : `Dostupne nove izmjene za ${checkStatus.outdatedCount} propisa`}
              </div>
              <div className="text-[11px] opacity-80 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                <span>
                  Zadnja tjedna provjera: {new Date(checkStatus.checkedAt).toLocaleString('hr-HR')}
                </span>
              </div>
            </div>
          </div>
        )}
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
