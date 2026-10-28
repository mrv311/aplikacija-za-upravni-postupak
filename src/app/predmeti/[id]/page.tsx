import { supabaseServer as supabase } from '@/lib/supabase-server';
import { DocumentManager } from '@/components/DocumentManager';
import { AiPanel } from '@/components/AiPanel';
import { PredmetHeaderActions } from '@/components/PredmetHeaderActions';
import { PredmetWorkspace } from '@/components/PredmetWorkspace';
import { enrichPredmetRow } from '@/lib/predmet-meta';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PredmetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: rawPredmet, error } = await supabase
    .from('predmeti')
    .select('*, dokumenti(id, tip_dokumenta, storage_url)')
    .eq('id', id)
    .single();

  if (error || !rawPredmet) {
    notFound();
  }

  const predmet = enrichPredmetRow(rawPredmet);
  const backHref = predmet.status === 'arhiviran' ? '/arhiva' : '/';
  const backLabel =
    predmet.status === 'arhiviran' ? '← Natrag u Arhivu (A/A)' : '← Natrag na aktivne predmete';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Zaglavlje predmeta s potpunim upravljanjem */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 sm:px-8 py-3.5 shrink-0 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <Link
            href={backHref}
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {backLabel}
          </Link>

          <PredmetHeaderActions predmet={predmet} />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {predmet.klasa}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {predmet.urbroj && (
                <>
                  <span>
                    <strong>Urbroj:</strong> {predmet.urbroj}
                  </span>
                  <span>&bull;</span>
                </>
              )}
              <span>
                <strong>Stranka:</strong> {predmet.stranka || '-'}
              </span>
              {predmet.datum_zaprimanja && (
                <>
                  <span>&bull;</span>
                  <span>
                    <strong>Primljeno:</strong>{' '}
                    {new Date(predmet.datum_zaprimanja).toLocaleDateString('hr-HR')}
                  </span>
                </>
              )}
            </div>
          </div>

          {predmet.napomena && (
            <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg italic max-w-md">
              Bilješka: „{predmet.napomena}”
            </p>
          )}
        </div>
      </header>

      {/* Fleksibilan radni prostor: podesivi omjeri, ZUP rok, mobilni tabovi */}
      <PredmetWorkspace
        predmet={predmet}
        childrenDocs={
          <DocumentManager
            predmetId={predmet.id}
            defaultPodrucje={predmet.podrucje}
            defaultIshod={predmet.ishod}
          />
        }
        childrenAi={
          <AiPanel
            predmetId={predmet.id}
            klasa={predmet.klasa}
            stranka={predmet.stranka}
          />
        }
      />
    </div>
  );
}
