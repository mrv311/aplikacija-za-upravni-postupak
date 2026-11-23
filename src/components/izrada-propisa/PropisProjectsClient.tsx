'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ScrollText,
  Plus,
  FolderOpen,
  FileText,
  MessageSquare,
  ShieldCheck,
  FileSpreadsheet,
  ArrowRight,
  Trash2,
  BookOpen,
  Scale,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  PROPIS_FAZE_POSTUPKA,
  PROPIS_VRSTE_AKATA,
  type PropisFazaPostupka,
  type PropisProjectSummary,
  type PropisVrstaAkta,
} from '@/lib/izrada-propisa-types';
import {
  createPropisProjectAction,
  deletePropisProjectAction,
} from '@/app/actions/izradaPropisaActions';

interface Props {
  initialProjects: PropisProjectSummary[];
  praksaCount: number;
  zakoniCount: number;
}

const FAZA_BADGE: Record<PropisFazaPostupka, string> = {
  'Rad Povjerenstva':
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  'Mišljenja TDU / UZZ':
    'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  'e-Savjetovanje':
    'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  'Upućivanje na Vladu RH':
    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  Doneseno:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
};

export function PropisProjectsClient({
  initialProjects,
  praksaCount,
  zakoniCount,
}: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<PropisProjectSummary[]>(initialProjects);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [naziv, setNaziv] = useState('');
  const [puniNazivAkta, setPuniNazivAkta] = useState('');
  const [vrstaAkta, setVrstaAkta] = useState<PropisVrstaAkta>('Uredba');
  const [fazaPostupka, setFazaPostupka] = useState<PropisFazaPostupka>('Rad Povjerenstva');
  const [maticniInput, setMaticniInput] = useState(
    'Zakon o financiranju vodnoga gospodarstva, Zakon o vodama'
  );
  const [klasa, setKlasa] = useState('');
  const [referentnaMapa, setReferentnaMapa] = useState('');
  const [opis, setOpis] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!naziv.trim()) {
      setError('Unesite naziv projekta.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const maticniPropisi = maticniInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await createPropisProjectAction({
      naziv,
      puniNazivAkta: puniNazivAkta || naziv,
      vrstaAkta,
      fazaPostupka,
      maticniPropisi,
      klasa,
      referentnaMapa,
      opis,
    });

    setSubmitting(false);
    if (res.error || !res.project) {
      setError(res.error || 'Greška pri kreiranju projekta.');
      return;
    }

    setModalOpen(false);
    router.push(`/izrada-propisa/${res.project.id}`);
    router.refresh();
  };

  const handleDelete = async (e: React.MouseEvent, project: PropisProjectSummary) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Jeste li sigurni da želite trajno obrisati projekt „${project.naziv}” i sve njegove lokalne podatke? (Izvorne datoteke u OneDrive mapi ostaju netaknute.)`
      )
    ) {
      return;
    }
    const res = await deletePropisProjectAction(project.id);
    if (!res.error) {
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Zaglavlje modula */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-900/20 shrink-0">
            <ScrollText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Izrada propisa (Povjerenstva)
              </h1>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-300 dark:border-indigo-800">
                Nomotehnika · RAG · .docx
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Radni prostor za nacrte uredbi, pravilnika i zakona: lokalno parsiranje, Tablica primjedbi, Diff po člancima, JMNP Stress-test i generatori službenih podloga
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novi projekt propisa
        </button>
      </header>

      {/* Informativna traka povezanosti s Bazom prakse i Bazom zakona */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Povezana Baza prakse (RAG)
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {praksaCount > 0 ? `${praksaCount.toLocaleString('hr-HR')} odluka` : 'Aktivna baza'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Upravni sudovi, VUSRH i II. stupanj
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Scale className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Povezana Baza zakona RH
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {zakoniCount} ključnih propisa
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              ZFVG, ZOV, U-NUV, P-NUV, ZUP, ZUS, ZKG, OPZ…
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Lokalno parsiranje dokumenata
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              0 AI troška pri uvozu
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              .docx (s tablicama), .doc, .xlsx, .pdf, .txt
            </div>
          </div>
        </div>
      </div>

      {/* Popis projekata propisa */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Aktivni projekti povjerenstava ({projects.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/izrada-propisa/${p.id}`}
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {p.vrstaAkta}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                          FAZA_BADGE[p.fazaPostupka] || FAZA_BADGE['Rad Povjerenstva']
                        }`}
                      >
                        {p.fazaPostupka}
                      </span>
                      {p.hasAktualniNacrt && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Nacrt učitan
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {p.naziv}
                    </h3>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {p.puniNazivAkta}
                    </p>
                  </div>

                  {p.id !== 'uredba-nuv-2026' && (
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, p)}
                      title="Obriši projekt"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {p.opis && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                    {p.opis}
                  </p>
                )}

                {p.referentnaMapa && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 rounded-lg px-2.5 py-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="truncate font-mono">{p.referentnaMapa}</span>
                  </div>
                )}

                {/* Brojači projekta */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 px-2.5 py-2 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-blue-500" />
                      Dokumenti
                    </div>
                    <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {p.docCount}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 px-2.5 py-2 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-amber-500" />
                      Primjedbe
                    </div>
                    <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {p.primjedbeCount}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 px-2.5 py-2 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-indigo-500" />
                      Stress-test
                    </div>
                    <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {p.stressTestsCount}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 px-2.5 py-2 border border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <ScrollText className="w-3 h-3 text-emerald-500" />
                      Akti
                    </div>
                    <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {p.deliverablesCount}/3
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="text-slate-400 dark:text-slate-500">
                  Ažurirano: {new Date(p.updatedAt).toLocaleDateString('hr-HR')}
                </div>
                <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">
                  Otvori radni prostor
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Modal: Novi projekt propisa */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ScrollText className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Novi projekt izrade propisa
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kratki naziv projekta *
                  </label>
                  <input
                    type="text"
                    required
                    value={naziv}
                    onChange={(e) => setNaziv(e.target.value)}
                    placeholder="npr. Pravilnik NUV 2026"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Puni službeni naziv akta
                  </label>
                  <input
                    type="text"
                    value={puniNazivAkta}
                    onChange={(e) => setPuniNazivAkta(e.target.value)}
                    placeholder="npr. Nacrt prijedloga Pravilnika o obračunu i naplati naknade za uređenje voda"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vrsta akta
                  </label>
                  <select
                    value={vrstaAkta}
                    onChange={(e) => setVrstaAkta(e.target.value as PropisVrstaAkta)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PROPIS_VRSTE_AKATA.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Faza postupka
                  </label>
                  <select
                    value={fazaPostupka}
                    onChange={(e) => setFazaPostupka(e.target.value as PropisFazaPostupka)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PROPIS_FAZE_POSTUPKA.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Matični propisi (odvojeni zarezom)
                  </label>
                  <input
                    type="text"
                    value={maticniInput}
                    onChange={(e) => setMaticniInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    KLASA (opcionalno)
                  </label>
                  <input
                    type="text"
                    value={klasa}
                    onChange={(e) => setKlasa(e.target.value)}
                    placeholder="npr. 011-02/26-01/..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Lokalna referentna mapa (OneDrive)
                  </label>
                  <input
                    type="text"
                    value={referentnaMapa}
                    onChange={(e) => setReferentnaMapa(e.target.value)}
                    placeholder="C:\Users\...\Naziv mape"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Kratki opis / cilj izrade propisa
                  </label>
                  <textarea
                    rows={3}
                    value={opis}
                    onChange={(e) => setOpis(e.target.value)}
                    placeholder="Sažetak glavnih novina i ciljeva povjerenstva..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Kreiraj projekt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
