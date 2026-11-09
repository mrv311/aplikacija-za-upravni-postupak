'use client';

import { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileText,
  Scale,
  ShieldCheck,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Layers,
  Gavel,
  Tag,
  Building2,
  Calendar,
  Hash,
} from 'lucide-react';
import {
  previewSudskaOdlukaAction,
  confirmPublishSudskaOdlukaAction,
  SudskaOdlukaPreviewResult,
} from '@/app/actions/praksaActions';

interface DodajOdlukuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (nazivDatoteke: string, chunkCount: number) => void;
}

const SUDSKA_TIJELA = [
  'Upravni sud u Zagrebu',
  'Upravni sud u Splitu',
  'Upravni sud u Rijeci',
  'Upravni sud u Osijeku',
  'Visoki upravni sud RH (VUSRH)',
  'Ustavni sud RH',
  'Ministarstvo zaštite okoliša i zelene tranzicije',
  'Ostalo / Drugo tijelo',
];

const KATEGORIJE_PRAKSE = [
  'Troškovi postupka',
  'Ostali upravni sporovi',
  'Vodni doprinos',
  'Naknada za uređenje voda',
  'Naknada za zaštitu voda',
  'Naknada za korištenje voda',
  'Naknada za koncesiju',
  'Poništavanje i ukidanje rješenja (ZUP)',
  'Obnova postupka',
  'Oglašavanje rješenja ništavim',
  'Zakup javnog vodnog dobra',
  'Akti po presudama',
];

const ISHODI_ODLUKE = [
  'Obustava postupka - dosuđeni troškovi',
  'Obustava postupka',
  'Poništeno rješenje (usvojena tužba)',
  'Odbijena tužba (potvrđeno rješenje)',
  'Odbačena tužba',
  'Dosuđeni troškovi postupka',
  'Odbijeni troškovi postupka',
  'Ostalo',
];

export function DodajOdlukuModal({ isOpen, onClose, onSuccess }: DodajOdlukuModalProps) {
  // Stanje koraka: 'input' (odabir/unos) | 'preview' (pregled i uređivanje)
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [tab, setTab] = useState<'file' | 'text'>('file');

  // Input podaci
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Opcionalne smjernice
  const [hintSud, setHintSud] = useState('');
  const [hintPodrucje, setHintPodrucje] = useState('Troškovi postupka');
  const [hintPoslovniBroj, setHintPoslovniBroj] = useState('');
  const [hintIshod, setHintIshod] = useState('Obustava postupka - dosuđeni troškovi');
  const [hintVrstaAkta, setHintVrstaAkta] = useState('Rješenje');
  const [hintGodina, setHintGodina] = useState(new Date().getFullYear().toString());

  // Rezultat analize za Korak 2
  const [proposedTitle, setProposedTitle] = useState('');
  const [anonymizedText, setAnonymizedText] = useState('');
  const [pravnaBit, setPravnaBit] = useState('');
  const [extractedMeta, setExtractedMeta] = useState<SudskaOdlukaPreviewResult['extractedData'] | null>(null);
  const [chunkEstimate, setChunkEstimate] = useState(1);

  // Statusi obrade
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setStep('input');
    setFile(null);
    setRawText('');
    setErrorMsg(null);
    setProposedTitle('');
    setAnonymizedText('');
    setPravnaBit('');
    setExtractedMeta(null);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setErrorMsg(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  // Korak 1 -> 2: Pokretanje AI ekstrakcije i GDPR anonimizacije
  const handleStartAnalysis = async () => {
    setErrorMsg(null);
    if (tab === 'file' && !file) {
      setErrorMsg('Molimo odaberite ili priložite datoteku (PDF, Word ili TXT).');
      return;
    }
    if (tab === 'text' && rawText.trim().length < 50) {
      setErrorMsg('Molimo unesite tekst odluke (minimalno 50 znakova).');
      return;
    }

    setIsAnalyzing(true);
    try {
      const fd = new FormData();
      if (tab === 'file' && file) {
        fd.append('file', file);
      }
      if (tab === 'text') {
        fd.append('sadrzajTekst', rawText);
      }
      if (hintSud) fd.append('hintSud', hintSud);
      if (hintPodrucje) fd.append('hintPodrucje', hintPodrucje);
      if (hintPoslovniBroj) fd.append('hintPoslovniBroj', hintPoslovniBroj);
      if (hintIshod) fd.append('hintIshod', hintIshod);
      if (hintVrstaAkta) fd.append('hintVrstaAkta', hintVrstaAkta);
      if (hintGodina) fd.append('hintGodina', hintGodina);

      const res = await previewSudskaOdlukaAction(fd);

      if (res.error || !res.success) {
        setErrorMsg(res.error || 'Nije uspjela AI analiza odluke.');
        return;
      }

      setProposedTitle(res.proposedTitle || '');
      setAnonymizedText(res.anonymizedText || '');
      setPravnaBit(res.extractedData?.pravnaBit || '');
      setExtractedMeta(res.extractedData || null);
      setChunkEstimate(res.chunkEstimate || 1);
      setStep('preview');
    } catch (err: any) {
      console.error('Greška pri analizi:', err);
      setErrorMsg(err.message || 'Neočekivana greška pri obradi odluke.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Korak 2 -> Trajni upis u bazu
  const handleConfirmPublish = async () => {
    if (!proposedTitle.trim()) {
      setErrorMsg('Naziv odluke u bazi ne smije biti prazan.');
      return;
    }
    if (!anonymizedText.trim() || anonymizedText.length < 50) {
      setErrorMsg('Tekst odluke mora imati barem 50 znakova.');
      return;
    }

    setIsPublishing(true);
    setErrorMsg(null);

    try {
      const res = await confirmPublishSudskaOdlukaAction({
        nazivDatoteke: proposedTitle.trim(),
        anonymizedText: anonymizedText.trim(),
        pravnaBit: pravnaBit.trim(),
      });

      if (res.error || !res.success) {
        setErrorMsg(res.error || 'Nije uspjelo spremanje u bazu prakse.');
        return;
      }

      onSuccess(res.nazivDatoteke || proposedTitle, res.chunkCount || chunkEstimate);
      handleReset();
      onClose();
    } catch (err: any) {
      console.error('Greška pri objavi u praksu:', err);
      setErrorMsg(err.message || 'Greška pri upisu u bazu prakse.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={() => !isAnalyzing && !isPublishing && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100"
      >
        {/* ZAGLAVLJE */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Uvoz sudske odluke u Bazu prakse
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-700/60">
                  {step === 'input' ? 'Korak 1/2' : 'Korak 2/2: Pregled'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {step === 'input'
                  ? 'Priložite rješenje ili presudu suda. AI automatski ekstrahira meritum i provodi GDPR anonimizaciju.'
                  : 'Provjerite predloženi naziv i anonimizirani tekst prije trajnog indeksiranja (3072 dim).'}
              </p>
            </div>
          </div>

          <button
            onClick={() => !isAnalyzing && !isPublishing && onClose()}
            disabled={isAnalyzing || isPublishing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Zatvori"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* GREŠKA ALERT */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2.5 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Upozorenje / Greška:</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-500 hover:text-rose-700 text-xs font-bold underline"
            >
              U redu
            </button>
          </div>
        )}

        {/* TIJELO MODALA */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 'input' ? (
            /* =================== KORAK 1: UNOS & SMJERNICE =================== */
            <div className="space-y-5">
              {/* Odabir načina unosa (Tabovi) */}
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setTab('file')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    tab === 'file'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Priloži datoteku (PDF / Word)
                </button>
                <button
                  type="button"
                  onClick={() => setTab('text')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    tab === 'text'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Zalijepi tekst odluke
                </button>
              </div>

              {/* Polje za datoteku */}
              {tab === 'file' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    isDragOver
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                      : file
                      ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 hover:border-blue-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-white text-sm">{file.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Veličina: {(file.size / 1024).toFixed(1)} KB &bull; Kliknite za zamjenu datoteke
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                        Povucite datoteku ovdje ili <span className="text-blue-600 underline">kliknite za odabir</span>
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Podržano: PDF (digitalni i skenirani), Word (.docx, .doc) i TXT
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Polje za izravni unos teksta */}
              {tab === 'text' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Tekst presude / rješenja suda:</span>
                    <span className="text-[11px] text-slate-400">{rawText.length} znakova</span>
                  </label>
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Zalijepite ovdje tekst odluke (zaglavlje, izreku, obrazloženje i odluku o troškovima)..."
                    className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-mono"
                  />
                </div>
              )}

              {/* SMJERNICE / PRE-POPUNJAVANJE (AI automatski prepoznaje ako se ostavi prazno) */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Smjernice za klasifikaciju (opcionalno - AI će detektirati ako ostavite prazno)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Sud / Tijelo */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                      <Building2 className="w-3 h-3" />
                      Sud / Donositelj odluke
                    </label>
                    <select
                      value={hintSud}
                      onChange={(e) => setHintSud(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none"
                    >
                      <option value="">Automatska detekcija suda</option>
                      {SUDSKA_TIJELA.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Pravno područje */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                      <Tag className="w-3 h-3" />
                      Područje / Institut
                    </label>
                    <select
                      value={hintPodrucje}
                      onChange={(e) => setHintPodrucje(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none"
                    >
                      {KATEGORIJE_PRAKSE.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Ishod */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                      <Gavel className="w-3 h-3" />
                      Ishod odluke
                    </label>
                    <select
                      value={hintIshod}
                      onChange={(e) => setHintIshod(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none"
                    >
                      {ISHODI_ODLUKE.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Poslovni broj */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                      <Hash className="w-3 h-3" />
                      Poslovni broj (npr. UsI-1234/26)
                    </label>
                    <input
                      type="text"
                      value={hintPoslovniBroj}
                      onChange={(e) => setHintPoslovniBroj(e.target.value)}
                      placeholder="npr. UsI-1234/26 (ili ostavite prazno)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none"
                    />
                  </div>

                  {/* Vrsta akta */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                      <FileText className="w-3 h-3" />
                      Vrsta akta
                    </label>
                    <select
                      value={hintVrstaAkta}
                      onChange={(e) => setHintVrstaAkta(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none"
                    >
                      <option value="Rješenje">Rješenje</option>
                      <option value="Presuda">Presuda</option>
                      <option value="Zaključak">Zaključak</option>
                      <option value="Ostalo">Ostalo</option>
                    </select>
                  </div>

                  {/* Godina */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1 mb-1">
                      <Calendar className="w-3 h-3" />
                      Godina odluke
                    </label>
                    <input
                      type="text"
                      value={hintGodina}
                      onChange={(e) => setHintGodina(e.target.value)}
                      placeholder="2026"
                      className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* GDPR napomena */}
              <div className="flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400 bg-blue-50/40 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/50">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Automatska GDPR zaštita:</strong> AI će anonimizirati fizičke osobe (zamjena inicijalima),
                  privatne tvrtke i kućne adrese, dok će nazive sudova, meritum spora, obrazloženje i troškove zadržati u cijelosti.
                </p>
              </div>
            </div>
          ) : (
            /* =================== KORAK 2: PREGLED I UREĐIVANJE =================== */
            <div className="space-y-4">
              {/* Detektirani bedževi */}
              {extractedMeta && (
                <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-300 mr-1 flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5 text-blue-600" />
                    Prepoznato:
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-blue-100/70 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800">
                    {extractedMeta.sud}
                  </span>
                  {extractedMeta.poslovniBroj && (
                    <span className="px-2.5 py-1 rounded-md bg-indigo-100/70 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
                      {extractedMeta.poslovniBroj}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-md bg-purple-100/70 dark:bg-purple-950 text-purple-800 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800">
                    {extractedMeta.ishod}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-100/70 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800">
                    Stranka: {extractedMeta.anonymizedParty}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-emerald-100/70 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {chunkEstimate} {chunkEstimate === 1 ? 'vektorski dio' : 'vektorska dijela'} (3072 dim)
                  </span>
                </div>
              )}

              {/* Standardizirani naslov u bazi prakse */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Službeni naziv zapisa u bazi prakse (naziv_datoteke):</span>
                  <span className="text-[11px] text-slate-400">Možete dodatno prilagoditi</span>
                </label>
                <input
                  type="text"
                  value={proposedTitle}
                  onChange={(e) => setProposedTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>

              {/* Sažetak pravnog shvaćanja / merituma */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Pravna bit / Sažetak merituma i troškova:
                </label>
                <input
                  type="text"
                  value={pravnaBit}
                  onChange={(e) => setPravnaBit(e.target.value)}
                  placeholder="npr. Obustava postupka nakon donošenja rješenja; tuženiku naloženi troškovi zbog šutnje uprave."
                  className="w-full px-3 py-2 text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                />
              </div>

              {/* Anonimizirani tekst odluke */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Anonimizirani tekst za vektorsko pretraživanje (RAG):</span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> GDPR anonimizirano
                  </span>
                </label>
                <textarea
                  rows={10}
                  value={anonymizedText}
                  onChange={(e) => setAnonymizedText(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-mono leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* PODNOŽJE MODALA (Akcijski gumbi) */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40">
          {step === 'input' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isAnalyzing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Odustani
              </button>

              <button
                type="button"
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center gap-2 shadow-xs disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI analizira i anonimizira tekst...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Analiziraj i pripremi za bazu &rarr;</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('input')}
                disabled={isPublishing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Natrag na unos
              </button>

              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={isPublishing}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all flex items-center gap-2 shadow-xs disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generiram 3072-dim vektore i spremam u bazu...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Potvrdi i spremi u bazu prakse</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
