'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Scale,
  Copy,
  Check,
  AlertTriangle,
  CalendarDays,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { calculateZupRok, calculateZastara, getCroatianHolidays, ZUP_ROK_PRESETS, ZupRokTip } from '@/lib/rok-kalkulator';

export default function KalkulatoriPage() {
  const [activeTab, setActiveTab] = useState<'rok' | 'zastara'>('rok');

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
    let naslovZabiljeske = `SLUŽBENA ZABILJEŠKA O ROKU (${zupResult.presetClanak || 'čl. 80.–82. ZUP-a'})`;
    if (selectedPresetId === 'clanak_121_zalba') {
      naslovZabiljeske = 'SLUŽBENA ZABILJEŠKA O ROKU ZA DONOŠENJE RJEŠENJA O ŽALBI (čl. 121. st. 1. ZUP-a)';
    } else if (selectedPresetId === 'zus_odgovor_tuzba_30' || selectedPresetId === 'zus_odgovor_tuzba_60') {
      naslovZabiljeske = `SLUŽBENA ZABILJEŠKA O ROKU ZA ODGOVOR NA TUŽBU UPRAVNOM SUDU (${zupResult.brojDana} DANA — čl. 48. st. 2. ZUS-a)`;
    }

    const text = `${naslovZabiljeske}:
Datum predaje/primitka: ${zupResult.datumDostave}
Početak tijeka roka: ${zupResult.pocetakTijekaRoka}
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
              Pravni kalkulatori (ZUP, ZUS & Zastara)
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Službeni izračun upravnih i sudskih rokova s kalendarom neradnih dana RH, te kalkulator zastare tražbina (OPZ i ZOO).
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
            ZUP & ZUS Rokovi
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
                      : selectedPresetId === 'zus_odgovor_tuzba_30' || selectedPresetId === 'zus_odgovor_tuzba_60'
                      ? 'Datum zaprimanja rješenja/zaključka suda s tužbom:'
                      : 'Datum primitka / dostave pismena stranci:'}
                  </span>
                  {selectedPresetId === 'clanak_121_zalba' && (
                    <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded">
                      čl. 121. ZUP
                    </span>
                  )}
                  {(selectedPresetId === 'zus_odgovor_tuzba_30' || selectedPresetId === 'zus_odgovor_tuzba_60') && (
                    <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded">
                      čl. 48. ZUS
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
                      : selectedPresetId === 'zus_odgovor_tuzba_30' || selectedPresetId === 'zus_odgovor_tuzba_60'
                      ? 'dana od zaprimanja zaključka/tužbe suda'
                      : 'dana od dana dostave'}
                  </span>
                </div>
              </div>

              {/* 1. Istaknuti zakonski rok za drugostupanjski postupak (čl. 121. st. 1. ZUP) */}
              {(() => {
                const p121 = ZUP_ROK_PRESETS.find((p) => p.id === 'clanak_121_zalba');
                if (!p121) return null;
                const isSelected = selectedPresetId === 'clanak_121_zalba' && daysCount === p121.dana;
                return (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Drugostupanjski žalbeni postupak:
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

              {/* 2. Istaknuti sudski rok za odgovor na tužbu pred Upravnim sudom (čl. 48. st. 2. ZUS) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Upravni spor — Odgovor na tužbu:
                  </span>
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full">
                    čl. 48. st. 2. ZUS
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2.5">
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    Rok koji sud određuje rješenjem/zaključkom uz dostavu tužbe (odgovor + dostava cjelokupnog spisa predmeta):
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectPreset('zus_odgovor_tuzba_30', 30)}
                      className={`p-2.5 rounded-lg text-left border text-xs transition-all cursor-pointer ${
                        selectedPresetId === 'zus_odgovor_tuzba_30' && daysCount === 30
                          ? 'border-indigo-600 bg-indigo-600 text-white font-bold shadow-xs'
                          : 'border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">30 dana</span>
                        <span className="text-[10px] opacity-80 uppercase tracking-wide">Redovni</span>
                      </div>
                      <div className="text-[10px] opacity-85 mt-0.5">Tipičan sudski rok</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectPreset('zus_odgovor_tuzba_60', 60)}
                      className={`p-2.5 rounded-lg text-left border text-xs transition-all cursor-pointer ${
                        selectedPresetId === 'zus_odgovor_tuzba_60' && daysCount === 60
                          ? 'border-indigo-600 bg-indigo-600 text-white font-bold shadow-xs'
                          : 'border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">60 dana</span>
                        <span className="text-[10px] opacity-80 uppercase tracking-wide">Složeni</span>
                      </div>
                      <div className="text-[10px] opacity-85 mt-0.5">Opsežni spisi / max.</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Ostali zakonski rokovi */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                  Ostali upravni i sudski rokovi:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ZUP_ROK_PRESETS.filter(
                    (p) => !['clanak_121_zalba', 'zus_odgovor_tuzba_30', 'zus_odgovor_tuzba_60'].includes(p.id)
                  ).map((p) => {
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
                        {selectedPresetId === 'clanak_121_zalba'
                          ? 'Predano / zaprimljeno:'
                          : selectedPresetId === 'zus_odgovor_tuzba_30' || selectedPresetId === 'zus_odgovor_tuzba_60'
                          ? 'Zaprimljeno iz suda:'
                          : 'Dostavljeno:'}
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
                      <strong className="block text-slate-900 dark:text-white">Porezna i javna davanja (OPZ — važeći zakon)</strong>
                      <span className="text-slate-500">Jedinstveni rok od 6 godina od isteka godine dospijeća (čl. 108. OPZ — trogodišnja relativna zastara je ukinuta).</span>
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
                    {vrstaZastare === 'opz_upravno' ? 'Datum nastupa jedinstvene zastare (6 godina):' : 'Datum nastupa zastare:'}
                  </span>
                  <div className="text-3xl font-extrabold text-amber-700 dark:text-amber-400">
                    {zastaraResult.datumZastare}
                  </div>
                  <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {zastaraResult.opis}
                  </p>
                  {zastaraResult.napomenaApsolutna && (
                    <div className="mt-3 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-900/40 p-2.5 rounded-xl">
                      ℹ️ {zastaraResult.napomenaApsolutna}
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  <div><strong>Mjerodavni propis:</strong> {zastaraResult.pravniTemelj}</div>
                  <div><strong>Napomena o prekidu zastare:</strong> Zastara se prekida svakom službenom radnjom poreznog tijela odnosno vjerovnika poduzetom radi utvrđivanja ili naplate (čl. 110. OPZ i čl. 241. ZOO). Nakon prekida rok počinje teći iznova!</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
