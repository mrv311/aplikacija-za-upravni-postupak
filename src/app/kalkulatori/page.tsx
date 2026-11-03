'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Scale,
  FileText,
  Download,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Info,
} from 'lucide-react';
import { calculateZupRok, calculateZastara, getCroatianHolidays, ZUP_ROK_PRESETS, ZupRokTip } from '@/lib/rok-kalkulator';
import { SlužbeniAktData } from '@/lib/docx-generator';

export default function KalkulatoriPage() {
  const [activeTab, setActiveTab] = useState<'rok' | 'zastara' | 'docx'>('rok');

  // --- 1. STANJE ZA KALKULATOR ROKOVA (ZUP) ---
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [deliveryDate, setDeliveryDate] = useState<string>(todayStr);
  const [daysCount, setDaysCount] = useState<number>(60);
  const [selectedPresetId, setSelectedPresetId] = useState<ZupRokTip>('clanak_121_zalba');
  const [copiedZup, setCopiedZup] = useState(false);

  const zupResult = useMemo(() => {
    try {
      return calculateZupRok(deliveryDate, daysCount, selectedPresetId);
    } catch {
      return null;
    }
  }, [deliveryDate, daysCount, selectedPresetId]);

  const holidaysThisYear = useMemo(() => {
    const year = parseInt(deliveryDate.split('-')[0], 10) || new Date().getFullYear();
    return getCroatianHolidays(year);
  }, [deliveryDate]);

  const handleSelectPreset = (presetId: ZupRokTip, dana: number) => {
    setSelectedPresetId(presetId);
    setDaysCount(dana);
  };

  const handleCopyZup = () => {
    if (!zupResult) return;
    const naslovZabiljeske =
      selectedPresetId === 'clanak_121_zalba'
        ? 'SLUŽBENA ZABILJEŠKA O ROKU ZA DONOŠENJE RJEŠENJA O ŽALBI (čl. 121. st. 1. ZUP-a)'
        : `SLUŽBENA ZABILJEŠKA O ROKU (${zupResult.presetClanak || 'čl. 80.–82. ZUP-a'})`;

    const text = `${naslovZabiljeske}:
Datum predaje/primitka: ${zupResult.datumDostave}
Početak tijeka roka (čl. 81. st. 1. ZUP-a): ${zupResult.pocetakTijekaRoka}
Duljina roka: ${zupResult.brojDana} dana
Nominalni istek: ${zupResult.nominalniIstekRoka} (${zupResult.nominalniDanNaziv})
KONAČNI ZAKONSKI ISTEK ROKA: ${zupResult.konacniIstekRoka} (${zupResult.konacniDanNaziv})
${zupResult.pomaknutZbogNeradnogDana ? `Napomena o pomaku: ${zupResult.propisNapomena}` : 'Rok istječe redovnim radnim danom.'}
${zupResult.posljedicaNapomena ? `Pravna posljedica: ${zupResult.posljedicaNapomena}` : ''}`.trim();

    navigator.clipboard.writeText(text);
    setCopiedZup(true);
    setTimeout(() => setCopiedZup(false), 2000);
  };

  // --- 2. STANJE ZA KALKULATOR ZASTARE ---
  const [dospijeceDate, setDospijeceDate] = useState<string>(todayStr);
  const [vrstaZastare, setVrstaZastare] = useState<'opz_upravno' | 'zoo_povremena' | 'zoo_opca' | 'zoo_steta'>(
    'opz_upravno'
  );
  const zastaraResult = useMemo(() => {
    try {
      return calculateZastara(dospijeceDate, vrstaZastare);
    } catch {
      return null;
    }
  }, [dospijeceDate, vrstaZastare]);

  // --- 3. STANJE ZA GENERATOR SLUŽBENIH AKATA (.DOCX) ---
  const [docData, setDocData] = useState<SlužbeniAktData>({
    vrsta: 'rjesenje',
    nazivTijela: 'UPRAVNI ODJEL ZA PROSTORNO UREĐENJE, GRADNJU I KOMUNALNO GOSPODARSTVO',
    klasa: 'UP/I-363-01/26-01/142',
    urbroj: '2181-05/02-26-2',
    mjesto: 'Split',
    datum: new Date().toLocaleDateString('hr-HR'),
    stranka: 'Ivan Horvat, OIB: 12345678901, Zagreb, Ilica 10',
    predmet: 'Utvrđivanje komunalnog doprinosa za stambenu zgradu',
    pravniOsnov:
      'članka 96. Zakona o općem upravnom postupku (»Narodne novine«, br. 47/09. i 110/21.) i članaka 76.–80. Zakona o komunalnom gospodarstvu (»Narodne novine«, br. 68/18., 110/18., 32/20. i 145/24.)',
    izreka:
      '1. Obvezniku Ivanu Horvatu iz Zagreba, Ilica 10, utvrđuje se obveza plaćanja komunalnog doprinosa za građenje stambene zgrade na k.č.br. 1245 k.o. Split u iznosu od 2.450,00 EUR.\n\n2. Utvrđeni iznos iz točke 1. ove izreke obveznik je dužan uplatiti u roku od 15 dana od dana izvršnosti ovog rješenja u korist računa Grada Splita.\n\n3. Žalba protiv ovog rješenja ne odgađa njegovo izvršenje.',
    obrazlozenje:
      'Obveznik Ivan Horvat podnio je ovom upravnom tijelu zahtjev za obračun komunalnog doprinosa za građenje stambene građevine na k.č.br. 1245 k.o. Split, u skladu s pravomoćnom građevinskom dozvolom.\n\nU provedenom postupku utvrđeno je da obujam građevine iznosi 450 m3 te se nalazi u II. zoni komunalnog doprinosa. Množenjem obujma i jedinične vrijednosti utvrđen je ukupan iznos davanja iz točke 1. izreke.\n\nTemeljem svega navedenog, a u skladu s mjerodavnim odredbama Zakona o komunalnom gospodarstvu i važeće Odluke o komunalnom doprinosu, riješeno je kao u izreci.',
    uputaOPravnomLijeku:
      'Protiv ovog rješenja može se izjaviti žalba drugostupanjskom tijelu u roku od 15 dana od dana dostave rješenja. Žalba se predaje neposredno ili šalje poštom preporučeno ovom tijelu u dva istovjetna primjerka.',
    sluzbenaOsoba: 'Marko Marulić, mag. iur.',
    funkcijaOsobe: 'Voditelj odsjeka',
    dostaviti: ['Imenovanom obvezniku, osobna dostava', 'Upravnom tijelu za financije'],
  });

  const [downloadingDocx, setDownloadingDocx] = useState(false);

  const applyTemplate = (tip: 'vodni' | 'prekid' | 'poziv') => {
    if (tip === 'vodni') {
      setDocData({
        ...docData,
        vrsta: 'rjesenje',
        predmet: 'Obračun vodnoga doprinosa',
        pravniOsnov:
          'članka 96. Zakona o općem upravnom postupku (»Narodne novine«, br. 47/09. i 110/21.) te članka 14. Zakona o financiranju vodnoga gospodarstva (»Narodne novine«, br. 153/09. do 36/24.)',
        izreka:
          '1. Investitoru se utvrđuje obveza plaćanja vodnoga doprinosa za građenje građevine u iznosu od 1.820,00 EUR.\n2. Navedeni iznos investitor je dužan podmiriti u roku od 15 dana od primitka rješenja.',
        obrazlozenje:
          'Uvidom u glavni projekt i obračun kubature građevine utvrđeno je da ukupni obujam iznosi 380 m3. Primjenom zakonske tarife utvrđen je iznos kao u izreci.',
      });
    } else if (tip === 'prekid') {
      setDocData({
        ...docData,
        vrsta: 'zakljucak',
        predmet: 'Prekid postupka zbog smrti stranke',
        pravniOsnov:
          'članka 55. stavka 1. Zakona o općem upravnom postupku (»Narodne novine«, br. 47/09. i 110/21.) i članka 139. Zakona o nasljeđivanju (»Narodne novine«, br. 48/03. do 14/19.)',
        izreka:
          '1. Prekida se upravni postupak pokrenut po zahtjevu stranke Petra Horvata zbog smrti stranke.\n\n2. Postupak će se nastaviti kada pravni sljednici (nasljednici) preuzmu postupak ili kada ih službena osoba na prijedlog druge stranke pozove da to učine.',
        obrazlozenje:
          'Uvidom u maticu umrlih utvrđeno je da je stranka Petar Horvat preminuo dana 12. veljače 2026. Sukladno članku 55. ZUP-a, kad stranka umre tijekom postupka, a prava i obveze prelaze na nasljednike po Zakonu o nasljeđivanju, postupak se prekida do preuzimanja od strane nasljednika.',
      });
    } else {
      setDocData({
        ...docData,
        vrsta: 'poziv',
        predmet: 'Poziv na otklanjanje nedostataka u podnesku',
        pravniOsnov: 'članka 73. stavka 1. Zakona o općem upravnom postupku (»Narodne novine«, br. 47/09. i 110/21.)',
        izreka:
          'Poziva se podnositelj zahtjeva da u roku od 8 dana od dana primitka ovog poziva dopuni zahtjev dostavom dokaza o pravnom interesu (izvadak iz zemljišne knjige sukladno Zakonu o zemljišnim knjigama) i idejnog rješenja.',
        obrazlozenje:
          'Podnositelj je dana 20. ožujka 2026. podnio nepotpun zahtjev. Sukladno članku 73. ZUP-a, ako podnesak sadrži kakav nedostatak koji onemogućuje postupanje, službena osoba pozvat će podnositelja zaključkom ili pozivom da nedostatak otkloni u određenom roku.',
      });
    }
  };

  const handleDownloadDocx = async () => {
    setDownloadingDocx(true);
    try {
      const res = await fetch('/api/alati/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData),
      });

      if (!res.ok) throw new Error('Neuspjelo generiranje dokumenta');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docData.vrsta.toUpperCase()}_${docData.klasa.replace(/[/\\?%*:|"<>]/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Greška: ${err.message}`);
    } finally {
      setDownloadingDocx(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. ZAGLAVLJE STRANICE */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <Scale className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Pravni kalkulatori i izvoz službenih pismena
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Službeni izračun ZUP rokova (s neradnim danima i blagdanima RH), kalkulator zastare i Word (.docx) generator
            akta.
          </p>
        </div>

        {/* TABS SELECTOR */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('rok')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'rok'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            ZUP Rokovi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('zastara')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'zastara'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Zastara (OPZ / ZOO)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('docx')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'docx'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            Izvoz u Word (.docx)
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: KALKULATOR ZUP ROKOVA */}
      {/* ========================================================================= */}
      {activeTab === 'rok' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LIJEVA STRANA: UNOS I BRZI PRESETI */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                Parametri roka (čl. 80.–82. ZUP)
              </h2>

              {/* Datum dostave / primitka */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>
                    {selectedPresetId === 'clanak_121_zalba'
                      ? 'Datum predaje / zaprimanja uredne žalbe:'
                      : 'Datum primitka / dostave pismena stranci:'}
                  </span>
                  {selectedPresetId === 'clanak_121_zalba' && (
                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded">
                      čl. 121. ZUP
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Broj dana */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Trajanje roka u danima:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={daysCount}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setDaysCount(val);
                      const matched = ZUP_ROK_PRESETS.find((p) => p.dana === val);
                      setSelectedPresetId(matched ? matched.id : 'korisnicki');
                    }}
                    className="w-28 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-base font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {selectedPresetId === 'clanak_121_zalba'
                      ? 'dana od predaje uredne žalbe'
                      : 'dana od dana dostave'}
                  </span>
                </div>
              </div>

              {/* Istaknuti zakonski rok za drugostupanjski postupak (čl. 121. st. 1. ZUP) */}
              {(() => {
                const p121 = ZUP_ROK_PRESETS.find((p) => p.id === 'clanak_121_zalba');
                if (!p121) return null;
                const isSelected = selectedPresetId === 'clanak_121_zalba' && daysCount === p121.dana;
                return (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Ključni drugostupanjski rok:
                      </span>
                      <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-full">
                        Žalbeni postupak
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectPreset(p121.id, p121.dana)}
                      className={`w-full p-3.5 rounded-xl text-left border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 text-slate-900 dark:text-white shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                              {p121.clanak}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                              Drugostupanjsko rješenje
                            </span>
                          </div>
                          <div className="font-semibold text-xs text-slate-900 dark:text-white mt-1">
                            {p121.naziv}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-blue-600 text-white shadow-xs">
                            {p121.dana} dana
                          </span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                        {p121.opis}
                      </div>
                    </button>
                  </div>
                );
              })()}

              {/* Ostali zakonski rokovi */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                  Ostali upravni i sudski rokovi:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ZUP_ROK_PRESETS.filter((p) => p.id !== 'clanak_121_zalba').map((p) => {
                    const isSelected = selectedPresetId === p.id && daysCount === p.dana;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPreset(p.id, p.dana)}
                        className={`p-2.5 rounded-xl text-left border text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold ring-1 ring-blue-500'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold truncate">{p.naziv}</span>
                          <span className="text-[11px] font-bold text-slate-500 shrink-0">{p.dana} d</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{p.clanak}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Neradni dani i blagdani tekuće godine */}
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-2">
                <CalendarDays className="w-3.5 h-3.5 text-amber-500" />
                Službeni blagdani RH za {deliveryDate.split('-')[0]}:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {holidaysThisYear.map((h) => (
                  <div key={h.date} className="text-slate-600 dark:text-slate-400 text-[11px] flex justify-between">
                    <span className="font-mono text-slate-700 dark:text-slate-300">{h.date}:</span>
                    <span className="truncate ml-1">{h.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* DESNA STRANA: REZULTAT IZRAČUNA I ZAKONSKI NALAZ */}
          <div className="lg:col-span-7">
            {zupResult && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                      Zakoniti izračun roka (ZUP RH)
                    </span>
                    {zupResult.presetClanak && (
                      <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                        {zupResult.presetClanak}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyZup}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    {copiedZup ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedZup ? 'Kopirano u međuspremnik!' : 'Kopiraj zabilješku'}
                  </button>
                </div>

                {/* Glavna kartica konačnog datuma */}
                <div
                  className={`p-5 rounded-2xl border ${
                    zupResult.pomaknutZbogNeradnogDana
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                      : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                  }`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                    Konačni zakonski istek roka:
                  </span>
                  <div className="text-3xl font-extrabold text-slate-900 dark:text-white flex flex-wrap items-baseline gap-2">
                    <span>{zupResult.konacniIstekRoka}</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      ({zupResult.konacniDanNaziv})
                    </span>
                  </div>

                  {zupResult.pomaknutZbogNeradnogDana && (
                    <div className="mt-3 flex items-start gap-2 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-900/40 p-2.5 rounded-xl">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <strong>Pomaknuto po članku 81. stavku 3. ZUP-a:</strong> Nominalni zadnji dan roka padao je na{' '}
                        <strong>{zupResult.nominalniIstekRoka} ({zupResult.nominalniDanNaziv} - {zupResult.razlogPomaka})</strong>
                        . Budući da javnopravno tijelo tog dana ne radi, rok istječe protekom prvog idućeg radnog dana!
                      </div>
                    </div>
                  )}
                </div>

                {/* Tijek izračuna korak po korak */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Kronologija tijeka roka:
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 block">
                        {selectedPresetId === 'clanak_121_zalba' ? 'Predano / zaprimljeno:' : 'Dostavljeno:'}
                      </span>
                      <strong className="text-sm text-slate-900 dark:text-white">{zupResult.datumDostave}</strong>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 block">Početak tijeka (čl. 81. st. 1.):</span>
                      <strong className="text-sm text-slate-900 dark:text-white">{zupResult.pocetakTijekaRoka}</strong>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-500 dark:text-slate-400 block">Nominalni istek:</span>
                      <strong className="text-sm text-slate-900 dark:text-white">
                        {zupResult.nominalniIstekRoka} ({zupResult.nominalniDanNaziv})
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Pravna posljedica isteka roka (čl. 121. ZUP / ZUS itd.) */}
                {zupResult.posljedicaNapomena && (
                  <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-950 dark:text-blue-200 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-blue-900 dark:text-blue-100">
                      <Scale className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      Pravna posljedica isteka roka ({zupResult.presetClanak || 'Zakon'}):
                    </div>
                    <p className="leading-relaxed text-blue-900/90 dark:text-blue-200/90">
                      {zupResult.posljedicaNapomena}
                    </p>
                  </div>
                )}

                {/* Službena pravna napomena */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-500" />
                    Mjerodavne odredbe ZUP-a:
                  </div>
                  <p>• <strong>Članak 81. stavak 1.:</strong> Rok koji je određen na dane počinje teći prvog sljedećeg dana nakon dana u kojem je pismeno dostavljeno.</p>
                  <p>• <strong>Članak 81. stavak 2.:</strong> Nedjelje, blagdani i neradni dani ne utječu na početak i tijek roka.</p>
                  <p>• <strong>Članak 81. stavak 3.:</strong> Ako posljednji dan roka pada u nedjelju, na blagdan ili u dan kad tijelo ne radi, rok istječe protekom prvoga sljedećeg radnog dana.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: KALKULATOR ZASTARE */}
      {/* ========================================================================= */}
      {activeTab === 'zastara' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Kategorija davanja / tražbine
              </h2>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Datum dospijeća obveze:
                </label>
                <input
                  type="date"
                  value={dospijeceDate}
                  onChange={(e) => setDospijeceDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Pravni temelj i priroda tražbine:
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="vrstaZastare"
                      checked={vrstaZastare === 'opz_upravno'}
                      onChange={() => setVrstaZastare('opz_upravno')}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="block text-slate-900 dark:text-white">Upravna naknada / Porez (OPZ)</strong>
                      <span className="text-slate-500">Relativna 3 godine, Apsolutna 6 godina od isteka godine dospijeća (čl. 108. OPZ).</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="vrstaZastare"
                      checked={vrstaZastare === 'zoo_povremena'}
                      onChange={() => setVrstaZastare('zoo_povremena')}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="block text-slate-900 dark:text-white">Komunalna naknada / Pričuva / Periodična davanja</strong>
                      <span className="text-slate-500">3 godine od dospjelosti pojedinog davanja (čl. 226. ZOO).</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="vrstaZastare"
                      checked={vrstaZastare === 'zoo_steta'}
                      onChange={() => setVrstaZastare('zoo_steta')}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="block text-slate-900 dark:text-white">Naknada štete</strong>
                      <span className="text-slate-500">3 godine subjektivni rok, 5 godina objektivni rok od nastanka (čl. 230. ZOO).</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="vrstaZastare"
                      checked={vrstaZastare === 'zoo_opca'}
                      onChange={() => setVrstaZastare('zoo_opca')}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="block text-slate-900 dark:text-white">Opći zastarni rok (ZOO)</strong>
                      <span className="text-slate-500">5 godina od dospjelosti ako zakonom nije određen drugi rok (čl. 225. ZOO).</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            {zastaraResult && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                    Zakonski nalaz zastare
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {zastaraResult.tipZastare}
                  </h3>
                </div>

                <div className="p-5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1">
                    Datum nastupa relativne zastare:
                  </span>
                  <div className="text-3xl font-extrabold text-amber-700 dark:text-amber-400">
                    {zastaraResult.datumZastare}
                  </div>
                  <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {zastaraResult.opis}
                  </p>
                  {zastaraResult.napomenaApsolutna && (
                    <div className="mt-3 text-xs font-bold text-rose-700 dark:text-rose-400 bg-rose-100/60 dark:bg-rose-950/40 p-2.5 rounded-xl">
                      ⚠️ {zastaraResult.napomenaApsolutna}
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  <div><strong>Mjerodavni propis:</strong> {zastaraResult.pravniTemelj}</div>
                  <div><strong>Napomena o prekidu zastare:</strong> Zastara se prekida svakom radnjom vjerovnika poduzetom pred sudom ili drugim nadležnim tijelom radi utvrđivanja, osiguranja ili ostvarenja tražbine (čl. 241. ZOO i čl. 110. OPZ). Nakon prekida rok počinje teći iznova!</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: GENERATOR I IZVOZ SLUŽBENIH AKATA U WORD (.DOCX) */}
      {/* ========================================================================= */}
      {activeTab === 'docx' && (
        <div className="space-y-6">
          {/* Quick template bar */}
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                Učitaj standardizirani predložak s točnim zakonskim osnovama:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => applyTemplate('vodni')}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-100 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 transition-colors cursor-pointer"
              >
                Rješenje o vodnom/komunalnom doprinosu
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('prekid')}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-100 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 transition-colors cursor-pointer"
              >
                Zaključak o prekidu (smrt stranke - čl. 55. ZUP)
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('poziv')}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-100 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 transition-colors cursor-pointer"
              >
                Poziv za dopunu / uvid (čl. 73. ZUP)
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Nacrt službenog akta (memorandum, uvod, izreka, obrazloženje i pravni lijek)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Izvoz u formatirani Microsoft Word dokument (.docx) usklađen sa standardima Uredbe o uredskom poslovanju.
                </p>
              </div>

              <button
                type="button"
                disabled={downloadingDocx}
                onClick={handleDownloadDocx}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                {downloadingDocx ? 'Generiram .docx...' : 'Preuzmi Word dokument (.docx)'}
              </button>
            </div>

            {/* Grid polja */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Vrsta akta:</label>
                <select
                  value={docData.vrsta}
                  onChange={(e) => setDocData({ ...docData, vrsta: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                >
                  <option value="rjesenje">Rješenje</option>
                  <option value="zakljucak">Zaključak</option>
                  <option value="poziv">Poziv</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">KLASA:</label>
                <input
                  type="text"
                  value={docData.klasa}
                  onChange={(e) => setDocData({ ...docData, klasa: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">URBROJ:</label>
                <input
                  type="text"
                  value={docData.urbroj}
                  onChange={(e) => setDocData({ ...docData, urbroj: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Naziv javnopravnog tijela:</label>
                <input
                  type="text"
                  value={docData.nazivTijela}
                  onChange={(e) => setDocData({ ...docData, nazivTijela: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Mjesto i datum:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={docData.mjesto}
                    onChange={(e) => setDocData({ ...docData, mjesto: e.target.value })}
                    className="w-1/2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    value={docData.datum}
                    onChange={(e) => setDocData({ ...docData, datum: e.target.value })}
                    className="w-1/2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Stranka / Podnositelj:</label>
                <input
                  type="text"
                  value={docData.stranka}
                  onChange={(e) => setDocData({ ...docData, stranka: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Predmet:</label>
                <input
                  type="text"
                  value={docData.predmet}
                  onChange={(e) => setDocData({ ...docData, predmet: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="md:col-span-3">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Pravni osnov (Uvod):</label>
                <input
                  type="text"
                  value={docData.pravniOsnov}
                  onChange={(e) => setDocData({ ...docData, pravniOsnov: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div className="md:col-span-3">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Izreka (Dispozitiv):</label>
                <textarea
                  rows={4}
                  value={docData.izreka}
                  onChange={(e) => setDocData({ ...docData, izreka: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium font-serif leading-relaxed"
                />
              </div>

              <div className="md:col-span-3">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Obrazloženje:</label>
                <textarea
                  rows={6}
                  value={docData.obrazlozenje}
                  onChange={(e) => setDocData({ ...docData, obrazlozenje: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-serif leading-relaxed"
                />
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Uputa o pravnom lijeku:</label>
                <textarea
                  rows={3}
                  value={docData.uputaOPravnomLijeku}
                  onChange={(e) => setDocData({ ...docData, uputaOPravnomLijeku: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs italic"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Službena osoba & Funkcija:</label>
                <input
                  type="text"
                  value={docData.sluzbenaOsoba}
                  onChange={(e) => setDocData({ ...docData, sluzbenaOsoba: e.target.value })}
                  placeholder="Ime i prezime"
                  className="w-full mb-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  value={docData.funkcijaOsobe}
                  onChange={(e) => setDocData({ ...docData, funkcijaOsobe: e.target.value })}
                  placeholder="Funkcija / zvanje"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
