import { supabase } from '@/lib/supabase';
import { DocumentManager } from '@/components/DocumentManager';
import { AiPanel } from '@/components/AiPanel';
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
          <AiPanel predmetId={predmet.id} />

        </div>
      </main>
    </div>
  );
}
