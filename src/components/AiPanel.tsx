'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useChat } from '@ai-sdk/react';
import { deleteDocument } from '@/app/actions/documentActions';
import {
  getPredmetChatHistory,
  savePredmetChatHistory,
  clearPredmetChatHistory,
  saveDraftToSpis,
} from '@/app/actions/chatActions';
import {
  Bot,
  Sparkles,
  Copy,
  Check,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Columns2,
  RotateCcw,
  RefreshCw,
  Send,
  Square,
  ClipboardList,
  Clock,
  Scale,
  PenTool,
  FileText,
  X,
  Filter,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Save,
  CheckCircle2,
  Loader2,
  BookmarkCheck,
} from 'lucide-react';
import {
  type LegalUIMessage,
  type PraksaFilterScope,
  type QuickActionTemplate,
  type RagSourcesPayload,
  PRAKSA_FILTER_OPTIONS,
  CASE_QUICK_ACTIONS,
} from '@/lib/ai-types';
import { LegalMarkdown, copyFormattedLegalText } from '@/components/LegalMarkdown';
import { SourcesInspector } from '@/components/SourcesInspector';
import {
  META_DOC_TYPE,
  CHAT_DOC_TYPE,
  DOKUMENT_VRSTE,
  decodeDocLabel,
} from '@/lib/predmet-meta';

interface SpisDokument {
  id: string;
  tip_dokumenta: string;
  storage_url: string;
}

type PanelSize = 'normal' | 'wide' | 'fullscreen';

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

export function AiPanel({ predmetId }: { predmetId: string }) {
  const [dokumenti, setDokumenti] = useState<SpisDokument[]>([]);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [modelPreference, setModelPreference] = useState<'pro' | 'flash'>('flash');
  const [filterScope, setFilterScope] = useState<PraksaFilterScope>('sve');
  const [panelSize, setPanelSize] = useState<PanelSize>('normal');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Status trajnog spremanja razgovora (baza + local)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [initialHydrated, setInitialHydrated] = useState(false);

  // Modal za spremanje generiranog nacrta izravno u dokumente spisa
  const [draftModalData, setDraftModalData] = useState<{
    msgId: string;
    text: string;
    naziv: string;
    vrsta: string;
  } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedJsonRef = useRef<string>('');

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    status,
    error: chatError,
    clearError,
  } = useChat<LegalUIMessage>();

  const isLoading = status === 'submitted' || status === 'streaming';

  const displayError = chatError
    ? chatError.message || 'Greška u komunikaciji s AI asistentom.'
    : null;

  // 1. UČITAVANJE POVIJESTI RAZGOVORA (prvo instant iz localStorage-a, a zatim provjera sa Supabase bazom)
  useEffect(() => {
    let active = true;
    const storageKey = `predmet_chat_${predmetId}`;

    // Instant lokalno učitavanje
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          lastSavedJsonRef.current = cached;
          setSaveStatus('saved');
        }
      }
    } catch (e) {
      console.warn('Greška pri čitanju lokalne povijesti chata:', e);
    }

    // Učitavanje iz baze (dokumenti "__CHAT__")
    getPredmetChatHistory(predmetId).then((serverMessages) => {
      if (!active) return;
      if (serverMessages && serverMessages.length > 0) {
        const serverJson = JSON.stringify(serverMessages);
        if (serverJson !== lastSavedJsonRef.current) {
          setMessages(serverMessages);
          lastSavedJsonRef.current = serverJson;
          try {
            localStorage.setItem(storageKey, serverJson);
          } catch {}
          setSaveStatus('saved');
        }
      }
      setInitialHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [predmetId, setMessages]);

  // 2. AUTOMATSKO TRAJNO SPREMANJE RAZGOVORA kad AI dovrši odgovor
  useEffect(() => {
    if (!initialHydrated) return;
    if (isLoading) return; // Nemoj spremati usred streamanja
    if (messages.length === 0) return;

    const currentJson = JSON.stringify(messages);
    if (currentJson === lastSavedJsonRef.current) return;

    // Spremi u localStorage odmah
    const storageKey = `predmet_chat_${predmetId}`;
    try {
      localStorage.setItem(storageKey, currentJson);
    } catch {}

    // Spremi u bazu u pozadini
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      savePredmetChatHistory(predmetId, messages).then((res) => {
        if (res.success) {
          lastSavedJsonRef.current = currentJson;
          setSaveStatus('saved');
        } else {
          setSaveStatus('idle');
        }
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [messages, status, isLoading, initialHydrated, predmetId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Esc izlazi iz fullscreen fokusa
  useEffect(() => {
    if (panelSize !== 'fullscreen') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelSize('normal');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panelSize]);

  const fetchDocs = useCallback(async () => {
    const { data } = await supabase
      .from('dokumenti')
      .select('id, tip_dokumenta, storage_url')
      .eq('predmet_id', predmetId)
      .neq('tip_dokumenta', META_DOC_TYPE);

    if (data) {
      const realDocs = (data as SpisDokument[]).filter(
        (d) => d.tip_dokumenta !== META_DOC_TYPE && d.tip_dokumenta !== CHAT_DOC_TYPE
      );
      setDokumenti(realDocs);
    }
  }, [predmetId]);

  useEffect(() => {
    let isMounted = true;
    supabase
      .from('dokumenti')
      .select('id, tip_dokumenta, storage_url')
      .eq('predmet_id', predmetId)
      .neq('tip_dokumenta', META_DOC_TYPE)
      .then(({ data }) => {
        if (isMounted && data) {
          const realDocs = (data as SpisDokument[]).filter(
            (d) => d.tip_dokumenta !== META_DOC_TYPE && d.tip_dokumenta !== CHAT_DOC_TYPE
          );
          setDokumenti(realDocs);
        }
      });

    const handleDocsSync = () => {
      fetchDocs();
    };
    window.addEventListener('predmet-docs-updated', handleDocsSync);

    return () => {
      isMounted = false;
      window.removeEventListener('predmet-docs-updated', handleDocsSync);
    };
  }, [predmetId, fetchDocs]);

  async function handleRemoveDoc(id: string, storageUrl: string) {
    if (!confirm('Jeste li sigurni da želite ukloniti ovaj dokument iz spisa?')) return;
    try {
      const result = await deleteDocument(id, storageUrl);
      if (result.error) throw new Error(result.error);
      await fetchDocs();
      window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Greška pri brisanju dokumenta.';
      alert(msg);
    }
  }

  const triggerPrompt = (promptText: string, overrideModel?: 'flash' | 'pro') => {
    if (!promptText.trim() || isLoading) return;
    const chosenModel = overrideModel || modelPreference;
    if (overrideModel && overrideModel !== modelPreference) {
      setModelPreference(overrideModel);
    }
    clearError?.();
    sendMessage(
      { text: promptText },
      {
        body: {
          predmetId,
          modelPreference: chosenModel,
          filterScope,
        },
      }
    );
  };

  const handleSubmit = (e?: React.FormEvent) => {
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
      handleSubmit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
  };

  const handleResetChat = async () => {
    if (messages.length === 0) return;
    if (
      !confirm(
        'Želite li očistiti trenutni razgovor u ovom predmetu? Cjelokupni razgovor bit će uklonjen iz memorije spisa.'
      )
    ) {
      return;
    }
    if (isLoading) stop();
    setMessages([]);
    lastSavedJsonRef.current = '[]';
    setSaveStatus('idle');
    try {
      localStorage.removeItem(`predmet_chat_${predmetId}`);
    } catch {}
    await clearPredmetChatHistory(predmetId);
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

  // Otvara modal za spremanje odgovora kao novog dokumenta/nacrta u spis predmeta
  const handleOpenSaveDraftModal = (msgId: string, text: string) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setDraftModalData({
      msgId,
      text,
      naziv: `Nacrt_obrazlozenja_${todayStr}.txt`,
      vrsta: 'Drugostupanjsko rješenje',
    });
  };

  const handleConfirmSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftModalData || savingDraft) return;

    setSavingDraft(true);
    setDraftFeedback(null);

    const res = await saveDraftToSpis({
      predmetId,
      docRole: draftModalData.vrsta,
      naziv: draftModalData.naziv,
      text: draftModalData.text,
    });

    setSavingDraft(false);

    if (res.error) {
      setDraftFeedback(`Greška: ${res.error}`);
    } else {
      const key = draftModalData.msgId;
      setSavedDraftKey(key);
      setDraftModalData(null);
      await fetchDocs();
      window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
      setTimeout(() => setSavedDraftKey(null), 3000);
    }
  };

  const containerSizeClasses =
    panelSize === 'fullscreen'
      ? 'fixed inset-4 z-50 w-auto h-auto shadow-2xl ring-1 ring-slate-900/10'
      : panelSize === 'wide'
      ? 'w-[58%] shrink-0 transition-[width] duration-200'
      : 'w-[42%] shrink-0 transition-[width] duration-200';

  return (
    <>
      {panelSize === 'fullscreen' && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px]"
          onClick={() => setPanelSize('normal')}
        />
      )}

      <section
        className={`${containerSizeClasses} bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden`}
      >
        {/* 1. ZAGLAVLJE PANELA */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-2xs">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-slate-800 leading-tight">
                  AI Pravni Asistent
                </h2>
                {/* Indikator trajnog spremanja razgovora u spis */}
                {saveStatus === 'saving' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Spremam u spis...
                  </span>
                ) : saveStatus === 'saved' && messages.length > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"
                    title="Razgovor i generirani nacrti su trajno spremljeni u bazi — možete slobodno izaći iz predmeta i vratiti se"
                  >
                    <BookmarkCheck className="w-3 h-3 text-emerald-600" />
                    Spremljeno u spis
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Analiza spisa, propisi i baza prakse
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Odabir modela */}
            <select
              value={modelPreference}
              onChange={(e) => setModelPreference(e.target.value as 'pro' | 'flash')}
              className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              title="Odaberite brzinu i dubinu analize"
            >
              <option value="flash">⚡ Flash (Brzo)</option>
              <option value="pro">🧠 Pro (Duboko)</option>
            </select>

            {/* Kontrole širine prikaza */}
            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setPanelSize(panelSize === 'wide' ? 'normal' : 'wide')}
                className={`p-1 rounded transition-colors ${
                  panelSize === 'wide'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title={panelSize === 'wide' ? 'Vrati na standardnu širinu' : 'Proširi panel na 60% ekrana'}
              >
                <Columns2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setPanelSize(panelSize === 'fullscreen' ? 'normal' : 'fullscreen')
                }
                className={`p-1 rounded transition-colors ${
                  panelSize === 'fullscreen'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title={
                  panelSize === 'fullscreen'
                    ? 'Izađi iz punog zaslona (Esc)'
                    : 'Otvori preko cijelog zaslona'
                }
              >
                {panelSize === 'fullscreen' ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleResetChat}
                className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                title="Očisti razgovor (poništi spremljeni chat za ovaj predmet)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. FILTRIRANJE KONTEKSTA PRAKSE + SAŽETAK DOKUMENATA U SPISU */}
        <div className="px-3.5 py-2 bg-white border-b border-slate-200 space-y-2 shrink-0">
          {/* RAG Filter opsega */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 shrink-0 mr-0.5">
              <Filter className="w-3 h-3 text-slate-400" />
              Fokus:
            </span>
            {PRAKSA_FILTER_OPTIONS.map((opt) => {
              const active = filterScope === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilterScope(opt.value)}
                  title={opt.description}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>

          {/* Kompaktna traka učitanih dokumenata u spisu */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setDocsExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>
                Dokumenti u spisu:{' '}
                <strong className={dokumenti.length > 0 ? 'text-slate-900' : 'text-amber-600'}>
                  {dokumenti.length}
                </strong>
              </span>
              {dokumenti.length > 0 &&
                (docsExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                ))}
            </button>

            <button
              type="button"
              onClick={fetchDocs}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800"
              title="Ponovno provjeri dokumente spisa"
            >
              <RefreshCw className="w-3 h-3" />
              Osvježi
            </button>
          </div>

          {docsExpanded && dokumenti.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {dokumenti.map((doc) => {
                const parsed = decodeDocLabel(doc.tip_dokumenta);
                return (
                  <div
                    key={doc.id}
                    className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[11px] text-slate-700"
                    title={doc.tip_dokumenta}
                  >
                    <span className="truncate max-w-48 font-medium">
                      {parsed.vrsta}
                      {parsed.izvorniNaziv ? ` — ${parsed.izvorniNaziv}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(doc.id, doc.storage_url)}
                      className="text-slate-400 hover:text-red-600 transition-colors"
                      title="Ukloni dokument iz spisa"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. PROSTOR RAZGOVORA I REZULTATA */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/60">
          {messages.length === 0 && (
            <div className="h-full flex flex-col justify-center py-4">
              <div className="text-center mb-5 px-2">
                <div className="w-12 h-12 mx-auto mb-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  Što želite napraviti s ovim spisom?
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Odaberite brzu pravnu radnju jednim klikom ili upišite vlastito pitanje. Svi odgovori i generirani nacrti automatski se trajno spremaju u ovaj predmet.
                </p>

                {dokumenti.length === 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    U spisu još nema dokumenata — učitajte rješenje ili žalbu u lijevom stupcu.
                  </div>
                )}
              </div>

              {/* 4 Kartice brzih pravnih radnji */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto w-full">
                {CASE_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => triggerPrompt(action.prompt, action.recommendedModel)}
                    className="text-left p-3.5 rounded-xl bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 shadow-2xs hover:shadow-sm transition-all group flex flex-col justify-between gap-2 disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <QuickActionIcon name={action.iconName} className="w-4 h-4" />
                      </div>
                      {action.recommendedModel === 'pro' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                          🧠 Pro
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700">
                        {action.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {action.shortDesc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {displayError && (
            <div className="p-3.5 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Došlo je do greške:</p>
                <p className="mt-0.5">{displayError}</p>
              </div>
            </div>
          )}

          {messages.map((m) => {
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
                  <span className="text-[11px] font-medium text-slate-400 mb-1 px-1">Vi</span>
                  <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-xs bg-blue-600 text-white text-[13.5px] leading-relaxed shadow-2xs whitespace-pre-wrap">
                    {textContent}
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className="flex flex-col items-start w-full">
                {/* Gornja alatna traka odgovora */}
                <div className="w-full flex items-center justify-between mb-1 px-1">
                  <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-blue-600" />
                    AI Pravni Asistent
                    {sourcesPart?.data?.modelName && (
                      <span className="text-[10px] font-normal text-slate-400">
                        ({sourcesPart.data.modelName.includes('pro') ? 'Pro' : 'Flash'})
                      </span>
                    )}
                  </span>

                  {textContent && (
                    <div className="flex items-center gap-1.5">
                      {/* Gumb 1: Spremi nacrt izravno kao dokument u spis predmeta */}
                      <button
                        type="button"
                        onClick={() => handleOpenSaveDraftModal(m.id, textContent)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[11px] font-semibold text-slate-700 hover:text-emerald-700 transition-colors shadow-2xs cursor-pointer"
                        title="Spremi ovaj nacrt / obrazloženje izravno u dokumente spisa (lijevi stupac)"
                      >
                        {savedDraftKey === m.id ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Spremljeno u spis!</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3 text-emerald-600" />
                            <span>Spremi u spis</span>
                          </>
                        )}
                      </button>

                      {/* Gumb 2: Kopiraj za Word */}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(m.id, textContent, 'word')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-[11px] font-semibold text-slate-700 hover:text-blue-700 transition-colors shadow-2xs cursor-pointer"
                        title="Kopiraj formatirani tekst spreman za izravno lijepljenje u Microsoft Word (bez zvjezdica)"
                      >
                        {copiedKey === `${m.id}-word` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Kopirano za Word</span>
                          </>
                        ) : (
                          <>
                            <FileSpreadsheet className="w-3 h-3 text-blue-600" />
                            <span>Kopiraj za Word</span>
                          </>
                        )}
                      </button>

                      {/* Gumb 3: Kopiraj čisti tekst */}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(m.id, textContent, 'plain')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        title="Kopiraj čisti neformatirani tekst"
                      >
                        {copiedKey === `${m.id}-plain` ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Kartica odgovora s Markdownom i Pravnim inspektorom */}
                <div className="w-full p-4 rounded-2xl rounded-tl-xs bg-white border border-slate-200/90 shadow-xs">
                  {textContent ? (
                    <LegalMarkdown content={textContent} />
                  ) : (
                    <div className="flex items-center gap-2 py-1 text-xs text-slate-500">
                      <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                      <span
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                      <span className="ml-1">Analiziram spis, propise i praksu...</span>
                    </div>
                  )}

                  {sourcesPart?.data && <SourcesInspector sources={sourcesPart.data} />}
                </div>
              </div>
            );
          })}

          {status === 'submitted' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 w-fit shadow-2xs">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
              <span
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
              <span>Pretražujem propise i bazu sudske i upravne prakse...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 4. BRZI PREČACI (kad razgovor već traje) + POLJE ZA UNOS */}
        <div className="p-3 bg-white border-t border-slate-200 space-y-2 shrink-0">
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {CASE_QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => triggerPrompt(action.prompt, action.recommendedModel)}
                  title={action.shortDesc}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-[11px] font-semibold text-slate-700 hover:text-blue-700 whitespace-nowrap transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <QuickActionIcon name={action.iconName} className="w-3 h-3 text-blue-600" />
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Postavite podpitanje o spisu... (Enter za slanje, Shift+Enter za novi red)"
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-32 leading-snug bg-slate-50/50 focus:bg-white transition-colors"
            />

            {isLoading ? (
              <button
                type="button"
                onClick={() => stop()}
                className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                title="Zaustavi generiranje"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input || input.trim() === ''}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Pošalji
              </button>
            )}
          </form>
        </div>
      </section>

      {/* MODAL ZA SPREMANJE NACRTA U SPIS PREDMETA */}
      {draftModalData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[2px]"
          onClick={() => !savingDraft && setDraftModalData(null)}
        >
          <form
            onSubmit={handleConfirmSaveDraft}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Spremi nacrt u dokumente spisa
                </h3>
              </div>
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => setDraftModalData(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Ovaj tekst bit će trajno spremljen kao novi službeni dokument/nacrt u lijevom stupcu
                spisa predmeta. Moći ćete ga naknadno uređivati, pregledavati i slati u Bazu prakse.
              </p>

              {draftFeedback && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                  {draftFeedback}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Vrsta dokumenta</label>
                  <select
                    value={draftModalData.vrsta}
                    onChange={(e) =>
                      setDraftModalData({ ...draftModalData, vrsta: e.target.value })
                    }
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white"
                  >
                    {DOKUMENT_VRSTE.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Naziv dokumenta</label>
                  <input
                    type="text"
                    required
                    value={draftModalData.naziv}
                    onChange={(e) =>
                      setDraftModalData({ ...draftModalData, naziv: e.target.value })
                    }
                    className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">
                  Pregled teksta za spremanje (prvih nekoliko redaka):
                </label>
                <div className="max-h-36 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 whitespace-pre-wrap">
                  {draftModalData.text.slice(0, 500)}
                  {draftModalData.text.length > 500 ? '\n...' : ''}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => setDraftModalData(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={savingDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {savingDraft ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Spremam u spis...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Spremi u spis predmeta
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
