import { supabaseServer as supabase } from '@/lib/supabase-server';
import { DocumentManager } from '@/components/DocumentManager';
import { AiPanel } from '@/components/AiPanel';
import { PredmetHeaderActions } from '@/components/PredmetHeaderActions';
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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Zaglavlje predmeta s potpunim upravljanjem */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <Link
            href={backHref}
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
          >
            {backLabel}
          </Link>

          <PredmetHeaderActions predmet={predmet} />
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {predmet.klasa}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-slate-600">
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
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg italic max-w-md">
              Bilješka: „{predmet.napomena}”
            </p>
          )}
        </div>
      </header>

      {/* Glavni radni prostor: Lijevo dokumenti spisa, Desno AI asistent */}
      <main className="flex-1 p-5 bg-slate-50 overflow-hidden min-h-0">
        <div className="flex gap-5 h-full min-h-0">
          {/* Lijevi stupac: Skenovi i dokumenti u spisu */}
          <section className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-sm text-slate-800">Dokumenti i skenovi u spisu</h2>
                <p className="text-[11px] text-slate-500">
                  Učitavanje skenova, provjera AI OCR teksta i slanje akata u Bazu prakse
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-slate-700">
                {predmet.broj_dokumenata} dok.
              </span>
            </div>
            <div className="flex-1 p-4 overflow-y-auto min-h-0">
              <DocumentManager
                predmetId={predmet.id}
                defaultPodrucje={predmet.podrucje}
                defaultIshod={predmet.ishod}
              />
            </div>
          </section>

          {/* Desni stupac: AI Pravni Asistent */}
          <AiPanel predmetId={predmet.id} />
        </div>
      </main>
    </div>
  );
}
