'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  X,
  Upload,
  FileText,
  FileSpreadsheet,
  Copy,
  Check,
  Sparkles,
  Loader2,
  Landmark,
  Save,
  PenTool,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { LegalMarkdown, copyFormattedLegalText } from '@/components/LegalMarkdown';
import {
  runLegalReviewAction,
  parseReferenceDocumentFile,
  publishReviewedActToPraksa,
} from '@/app/actions/draftGeneratorActions';
import { saveDraftToSpis } from '@/app/actions/chatActions';
import { sendPredmetToSigning } from '@/app/actions/predmetActions';
import { type PredmetIshod, PREDMET_ISHODI } from '@/lib/predmet-meta';
import { supabase } from '@/lib/supabase';

interface LegalReviewModalProps {
  predmetId: string;
  klasa: string;
  stranka: string;
  isOpen: boolean;
  onClose: () => void;
  onActSavedToCase?: () => void;
}

export function LegalReviewModal({
  predmetId,
  klasa,
  stranka,
  isOpen,
  onClose,
  onActSavedToCase,
}: LegalReviewModalProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [actText, setActText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [modelPreference, setModelPreference] = useState<'pro' | 'flash'>('pro');

  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Akcije nakon pregleda
  const [praksaBusy, setPraksaBusy] = useState(false);
  const [praksaSuccess, setPraksaSuccess] = useState<string | null>(null);
  const [praksaIshod, setPraksaIshod] = useState<PredmetIshod>('Odbijena žalba');

  const [saveDocBusy, setSaveDocBusy] = useState(false);
  const [savedToDocSuccess, setSavedToDocSuccess] = useState(false);

  const [signBusy, setSignBusy] = useState(false);
  const [signSuccess, setSignSuccess] = useState(false);

  const [copiedWord, setCopiedWord] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    setIsUploadingFile(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await parseReferenceDocumentFile(formData);
      if (res.success && res.text) {
        setActText(res.text);
        setUploadedFileName(file.name);
        setActiveTab('paste'); // Prebaci na prikaz izvučenog teksta da korisnik vidi što je učitano
      } else {
        setErrorMsg(res.error || 'Nije uspjelo čitanje teksta iz datoteke.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Greška pri obradi datoteke.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleLoadFromCaseDocs = async () => {
    try {
      const { data: docs } = await supabase
        .from('dokumenti')
        .select('id, tip_dokumenta, raw_text')
        .eq('predmet_id', predmetId)
        .neq('tip_dokumenta', '__META__')
        .neq('tip_dokumenta', '__CHAT__');

      if (docs && docs.length > 0) {
        const found = docs.find(
          (d) =>
            d.tip_dokumenta.toLowerCase().includes('drugostup') ||
            d.tip_dokumenta.toLowerCase().includes('rješenje') ||
            (d.raw_text && d.raw_text.toLowerCase().includes('obrazloženje'))
        );
        if (found && found.raw_text) {
          setActText(found.raw_text);
          setUploadedFileName('Dokument iz spisa');
        } else {
          setErrorMsg('U ovom spisu još nema spremljenog drugostupanjskog rješenja.');
        }
      } else {
        setErrorMsg('U spisu nema pronađenih dokumenata.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Greška pri učitavanju dokumenata.');
    }
  };

  const handleRunReview = async () => {
    if (!actText.trim() || actText.trim().length < 30) {
      setErrorMsg('Molimo unesite ili učitajte tekst rješenja za pregled.');
      return;
    }

    setIsReviewing(true);
    setErrorMsg(null);
    setPraksaSuccess(null);
    setSavedToDocSuccess(false);

    try {
      const res = await runLegalReviewAction({
        predmetId,
        actText: actText.trim(),
        modelPreference,
      });

      if (res.success && res.reviewText) {
        setReviewResult(res.reviewText);

        // Prepoznaj ishod iz teksta rješenja za eventualnu objavu u praksi
        const lower = actText.toLowerCase();
        if (lower.includes('poništava se') || lower.includes('uvažava se')) {
          setPraksaIshod('Poništeno rješenje');
        } else if (lower.includes('odbacuje se')) {
          setPraksaIshod('Odbačena žalba');
        } else {
          setPraksaIshod('Odbijena žalba');
        }
      } else {
        setErrorMsg(res.error || 'Nije uspjela pravna revizija rješenja.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Greška pri provođenju pravne revizije.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleSaveToCase = async () => {
    if (!actText.trim()) return;
    setSaveDocBusy(true);
    try {
      const res = await saveDraftToSpis({
        predmetId,
        text: actText.trim(),
        naziv: `Drugostupanjsko rješenje — završeno (${new Date().toLocaleDateString('hr-HR')})`,
        docRole: 'Drugostupanjsko rješenje',
      });
      if (!res.error) {
        setSavedToDocSuccess(true);
        onActSavedToCase?.();
        window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
        router.refresh();
      } else {
        alert(res.error);
      }
    } catch (err: any) {
      alert(err.message || 'Greška pri spremanju u spis.');
    } finally {
      setSaveDocBusy(false);
    }
  };

  const handlePublishToPraksa = async () => {
    if (!actText.trim()) return;
    setPraksaBusy(true);
    try {
      const res = await publishReviewedActToPraksa({
        predmetId,
        actText: actText.trim(),
        ishod: praksaIshod,
      });
      if (res.success) {
        setPraksaSuccess(res.insertedTitle || 'Rješenje je uspješno dodano u Bazu prakse!');
        router.refresh();
      } else {
        alert(res.error || 'Greška pri objavi u Bazu prakse.');
      }
    } catch (err: any) {
      alert(err.message || 'Greška pri objavi u praksu.');
    } finally {
      setPraksaBusy(false);
    }
  };

  const handleSendToSigningAndSave = async () => {
    setSignBusy(true);
    try {
      // 1. Prvo spremi u spis ako već nije spremljeno
      if (!savedToDocSuccess) {
        await saveDraftToSpis({
          predmetId,
          text: actText.trim(),
          naziv: `Drugostupanjsko rješenje — upućeno na potpis`,
          docRole: 'Drugostupanjsko rješenje',
        });
      }
      // 2. Pošalji na potpis
      const res = await sendPredmetToSigning(predmetId);
      if (!res.error) {
        setSignSuccess(true);
        onActSavedToCase?.();
        window.dispatchEvent(new CustomEvent('predmet-docs-updated'));
        router.refresh();
      } else {
        alert(res.error);
      }
    } catch (err: any) {
      alert(err.message || 'Greška pri slanju na potpis.');
    } finally {
      setSignBusy(false);
    }
  };

  const handleCopyWord = async () => {
    const ok = await copyFormattedLegalText(actText);
    if (ok) {
      setCopiedWord(true);
      setTimeout(() => setCopiedWord(false), 2500);
    }
  };

  const charCount = actText.length;
  const wordCount = actText.trim() ? actText.trim().split(/\s+/).length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={() => !isReviewing && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden"
      >
        {/* ZAGLAVLJE MODALA */}
        <div className="px-6 py-4 bg-indigo-50/80 dark:bg-indigo-950/60 border-b border-indigo-100 dark:border-indigo-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
                AI Pregled i revizija završenog rješenja kod savjetnika
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                Spis: <strong>{klasa}</strong> • Stranka: <strong>{stranka}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Odabir modela */}
            <select
              value={modelPreference}
              disabled={isReviewing}
              onChange={(e) => setModelPreference(e.target.value as 'pro' | 'flash')}
              className="text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="pro">🧠 Gemini Pro (Preporučeno za reviziju)</option>
              <option value="flash">⚡ Gemini Flash (Brza provjera)</option>
            </select>

            <button
              type="button"
              disabled={isReviewing}
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* GLAVNI SADRŽAJ: DVA STUPCA (Lijevo: Tekst akta, Desno: AI Izvješće o reviziji) */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          {/* LIJEVI STUPAC: Unos / Uređivanje završnog akta */}
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 p-4 space-y-3">
            {/* Traka za odabir unosa: Zalijepi vs Učitaj datoteku */}
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    activeTab === 'paste'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Zalijepi tekst (Ctrl+V)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('upload');
                    fileInputRef.current?.click();
                  }}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                    activeTab === 'upload'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  Učitaj Word / PDF
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadFromCaseDocs}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  title="Učitaj rješenje iz dokumenata ovog spisa"
                >
                  Učitaj iz spisa
                </button>
                {actText && (
                  <button
                    type="button"
                    onClick={() => {
                      setActText('');
                      setUploadedFileName(null);
                      setReviewResult(null);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    Očisti
                  </button>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.doc,.pdf,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            {/* Učitavanje datoteke banner */}
            {isUploadingFile && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Čitam i izvlačim tekst iz datoteke (Word / PDF)...</span>
              </div>
            )}

            {uploadedFileName && !isUploadingFile && (
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="truncate">
                  Učitana datoteka: <strong>{uploadedFileName}</strong>
                </span>
                <span className="text-[11px] text-slate-400">
                  {charCount.toLocaleString('hr-HR')} znakova • ~{wordCount} riječi
                </span>
              </div>
            )}

            {/* Glavno polje za unos teksta rješenja */}
            <div className="flex-1 flex flex-col min-h-0 relative">
              <textarea
                value={actText}
                onChange={(e) => setActText(e.target.value)}
                placeholder="Zalijepite ovdje tekst Vašeg rješenja (iz Microsoft Worda ili sustava upravljanja dokumentima)..."
                disabled={isReviewing}
                className="w-full flex-1 p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/60 text-slate-900 dark:text-slate-100 text-xs sm:text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors font-sans"
              />
            </div>

            {/* Gumb za pokretanje pregleda na dnu lijevog stupca */}
            <div className="pt-2 shrink-0 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 hidden sm:inline">
                {charCount > 0 ? `${charCount.toLocaleString('hr-HR')} znakova` : 'Zalijepite ili učitajte akt'}
              </span>

              <button
                type="button"
                disabled={isReviewing || !actText.trim() || isUploadingFile}
                onClick={handleRunReview}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                {isReviewing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Savjetnik provjerava spis i propise...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Pokreni pregled savjetnika</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* DESNI STUPAC: AI Izvješće o pravnoj reviziji + Akcije (Praksa, Spremanje, Potpis) */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-950/40 p-4 space-y-3">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  Izvješće o pravnoj reviziji nacrta
                </h3>
              </div>

              {reviewResult && (
                <button
                  type="button"
                  onClick={handleRunReview}
                  disabled={isReviewing}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Osvježi pregled
                </button>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-xl border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Prostor za prikaz rezultata pregleda */}
            <div className="flex-1 overflow-y-auto p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              {isReviewing ? (
                <div className="h-full flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center animate-pulse">
                    <ShieldCheck className="w-6 h-6 animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Savjetnik analizira Vaš akt...
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                      Uspoređujem uneseni tekst sa žalbom stranke, provjeravam je li odgovoreno na sve prigovore i kontroliram zakonske članke ZUP-a i materijalnog prava.
                    </p>
                  </div>
                </div>
              ) : reviewResult ? (
                <div className="space-y-4">
                  <LegalMarkdown content={reviewResult} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-12 text-center text-slate-400 space-y-2">
                  <ShieldCheck className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    Nacrt još nije pregledan
                  </p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    U lijevom stupcu zalijepite ili učitajte Vaše rješenje iz Worda i kliknite <strong>„Pokreni pregled savjetnika”</strong>.
                  </p>
                </div>
              )}
            </div>

            {/* AKCIJE NAKON PREGLEDA: Dodaj u praksu, Spremi u spis, Pošalji na potpis */}
            {reviewResult && (
              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Sljedeći koraci za ovo rješenje:
                  </p>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyWord}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                      title="Kopiraj formatirani tekst za Word"
                    >
                      {copiedWord ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 dark:text-emerald-300">Kopirano</span>
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="w-3 h-3 text-blue-600" />
                          <span>Kopiraj za Word</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Poruke o uspjehu */}
                {praksaSuccess && (
                  <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Odluka je uspješno GDPR anonimizirana i dodana u Bazu prakse!</span>
                  </div>
                )}

                {savedToDocSuccess && (
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Rješenje je trajno spremljeno kao službeni dokument u lijevom stupcu spisa!</span>
                  </div>
                )}

                {signSuccess && (
                  <div className="p-2.5 bg-purple-50 dark:bg-purple-950/50 rounded-lg border border-purple-200 dark:border-purple-800 text-xs text-purple-800 dark:text-purple-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Predmet je upućen na potpis ovlaštenoj osobi (status: Na potpisu)!</span>
                  </div>
                )}

                {/* Gumbi akcija */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Akcija 1: Dodaj u praksu */}
                  <button
                    type="button"
                    disabled={praksaBusy || Boolean(praksaSuccess)}
                    onClick={handlePublishToPraksa}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer disabled:opacity-50"
                    title="Anonimiziraj i uvrsti ovo ogledno rješenje u Bazu prakse za buduće predmete"
                  >
                    {praksaBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Landmark className="w-3.5 h-3.5 text-indigo-600" />
                    )}
                    <span>{praksaSuccess ? 'Dodano u praksu ✓' : 'Dodaj u praksu'}</span>
                  </button>

                  {/* Akcija 2: Spremi u spis */}
                  <button
                    type="button"
                    disabled={saveDocBusy || savedToDocSuccess}
                    onClick={handleSaveToCase}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300 transition-colors cursor-pointer disabled:opacity-50"
                    title="Spremi ovo završeno rješenje u dokumente spisa"
                  >
                    {saveDocBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5 text-blue-600" />
                    )}
                    <span>{savedToDocSuccess ? 'Spremljeno u spis ✓' : 'Spremi u spis'}</span>
                  </button>

                  {/* Akcija 3: Pošalji na potpis */}
                  <button
                    type="button"
                    disabled={signBusy || signSuccess}
                    onClick={handleSendToSigningAndSave}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    title="Spremi rješenje i odmah prebaci fazu predmeta u 'Na potpisu'"
                  >
                    {signBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PenTool className="w-3.5 h-3.5" />
                    )}
                    <span>{signSuccess ? 'Poslano na potpis ✓' : 'Pošalji na potpis'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
