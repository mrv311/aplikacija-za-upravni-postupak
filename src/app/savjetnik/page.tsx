'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  Bot,
  Sparkles,
  Copy,
  Check,
  FileSpreadsheet,
  RotateCcw,
  Send,
  Square,
  ClipboardList,
  Clock,
  Scale,
  PenTool,
  Filter,
  AlertCircle,
} from 'lucide-react';
import {
  type LegalUIMessage,
  type PraksaFilterScope,
  type QuickActionTemplate,
  type RagSourcesPayload,
  PRAKSA_FILTER_OPTIONS,
  SAVJETNIK_QUICK_ACTIONS,
} from '@/lib/ai-types';
import { LegalMarkdown, copyFormattedLegalText } from '@/components/LegalMarkdown';
import { SourcesInspector } from '@/components/SourcesInspector';

function QuickActionIcon({
  name,
  className,
}: {
  name: QuickActionTemplate['iconName'];
  className?: string;
}) {
  switch (name) {
    case 'clipboard':
      return <ClipboardList className={className} />;
    case 'clock':
      return <Clock className={className} />;
    case 'scale':
      return <Scale className={className} />;
    case 'pen':
      return <PenTool className={className} />;
  }
}

export default function SavjetnikPage() {
  const [input, setInput] = useState('');
  const [modelPreference, setModelPreference] = useState<'flash' | 'pro'>('flash');
  const [filterScope, setFilterScope] = useState<PraksaFilterScope>('sve');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    status,
    error,
    clearError,
  } = useChat<LegalUIMessage>();

  const isLoading = status === 'submitted' || status === 'streaming';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const triggerPrompt = (promptText: string) => {
    if (!promptText.trim() || isLoading) return;
    clearError?.();
    sendMessage(
      { text: promptText },
      {
        body: {
          modelPreference,
          filterScope,
        },
      }
    );
  };

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input || input.trim() === '' || isLoading) return;
    const text = input.trim();
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    triggerPrompt(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  const handleResetChat = () => {
    if (messages.length === 0) return;
    if (!confirm('Želite li započeti novi razgovor u AI Savjetniku?')) return;
    if (isLoading) stop();
    setMessages([]);
    clearError?.();
  };

  const handleCopyMessage = async (msgId: string, text: string, mode: 'word' | 'plain') => {
    const ok = await copyFormattedLegalText(text, mode);
    if (ok) {
      const key = `${msgId}-${mode}`;
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 w-full overflow-hidden">
      {/* Zaglavlje + Filtar opsega baze */}
      <header className="bg-white border-b border-slate-200 px-8 py-5 shrink-0 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Savjetnik</h1>
              <p className="text-sm text-slate-500">
                Globalni pravni asistent za propise, upravnu i sudsku praksu RH
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="model-select" className="text-xs font-semibold text-slate-500">
              Model:
            </label>
            <select
              id="model-select"
              value={modelPreference}
              onChange={(e) => setModelPreference(e.target.value as 'flash' | 'pro')}
              className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold cursor-pointer"
              title="Odaberite brzinu i razinu dubine modela"
            >
              <option value="flash">⚡ Flash (Brzi odgovori)</option>
              <option value="pro">🧠 Pro (Duboka pravna analiza)</option>
            </select>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleResetChat}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                title="Očisti razgovor"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Novi upit
              </button>
            )}
          </div>
        </div>

        {/* Traka filtriranja konteksta pretrage */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 shrink-0 mr-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Opseg pretrage prakse:
          </span>
          {PRAKSA_FILTER_OPTIONS.map((opt) => {
            const active = filterScope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilterScope(opt.value)}
                title={opt.description}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Prostor razgovora */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Došlo je do greške u komunikaciji:</p>
                <p className="text-xs mt-0.5">{error.message || 'Pokušajte ponovno.'}</p>
              </div>
            </div>
          )}

          {messages.length === 0 && !error ? (
            <div className="mt-8 space-y-6">
              <div className="text-center p-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                <h2 className="text-xl font-bold text-slate-800">
                  Postavite pravno pitanje iz upravnog postupka ili prakse
                </h2>
                <p className="text-sm text-slate-500 mt-2 max-w-2xl mx-auto">
                  AI Savjetnik istovremeno pretražuje važeće zakone i podzakonske akte te anonimiziranu bazu drugostupanjskih rješenja i presuda upravnih sudova, uz prikaz točnih izvora ispod svakog odgovora.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SAVJETNIK_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => triggerPrompt(action.prompt)}
                    className="text-left p-4 rounded-xl bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 shadow-2xs hover:shadow-sm transition-all group flex items-start gap-3"
                  >
                    <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                      <QuickActionIcon name={action.iconName} className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700">
                        {action.label}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {action.shortDesc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user';
              const textContent = (m.parts || [])
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('');

              const sourcesPart = (m.parts || []).find(
                (p): p is { type: 'data-sources'; data: RagSourcesPayload } =>
                  p.type === 'data-sources'
              );

              if (isUser) {
                return (
                  <div key={m.id} className="flex flex-col items-end">
                    <span className="text-xs font-medium text-slate-400 mb-1 px-1">Vi</span>
                    <div className="max-w-[80%] rounded-2xl rounded-br-xs px-5 py-3.5 bg-blue-600 text-white text-sm leading-relaxed shadow-xs whitespace-pre-wrap">
                      {textContent}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className="flex flex-col items-start w-full">
                  <div className="w-full flex items-center justify-between mb-1.5 px-1">
                    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-blue-600" />
                      AI Savjetnik
                      {sourcesPart?.data?.modelName && (
                        <span className="text-[11px] font-normal text-slate-400">
                          ({sourcesPart.data.modelName.includes('pro') ? 'Pro' : 'Flash'})
                        </span>
                      )}
                    </span>

                    {textContent && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(m.id, textContent, 'word')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-xs font-semibold text-slate-700 hover:text-blue-700 transition-colors shadow-2xs"
                          title="Kopiraj formatirani tekst spreman za Microsoft Word"
                        >
                          {copiedKey === `${m.id}-word` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">Kopirano za Word</span>
                            </>
                          ) : (
                            <>
                              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                              <span>Kopiraj za Word</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyMessage(m.id, textContent, 'plain')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                          title="Kopiraj čisti tekst"
                        >
                          {copiedKey === `${m.id}-plain` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="w-full rounded-2xl rounded-tl-xs px-6 py-5 bg-white text-slate-800 border border-slate-200/90 shadow-xs">
                    {textContent ? (
                      <LegalMarkdown content={textContent} />
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-sm text-slate-500">
                        <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" />
                        <span
                          className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                        <span className="ml-1">Sastavljam pravno mišljenje temeljem izvora...</span>
                      </div>
                    )}

                    {sourcesPart?.data && <SourcesInspector sources={sourcesPart.data} />}
                  </div>
                </div>
              );
            })
          )}

          {status === 'submitted' && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-500 w-fit shadow-2xs">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" />
              <span
                className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
              <span>Pretražujem propise i bazu prakse...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Donja traka za unos */}
      <div className="p-4 bg-white border-t border-slate-200 shrink-0">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={onSubmit} className="flex items-end gap-3">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Upišite pravno pitanje (npr. zastara kod NUV-a, primjena čl. 116. ZUP-a)... (Enter šalje, Shift+Enter novi red)"
              disabled={isLoading}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/60 focus:bg-white transition-all text-sm text-slate-800 placeholder-slate-400 resize-none max-h-36 leading-snug"
            />
            {isLoading ? (
              <button
                type="button"
                onClick={() => stop()}
                className="px-5 py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold text-sm rounded-xl transition-colors inline-flex items-center gap-2 shrink-0"
              >
                <Square className="w-4 h-4 fill-current" />
                Zaustavi
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input || input.trim() === ''}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 px-6 rounded-xl transition-all shadow-xs hover:shadow-md disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none inline-flex items-center gap-2 shrink-0"
              >
                <Send className="w-4 h-4" />
                Pošalji
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
