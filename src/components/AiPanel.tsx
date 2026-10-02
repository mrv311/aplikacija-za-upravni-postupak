'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useChat } from '@ai-sdk/react';
import { deleteDocument } from '@/app/actions/documentActions';

export function AiPanel({ predmetId }: { predmetId: string }) {
  const [dokumenti, setDokumenti] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [modelPreference, setModelPreference] = useState<'pro' | 'flash'>('pro');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    api: '/api/chat',
    body: { predmetId },
    onError: (err) => {
      setError(err.message || 'Greška u komunikaciji s AI asistentom.');
    }
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || input.trim() === '' || isLoading) return;
    sendMessage({ text: input }, { body: { predmetId, modelPreference } });
    setInput('');
  };

  useEffect(() => {
    fetchDocs();
  }, [predmetId]);

  async function fetchDocs() {
    const { data } = await supabase
      .from('dokumenti')
      .select('id, tip_dokumenta, storage_url')
      .eq('predmet_id', predmetId);
    
    if (data) {
      setDokumenti(data);
    }
  }

  async function handleRemoveDoc(id: string, storageUrl: string) {
    if (!confirm('Jeste li sigurni da želite ukloniti ovaj dokument iz spisa?')) return;
    try {
      const result = await deleteDocument(id, storageUrl);
      if (result.error) throw new Error(result.error);
      fetchDocs();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Greška pri brisanju dokumenta.');
    }
  }

  return (
    <section className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          AI Analiza & Chat
        </h2>
        <div className="flex items-center gap-3">
          <select 
            value={modelPreference}
            onChange={(e) => setModelPreference(e.target.value as 'pro' | 'flash')}
            className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            title="Odaberite razinu inteligencije asistenta"
          >
            <option value="pro">Pro (Duboka analiza)</option>
            <option value="flash">Flash (Brzi odgovori)</option>
          </select>
          <button onClick={fetchDocs} className="text-xs text-blue-600 hover:underline">
            Osvježi
          </button>
        </div>
      </div>
      
      {/* Prikaz dokumenata u spisu */}
      <div className="p-3 bg-slate-50 border-b border-slate-200">
        <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">Učitani dokumenti u spisu</p>
        {dokumenti.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Nema dokumenata.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dokumenti.map(doc => (
              <div key={doc.id} className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-700 shadow-sm">
                <span className="truncate max-w-[120px]">{doc.tip_dokumenta}</span>
                <button 
                  onClick={() => handleRemoveDoc(doc.id, doc.storage_url)}
                  className="text-slate-400 hover:text-red-500 transition-colors ml-1"
                  title="Ukloni dokument"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 flex flex-col overflow-y-auto space-y-4 bg-slate-50/50">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p className="text-sm text-slate-500 max-w-[80%]">
              AI Asistent je spreman pregledati dokumente i pripremiti analizu slučaja. Pokrenite chat ili upišite &quot;Analiziraj&quot;.
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col max-w-[85%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
            <span className={`text-xs mb-1 ${m.role === 'user' ? 'text-right text-slate-400' : 'text-slate-400'}`}>
              {m.role === 'user' ? 'Vi' : 'AI Asistent'}
            </span>
            <div className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
              {m.parts.map((part, index) => {
                if (part.type === 'text') {
                  return <span key={index}>{part.text}</span>;
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="self-start flex flex-col max-w-[85%]">
            <span className="text-xs mb-1 text-slate-400">AI Asistent</span>
            <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-500 rounded-bl-none shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-3 bg-white border-t border-slate-200">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
            value={input}
            onChange={handleInputChange}
            placeholder="Pitajte asistenta ili upišite 'Analiziraj'..."
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input || input.trim() === ''}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center min-w-[80px]"
          >
            {isLoading ? '...' : 'Pošalji'}
          </button>
        </form>
      </div>
    </section>
  );
}
