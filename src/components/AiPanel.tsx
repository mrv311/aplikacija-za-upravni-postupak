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
  ShieldCheck,
  Download,
  Pencil,
  Wand2,
  Plus,
  Search,
  BookOpen,
  UploadCloud,
  Tag,
} from 'lucide-react';
import {
  type ChatDraftConfig,
  type DraftIshodChoice,
  type LegalUIMessage,
  type PraksaFilterScope,
  type QuickActionTemplate,
  type RagSourcesPayload,
  DRAFT_ISHOD_OPTIONS,
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
import {
  getDraftingContext,
  searchPraksaForDraft,
  parseReferenceDocumentFile,
  type RecommendedPracticeItem,
  type ManualReferenceAct,
} from '@/app/actions/draftGeneratorActions';
import { updatePredmetFaza } from '@/app/actions/predmetActions';
import { cleanDraftActFormatting } from '@/lib/text-formatter';

interface SpisDokument {
  id: string;
  tip_dokumenta: string;
  storage_url: string;
}

type PanelSize = 'normal' | 'fullscreen';

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
    case 'shield':
      return <ShieldCheck className={className} />;
  }
}

export function AiPanel({
  predmetId,
  klasa = '',
  stranka = '',
}: {
  predmetId: string;
  klasa?: string;
  stranka?: string;
}) {
  const [dokumenti, setDokumenti] = useState<SpisDokument[]>([]);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [modelPreference, setModelPreference] = useState<'pro' | 'flash'>('flash');
  const [filterScope, setFilterScope] = useState<PraksaFilterScope>('sve');
  const [panelSize, setPanelSize] = useState<PanelSize>('normal');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Jedinstveni ugrađeni Konfigurator nacrta rješenja (Prijedlog 1 + Prijedlog 2)
  const [isDraftBuilderOpen, setIsDraftBuilderOpen] = useState(false);
  const [draftIshod, setDraftIshod] = useState<DraftIshodChoice>('odbijanje');
  const [draftUpute, setDraftUpute] = useState('');
  const [citirajCijeluZalbu, setCitirajCijeluZalbu] = useState(true);
  const [showAdvancedSources, setShowAdvancedSources] = useState(false);
  const [loadingDraftContext, setLoadingDraftContext] = useState(false);
  const [draftContextLoaded, setDraftContextLoaded] = useState(false);
  const [recommendedPractice, setRecommendedPractice] = useState<RecommendedPracticeItem[]>([]);
  const [selectedPracticeNames, setSelectedPracticeNames] = useState<string[]>([]);
  const [manualReferenceActs, setManualReferenceActs] = useState<ManualReferenceAct[]>([]);
  const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [practiceSearchQuery, setPracticeSearchQuery] = useState('');
  const [practiceSearchResults, setPracticeSearchResults] = useState<RecommendedPracticeItem[]>([]);
  const [isSearchingPractice, setIsSearchingPractice] = useState(false);
  const [uploadingRefFile, setUploadingRefFile] = useState(false);
  const [refUploadMessage, setRefUploadMessage] = useState<string | null>(null);
  const refFileInputRef = useRef<HTMLInputElement | null>(null);
  const practiceSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Ručno uređivanje i .docx izvoz pojedine poruke izravno u chatu
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [downloadingDocxId, setDownloadingDocxId] = useState<string | null>(null);
  const [markAsSigningOnSave, setMarkAsSigningOnSave] = useState(true);

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

  const loadDraftingRecommendations = useCallback(
    async (customKws?: string[], ishodChoice: DraftIshodChoice = draftIshod) => {
      setLoadingDraftContext(true);
      try {
        const mappedIshod =
          ishodChoice === 'ai_preporuka' ? undefined : ishodChoice;
        const res = await getDraftingContext(predmetId, {
          customKeywords: customKws,
          preferredIshod: mappedIshod,
        });
        if (!res.error) {
          if (!customKws) {
            setActiveKeywords(res.extractedKeywords || []);
          }
          setRecommendedPractice(res.recommendedPractice || []);
          setDraftContextLoaded(true);
        }
      } finally {
        setLoadingDraftContext(false);
      }
    },
    [predmetId, draftIshod]
  );

  const openDraftBuilder = useCallback(() => {
    setIsDraftBuilderOpen(true);
    setModelPreference('pro');
    if (!draftContextLoaded && !loadingDraftContext) {
      loadDraftingRecommendations();
    }
  }, [draftContextLoaded, loadingDraftContext, loadDraftingRecommendations]);

  useEffect(() => {
    const handleOpenDraftBuilderEvent = () => {
      openDraftBuilder();
    };
    window.addEventListener('open-ai-draft-builder', handleOpenDraftBuilderEvent);
    return () => {
      window.removeEventListener('open-ai-draft-builder', handleOpenDraftBuilderEvent);
    };
  }, [openDraftBuilder]);

  const triggerPrompt = (
    promptText: string,
    overrideModel?: 'flash' | 'pro',
    draftConfig?: ChatDraftConfig
  ) => {
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
          ...(draftConfig ? { draftConfig } : {}),
        },
      }
    );
  };

  const handleLaunchUnifiedDraft = () => {
    if (isLoading) return;
    const ishodMeta =
      DRAFT_ISHOD_OPTIONS.find((o) => o.id === draftIshod) || DRAFT_ISHOD_OPTIONS[1];

    const draftConfig: ChatDraftConfig = {
      ishod: draftIshod,
      uputeSavjetnika: draftUpute.trim() || undefined,
      citirajCijeluZalbu,
      selectedPracticeNames:
        selectedPracticeNames.length > 0 ? selectedPracticeNames : undefined,
      manualReferenceActs:
        manualReferenceActs.length > 0 ? manualReferenceActs : undefined,
      customKeywords: activeKeywords.length > 0 ? activeKeywords : undefined,
    };

    const promptLines = [
      `Sastavi cjelovit nacrt drugostupanjskog rješenja za ovaj predmet u mojoj višegodišnjoj autentičnoj strukturi i stilu (bez memoranduma na vrhu, bez Markdown podnaslova ### i bez zvjezdica ** u tekstu akta).`,
      `• Traženi ishod po ZUP-u: ${ishodMeta.title} (${ishodMeta.zupClanak})`,
      `• Citiranje žalbe: ${
        citirajCijeluZalbu
          ? 'Doslovno citiraj cjelokupni tekst žalbe u navodnim znakovima („...“)'
          : 'Sažeto i vjerno prenesi žalbene navode'
      }`,
    ];

    if (draftUpute.trim()) {
      promptLines.push(`• Posebna uputa / fokus savjetnika: ${draftUpute.trim()}`);
    }
    if (selectedPracticeNames.length > 0) {
      promptLines.push(
        `• Prikvačeni uzorci iz Baze prakse: ${selectedPracticeNames
          .map((n) => n.replace(/^\[[^\]]+\]\s*/, ''))
          .join('; ')}`
      );
    }
    if (manualReferenceActs.length > 0) {
      promptLines.push(
        `• Priloženi ogledni akti: ${manualReferenceActs.map((a) => a.title).join('; ')}`
      );
    }

    setIsDraftBuilderOpen(false);
    triggerPrompt(promptLines.join('\n'), 'pro', draftConfig);
  };

  const handleAddDraftKeyword = () => {
    const rawParts = newKeywordInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (rawParts.length === 0) return;

    const existingLower = new Set(activeKeywords.map((k) => k.toLowerCase()));
    const added: string[] = [];
    for (const part of rawParts) {
      if (!existingLower.has(part.toLowerCase())) {
        existingLower.add(part.toLowerCase());
        added.push(part);
      }
    }
    setNewKeywordInput('');
    if (added.length === 0) return;

    const nextKeywords = [...activeKeywords, ...added];
    setActiveKeywords(nextKeywords);
    loadDraftingRecommendations(nextKeywords, draftIshod);
  };

  const handleRemoveDraftKeyword = (kwToRemove: string) => {
    const nextKeywords = activeKeywords.filter((kw) => kw !== kwToRemove);
    setActiveKeywords(nextKeywords);
    loadDraftingRecommendations(nextKeywords, draftIshod);
  };

  const handlePracticeSearchChange = (text: string) => {
    setPracticeSearchQuery(text);
    if (practiceSearchTimerRef.current) clearTimeout(practiceSearchTimerRef.current);
    if (!text.trim()) {
      setPracticeSearchResults([]);
      setIsSearchingPractice(false);
      return;
    }
    setIsSearchingPractice(true);
    practiceSearchTimerRef.current = setTimeout(async () => {
      const results = await searchPraksaForDraft(text.trim(), 10);
      setPracticeSearchResults(results);
      setIsSearchingPractice(false);
    }, 300);
  };

  const togglePinnedPractice = (nazivDatoteke: string) => {
    setSelectedPracticeNames((prev) =>
      prev.includes(nazivDatoteke)
        ? prev.filter((n) => n !== nazivDatoteke)
        : [...prev, nazivDatoteke]
    );
  };

  const handleUploadReferenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingRefFile(true);
    setRefUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await parseReferenceDocumentFile(formData);
      if (res.success && res.text) {
        const newAct: ManualReferenceAct = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: res.title || file.name,
          content: res.text,
        };
        setManualReferenceActs((prev) => [...prev, newAct]);
        setRefUploadMessage(`Uzorak "${newAct.title}" dodan u kontekst.`);
      } else {
        setRefUploadMessage(res.error || 'Nije uspjelo čitanje datoteke.');
      }
    } catch {
      setRefUploadMessage('Greška pri učitavanju datoteke.');
    } finally {
      setUploadingRefFile(false);
      if (refFileInputRef.current) refFileInputRef.current.value = '';
    }
  };

  const handleDownloadMessageDocx = async (msgId: string, rawText: string) => {
    if (!rawText.trim() || downloadingDocxId) return;
    setDownloadingDocxId(msgId);
    try {
      const cleanText = cleanDraftActFormatting(rawText);
      const res = await fetch('/api/alati/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vrsta: 'rjesenje',
          nazivTijela: 'Ministarstvo zaštite okoliša i zelene tranzicije',
          klasa: klasa || 'UP/II-325-08/26-02/01',
          urbroj: '517-02-26-2',
          mjesto: 'Zagreb',
          datum: new Date().toLocaleDateString('hr-HR'),
          stranka: stranka || 'Žalitelj',
          predmet: 'Rješavanje po žalbi',
          pravniOsnov: 'članka 116. Zakona o općem upravnom postupku',
          izreka: 'Žalba se odbija.',
          obrazlozenje: cleanText,
          sluzbenaOsoba: 'Dino Malbaša, dipl. iur.',
          funkcijaOsobe: 'SEKTORSKI SAVJETNIK',
          dostaviti: [stranka || 'Žalitelj', 'Hrvatske vode, VGO'],
          rawFullActText: cleanText,
        }),
      });

      if (!res.ok) throw new Error('Greška pri generiranju Word dokumenta');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RJESENJE_${(klasa || 'nacrt').replace(/[/\\?%*:|"<>]/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Greška pri izvozu u Word: ${err?.message || 'Pokušajte ponovno.'}`);
    } finally {
      setDownloadingDocxId(null);
    }
  };

  const handleSaveEditedMessage = (msgId: string) => {
    if (!editingMsgText.trim()) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const otherParts = (m.parts || []).filter((p) => p.type !== 'text');
        return {
          ...m,
          parts: [...otherParts, { type: 'text' as const, text: editingMsgText }],
        };
      })
    );
    setEditingMsgId(null);
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
    setMarkAsSigningOnSave(true);
    setDraftModalData({
      msgId,
      text,
      naziv: `Nacrt_rjesenja_${todayStr}.txt`,
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

    if (!res.error && markAsSigningOnSave && draftModalData.vrsta === 'Drugostupanjsko rješenje') {
      await updatePredmetFaza(predmetId, 'Na potpisu');
    }

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
      : 'w-full h-full';

  return (
    <>
      {panelSize === 'fullscreen' && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px]"
          onClick={() => setPanelSize('normal')}
        />
      )}

      <section
        className={`${containerSizeClasses} bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden min-h-0`}
      >
        {/* 1. ZAGLAVLJE PANELA */}
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex flex-wrap justify-between items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center shadow-2xs shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-tight truncate">
                  AI Pravni Asistent
                </h2>
                {/* Indikator trajnog spremanja razgovora u spis */}
                {saveStatus === 'saving' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 shrink-0">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Spremam u spis...
                  </span>
                ) : saveStatus === 'saved' && messages.length > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 shrink-0"
                    title="Razgovor i generirani nacrti su trajno spremljeni u bazi — možete slobodno izaći iz predmeta i vratiti se"
                  >
                    <BookmarkCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    Spremljeno u spis
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight hidden sm:block truncate">
                Analiza spisa, propisi i baza prakse
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Jedinstveni gumb za konfiguraciju i izradu nacrta rješenja u chatu */}
            <button
              type="button"
              onClick={() =>
                isDraftBuilderOpen ? setIsDraftBuilderOpen(false) : openDraftBuilder()
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                isDraftBuilderOpen
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
              title="Otvori konfigurator za sastavljanje nacrta drugostupanjskog rješenja (Gemini Pro + puni RAG)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isDraftBuilderOpen ? 'Zatvori konfigurator' : 'Izradi nacrt rješenja'}
              </span>
            </button>

            {/* Odabir modela */}
            <select
              value={modelPreference}
              onChange={(e) => setModelPreference(e.target.value as 'pro' | 'flash')}
              className="text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              title="Odaberite brzinu i dubinu analize"
            >
              <option value="flash">⚡ Flash</option>
              <option value="pro">🧠 Pro</option>
            </select>

            {/* Gumb za cijeli zaslon */}
            <button
              type="button"
              onClick={() =>
                setPanelSize(panelSize === 'fullscreen' ? 'normal' : 'fullscreen')
              }
              className={`p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors ${
                panelSize === 'fullscreen'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
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

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleResetChat}
                className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                title="Očisti razgovor (poništi spremljeni chat za ovaj predmet)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. FILTRIRANJE KONTEKSTA PRAKSE + SAŽETAK DOKUMENATA U SPISU */}
        <div className="px-3.5 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          {/* RAG Filter opsega */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0 mr-0.5">
              <Filter className="w-3 h-3 text-slate-400 dark:text-slate-500" />
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
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>

          {/* Kompaktna traka učitanih dokumenata u spisu */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setDocsExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>
                Dokumenti u spisu:{' '}
                <strong className={dokumenti.length > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-amber-600 dark:text-amber-400'}>
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
              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
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
                    className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300"
                    title={doc.tip_dokumenta}
                  >
                    <span className="truncate max-w-48 font-medium">
                      {parsed.vrsta}
                      {parsed.izvorniNaziv ? ` — ${parsed.izvorniNaziv}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(doc.id, doc.storage_url)}
                      className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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

        {/* 2.5. JEDINSTVENI UGRAĐENI KONFIGURATOR NACRTA RJEŠENJA (Prijedlog 1 + 2) */}
        {isDraftBuilderOpen && (
          <div className="p-3.5 bg-blue-50/60 dark:bg-slate-900 border-b-2 border-blue-200 dark:border-blue-900/70 space-y-3 shrink-0 max-h-[56vh] overflow-y-auto animate-in fade-in duration-150">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    Izrada nacrta drugostupanjskog rješenja (Gemini Pro)
                  </h3>
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Cijeli spis + Puna baza prakse
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  AI čita cijeli spis bez skraćivanja, mapira sve žalbene navode na propise i sudsku praksu te sastavlja nacrt u vašoj autentičnoj strukturi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDraftBuilderOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800 cursor-pointer"
                title="Zatvori konfigurator"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Odabir ishoda rješavanja po ZUP-u */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
                1. Odaberite ishod rješavanja po ZUP-u:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {DRAFT_ISHOD_OPTIONS.map((opt) => {
                  const active = draftIshod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDraftIshod(opt.id);
                        if (showAdvancedSources) {
                          loadDraftingRecommendations(
                            activeKeywords.length > 0 ? activeKeywords : undefined,
                            opt.id
                          );
                        }
                      }}
                      className={`text-left p-2 rounded-xl border transition-all cursor-pointer ${
                        active
                          ? 'border-blue-600 bg-white dark:bg-slate-800 shadow-2xs ring-1 ring-blue-600/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 hover:border-blue-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {opt.shortTitle}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {opt.zupClanak.replace(' ZUP-a', '')}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {opt.shortDesc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Kratka uputa / fokus savjetnika + opcija citiranja žalbe */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start">
              <div className="sm:col-span-8">
                <input
                  type="text"
                  value={draftUpute}
                  onChange={(e) => setDraftUpute(e.target.value)}
                  placeholder="Opcijska uputa za ovaj nacrt (npr. posebno obradi prigovor zastare ili očevidnik komunalne naknade)..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-4 flex items-center h-full pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={citirajCijeluZalbu}
                    onChange={(e) => setCitirajCijeluZalbu(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Doslovno citiraj cijelu žalbu („...“)</span>
                </label>
              </div>
            </div>

            {/* 3. Opcionalno: Prikvači specifični ogledni akt ili dodaj ključnu riječ */}
            <div className="pt-1 border-t border-blue-200/70 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !showAdvancedSources;
                    setShowAdvancedSources(next);
                    if (next && !draftContextLoaded && !loadingDraftContext) {
                      loadDraftingRecommendations();
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-200 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>
                    {showAdvancedSources
                      ? 'Sakrij odabir dodatnih oglednih uzoraka'
                      : '+ Dodaj ciljani ogledni akt iz baze / datoteku ili ključne riječi (opcijski)'}
                  </span>
                  {(selectedPracticeNames.length > 0 || manualReferenceActs.length > 0) && (
                    <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 text-[10px] font-bold">
                      {selectedPracticeNames.length + manualReferenceActs.length} prikvačeno
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDraftBuilderOpen(false)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                  >
                    Odustani
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleLaunchUnifiedDraft}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sastavi nacrt rješenja (Pro)</span>
                  </button>
                </div>
              </div>

              {showAdvancedSources && (
                <div className="mt-2.5 p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  {/* Ključne riječi */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-indigo-600" />
                        Ključne riječi za pretragu prakse:
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-[11px] font-semibold"
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftKeyword(kw)}
                            className="text-indigo-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="text"
                          value={newKeywordInput}
                          onChange={(e) => setNewKeywordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddDraftKeyword();
                            }
                          }}
                          placeholder="+ Dodaj pojam (npr. zastara)..."
                          className="px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 w-44"
                        />
                        <button
                          type="button"
                          onClick={handleAddDraftKeyword}
                          disabled={!newKeywordInput.trim()}
                          className="p-1 rounded-md bg-indigo-600 text-white disabled:opacity-40 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Pretraga i odabir odluka iz Baze prakse + Upload datoteke */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={practiceSearchQuery}
                        onChange={(e) => handlePracticeSearchChange(e.target.value)}
                        placeholder="Pretraži 1.600 odluka u bazi prakse..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        ref={refFileInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.txt,image/*"
                        onChange={handleUploadReferenceFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingRefFile}
                        onClick={() => refFileInputRef.current?.click()}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/30 hover:bg-blue-50 text-xs font-semibold text-blue-700 dark:text-blue-300 cursor-pointer"
                      >
                        {uploadingRefFile ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Čitam datoteku...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>Priloži ogledni akt (.pdf / .docx)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {refUploadMessage && (
                    <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      {refUploadMessage}
                    </p>
                  )}

                  {/* Prikvačeni uzorci */}
                  {(selectedPracticeNames.length > 0 || manualReferenceActs.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selectedPracticeNames.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-[11px] font-semibold"
                        >
                          <span className="truncate max-w-52">
                            {name.replace(/^\[[^\]]+\]\s*/, '')}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePinnedPractice(name)}
                            className="text-blue-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {manualReferenceActs.map((act) => (
                        <span
                          key={act.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold"
                        >
                          <span className="truncate max-w-52">[Datoteka] {act.title}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setManualReferenceActs((prev) =>
                                prev.filter((a) => a.id !== act.id)
                              )
                            }
                            className="text-emerald-500 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Lista preporučenih ili pretraženih odluka */}
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {loadingDraftContext || isSearchingPractice ? (
                      <div className="py-3 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                        <span>Tražim najsličnije odluke u bazi prakse...</span>
                      </div>
                    ) : (
                      (practiceSearchQuery.trim()
                        ? practiceSearchResults
                        : recommendedPractice
                      ).map((p) => {
                        const checked = selectedPracticeNames.includes(p.nazivDatoteke);
                        return (
                          <div
                            key={`${p.id}-${p.nazivDatoteke}`}
                            onClick={() => togglePinnedPractice(p.nazivDatoteke)}
                            className={`p-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              checked
                                ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/40'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {}}
                                className="rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                              />
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                                {p.vrsta === 'Sudska presuda' ? 'Presuda' : 'II. st.'}
                              </span>
                              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                {p.kratkiNaziv}
                              </span>
                            </div>
                            {p.similarity && (
                              <span className="text-[10px] font-mono font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                                {Math.round(p.similarity * 100)}%
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. PROSTOR RAZGOVORA I REZULTATA */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/60 dark:bg-slate-950/50">
          {messages.length === 0 && (
            <div className="h-full flex flex-col justify-center py-4">
              <div className="text-center mb-5 px-2">
                <div className="w-12 h-12 mx-auto mb-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800/80 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Što želite napraviti s ovim spisom?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  Odaberite brzu pravnu radnju jednim klikom ili upišite vlastito pitanje. Svi odgovori i generirani nacrti automatski se trajno spremaju u ovaj predmet.
                </p>

                {dokumenti.length === 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    U spisu još nema dokumenata — učitajte rješenje ili žalbu u lijevom stupcu.
                  </div>
                )}
              </div>

              {/* Kartice brzih pravnih radnji */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto w-full">
                {CASE_QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => {
                      if (action.id === 'nacrt-rjesenja' || action.id === 'case-draft') {
                        openDraftBuilder();
                      } else if (action.id === 'revizija-nacrta') {
                        window.dispatchEvent(new CustomEvent('trigger-ai-review'));
                      } else {
                        triggerPrompt(action.prompt, action.recommendedModel);
                      }
                    }}
                    className="text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-blue-50/50 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 shadow-2xs hover:shadow-sm transition-all group flex flex-col justify-between gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <QuickActionIcon name={action.iconName} className="w-4 h-4" />
                      </div>
                      {action.recommendedModel === 'pro' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          🧠 Pro
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                        {action.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {action.shortDesc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {displayError && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs rounded-xl border border-red-200 dark:border-red-800 flex items-start gap-2">
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

            const isEditingThis = editingMsgId === m.id;

            return (
              <div key={m.id} className="flex flex-col items-start w-full">
                {/* Gornja alatna traka odgovora */}
                <div className="w-full flex flex-wrap items-center justify-between gap-1.5 mb-1.5 px-1">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    AI Pravni Asistent
                    {sourcesPart?.data?.modelName && (
                      <span className="text-[10px] font-normal text-slate-400 dark:text-slate-500">
                        ({sourcesPart.data.modelName.includes('pro') ? 'Pro' : 'Flash'})
                      </span>
                    )}
                  </span>

                  {textContent && (
                    <div className="flex flex-wrap items-center gap-1">
                      {/* Gumb: Pravna revizija ovog nacrta */}
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent('trigger-ai-review', {
                              detail: { draftText: textContent },
                            })
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors shadow-2xs cursor-pointer"
                        title="Otvori AI Pravnu reviziju s ovim nacrtom rješenja (provjera svih žalbenih navoda i zakonskih članaka)"
                      >
                        <ShieldCheck className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        <span>Revizija</span>
                      </button>

                      {/* Gumb: Ručno uredi tekst izravno u kartici */}
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditingThis) {
                            setEditingMsgId(null);
                          } else {
                            setEditingMsgId(m.id);
                            setEditingMsgText(textContent);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors shadow-2xs cursor-pointer ${
                          isEditingThis
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                            : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                        title="Ručno uredi ili poravnaj tekst prije kopiranja, preuzimanja u Word ili spremanja u spis"
                      >
                        <Pencil className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                        <span>{isEditingThis ? 'Zatvori uređivanje' : 'Uredi tekst'}</span>
                      </button>

                      {/* Gumb: Spremi nacrt izravno kao dokument u spis predmeta */}
                      <button
                        type="button"
                        onClick={() => handleOpenSaveDraftModal(m.id, textContent)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors shadow-2xs cursor-pointer"
                        title="Spremi ovaj nacrt / obrazloženje izravno u dokumente spisa (lijevi stupac)"
                      >
                        {savedDraftKey === m.id ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-700 dark:text-emerald-300">Spremljeno u spis!</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Spremi u spis</span>
                          </>
                        )}
                      </button>

                      {/* Gumb: Preuzmi Word (.docx) */}
                      <button
                        type="button"
                        disabled={downloadingDocxId === m.id}
                        onClick={() => handleDownloadMessageDocx(m.id, textContent)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                        title="Preuzmi tekst kao formatirani Microsoft Word (.docx) dokument"
                      >
                        {downloadingDocxId === m.id ? (
                          <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                        ) : (
                          <Download className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        )}
                        <span>Word (.docx)</span>
                      </button>

                      {/* Gumb: Kopiraj za Word */}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(m.id, textContent, 'word')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 transition-colors shadow-2xs cursor-pointer"
                        title="Kopiraj formatirani tekst spreman za izravno lijepljenje u Microsoft Word (bez zvjezdica)"
                      >
                        {copiedKey === `${m.id}-word` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-700 dark:text-emerald-300">Kopirano</span>
                          </>
                        ) : (
                          <>
                            <FileSpreadsheet className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            <span>Kopiraj za Word</span>
                          </>
                        )}
                      </button>

                      {/* Gumb: Kopiraj čisti tekst */}
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(m.id, textContent, 'plain')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                        title="Kopiraj čisti neformatirani tekst (za uredski sustav)"
                      >
                        {copiedKey === `${m.id}-plain` ? (
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Kartica odgovora s Markdownom / Inline editorom i Pravnim inspektorom */}
                <div className="w-full p-4.5 rounded-2xl rounded-tl-xs legal-document-sheet border border-slate-200/90 dark:border-slate-800 border-t-3 border-t-blue-600/80 dark:border-t-blue-500/80">
                  {isEditingThis ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Ručno uređivanje teksta nacrta:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingMsgText((prev) => cleanDraftActFormatting(prev))
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                            title="Automatski spoji nepravilno prekinute retke iz PDF-a u tečne odlomke"
                          >
                            <Wand2 className="w-3.5 h-3.5 text-blue-600" />
                            <span>Poravnaj odlomke</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditedMessage(m.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Spremi izmjene</span>
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={16}
                        value={editingMsgText}
                        onChange={(e) => setEditingMsgText(e.target.value)}
                        className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs sm:text-[13.5px] font-serif leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : textContent ? (
                    <LegalMarkdown content={textContent} />
                  ) : (
                    <div className="flex items-center gap-2 py-1 text-xs text-slate-500 dark:text-slate-400">
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
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 w-fit shadow-2xs">
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
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {CASE_QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    if (action.id === 'nacrt-rjesenja' || action.id === 'case-draft') {
                      openDraftBuilder();
                    } else if (action.id === 'revizija-nacrta') {
                      window.dispatchEvent(new CustomEvent('trigger-ai-review'));
                    } else {
                      triggerPrompt(action.prompt, action.recommendedModel);
                    }
                  }}
                  title={action.shortDesc}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <QuickActionIcon name={action.iconName} className="w-3 h-3 text-blue-600 dark:text-blue-400" />
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
              placeholder="Postavite podpitanje ili uputu za doradu nacrta... (Enter za slanje, Shift+Enter za novi red)"
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none max-h-32 leading-snug bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-900 transition-colors"
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
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200/80 dark:border-emerald-850 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Spremi nacrt u dokumente spisa
                </h3>
              </div>
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => setDraftModalData(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Ovaj tekst bit će trajno spremljen kao novi službeni dokument/nacrt u lijevom stupcu
                spisa predmeta. Moći ćete ga naknadno uređivati, pregledavati i slati u Bazu prakse.
              </p>

              {draftFeedback && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs">
                  {draftFeedback}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Vrsta dokumenta</label>
                  <select
                    value={draftModalData.vrsta}
                    onChange={(e) =>
                      setDraftModalData({ ...draftModalData, vrsta: e.target.value })
                    }
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    {DOKUMENT_VRSTE.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Naziv dokumenta</label>
                  <input
                    type="text"
                    required
                    value={draftModalData.naziv}
                    onChange={(e) =>
                      setDraftModalData({ ...draftModalData, naziv: e.target.value })
                    }
                    className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              {draftModalData.vrsta === 'Drugostupanjsko rješenje' && (
                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-900 dark:text-emerald-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markAsSigningOnSave}
                    onChange={(e) => setMarkAsSigningOnSave(e.target.checked)}
                    className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Automatski prebaci fazu predmeta u „Na potpisu“</span>
                </label>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pregled teksta za spremanje (prvih nekoliko redaka):
                </label>
                <div className="max-h-36 overflow-y-auto p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {draftModalData.text.slice(0, 500)}
                  {draftModalData.text.length > 500 ? '\n...' : ''}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => setDraftModalData(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
