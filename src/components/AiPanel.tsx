'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function AiPanel({ predmetId }: { predmetId: string }) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zalbe, setZalbe] = useState<any[]>([]);

  useEffect(() => {
    // Fetch available documents, specially "Žalba"
    async function fetchDocs() {
      const { data } = await supabase
        .from('dokumenti')
        .select('id, tip_dokumenta')
        .eq('predmet_id', predmetId);
      
      if (data) {
        const zalbeDocs = data.filter(d => d.tip_dokumenta === 'Žalba' || d.tip_dokumenta === 'Prvostupanjsko rješenje');
        setZalbe(zalbeDocs);
        if (zalbeDocs.length > 0) {
          setDocumentId(zalbeDocs[0].id);
        }
      }
    }
    fetchDocs();
  }, [predmetId]);

  async function handleAnalyze() {
    if (!documentId) {
      setError("Nije odabran dokument za analizu.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Greška pri komunikaciji s API-jem');
      }

      setAnalysis(data.analysis);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Pojavila se greška prilikom analize.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          AI Analiza
        </h2>
      </div>
      <div className="flex-1 p-4 flex flex-col overflow-y-auto">
        {!analysis && !isAnalyzing && (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p className="text-sm text-slate-500">
              AI Asistent je spreman pregledati dokumente i pripremiti analizu slučaja.
            </p>
            
            {zalbe.length > 0 ? (
              <div className="flex flex-col gap-2 w-full mt-4">
                <select 
                  className="px-3 py-2 border border-slate-300 rounded-md text-sm w-full"
                  value={documentId || ''}
                  onChange={(e) => setDocumentId(e.target.value)}
                >
                  {zalbe.map(z => (
                    <option key={z.id} value={z.id}>{z.tip_dokumenta}</option>
                  ))}
                </select>
                <button 
                  onClick={handleAnalyze}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Analiziraj dokument
                </button>
              </div>
            ) : (
              <p className="text-xs text-orange-600 mt-2">
                Prvo učitajte dokument (npr. Žalbu) u lijevom stupcu. Osvježite stranicu nakon uploada.
              </p>
            )}

            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
          </div>
        )}

        {isAnalyzing && (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            <p className="text-sm text-slate-500 animate-pulse">Analiziram dokument, molim pričekajte...</p>
          </div>
        )}

        {analysis && !isAnalyzing && (
          <div className="flex-1 flex flex-col h-full">
            <h3 className="font-semibold text-sm text-slate-800 mb-3">Ključni navodi:</h3>
            <div className="flex-1 overflow-y-auto text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 p-4 rounded-lg border border-slate-200 whitespace-pre-wrap">
              {analysis}
            </div>
            <button 
              onClick={() => setAnalysis(null)}
              className="mt-4 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors text-sm"
            >
              Nova analiza
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
