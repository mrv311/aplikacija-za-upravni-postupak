'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Loader2,
  Check,
  Copy,
  Save,
  Scale,
  FileText,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Landmark,
  PenLine,
  Wand2,
  ArrowRight,
  Search,
  Plus,
  BookOpen,
  Trash2,
  SlidersHorizontal,
  UploadCloud,
  FileUp,
  FileCheck,
} from 'lucide-react';
import {
  getDraftingContext,
  searchPraksaForDraft,
  generateLegalDraft,
  refineLegalDraft,
  saveDraftActToCase,
  parseReferenceDocumentFile,
  type NacrtIshodTip,
  type RecommendedPracticeItem,
  type ManualReferenceAct,
} from '@/app/actions/draftGeneratorActions';
import { cleanDraftActFormatting } from '@/lib/text-formatter';

interface DraftGeneratorModalProps {
  predmetId: string;
  klasa: string;
  stranka: string;
  isOpen: boolean;
  onClose: () => void;
  onDraftSavedToCase?: () => void;
}

const ISHOD_OPTIONS: Array<{
  id: NacrtIshodTip;
  title: string;
  zupClanak: string;
  shortDesc: string;
  isPopular?: boolean;
}> = [
  {
    id: 'odbijanje',
    title: 'Odbijanje žalbe',
    zupClanak: 'čl. 116. ZUP-a',
    shortDesc: 'Žalba je neosnovana. Prvostupanjsko rješenje Hrvatskih voda je zakonito.',
    isPopular: true,
  },
  {
    id: 'ponistavanje_vracanje',
    title: 'Poništavanje i vraćanje na ponovni postupak',
    zupClanak: 'čl. 117. st. 2. ZUP-a',
    shortDesc: 'Nepotpuno utvrđeno činjenično stanje ili povreda pravila postupka.',
  },
  {
    id: 'odbacivanje_nepravodobna',
    title: 'Odbacivanje — nepravodobna žalba',
    zupClanak: 'čl. 114. st. 1. ZUP-a',
    shortDesc: 'Žalba je predana nakon isteka zakonskog roka od 15 dana od dostave.',
  },
  {
    id: 'odbacivanje_nedopustena',
    title: 'Odbacivanje — nedopuštena / neovlaštena',
    zupClanak: 'čl. 114. st. 1. ZUP-a',
    shortDesc: 'Nedostatak pravnog interesa ili nedostatak ovlaštenja/punomoći.',
  },
  {
    id: 'usvajanje_izmjena',
    title: 'Usvajanje žalbe i izmjena rješenja',
    zupClanak: 'čl. 117. st. 1. ZUP-a',
    shortDesc: 'Izmjena pobijanog dijela (npr. očita pogreška u izračunu) bez vraćanja.',
  },
];

export function DraftGeneratorModal({
  predmetId,
  klasa,
  stranka,
  isOpen,
  onClose,
  onDraftSavedToCase,
}: DraftGeneratorModalProps) {
  const [step, setStep] = useState<'config' | 'result'>('config');
  const [loadingContext, setLoadingContext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [savingToCase, setSavingToCase] = useState(false);

  // Konfiguracija
  const [selectedIshod, setSelectedIshod] = useState<NacrtIshodTip>('odbijanje');
  const [recommendedPractice, setRecommendedPractice] = useState<RecommendedPracticeItem[]>([]);
  const [selectedPracticeNames, setSelectedPracticeNames] = useState<string[]>([]);
  const [manualReferenceActs, setManualReferenceActs] = useState<ManualReferenceAct[]>([]);

  // Pretraga baze prakse
  const [practiceTab, setPracticeTab] = useState<'recommended' | 'search' | 'manual'>('recommended');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RecommendedPracticeItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Ručni unos i učitavanje oglednog akta (PDF, Word, tekst)
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [uputeSavjetnika, setUputeSavjetnika] = useState('');
  const [citirajCijeluZalbu, setCitirajCijeluZalbu] = useState(true); // default true: prema običaju savjetnika
  const [modelPreference, setModelPreference] = useState<'flash' | 'pro'>('flash');
  const [docsCount, setDocsCount] = useState(0);

  // Rezultat
  const [draftText, setDraftText] = useState('');
  const [copied, setCopied] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [customRefineInput, setCustomRefineInput] = useState('');
  const [showCustomRefine, setShowCustomRefine] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Učitavanje početnog konteksta i automatskih preporuka kad se otvori modal
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setLoadingContext(true);
    setErrorMsg(null);
    setSaveSuccessMsg('');

    getDraftingContext(predmetId).then((res) => {
      if (!active) return;
      setLoadingContext(false);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setDocsCount(res.docs.length);
        setRecommendedPractice(res.recommendedPractice);
        // Automatski označi prvu najrelevantniju odluku kao ogledni uzor
        if (res.recommendedPractice.length > 0) {
          setSelectedPracticeNames([res.recommendedPractice[0].nazivDatoteke]);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [isOpen, predmetId]);

  // Live pretraga baze prakse
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!text.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchPraksaForDraft(text.trim(), 12);
      setSearchResults(results);
      setIsSearching(false);
    }, 350);
  };

  const togglePracticeSelection = (nazivDatoteke: string) => {
    setSelectedPracticeNames((prev) =>
      prev.includes(nazivDatoteke)
        ? prev.filter((name) => name !== nazivDatoteke)
        : [...prev, nazivDatoteke]
    );
  };

  const processReferenceFile = async (file: File) => {
    setIsUploadingFile(true);
    setUploadErrorMsg(null);
    setUploadSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await parseReferenceDocumentFile(formData);

      if (!res.success || !res.text) {
        setUploadErrorMsg(res.error || 'Nije uspjelo čitanje teksta iz datoteke.');
        setIsUploadingFile(false);
        return;
      }

      const title = res.title || file.name;
      const content = res.text;

      // Automatski dodaj u aktivne ogledne akte
      const newAct: ManualReferenceAct = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        content,
      };

      setManualReferenceActs((prev) => [...prev, newAct]);
      // Popuni i ručna polja tako da korisnik može pregledati i urediti
      setManualTitle(title);
      setManualContent(content);

      const charInfo = res.charCount ? `${res.charCount.toLocaleString('hr-HR')} znakova` : '';
      const izvorInfo = res.izvorTeksta ? ` • ${res.izvorTeksta}` : '';
      setUploadSuccessMsg(
        `Datoteka "${file.name}" uspješno pročitana (${charInfo}${izvorInfo}) i dodana u aktivne predloške!`
      );
    } catch (err: any) {
      setUploadErrorMsg(err?.message || 'Greška pri obradi datoteke.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processReferenceFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleFileDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processReferenceFile(file);
  };

  const handleAddManualAct = () => {
    if (!manualTitle.trim() || !manualContent.trim()) {
      alert('Molimo unesite naziv i tekst oglednog akta.');
      return;
    }

    const newAct: ManualReferenceAct = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: manualTitle.trim(),
      content: manualContent.trim(),
    };

    setManualReferenceActs((prev) => [...prev, newAct]);
    setUploadSuccessMsg(`Ogledni akt "${manualTitle.trim()}" dodan u aktivne predloške!`);
    setManualTitle('');
    setManualContent('');
  };

  const handleRemoveManualAct = (id: string) => {
    setManualReferenceActs((prev) => prev.filter((a) => a.id !== id));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg(null);

    const res = await generateLegalDraft({
      predmetId,
      ishod: selectedIshod,
      selectedPracticeNames,
      manualReferenceActs,
      uputeSavjetnika: uputeSavjetnika.trim(),
      modelPreference,
      citirajCijeluZalbu,
    });

    setGenerating(false);

    if (res.error || !res.draftText) {
      setErrorMsg(res.error || 'Nije uspjelo generiranje nacrta.');
    } else {
      setDraftText(res.draftText);
      setStep('result');
    }
  };

  const handleCopyCleanText = async () => {
    const textToCopy = cleanDraftActFormatting(draftText);
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSaveToCase = async () => {
    if (!draftText.trim() || savingToCase) return;

    setSavingToCase(true);
    setErrorMsg(null);

    const res = await saveDraftActToCase({
      predmetId,
      draftText,
    });

    setSavingToCase(false);

    if (res.error) {
      setErrorMsg(`Greška pri spremanju: ${res.error}`);
    } else {
      setSaveSuccessMsg('Nacrt je uspješno spremljen u spis predmeta (faza prebačena u "Na potpisu").');
      window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
      onDraftSavedToCase?.();
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    }
  };

  const handleQuickRefine = async (instruction: string) => {
    if (!draftText.trim() || refining) return;

    setRefining(true);
    setErrorMsg(null);

    const res = await refineLegalDraft({
      currentText: draftText,
      instruction,
      modelPreference,
    });

    setRefining(false);

    if (res.error || !res.refinedText) {
      setErrorMsg(res.error || 'Greška pri doradi teksta.');
    } else {
      setDraftText(res.refinedText);
      setShowCustomRefine(false);
      setCustomRefineInput('');
    }
  };

  if (!isOpen) return null;

  const totalSelectedCount = selectedPracticeNames.length + manualReferenceActs.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. ZAGLAVLJE MODALA */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-blue-50/40 dark:from-slate-900 dark:to-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Generator nacrta drugostupanjskog rješenja
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800">
                  Točka 3
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {klasa} &bull; {stranka}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {step === 'result' && (
              <button
                type="button"
                onClick={() => setStep('config')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                Postavke nacrta
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. GLAVNI SADRŽAJ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-xs underline font-semibold cursor-pointer"
              >
                Zatvori
              </button>
            </div>
          )}

          {step === 'config' ? (
            /* ============================================================== */
            /* KORAK 1: POSTAVKE ODLUKE + ODABIR OGLEDNIH RJEŠENJA IZ BAZE    */
            /* ============================================================== */
            <div className="space-y-6">
              {/* Obavijest o autentičnom stilu */}
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/70 text-xs text-blue-900 leading-relaxed flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-950">
                    Sastavljanje teksta akta koji vjerno prati logiku i frazeologiju vaših rješenja
                  </p>
                  <p className="mt-0.5 text-blue-800/90">
                    AI je prilagođen točnom načinu pisanja ovog savjetnika (Uvod, Izreka, prirodni odlomci
                    obrazloženja, ocjena postupka i ZUS uputa). Ispod možete odabrati ili ručno dodati ogledna
                    rješenja iz baze koja će poslužiti kao pravni i stilski uzor za ovaj predmet.
                  </p>
                </div>
              </div>

              {/* 1. Odabir ishoda rješavanja */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                  <Scale className="w-4 h-4 text-blue-600" />
                  1. Odaberite željeni ishod rješavanja po ZUP-u:
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {ISHOD_OPTIONS.map((opt) => {
                    const isSelected = selectedIshod === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setSelectedIshod(opt.id)}
                        className={`p-3 rounded-xl border-2 transition-all cursor-pointer relative ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-1 ring-blue-600/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{opt.title}</span>
                              {opt.isPopular && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  Preporučeno
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold text-blue-700 block mt-0.5">
                              {opt.zupClanak}
                            </span>
                            <p className="text-[11.5px] text-slate-600 mt-1 leading-snug">
                              {opt.shortDesc}
                            </p>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Odabir i ručno dodavanje oglednih rješenja / prakse */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                      <Landmark className="w-4 h-4 text-blue-600" />
                      2. Ogledna rješenja i praksa na kojima će se temeljiti novi nacrt:
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Odaberite rješenja iz baze ili ručno ubacite akt čiju pravnu logiku i argumentaciju AI treba preslikati.
                    </p>
                  </div>

                  <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 font-bold border border-blue-200">
                    Aktivno uzoraka: {totalSelectedCount}
                  </span>
                </div>

                {/* Traka odabranih oglednih akata (bedževi) */}
                {totalSelectedCount > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[11px] font-bold text-slate-500 self-center mr-1">
                      Uzorak za AI:
                    </span>
                    {selectedPracticeNames.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-blue-300 text-blue-900 text-xs font-semibold shadow-2xs"
                      >
                        <BookOpen className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate max-w-64" title={name}>
                          {name.replace(/^\[[^\]]+\]\s*/, '')}
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePracticeSelection(name)}
                          className="text-slate-400 hover:text-rose-600 ml-0.5"
                          title="Ukloni iz uzorka"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    {manualReferenceActs.map((act) => (
                      <span
                        key={act.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold shadow-2xs"
                      >
                        <PenLine className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate max-w-64" title={act.title}>
                          [Ručni akt] {act.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveManualAct(act.id)}
                          className="text-slate-400 hover:text-rose-600 ml-0.5"
                          title="Ukloni ručni akt"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Tabovi: Preporučeno / Pretraži bazu / Ručno unesi */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setPracticeTab('recommended')}
                      className={`px-4 py-2.5 transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                        practiceTab === 'recommended'
                          ? 'border-blue-600 text-blue-700 bg-white'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Preporučeno za ovaj spis ({recommendedPractice.length})
                    </button>

                    <button
                      type="button"
                      onClick={() => setPracticeTab('search')}
                      className={`px-4 py-2.5 transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                        practiceTab === 'search'
                          ? 'border-blue-600 text-blue-700 bg-white'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Search className="w-3.5 h-3.5" />
                      Pretraži cijelu bazu odluka
                    </button>

                    <button
                      type="button"
                      onClick={() => setPracticeTab('manual')}
                      className={`px-4 py-2.5 transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
                        practiceTab === 'manual'
                          ? 'border-blue-600 text-blue-700 bg-white'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      + Učitaj datoteku / unesi ogledni akt
                      {manualReferenceActs.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                          {manualReferenceActs.length}
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="p-3">
                    {/* TAB 1: PREPORUČENO IZ SPISA */}
                    {practiceTab === 'recommended' && (
                      <div className="space-y-2">
                        {loadingContext ? (
                          <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            Tražim najsličnija rješenja u bazi...
                          </div>
                        ) : recommendedPractice.length === 0 ? (
                          <p className="text-xs text-slate-500 p-3">
                            Nema automatski prepoznatih rješenja — koristite tab „Pretraži bazu” ili „Ručno unesi”.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {recommendedPractice.map((p) => {
                              const isChecked = selectedPracticeNames.includes(p.nazivDatoteke);
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => togglePracticeSelection(p.nazivDatoteke)}
                                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                                    isChecked
                                      ? 'border-blue-400 bg-blue-50/50 shadow-2xs'
                                      : 'border-slate-200 bg-white hover:border-slate-300'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}}
                                    className="mt-0.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-slate-900 truncate">
                                        {p.kratkiNaziv}
                                      </span>
                                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                        {p.vrsta} {p.godina ? `(${p.godina}.)` : ''}
                                      </span>
                                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800">
                                        {p.ishod}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                                      {p.sadrzajPreview}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 2: PRETRAGA CIJELE BAZE */}
                    {practiceTab === 'search' && (
                      <div className="space-y-2.5">
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Upišite pojam za pretragu odluka (npr. Karlovac, garaža, zastara, promjena posjednika, Državne nekretnine)..."
                            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white"
                          />
                        </div>

                        {isSearching ? (
                          <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                            Pretražujem bazu prakse...
                          </div>
                        ) : searchResults.length > 0 ? (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {searchResults.map((p) => {
                              const isChecked = selectedPracticeNames.includes(p.nazivDatoteke);
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => togglePracticeSelection(p.nazivDatoteke)}
                                  className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                                    isChecked
                                      ? 'border-blue-400 bg-blue-50/50 shadow-2xs'
                                      : 'border-slate-200 bg-white hover:border-slate-300'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}}
                                    className="mt-0.5 rounded border-slate-300 text-blue-600 cursor-pointer"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-slate-900 truncate">
                                        {p.kratkiNaziv}
                                      </span>
                                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                        {p.vrsta} {p.godina ? `(${p.godina}.)` : ''}
                                      </span>
                                      <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800">
                                        {p.ishod}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                                      {p.sadrzajPreview}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : searchQuery.trim() ? (
                          <p className="text-xs text-slate-500 p-2 text-center">
                            Nema pronađenih odluka za pojam „{searchQuery}”. Pokušajte s drugim pojmom ili korijenom riječi.
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 p-2 text-center">
                            Upišite bilo koju ključnu riječ ili naziv stranke za pretragu preko 500 odluka iz baze.
                          </p>
                        )}
                      </div>
                    )}

                    {/* TAB 3: UČITAJ DATOTEKU / RUČNO UNESI OGLEDNI AKT */}
                    {practiceTab === 'manual' && (
                      <div className="space-y-3">
                        {/* Drag & drop zona za učitavanje cijele datoteke */}
                        <div
                          onDragOver={handleFileDragOver}
                          onDragLeave={handleFileDragLeave}
                          onDrop={handleFileDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                            isDraggingFile
                              ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
                              : isUploadingFile
                              ? 'border-blue-300 bg-blue-50/40 pointer-events-none'
                              : 'border-slate-300 bg-slate-50/70 hover:bg-blue-50/30 hover:border-blue-400'
                          }`}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.docx,.doc,.txt,image/*"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />

                          {isUploadingFile ? (
                            <div className="flex flex-col items-center justify-center py-2 text-blue-700">
                              <Loader2 className="w-6 h-6 animate-spin mb-1.5" />
                              <span className="text-xs font-bold">Čitam datoteku i izdvajam tekst...</span>
                              <span className="text-[11px] text-blue-600/80 mt-0.5">
                                Uključuje automatski OCR za skenirane spise
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-1">
                              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-1.5 shadow-2xs">
                                <UploadCloud className="w-5 h-5" />
                              </div>
                              <span className="text-xs font-bold text-slate-800">
                                Povucite i ispustite datoteku ranijeg rješenja ili{' '}
                                <span className="text-blue-600 underline">kliknite za odabir</span>
                              </span>
                              <span className="text-[11px] text-slate-500 mt-0.5">
                                Podržani formati: <strong>PDF</strong> (digitalni i skenirani), <strong>Word (.docx, .doc)</strong>, <strong>TXT</strong>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Poruka o uspješnom učitavanju datoteke */}
                        {uploadSuccessMsg && (
                          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{uploadSuccessMsg}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setUploadSuccessMsg(null)}
                              className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {uploadErrorMsg && (
                          <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                              <span>{uploadErrorMsg}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setUploadErrorMsg(null)}
                              className="text-red-700 hover:text-red-900 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Alternativno: Ručni unos / pregled i uređivanje pročitanog teksta */}
                        <div className="pt-2 border-t border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                              Ili ručno zalijepite / doradite tekst oglednog rješenja:
                            </span>
                            {manualContent.trim() && (
                              <span className="text-[10px] text-slate-500 font-medium">
                                {manualContent.length.toLocaleString('hr-HR')} znakova
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Naziv oglednog akta (npr. „NUV 2014 - Odbijena žalba za garažu”):
                            </label>
                            <input
                              type="text"
                              value={manualTitle}
                              onChange={(e) => setManualTitle(e.target.value)}
                              placeholder="Kratki opis ili klasa oglednog rješenja..."
                              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-slate-700">
                              Tekst oglednog rješenja (obrazloženje i pravni stav):
                            </label>
                            <textarea
                              rows={4}
                              value={manualContent}
                              onChange={(e) => setManualContent(e.target.value)}
                              placeholder="Zalijepite ovdje tekst vašeg prethodnog rješenja ili ga doradite nakon učitavanja datoteke gore..."
                              className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-sans bg-slate-50 focus:bg-white"
                            />
                          </div>

                          <div className="flex justify-between items-center pt-1">
                            <p className="text-[11px] text-slate-500">
                              Uzorak će poslužiti kao stilski i pravni predložak za novi nacrt.
                            </p>
                            <button
                              type="button"
                              onClick={handleAddManualAct}
                              disabled={!manualTitle.trim() || !manualContent.trim()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Dodaj u aktivne ogledne uzorke
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Posebne upute / fokus savjetnika */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label
                  htmlFor="uputeSavjetnika"
                  className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide"
                >
                  <PenLine className="w-4 h-4 text-blue-600" />
                  3. Posebne upute i fokus savjetnika (opcijski):
                </label>
                <textarea
                  id="uputeSavjetnika"
                  rows={2}
                  value={uputeSavjetnika}
                  onChange={(e) => setUputeSavjetnika(e.target.value)}
                  placeholder="npr. Posebno naglasi da žalitelj nije dokazao promjenu površine u očevidniku komunalne naknade, ili detaljnije obradi prigovor zastare..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Citiranje žalbe: Po defaultu doslovno u navodnim znakovima (prema praksi savjetnika) */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={citirajCijeluZalbu}
                    onChange={(e) => setCitirajCijeluZalbu(e.target.checked)}
                    className="mt-0.5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                      Doslovno citiraj cjelokupnu žalbu u navodnim znakovima („...“)
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-blue-200/80 text-blue-800">
                        Zadano
                      </span>
                    </span>
                    <p className="text-[11px] text-blue-800/80 mt-0.5">
                      U obrazloženje se umeće cjeloviti izvorni tekst žalbe od riječi do riječi pod navodnicima („U žalbi žalitelj navodi sljedeće: „...““), bez prepričavanja i bez sažimanja.
                    </p>
                  </div>
                </label>
              </div>

              {/* 4. Donji dio postavki: Model i gumb za generiranje (Sticky) */}
              <div className="sticky bottom-0 -mx-6 -mb-6 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 z-10">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Model:</span>
                  <select
                    value={modelPreference}
                    onChange={(e) => setModelPreference(e.target.value as 'flash' | 'pro')}
                    className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="flash">⚡ Flash (Brzo ~4s)</option>
                    <option value="pro">🧠 Pro (Duboka pravna analiza)</option>
                  </select>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
                    (U spisu: <strong>{docsCount}</strong> dok.)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    Odustani
                  </button>

                  <button
                    type="button"
                    disabled={generating}
                    onClick={handleGenerate}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sastavljam nacrt prema uzorku...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        Sastavi nacrt rješenja
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ============================================================== */
            /* KORAK 2: PREGLEDNIK I UREĐIVAČ GENERIRANOG TEKSTA              */
            /* ============================================================== */
            <div className="space-y-4">
              {saveSuccessMsg && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Traka s brzim akcijama na vrhu editora */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Generirani tekst rješenja
                  </span>
                  {(() => {
                    const wordCount = draftText.trim() ? draftText.trim().split(/\s+/).length : 0;
                    const pageEstimate = Math.max(1, Math.round(wordCount / 380));
                    return (
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs">
                        {wordCount.toLocaleString('hr-HR')} riječi &bull; cca. {pageEstimate} {pageEstimate === 1 ? 'stranica' : 'stranice'}
                      </span>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-2">
                  {/* Brzo poravnavanje i spajanje prekinutih redaka */}
                  <button
                    type="button"
                    onClick={() => setDraftText((prev) => cleanDraftActFormatting(prev))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-slate-400 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                    title="Automatski spoji sve nepravilno prekinute retke iz PDF-a u tečne rečenice i odlomke"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Poravnaj odlomke</span>
                  </button>

                  {/* Glavni gumb: Kopiraj čisti tekst za interni sustav */}
                  <button
                    type="button"
                    onClick={handleCopyCleanText}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                    title="Kopiraj čisti tekst spreman za izravno lijepljenje (Ctrl+V) u vaš interni sustav"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Kopirano u međuspremnik!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopiraj za interni sustav</span>
                      </>
                    )}
                  </button>

                  {/* Spremi kao dokument u spis predmeta */}
                  <button
                    type="button"
                    disabled={savingToCase}
                    onClick={handleSaveToCase}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                    title="Spremi ovaj nacrt u dokumente spisa i prebaci fazu u 'Na potpisu'"
                  >
                    {savingToCase ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Spremi u spis</span>
                  </button>
                </div>
              </div>

              {/* Glavni editor čistog teksta (editable) */}
              <div className="relative">
                <textarea
                  rows={18}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  className="w-full p-4 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-[13px] font-sans leading-relaxed text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal"
                  placeholder="Tekst akta..."
                />

                {refining && (
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                    <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold text-blue-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Prilagođavam tekst akta prema vašoj uputi...
                    </div>
                  </div>
                )}
              </div>

              {/* Traka za brze AI dorade */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Brze AI dorade ovog teksta jednim klikom:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCustomRefine((v) => !v)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold cursor-pointer"
                  >
                    {showCustomRefine ? 'Zatvori vlastitu uputu' : '+ Vlastita uputa za doradu'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={refining}
                    onClick={() =>
                      handleQuickRefine('Skrati obrazloženje na najbitnije pravne točke i ukloni suvišne rečenice.')
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    ✂️ Skrati obrazloženje
                  </button>

                  <button
                    type="button"
                    disabled={refining}
                    onClick={() =>
                      handleQuickRefine('Pojačaj pravnu argumentaciju zašto žalbeni navodi ne mogu dovesti do drukčije odluke.')
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    ⚖️ Pojačaj pravnu argumentaciju
                  </button>

                  <button
                    type="button"
                    disabled={refining}
                    onClick={() =>
                      handleQuickRefine('Proširi dio o sudskoj i upravnoj praksi i dodaj još argumenata o ujednačenom postupanju.')
                    }
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    🏛️ Proširi sudsku praksu
                  </button>
                </div>

                {showCustomRefine && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={customRefineInput}
                      onChange={(e) => setCustomRefineInput(e.target.value)}
                      placeholder="Upišite što točno želite promijeniti u tekstu..."
                      className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={!customRefineInput.trim() || refining}
                      onClick={() => handleQuickRefine(customRefineInput.trim())}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      Primijeni
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. PODNOŽJE MODALA KAD JE PRIKAZAN REZULTAT */}
        {step === 'result' && (
          <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setStep('config')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Ponovno podesi i generiraj
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                Zatvori
              </button>
              <button
                type="button"
                onClick={handleCopyCleanText}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied ? 'Kopirano!' : 'Kopiraj tekst'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
