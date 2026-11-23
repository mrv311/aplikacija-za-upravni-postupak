'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  Bot,
  Sparkles,
  Send,
  Square,
  RotateCcw,
  Copy,
  Check,
  FileSpreadsheet,
  Filter,
  AlertCircle,
  BookOpen,
  Scale,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  PRAKSA_FILTER_OPTIONS,
  type LegalUIMessage,
  type PraksaFilterScope,
  type RagSourcesPayload,
} from '@/lib/ai-types';
import {
  PROPIS_AI_QUICK_ACTIONS,
  PROPIS_DOC_ROLE_MAP,
  type PropisDocument,
  type PropisProject,
} from '@/lib/izrada-propisa-types';
import { LegalMarkdown, copyFormattedLegalText } from '@/components/LegalMarkdown';
import { SourcesInspector } from '@/components/SourcesInspector';
import {
  savePropisChatHistoryAction,
  clearPropisChatHistoryAction,
  updatePropisDocumentAction,
} from '@/app/actions/izradaPropisaActions';

interface PropisAiChatProps {
  project: PropisProject;
  documents: PropisDocument[];
  initialMessages: LegalUIMessage[];
  praksaCount: number;
  zakoniCount: number;
  onDocumentsChange: (docs: PropisDocument[]) => void;
}

function getMessageText(message: LegalUIMessage): string {
  if (!message?.parts) return '';
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function getMessageSources(message: LegalUIMessage): RagSourcesPayload | null {
  if (!message?.parts) return null;
  const part = message.parts.find((p) => p.type === 'data-sources') as
    | { type: 'data-sources'; data?: RagSourcesPayload }
    | undefined;
  return part?.data || null;
}

export function PropisAiChat({
  project,
  documents,
  initialMessages,
  praksaCount,
  zakoniCount,
  onDocumentsChange,
}: PropisAiChatProps) {
  const [input, setInput] = useState('');
  const [modelPreference, setModelPreference] = useState<'flash' | 'pro'>('flash');
  const [filterScope, setFilterScope] = useState<PraksaFilterScope>('nuv');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef<string>(JSON.stringify(initialMessages || []));

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/izrada-propisa/chat',
      }),
    []
  );

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    status,
    error,
    clearError,
  } = useChat<LegalUIMessage>({
    id: `izrada-propisa-${project.id}`,
    transport,
    messages: initialMessages,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Automatski spremi povijest razgovora kad završi odgovor
  useEffect(() => {
    if (isLoading || messages.length === 0) return;
    const serialized = JSON.stringify(messages);
    if (serialized === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      savePropisChatHistoryAction(project.id, messages).then((res) => {
        if (res.success) lastSavedRef.current = serialized;
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [messages, isLoading, project.id]);

  const activeDocs = useMemo(
    () => documents.filter((d) => d.uloga === 'aktualni_nacrt' || d.includeInAiContext),
    [documents]
  );

  const triggerPrompt = (promptText: string) => {
    if (!promptText.trim() || isLoading) return;
    clearError?.();
    sendMessage(
      { text: promptText },
      {
        body: {
          projectId: project.id,
          modelPreference,
          filterScope,
        },
      }
    );
  };

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    triggerPrompt(text);
  };

  const handleReset = async () => {
    if (messages.length === 0) return;
    if (!confirm('Očistiti povijest AI razgovora za ovaj projekt propisa?')) return;
    if (isLoading) stop();
    setMessages([]);
    lastSavedRef.current = '[]';
    await clearPropisChatHistoryAction(project.id);
  };

  const handleCopy = async (msgId: string, text: string, mode: 'word' | 'plain') => {
    const ok = await copyFormattedLegalText(text, mode);
    if (ok) {
      setCopiedKey(`${msgId}-${mode}`);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleToggleDocContext = async (doc: PropisDocument) => {
    if (doc.uloga === 'aktualni_nacrt') return;
    const nextVal = !doc.includeInAiContext;
    onDocumentsChange(
      documents.map((d) => (d.id === doc.id ? { ...d, includeInAiContext: nextVal } : d))
    );
    await updatePropisDocumentAction(project.id, doc.id, { includeInAiContext: nextVal });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col h-[calc(100vh-235px)] min-h-[540px] overflow-hidden shadow-xs">
      {/* Zaglavlje AI chata */}
      <div className="px-4 py-3 bg-slate-50/90 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              AI Nomotehnički savjetnik
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <BookOpen className="w-3 h-3" />
              Baza prakse ({praksaCount > 0 ? praksaCount.toLocaleString('hr-HR') : '2.202'})
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <Scale className="w-3 h-3" />
              Baza zakona ({zakoniCount})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setContextDrawerOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Kontekst: {activeDocs.length}/{documents.length} dok.
              {contextDrawerOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <select
              value={modelPreference}
              onChange={(e) => setModelPreference(e.target.value as 'flash' | 'pro')}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="flash">Gemini Flash (brzi)</option>
              <option value="pro">Gemini Pro (dubinska analiza)</option>
            </select>

            <button
              type="button"
              onClick={handleReset}
              disabled={messages.length === 0}
              title="Novi razgovor"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-rose-600 disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filtar opsega Baze prakse */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 mr-1">
            <Filter className="w-3 h-3" />
            Opseg Baze prakse:
          </span>
          {PRAKSA_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilterScope(opt.value)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                filterScope === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {opt.shortLabel}
            </button>
          ))}
        </div>

        {/* Sklopiva ladica za brzi odabir uključenih dokumenata projekta */}
        {contextDrawerOpen && (
          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2 max-h-44 overflow-y-auto">
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              Odaberite dokumente projekta koji ulaze u AI prompt (Aktualni nacrt je uvijek uključen):
            </div>
            {documents.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Nema učitanih dokumenata u projektu. Uvezite ih u kartici „Dokumenti i Nacrt”.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {documents.map((doc) => {
                  const isCurrent = doc.uloga === 'aktualni_nacrt';
                  const checked = isCurrent || doc.includeInAiContext;
                  return (
                    <label
                      key={doc.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                        checked
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                          : 'bg-slate-50/60 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 opacity-75'
                      } ${isCurrent ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isCurrent}
                        onChange={() => handleToggleDocContext(doc)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span className="truncate flex-1 font-medium text-slate-800 dark:text-slate-200">
                        {doc.prikazniNaziv}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {PROPIS_DOC_ROLE_MAP[doc.uloga].shortLabel}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tijelo poruka */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="max-w-3xl mx-auto py-6 space-y-5">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-md">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                AI Savjetnik za izradu propisa — {project.naziv}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                Postavite bilo koje nomotehničko ili pravno pitanje. AI istovremeno čita uključene dokumente ovog projekta, članke iz Baze zakona (ZFVG, ZOV, važeća Uredba NUV…) i relevantnu sudsku i upravnu praksu.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PROPIS_AI_QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.id}
                  type="button"
                  onClick={() => triggerPrompt(qa.prompt)}
                  className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-blue-50/60 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer"
                >
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {qa.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {qa.shortDesc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            const text = getMessageText(msg);
            const sources = !isUser ? getMessageSources(msg) : null;

            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    isUser
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                      {text}
                    </div>
                  ) : (
                    <>
                      <LegalMarkdown content={text || '...'} />
                      {sources && <SourcesInspector sources={sources} />}

                      {text && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, text, 'word')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 cursor-pointer"
                          >
                            {copiedKey === `${msg.id}-word` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <FileSpreadsheet className="w-3 h-3" />
                            )}
                            Kopiraj za Word
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, text, 'plain')}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 cursor-pointer"
                          >
                            {copiedKey === `${msg.id}-plain` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            Kopiraj tekst
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error.message || 'Greška u komunikaciji s AI savjetnikom.'}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Donja traka za unos poruke */}
      <form
        onSubmit={onSubmit}
        className="p-3 bg-slate-50/80 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 shrink-0"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Postavi pitanje o nacrtu propisa, člancima, primjedbama TDU/UZZ ili sudskoj praksi..."
            className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Square className="w-3.5 h-3.5" />
              Zaustavi
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              Pošalji
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
