import { supabase } from '@/lib/supabase';
import { DocumentManager } from '@/components/DocumentManager';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function PredmetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: predmet, error } = await supabase
    .from('predmeti')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !predmet) {
    notFound();
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-6 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            &larr; Natrag na popis
          </Link>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            predmet.status === 'Otvoren' ? 'bg-slate-100 text-slate-800' :
            predmet.status === 'U radu' ? 'bg-blue-100 text-blue-800' :
            'bg-emerald-100 text-emerald-800'
          }`}>
            {predmet.status}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{predmet.klasa}</h1>
          <div className="flex items-center space-x-4 mt-2 text-sm text-slate-500">
            <span><strong>Urbroj:</strong> {predmet.urbroj}</span>
            <span>&bull;</span>
            <span><strong>Stranka:</strong> {predmet.stranka}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-8 bg-slate-50 overflow-hidden">
        <div className="flex gap-8 h-full">
          
          {/* Left Column: Documents */}
          <section className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="font-semibold text-slate-800">Priloženi dokumenti</h2>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <DocumentManager predmetId={predmet.id} />
            </div>
          </section>

          {/* Right Column: AI Assistant */}
          <section className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                AI Analiza
              </h2>
            </div>
            <div className="flex-1 p-4 flex flex-col justify-center items-center text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <p className="text-sm text-slate-500">
                AI Asistent je spreman pregledati dokumente i pripremiti analizu slučaja.
              </p>
              <button disabled className="px-4 py-2 bg-slate-200 text-slate-400 font-medium rounded-lg cursor-not-allowed">
                Analiziraj žalbu
              </button>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
