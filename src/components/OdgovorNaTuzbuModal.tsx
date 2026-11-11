'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileText,
  Download,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Building2,
  RefreshCw,
  Loader2,
  FileCheck,
  Upload,
  FolderOpen,
  Trash2,
  Eye,
  EyeOff,
  Check,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { UpravniSpor } from '@/lib/upravni-sporovi';
import {
  type OdgovorScenarij,
  type OdgovorNaTuzbuInput,
  detectCourtDetails,
  getCroatianLongDate,
  generateDefaultScenarioText,
} from '@/lib/docx-odgovor-generator';
import {
  generateAiOdgovorAction,
  parseDocumentTextAction,
  findOneDriveCourtFilesAction,
  loadOneDriveCourtFileAction,
  findLinkedZupPredmetAction,
  type CourtFolderFileItem,
} from '@/app/actions/odgovorNaTuzbuActions';

interface OdgovorNaTuzbuModalProps {
  isOpen: boolean;
  onClose: () => void;
  spor: UpravniSpor | null;
}

interface LoadedDocInfo {
  name: string;
  text: string;
  charCount: number;
  source: 'onedrive' | 'upload';
}

export default function OdgovorNaTuzbuModal({
  isOpen,
  onClose,
  spor,
}: OdgovorNaTuzbuModalProps) {
  // Scenario state
  const [scenarij, setScenarij] = useState<OdgovorScenarij>('sutnja_nije_zaprimljeno');

  // Document metadata states
  const [sudNaziv, setSudNaziv] = useState('');
  const [sudAdresa, setSudAdresa] = useState('');
  const [poslovniBroj, setPoslovniBroj] = useState('');
  const [tuzitelj, setTuzitelj] = useState('');
  const [opunomocenik, setOpunomocenik] = useState('');
  const [oib, setOib] = useState('');
  const [klasa, setKlasa] = useState('');
  const [urbroj, setUrbroj] = useState('');
  const [datum, setDatum] = useState('');
  const [predmetSpora, setPredmetSpora] = useState('');

  // Scenario specific fields
  const [prvostupanjskiAkt, setPrvostupanjskiAkt] = useState('');
  const [datumPredajeZalbe, setDatumPredajeZalbe] = useState('');
  const [donesenoRjesenje, setDonesenoRjesenje] = useState('');
  const [datumDostave, setDatumDostave] = useState('');
  const [ishodRjesenja, setIshodRjesenja] = useState('odbijena je kao neosnovana žalba podnositelja');
  const [meritumArgumenti, setMeritumArgumenti] = useState('');

  // Meritum: Izvorni dokumenti (Tužba i Pobijano rješenje / spis)
  const [tuzbaDoc, setTuzbaDoc] = useState<LoadedDocInfo | null>(null);
  const [rjesenjeDoc, setRjesenjeDoc] = useState<LoadedDocInfo | null>(null);
  const [showTuzbaPreview, setShowTuzbaPreview] = useState(false);
  const [showRjesenjePreview, setShowRjesenjePreview] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);

  // OneDrive e-Komunikacija pretraga
  const [oneDriveFolder, setOneDriveFolder] = useState<string | null>(null);
  const [oneDriveFiles, setOneDriveFiles] = useState<CourtFolderFileItem[]>([]);
  const [isLoadingOneDrive, setIsLoadingOneDrive] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);

  // Povezani ZUP predmet
  const [linkedZup, setLinkedZup] = useState<any | null>(null);

  // AI & custom text
  const [tekstObrazlozenja, setTekstObrazlozenja] = useState('');
  const [aiUpute, setAiUpute] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccessMsg, setAiSuccessMsg] = useState('');

  // Potpisnik
  const [potpisnikFunkcija, setPotpisnikFunkcija] = useState('SEKTORSKI SAVJETNIK');
  const [potpisnikIme, setPotpisnikIme] = useState('Dino Malbaša, dipl. iur.');

  // UI state
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState('');

  const tuzbaInputRef = useRef<HTMLInputElement>(null);
  const rjesenjeInputRef = useRef<HTMLInputElement>(null);

  // Inicijalizacija polja kada se otvori modal
  useEffect(() => {
    if (!spor || !isOpen) return;

    const detected = detectCourtDetails(spor.sud || '');
    setSudNaziv(detected.naziv);
    setSudAdresa(detected.adresa);
    setPoslovniBroj(spor.poslovniBroj || '');

    const tuziteljBase = spor.tuzitelj || '';
    const tuziteljFull = spor.oib ? `${tuziteljBase} (OIB: ${spor.oib})` : tuziteljBase;
    setTuzitelj(tuziteljFull);
    setOib(spor.oib || '');

    setDatum(getCroatianLongDate());

    const currentYear = new Date().getFullYear().toString().slice(-2);
    setKlasa(spor.upIiRjesenje || `UP/II-325-08/${currentYear}-02/${spor.rbr || '1'}`);
    setUrbroj(`517-05-2-${currentYear}-2`);

    // Određivanje početnog scenarija
    if (spor.aktUpIiPoPresudi && spor.aktUpIiPoPresudi.trim()) {
      setScenarij('sutnja_naknadno_doneseno');
      setDonesenoRjesenje(spor.aktUpIiPoPresudi);
      setPredmetSpora('šutnje uprave');
    } else if (spor.isSutnjaUprave || (spor.predmet && spor.predmet.toLowerCase().includes('šutnja'))) {
      setScenarij('sutnja_nije_zaprimljeno');
      setPredmetSpora('šutnje uprave');
    } else {
      setScenarij('meritum_potvrda_rjesenja');
      setPredmetSpora(spor.predmet || 'ocjene zakonitosti rješenja');
    }

    if (spor.upIiRjesenje) {
      setPrvostupanjskiAkt(spor.upIiRjesenje);
    }

    // Reset doc stanja
    setTuzbaDoc(null);
    setRjesenjeDoc(null);
    setShowTuzbaPreview(false);
    setShowRjesenjePreview(false);
    setExportSuccess(false);
    setExportError('');
    setAiSuccessMsg('');
    setAiError('');

    // 1. Automatski potraži mapu na OneDrive-u (e-Komunikacija)
    setIsLoadingOneDrive(true);
    findOneDriveCourtFilesAction(spor.poslovniBroj, spor.tuzitelj)
      .then((res) => {
        if (res.success && res.folderName) {
          setOneDriveFolder(res.folderName);
          setOneDriveFiles(res.files || []);
        } else {
          setOneDriveFolder(null);
          setOneDriveFiles([]);
        }
      })
      .finally(() => setIsLoadingOneDrive(false));

    // 2. Potraži povezani ZUP predmet u bazi ako postoji
    findLinkedZupPredmetAction(spor.upIiRjesenje, spor.tuzitelj)
      .then((zup) => {
        if (zup) setLinkedZup(zup);
      })
      .catch(() => {});
  }, [spor, isOpen]);

  // Kada se promijeni scenarij (i korisnik nije u prilagođenom/AI radu), osvježi zadani tekst
  useEffect(() => {
    if (!spor || scenarij === 'ai_prilagodeno') return;

    const inputData: OdgovorNaTuzbuInput = {
      klasa,
      urbroj,
      sudNaziv,
      sudAdresa,
      tuzitelj,
      poslovniBrojSuda: poslovniBroj,
      scenarij,
      predmetSpora,
      prvostupanjskiAkt,
      datumPredajeZalbe,
      donesenoRjesenjeKlasaUrbroj: donesenoRjesenje,
      datumDostaveStranci: datumDostave,
      ishodRjesenja,
      meritumArgumenti,
      potpisnikFunkcija,
      potpisnikIme,
    };

    const paragraphs = generateDefaultScenarioText(inputData);
    setTekstObrazlozenja(paragraphs.join('\n\n'));
  }, [
    scenarij,
    sudNaziv,
    sudAdresa,
    poslovniBroj,
    tuzitelj,
    klasa,
    urbroj,
    prvostupanjskiAkt,
    datumPredajeZalbe,
    donesenoRjesenje,
    datumDostave,
    ishodRjesenja,
    meritumArgumenti,
  ]);

  if (!isOpen || !spor) return null;

  // Promjena suda uz automatsko ažuriranje adrese
  const handleSudChange = (newSud: string) => {
    setSudNaziv(newSud);
    const det = detectCourtDetails(newSud);
    if (det.adresa) {
      setSudAdresa(det.adresa);
    }
  };

  // Učitavanje datoteke s diska (iz pronađene OneDrive mape)
  const handleLoadOneDriveFile = async (
    fileName: string,
    targetSlot: 'tuzba' | 'rjesenje'
  ) => {
    if (!oneDriveFolder) return;
    setLoadingFileId(fileName);
    setAiError('');

    try {
      const res = await loadOneDriveCourtFileAction(oneDriveFolder, fileName);
      if (res.success && res.text) {
        const docInfo: LoadedDocInfo = {
          name: fileName,
          text: res.text,
          charCount: res.charCount || res.text.length,
          source: 'onedrive',
        };
        if (targetSlot === 'tuzba') {
          setTuzbaDoc(docInfo);
        } else {
          setRjesenjeDoc(docInfo);
        }
        if (res.isOcr) {
          setAiSuccessMsg(`✓ Skenirani dokument "${fileName}" uspješno je prepoznat putem optičkog OCR-a!`);
        }
      } else {
        setAiError(res.error || `Nije uspjelo čitanje datoteke "${fileName}".`);
      }
    } catch (err: any) {
      setAiError(err.message || 'Greška pri čitanju s OneDrive-a.');
    } finally {
      setLoadingFileId(null);
    }
  };

  // Drag & Drop / manualni upload datoteke (PDF / Word)
  const handleFileUpload = async (
    file: File,
    targetSlot: 'tuzba' | 'rjesenje'
  ) => {
    setIsParsingFile(true);
    setAiError('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await parseDocumentTextAction(fd);

      if (res.success && res.text) {
        const docInfo: LoadedDocInfo = {
          name: file.name,
          text: res.text,
          charCount: res.charCount || res.text.length,
          source: 'upload',
        };
        if (targetSlot === 'tuzba') {
          setTuzbaDoc(docInfo);
        } else {
          setRjesenjeDoc(docInfo);
        }
        if (res.isOcr) {
          setAiSuccessMsg(`✓ Skenirani dokument "${file.name}" uspješno je prepoznat putem optičkog OCR-a!`);
        }
      } else {
        setAiError(res.error || `Nije uspjelo čitanje teksta iz datoteke "${file.name}".`);
      }
    } catch (err: any) {
      setAiError(err.message || 'Greška pri obradi datoteke.');
    } finally {
      setIsParsingFile(false);
    }
  };

  // Pokretanje dubinske AI analize (Gemini 3.8 Flash)
  const handleGenerateAi = async () => {
    setIsGeneratingAi(true);
    setAiError('');
    setAiSuccessMsg('');

    try {
      const zupPodaci = linkedZup
        ? `Povezani ZUP predmet: KLASA: ${linkedZup.klasa}, Stranka: ${linkedZup.stranka}, Pravna osnova: ${linkedZup.pravna_osnova || '-'}`
        : undefined;

      const res = await generateAiOdgovorAction({
        tuzitelj,
        sud: sudNaziv,
        poslovniBroj,
        vrstaSpora: scenarij === 'sutnja_nije_zaprimljeno' ? 'Šutnja uprave' : 'Pobijanje rješenja',
        predmet: predmetSpora || spor.predmet || 'upravna stvar',
        pobijaniAkt: prvostupanjskiAkt || spor.upIiRjesenje,
        sazetakTuzbe: spor.vrijednostNapomena,
        dodatneUpute: aiUpute,
        tuzbaTekst: tuzbaDoc?.text,
        rjesenjeTekst: rjesenjeDoc?.text,
        zupPodaci,
      });

      if (res.success && res.tekst) {
        setTekstObrazlozenja(res.tekst);
        setScenarij('ai_prilagodeno');
        const docsUsed = [
          tuzbaDoc ? 'tužbe' : null,
          rjesenjeDoc ? 'pobijanog rješenja' : null,
        ].filter(Boolean);

        if (docsUsed.length > 0) {
          setAiSuccessMsg(
            `✓ AI je uspješno analizirao izvorni tekst ${docsUsed.join(' i ')} te sastavio strukturirani odgovor po točkama (I. – IV.)!`
          );
        } else {
          setAiSuccessMsg('✓ AI je sastavio pravno obrazloženje na temelju dostupnih podataka spora.');
        }
      } else {
        setAiError(res.error || 'Nije uspjelo generiranje odgovora.');
      }
    } catch (err: any) {
      setAiError(err.message || 'Greška u komunikaciji s AI poslužiteljem.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Preuzimanje gotovog Word dokumenta (.docx)
  const handleDownloadDocx = async () => {
    setIsExporting(true);
    setExportError('');
    setExportSuccess(false);

    try {
      const payload: OdgovorNaTuzbuInput = {
        klasa,
        urbroj,
        datum,
        sudNaziv,
        sudAdresa,
        tuzitelj,
        opunomocenik: opunomocenik || undefined,
        poslovniBrojSuda: poslovniBroj,
        scenarij,
        predmetSpora,
        prvostupanjskiAkt,
        datumPredajeZalbe,
        donesenoRjesenjeKlasaUrbroj: donesenoRjesenje,
        datumDostaveStranci: datumDostave,
        ishodRjesenja,
        meritumArgumenti,
        prilagodeniTekstObrazlozenja: tekstObrazlozenja,
        potpisnikFunkcija,
        potpisnikIme,
      };

      const res = await fetch('/api/sporovi/export-odgovor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Greška pri generiranju dokumenta.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanNum = (poslovniBroj || 'spor').replace(/[/\\?%*:|"<>]/g, '_');
      const cleanName = (spor.tuzitelj || 'stranka').replace(/[/\\?%*:|"<>]/g, '_').split(' ')[0];
      a.download = `ODGOVOR_NA_TUZBU_${cleanNum}_${cleanName}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 6000);
    } catch (err: any) {
      console.error(err);
      setExportError(err.message || 'Neuspjelo preuzimanje dokumenta.');
    } finally {
      setIsExporting(false);
    }
  };

  // Traženje detektirane tužbe ili rješenja u OneDrive mapi
  const oneDriveTuzba = oneDriveFiles.find((f) => f.role === 'tuzba');
  const oneDriveRjesenje = oneDriveFiles.find(
    (f) => f.role === 'rjesenje' || f.role === 'prilog'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-white dark:from-slate-850 dark:via-indigo-950/20 dark:to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Sastavljanje odgovora na tužbu (.docx)</span>
                <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  čl. 48. ZUS
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {poslovniBroj || 'Predmet bez broja'} • {spor.tuzitelj} • {sudNaziv}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-slate-800 dark:text-slate-200">
          {/* OBAVIJESTI I PORUKE */}
          {exportSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2.5 shadow-2xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p>✓ Word dokument (.docx) je uspješno generiran i preuzet!</p>
                <p className="text-2xs font-normal text-emerald-700 dark:text-emerald-300">
                  Dokument je formatiran prema službenom predlošku Ministarstva i spreman za e-Komunikaciju.
                </p>
              </div>
            </div>
          )}

          {exportError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}

          {(isParsingFile || loadingFileId) && (
            <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-semibold flex items-center gap-2.5 shadow-2xs animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <p>Učitavanje i obrada dokumenta u tijeku...</p>
                <p className="text-2xs font-normal text-indigo-700 dark:text-indigo-300">
                  Ako je datoteka skenirana slika bez tekstualnog sloja, automatski se provodi optičko prepoznavanje (OCR).
                </p>
              </div>
            </div>
          )}

          {/* KORAK 1: ODABIR PRAVNOG SCENARIJA */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5">
              1. Odaberite pravni scenarij odgovora:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Scenarij 1: Šutnja - nije zaprimljeno */}
              <button
                type="button"
                onClick={() => setScenarij('sutnja_nije_zaprimljeno')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scenarij === 'sutnja_nije_zaprimljeno'
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-100 mb-1">
                  <span className="text-base">❌</span>
                  <span>Šutnja – spis nije zaprimljen</span>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                  Tužitelj predao žalbu HV-u, spis nikada nije proslijeđen Ministarstvu. Rok nije počeo teći.
                </p>
              </button>

              {/* Scenarij 2: Šutnja - doneseno rješenje */}
              <button
                type="button"
                onClick={() => setScenarij('sutnja_naknadno_doneseno')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scenarij === 'sutnja_naknadno_doneseno'
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-100 mb-1">
                  <span className="text-base">📜</span>
                  <span>Šutnja – rješenje doneseno</span>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                  Ministarstvo je donijelo UP/II rješenje i otpremilo ga. Prijedlog obustave spora (čl. 24. st. 3. ZUS).
                </p>
              </button>

              {/* Scenarij 3: Meritum / potvrda zakonitosti */}
              <button
                type="button"
                onClick={() => setScenarij('meritum_potvrda_rjesenja')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scenarij === 'meritum_potvrda_rjesenja'
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-slate-900 dark:text-slate-100 mb-1">
                  <span className="text-base">⚖️</span>
                  <span>Redovni spor – potvrda rješenja</span>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                  Ministarstvo ostaje u cijelosti kod pobijanog drugostupanjskog akta i prakse Visokog upravnog suda RH.
                </p>
              </button>

              {/* Scenarij 4: AI asistent za podrobni meritum */}
              <button
                type="button"
                onClick={() => setScenarij('ai_prilagodeno')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  scenarij === 'ai_prilagodeno'
                    ? 'bg-purple-50/90 dark:bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/30'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-purple-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-purple-900 dark:text-purple-300 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>AI podrobni meritum</span>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                  Čita tekst tužbe i pobijanog rješenja te točku po točku (I.–IV.) pobija tužbene navode.
                </p>
                {tuzbaDoc && (
                  <span className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-600"></span>
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* NOVO: DOKUMENTI ZA MERITUM (TUŽBA I RJEŠENJE / ONEDRIVE) */}
          <div className="p-4 rounded-xl bg-slate-50/90 dark:bg-slate-850/90 border border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>2. Izvorni dokumenti spora za meritum (Tužba & Pobijano rješenje)</span>
              </p>
              {oneDriveFolder && (
                <span className="text-2xs px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 font-medium truncate max-w-xs">
                  <FolderOpen className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                  <span className="truncate">OneDrive: {oneDriveFolder}</span>
                </span>
              )}
            </div>

            {/* BRZI UVOZ IZ PRONAĐENE ONEDRIVE MAPE */}
            {oneDriveFolder && (oneDriveTuzba || oneDriveRjesenje) && (
              <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                  <span className="text-sm">⚡</span>
                  <span className="font-semibold">
                    Pronađene datoteke u mapi e-Komunikacije:
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {oneDriveTuzba && (
                    <button
                      type="button"
                      disabled={loadingFileId === oneDriveTuzba.name}
                      onClick={() => handleLoadOneDriveFile(oneDriveTuzba.name, 'tuzba')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-bold transition-all cursor-pointer ${
                        tuzbaDoc?.name === oneDriveTuzba.name
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                      }`}
                    >
                      {loadingFileId === oneDriveTuzba.name ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : tuzbaDoc?.name === oneDriveTuzba.name ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                      <span>
                        {tuzbaDoc?.name === oneDriveTuzba.name
                          ? '✓ Tužba učitana'
                          : `Učitaj tužbu (${oneDriveTuzba.name.length > 25 ? oneDriveTuzba.name.slice(0, 22) + '...' : oneDriveTuzba.name})`}
                      </span>
                    </button>
                  )}

                  {oneDriveRjesenje && (
                    <button
                      type="button"
                      disabled={loadingFileId === oneDriveRjesenje.name}
                      onClick={() => handleLoadOneDriveFile(oneDriveRjesenje.name, 'rjesenje')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-2xs font-bold transition-all cursor-pointer ${
                        rjesenjeDoc?.name === oneDriveRjesenje.name
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-700 hover:bg-slate-800 text-white shadow-2xs dark:bg-slate-800 dark:hover:bg-slate-700'
                      }`}
                    >
                      {loadingFileId === oneDriveRjesenje.name ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : rjesenjeDoc?.name === oneDriveRjesenje.name ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                      <span>
                        {rjesenjeDoc?.name === oneDriveRjesenje.name
                          ? '✓ Rješenje učitano'
                          : `Učitaj rješenje/odluku`}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* DVA UTORA ZA DRAG & DROP / UPLOAD: TUŽBA I POBIJANO RJEŠENJE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* UTOR 1: TUŽBA */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file, 'tuzba');
                }}
                className={`p-3.5 rounded-xl border-2 transition-all ${
                  tuzbaDoc
                    ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800/80'
                    : 'border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <FileText className={`w-4 h-4 ${tuzbaDoc ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Tekst tužbe (tužbeni navodi):
                    </span>
                  </div>
                  {tuzbaDoc && (
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {(tuzbaDoc.charCount / 1000).toFixed(1)}k znakova
                    </span>
                  )}
                </div>

                {tuzbaDoc ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[220px]" title={tuzbaDoc.name}>
                        📄 {tuzbaDoc.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowTuzbaPreview(!showTuzbaPreview)}
                          className="px-2 py-0.5 text-2xs rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                        >
                          {showTuzbaPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showTuzbaPreview ? 'Sakrij' : 'Pregled'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTuzbaDoc(null)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Ukloni tužbu"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {showTuzbaPreview && (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-2xs font-mono max-h-36 overflow-y-auto leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {tuzbaDoc.text.slice(0, 1500)}...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-3 text-center space-y-1.5">
                    <p className="text-2xs text-slate-500 dark:text-slate-400">
                      Povucite tužbu ovdje (.pdf ili .docx) ili kliknite za odabir:
                    </p>
                    <input
                      type="file"
                      ref={tuzbaInputRef}
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'tuzba');
                      }}
                    />
                    <button
                      type="button"
                      disabled={isParsingFile}
                      onClick={() => tuzbaInputRef.current?.click()}
                      className="px-3 py-1 rounded-lg text-2xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      {isParsingFile ? 'Čitanje...' : '📁 Odaberi tužbu s računala'}
                    </button>
                  </div>
                )}
              </div>

              {/* UTOR 2: POBIJANO RJEŠENJE / SPIS */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file, 'rjesenje');
                }}
                className={`p-3.5 rounded-xl border-2 transition-all ${
                  rjesenjeDoc
                    ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800/80'
                    : 'border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <FileCheck className={`w-4 h-4 ${rjesenjeDoc ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Pobijano rješenje / Spis predmeta:
                    </span>
                  </div>
                  {rjesenjeDoc && (
                    <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {(rjesenjeDoc.charCount / 1000).toFixed(1)}k znakova
                    </span>
                  )}
                </div>

                {rjesenjeDoc ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[220px]" title={rjesenjeDoc.name}>
                        📄 {rjesenjeDoc.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowRjesenjePreview(!showRjesenjePreview)}
                          className="px-2 py-0.5 text-2xs rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                        >
                          {showRjesenjePreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showRjesenjePreview ? 'Sakrij' : 'Pregled'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRjesenjeDoc(null)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="Ukloni rješenje"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {showRjesenjePreview && (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-2xs font-mono max-h-36 overflow-y-auto leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                        {rjesenjeDoc.text.slice(0, 1500)}...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-3 text-center space-y-1.5">
                    <p className="text-2xs text-slate-500 dark:text-slate-400">
                      Povucite rješenje ovdje (.pdf ili .docx) ili kliknite za odabir:
                    </p>
                    <input
                      type="file"
                      ref={rjesenjeInputRef}
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'rjesenje');
                      }}
                    />
                    <button
                      type="button"
                      disabled={isParsingFile}
                      onClick={() => rjesenjeInputRef.current?.click()}
                      className="px-3 py-1 rounded-lg text-2xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    >
                      {isParsingFile ? 'Čitanje...' : '📁 Odaberi rješenje s računala'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* AI GENERIRANJE NA TEMELJU UČITANIH DOKUMENATA */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={aiUpute}
                  onChange={(e) => setAiUpute(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  placeholder="Dodatni fokus (neobvezno, npr: Posebno istakni da tužitelj nije fiducijar...)"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateAi}
                disabled={isGeneratingAi}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-sm hover:shadow cursor-pointer shrink-0"
              >
                {isGeneratingAi ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gemini analizira meritum...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {tuzbaDoc || rjesenjeDoc
                        ? '✨ Generiraj podrobni meritumski odgovor (I.–IV.)'
                        : '✨ Generiraj pravni nacrt s AI'}
                    </span>
                  </>
                )}
              </button>
            </div>

            {aiSuccessMsg && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-50 dark:bg-emerald-950/60 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{aiSuccessMsg}</span>
              </p>
            )}

            {aiError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">⚠️ {aiError}</p>
            )}
          </div>

          {/* KORAK 3: PODACI ZA MEMORANDUM I ZAGLAVLJE */}
          <div className="p-4 rounded-xl bg-slate-50/60 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>3. Podaci za memorandum i zaglavlje</span>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1 font-semibold">Nadležni upravni sud:</label>
                <input
                  type="text"
                  value={sudNaziv}
                  onChange={(e) => handleSudChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  placeholder="npr. UPRAVNI SUD U ZAGREBU"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Adresa suda:</label>
                <input
                  type="text"
                  value={sudAdresa}
                  onChange={(e) => setSudAdresa(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  placeholder="npr. Avenija Dubrovnik 6 i 8, Zagreb"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-semibold">Poslovni broj suda:</label>
                <input
                  type="text"
                  value={poslovniBroj}
                  onChange={(e) => setPoslovniBroj(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-indigo-600 dark:text-indigo-400"
                  placeholder="npr. Us I-754/2026"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Datum odgovora:</label>
                <input
                  type="text"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  placeholder="npr. 11. studenoga 2026."
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">KLASA (Ministarstvo):</label>
                <input
                  type="text"
                  value={klasa}
                  onChange={(e) => setKlasa(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  placeholder="UP/II-325-08/..."
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">URBROJ (Ministarstvo):</label>
                <input
                  type="text"
                  value={urbroj}
                  onChange={(e) => setUrbroj(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  placeholder="517-05-2-26-2"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Tužitelj (naziv/adresa/OIB):</label>
                <input
                  type="text"
                  value={tuzitelj}
                  onChange={(e) => setTuzitelj(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Opunomoćenik (ako postoji):</label>
                <input
                  type="text"
                  value={opunomocenik}
                  onChange={(e) => setOpunomocenik(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  placeholder="npr. odvjetnik Luka Matković"
                />
              </div>
            </div>

            {/* Specifična polja prema scenariju */}
            {scenarij === 'sutnja_naknadno_doneseno' && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="md:col-span-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Klasa i Urbroj naknadno donesenog rješenja:
                  </label>
                  <input
                    type="text"
                    value={donesenoRjesenje}
                    onChange={(e) => setDonesenoRjesenje(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    placeholder="npr. KLASA: UP/II-325-08/25-02/224, URBROJ: 517-05-2-26-2 od 29. rujna 2026."
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Datum otpreme / dostave:
                  </label>
                  <input
                    type="text"
                    value={datumDostave}
                    onChange={(e) => setDatumDostave(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    placeholder="npr. 1. listopada 2026."
                  />
                </div>
              </div>
            )}
          </div>

          {/* KORAK 4: PREGLED I UREĐIVANJE TEKSTA OBRAZLOŽENJA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5 text-indigo-500" />
                <span>4. Pregled i uređivanje teksta obrazloženja:</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const inputData: OdgovorNaTuzbuInput = {
                    klasa,
                    urbroj,
                    sudNaziv,
                    sudAdresa,
                    tuzitelj,
                    poslovniBrojSuda: poslovniBroj,
                    scenarij,
                    predmetSpora,
                    prvostupanjskiAkt,
                    datumPredajeZalbe,
                    donesenoRjesenjeKlasaUrbroj: donesenoRjesenje,
                    datumDostaveStranci: datumDostave,
                    ishodRjesenja,
                    meritumArgumenti,
                  };
                  const paragraphs = generateDefaultScenarioText(inputData);
                  setTekstObrazlozenja(paragraphs.join('\n\n'));
                }}
                className="text-2xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Vrati predloženi tekst</span>
              </button>
            </div>

            <textarea
              rows={11}
              value={tekstObrazlozenja}
              onChange={(e) => setTekstObrazlozenja(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-serif text-sm leading-relaxed text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Tekst obrazloženja (struktura I.–IV. točaka)..."
            />
            <p className="text-2xs text-slate-400 italic">
              Savjet: Svaki odlomak u gornjem polju automatski se uvozi u službeni Word predložak s obostranim poravnanjem i proredom 1,15.
            </p>
          </div>

          {/* KORAK 5: POTPISNIK I DOSTAVA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50/60 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-semibold">Službena osoba (potpisnik):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={potpisnikFunkcija}
                  onChange={(e) => setPotpisnikFunkcija(e.target.value)}
                  className="w-1/2 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  placeholder="Funkcija"
                />
                <input
                  type="text"
                  value={potpisnikIme}
                  onChange={(e) => setPotpisnikIme(e.target.value)}
                  className="w-1/2 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                  placeholder="Ime i prezime"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-500 mb-1 font-semibold">Dostavna naredba (DOSTAVITI):</label>
              <p className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-2xs truncate">
                1. Naslovu – putem e-Komunikacije &nbsp;•&nbsp; 2. Pismohrana – ovdje
              </p>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Zatvori
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadDocx}
              disabled={isExporting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md hover:shadow-lg cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Priprema .docx...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Preuzmi Word dokument (.docx)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
