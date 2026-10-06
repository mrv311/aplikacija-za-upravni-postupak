'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

export default function SavjetnikPage() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat();
  const isLoading = status === 'submitted' || status === 'streaming';
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input || input.trim() === '' || isLoading) return;
    
    // Koristimo sendMessage umjesto append (novo u AI SDK-u koji koristite)
    sendMessage({ text: input });
    
    setInput('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 w-full">
      <header className="bg-white border-b border-slate-200 px-8 py-6 shrink-0 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">✨ AI Savjetnik</h1>
        <p className="text-slate-500 mt-2 font-medium">Globalni pravni asistent temeljen na bazi zakona i sudske prakse</p>
      </header>
      
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {error && (
            <div className="p-4 mb-4 bg-red-50 border border-red-200 text-red-600 rounded-xl">
              <p className="font-semibold">Došlo je do greške:</p>
              <p className="text-sm">{error.message || 'Pokušajte ponovno.'}</p>
            </div>
          )}
          {messages.length === 0 && !error ? (
            <div className="text-center text-slate-400 mt-20 p-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-2xl font-semibold text-slate-700">Kako vam mogu pomoći danas?</p>
              <p className="text-md mt-3">Postavite pitanje o upravnom pravu, sudskoj praksi ili zakonima. Pretražujem cijelu bazu.</p>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-6 py-4 shadow-md ${
                  m.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-none font-medium' 
                    : 'bg-white text-slate-800 rounded-bl-none border border-slate-100 leading-relaxed'
                }`}>
                  <div className="whitespace-pre-wrap">
                    {m.parts?.map((part: any, index: number) => {
                      if (part.type === 'text') return <span key={index}>{part.text}</span>;
                      return null;
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white text-slate-500 rounded-2xl rounded-bl-none px-6 py-4 shadow-sm border border-slate-100 flex gap-2 items-center">
                <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce"></span>
                <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                <span className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-6 bg-white border-t border-slate-200">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={onSubmit} className="flex gap-4">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Upišite vaše pitanje..."
              className="flex-1 p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 transition-all font-medium text-slate-800 placeholder-slate-400"
              disabled={isLoading}
            />
            <button 
              type="submit"
              disabled={isLoading || !input || input.trim() === ''}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Pošalji
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
