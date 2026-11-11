'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Download,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  User,
  Scale,
  RefreshCw,
  Loader2,
  FileCheck,
} from 'lucide-react';
import type { UpravniSpor } from '@/lib/upravni-sporovi';
import {
  type OdgovorScenarij,
  type OdgovorNaTuzbuInput,
  detectCourtDetails,
  getCroatianLongDate,
  generateDefaultScenarioText,
} from '@/lib/docx-odgovor-generator';
import { generateAiOdgovorAction } from '@/app/actions/odgovorNaTuzbuActions';

interface OdgovorNaTuzbuModalProps {
  isOpen: boolean;
  onClose: () => void;
  spor: UpravniSpor | null;
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

  // AI & custom text
  const [tekstObrazlozenja, setTekstObrazlozenja] = useState('');
  const [aiUpute, setAiUpute] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState('');

  // Potpisnik
  const [potpisnikFunkcija, setPotpisnikFunkcija] = useState('SEKTORSKI SAVJETNIK');
  const [potpisnikIme, setPotpisnikIme] = useState('Dino Malbaša, dipl. iur.');

  // UI state
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState('');

  // Inicijalizacija polja kada se odabere spor
  useEffect(() => {
    if (!spor) return;

    const detected = detectCourtDetails(spor.sud || '');
    setSudNaziv(detected.naziv);
    setSudAdresa(detected.adresa);
    setPoslovniBroj(spor.poslovniBroj || '');
    
    // Sastavi tužitelja s OIB-om
    const tuziteljBase = spor.tuzitelj || '';
    const tuziteljFull = spor.oib ? `${tuziteljBase} (OIB: ${spor.oib})` : tuziteljBase;
    setTuzitelj(tuziteljFull);
    setOib(spor.oib || '');

    setDatum(getCroatianLongDate());

    // Zadaj Klasu i Urbroj ako postoje u evidenciji, ili standardni oblik za 2026. godinu
    const currentYear = new Date().getFullYear().toString().slice(-2);
    setKlasa(spor.upIiRjesenje || `UP/II-325-08/${currentYear}-02/${spor.rbr || '1'}`);
    setUrbroj(`517-05-2-${currentYear}-2`);

    // Određivanje početnog scenarija na temelju podataka spora
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

    // Reset feedback
    setExportSuccess(false);
    setExportError('');
    setTekstObrazlozenja('');
  }, [spor, isOpen]);

  // Kada se promijeni scenarij, regeneriraj zadani tekst ako korisnik nije već unio prilagođeni
  useEffect(() => {
    if (!spor) return;

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

  // Poziv Gemini AI-ja za sastavljanje odgovora
  const handleGenerateAi = async () => {
    setIsGeneratingAi(true);
    setAiError('');

    try {
      const res = await generateAiOdgovorAction({
        tuzitelj,
        sud: sudNaziv,
        poslovniBroj,
        vrstaSpora: scenarij === 'sutnja_nije_zaprimljeno' ? 'Šutnja uprave' : 'Pobijanje rješenja',
        predmet: predmetSpora || spor.predmet || 'upravna stvar',
        pobijaniAkt: prvostupanjskiAkt || spor.upIiRjesenje,
        sazetakTuzbe: spor.vrijednostNapomena,
        dodatneUpute: aiUpute,
      });

      if (res.success && res.tekst) {
        setTekstObrazlozenja(res.tekst);
        setScenarij('ai_prilagodeno');
      } else {
        setAiError(res.error || 'Nije uspjelo generiranje odgovora.');
      }
    } catch (err: any) {
      setAiError(err.message || 'Greška u komunikaciji s AI poslužiteljem.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Preuzimanje Word dokumenta
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

      // Preuzmi blob i kreiraj download link
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-white dark:from-slate-850 dark:via-indigo-950/20 dark:to-slate-900 flex items-center justify-between">
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

          {/* KORAK 1: ODABIR SCENARIJA */}
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
                  <span>Redovni spor – meritum</span>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                  Ministarstvo ostaje u cijelosti kod pobijanog drugostupanjskog akta i prakse Visokog upravnog suda RH.
                </p>
              </button>

              {/* Scenarij 4: AI asistent */}
              <button
                type="button"
                onClick={() => setScenarij('ai_prilagodeno')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scenarij === 'ai_prilagodeno'
                    ? 'bg-purple-50/80 dark:bg-purple-950/60 border-purple-500 ring-2 ring-purple-500/30'
                    : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-purple-900 dark:text-purple-300 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>AI prilagođeni odgovor</span>
                </div>
                <p className="text-2xs text-slate-500 dark:text-slate-400 leading-snug">
                  Gemini sastavlja detaljnu pravnu argumentaciju prilagođenu specifičnim navodima tužbe.
                </p>
              </button>
            </div>
          </div>

          {/* KORAK 2: OSNOVNI PODACI O PISMENU */}
          <div className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-850/80 border border-slate-200 dark:border-slate-800 space-y-3">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>2. Podaci za memorandum i zaglavlje</span>
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

            {scenarij === 'meritum_potvrda_rjesenja' && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Pobijani upravni akt:
                  </label>
                  <input
                    type="text"
                    value={prvostupanjskiAkt}
                    onChange={(e) => setPrvostupanjskiAkt(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    placeholder="npr. rješenje Ministarstva KLASA: UP/II-325-08/23-02/260..."
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Specifični argument tuženika (neobvezno):
                  </label>
                  <input
                    type="text"
                    value={meritumArgumenti}
                    onChange={(e) => setMeritumArgumenti(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    placeholder="npr. Obveznik je u trenutku donošenja rješenja bio upisan kao vlasnik..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* KORAK 3: AI GENERATOR SEKCIJA (AKO JE ODABRAN AI SCENARIJ) */}
          {scenarij === 'ai_prilagodeno' && (
            <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>AI pravni asistent za sastavljanje odgovora</span>
                </span>
                <span className="text-2xs text-purple-700 dark:text-purple-400">Gemini 3.8 Flash</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Dodatne upute ili fokus pravne argumentacije:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiUpute}
                    onChange={(e) => setAiUpute(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900"
                    placeholder="npr. Istakni da je rješenje postalo pravomoćno i da tužitelj neosnovano zahtijeva troškove..."
                  />
                  <button
                    type="button"
                    onClick={handleGenerateAi}
                    disabled={isGeneratingAi}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                  >
                    {isGeneratingAi ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generiram...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generiraj pravni tekst</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {aiError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">⚠️ {aiError}</p>
              )}
            </div>
          )}

          {/* KORAK 4: PREGLED I UREĐIVANJE TEKSTA OBRAZLOŽENJA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-3.5 h-3.5 text-indigo-500" />
                <span>3. Pregled i uređivanje teksta obrazloženja:</span>
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
              rows={9}
              value={tekstObrazlozenja}
              onChange={(e) => setTekstObrazlozenja(e.target.value)}
              className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-serif text-sm leading-relaxed text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Tekst obrazloženja..."
            />
            <p className="text-2xs text-slate-400 italic">
              Savjet: Svaki odlomak u gornjem polju bit će automatski formatiran s obostranim poravnanjem i proredom 1,15 u Word dokumentu.
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
