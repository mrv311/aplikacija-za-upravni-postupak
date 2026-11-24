'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Sparkles,
  MessageSquareText,
  GitCompareArrows,
  ShieldCheck,
  FileOutput,
  Settings2,
  X,
  Loader2,
  Save,
  ScrollText,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  PROPIS_FAZE_POSTUPKA,
  type DeliverableRecord,
  type PrimjedbaItem,
  type PropisDocument,
  type PropisFazaPostupka,
  type PropisProject,
  type StressTestReport,
} from '@/lib/izrada-propisa-types';
import type { LegalUIMessage } from '@/lib/ai-types';
import { updatePropisProjectAction } from '@/app/actions/izradaPropisaActions';
import { runLocalStressChecks } from '@/lib/propis-stress-local';
import { DokumentiTab } from './DokumentiTab';
import { PropisAiChat } from './PropisAiChat';
import { PrimjedbeTab } from './PrimjedbeTab';
import { DiffTab } from './DiffTab';
import { StressTestTab } from './StressTestTab';
import { GeneratoriTab } from './GeneratoriTab';

type WorkspaceTab =
  | 'dokumenti'
  | 'chat'
  | 'primjedbe'
  | 'diff'
  | 'stress'
  | 'generatori';

interface PropisWorkspaceProps {
  initialProject: PropisProject;
  initialDocuments: PropisDocument[];
  initialPrimjedbe: PrimjedbaItem[];
  initialStressTests: StressTestReport[];
  initialDeliverables: DeliverableRecord[];
  initialChatMessages: LegalUIMessage[];
  praksaCount: number;
  zakoniCount: number;
}

export function PropisWorkspace({
  initialProject,
  initialDocuments,
  initialPrimjedbe,
  initialStressTests,
  initialDeliverables,
  initialChatMessages,
  praksaCount,
  zakoniCount,
}: PropisWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dokumenti');
  const [project, setProject] = useState<PropisProject>(initialProject);
  const [documents, setDocuments] = useState<PropisDocument[]>(initialDocuments);
  const [primjedbe, setPrimjedbe] = useState<PrimjedbaItem[]>(initialPrimjedbe);
  const [stressTests, setStressTests] = useState<StressTestReport[]>(initialStressTests);
  const [deliverables, setDeliverables] = useState<DeliverableRecord[]>(initialDeliverables);

  // Sinkroniziraj kad router.refresh() donese svježe server podatke
  useEffect(() => setProject(initialProject), [initialProject]);
  useEffect(() => setDocuments(initialDocuments), [initialDocuments]);
  useEffect(() => setPrimjedbe(initialPrimjedbe), [initialPrimjedbe]);
  useEffect(() => setStressTests(initialStressTests), [initialStressTests]);
  useEffect(() => setDeliverables(initialDeliverables), [initialDeliverables]);

  // Modal postavki projekta + sklopivi Vodič za rad (6 koraka)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [setForm, setSetForm] = useState({
    naziv: project.naziv,
    puniNazivAkta: project.puniNazivAkta,
    klasa: project.klasa || '',
    urbroj: project.urbroj || '',
    referentnaMapa: project.referentnaMapa || '',
    maticniPropisi: project.maticniPropisi.join(', '),
    opis: project.opis || '',
  });

  const aktualniNacrt = useMemo(
    () => documents.find((d) => d.uloga === 'aktualni_nacrt'),
    [documents]
  );

  const localStressCriticalCount = useMemo(() => {
    if (!aktualniNacrt) return 0;
    const excelDocs = documents.filter((d) => d.uloga === 'excel_tarife');
    return runLocalStressChecks(aktualniNacrt, excelDocs).filter(
      (f) => f.severity === 'kriticno' || f.severity === 'upozorenje'
    ).length;
  }, [aktualniNacrt, documents]);

  const draftVersionsCount = useMemo(
    () =>
      documents.filter(
        (d) => d.uloga === 'aktualni_nacrt' || d.uloga === 'prethodna_verzija'
      ).length,
    [documents]
  );

  const handleFazaChange = async (fazaPostupka: PropisFazaPostupka) => {
    setProject((prev) => ({ ...prev, fazaPostupka }));
    await updatePropisProjectAction(project.id, { fazaPostupka });
    router.refresh();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    const maticni = setForm.maticniPropisi
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await updatePropisProjectAction(project.id, {
      naziv: setForm.naziv.trim() || project.naziv,
      puniNazivAkta: setForm.puniNazivAkta.trim() || project.puniNazivAkta,
      klasa: setForm.klasa.trim() || undefined,
      urbroj: setForm.urbroj.trim() || undefined,
      referentnaMapa: setForm.referentnaMapa.trim() || undefined,
      maticniPropisi: maticni.length > 0 ? maticni : project.maticniPropisi,
      opis: setForm.opis.trim() || undefined,
    });
    setSavingSettings(false);
    if (res.project) {
      setProject(res.project);
      setSettingsOpen(false);
      router.refresh();
    }
  };

  const tabs: Array<{
    id: WorkspaceTab;
    label: string;
    icon: typeof FileText;
    badge?: string | number;
    badgeTone?: 'blue' | 'amber' | 'rose' | 'emerald';
  }> = [
    {
      id: 'dokumenti',
      label: 'Dokumenti i Nacrt',
      icon: FileText,
      badge: documents.length,
      badgeTone: aktualniNacrt ? 'emerald' : 'blue',
    },
    {
      id: 'chat',
      label: 'AI Pravni Chat',
      icon: Sparkles,
      badge: praksaCount > 0 ? `${praksaCount}` : 'RAG',
      badgeTone: 'blue',
    },
    {
      id: 'primjedbe',
      label: 'Tablica primjedbi',
      icon: MessageSquareText,
      badge: primjedbe.length,
      badgeTone: primjedbe.some((p) => p.status === 'Na razmatranju') ? 'amber' : 'blue',
    },
    {
      id: 'diff',
      label: 'Usporedba (Diff)',
      icon: GitCompareArrows,
      badge: draftVersionsCount,
      badgeTone: 'blue',
    },
    {
      id: 'stress',
      label: 'Stress-test',
      icon: ShieldCheck,
      badge: localStressCriticalCount > 0 ? `${localStressCriticalCount}!` : stressTests.length,
      badgeTone: localStressCriticalCount > 0 ? 'rose' : 'emerald',
    },
    {
      id: 'generatori',
      label: 'Generatori (.docx)',
      icon: FileOutput,
      badge: `${deliverables.length}/3`,
      badgeTone: deliverables.length === 3 ? 'emerald' : 'blue',
    },
  ];

  const badgeClasses = (tone: 'blue' | 'amber' | 'rose' | 'emerald' = 'blue', active: boolean) => {
    if (active) return 'bg-white/20 text-white';
    switch (tone) {
      case 'rose':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300';
      case 'amber':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300';
      case 'emerald':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300';
      default:
        return 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="min-h-[calc(100vh-3px)] flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Zaglavlje projekta */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 sm:px-8 pt-4 pb-0 shrink-0">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/izrada-propisa"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Natrag na projekte povjerenstava
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={project.fazaPostupka}
                onChange={(e) => handleFazaChange(e.target.value as PropisFazaPostupka)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                {PROPIS_FAZE_POSTUPKA.map((f) => (
                  <option key={f} value={f}>
                    Faza: {f}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setGuideOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                  guideOpen
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Kako koristiti (Vodič)
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetForm({
                    naziv: project.naziv,
                    puniNazivAkta: project.puniNazivAkta,
                    klasa: project.klasa || '',
                    urbroj: project.urbroj || '',
                    referentnaMapa: project.referentnaMapa || '',
                    maticniPropisi: project.maticniPropisi.join(', '),
                    opis: project.opis || '',
                  });
                  setSettingsOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Postavke projekta
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-sm shrink-0 mt-0.5">
                <ScrollText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {project.naziv}
                  </h1>
                  <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {project.vrstaAkta}
                  </span>
                  {project.klasa && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800">
                      KLASA: {project.klasa}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  {project.puniNazivAkta}
                </p>
              </div>
            </div>
          </div>

          {/* 6-tab navigacija */}
          <nav className="flex items-center gap-1.5 overflow-x-auto pb-3 pt-1 -mx-1 px-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`text-[10.5px] font-bold px-1.5 py-0.2 rounded-full tabular-nums ${badgeClasses(
                        tab.badgeTone,
                        isActive
                      )}`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Sadržaj aktivne kartice */}
      <div className="flex-1 px-5 sm:px-8 py-5">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Sklopivi interaktivni vodič: Kako koristiti modul u 6 koraka */}
          {guideOpen && (
            <div className="bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/70 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-blue-600" />
                    Vodič za rad s modulom „Izrada propisa” (redoslijed u 6 koraka)
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Kliknite bilo koji korak ispod da biste se izravno prebacili na tu funkcionalnost.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {[
                  {
                    step: '1',
                    tab: 'dokumenti' as WorkspaceTab,
                    title: 'Dokumenti i Aktualni nacrt',
                    done: Boolean(aktualniNacrt),
                    desc: 'Učitajte dokumente i postavite najnoviju verziju kao „Aktualni nacrt” (zvjezdica). Označite kvačicom „U AI kontekstu” samo ključne dokumente koje AI treba čitati (npr. tarife i zadnja mišljenja) — ostale slobodno isključite.',
                  },
                  {
                    step: '2',
                    tab: 'chat' as WorkspaceTab,
                    title: 'AI Pravni Chat (+ Baza prakse)',
                    done: false,
                    desc: 'Pitajte AI bilo što o nacrtu: usklađenost s ZFVG-om, rizike iz 2.200+ presuda i II. stupnja ili brifing za sjednicu. AI automatski vuče članke zakona i stvarne odluke u Pravni inspektor.',
                  },
                  {
                    step: '3',
                    tab: 'primjedbe' as WorkspaceTab,
                    title: 'Tablica primjedbi TDU / UZZ',
                    done: primjedbe.length > 0,
                    desc: 'Kliknite „Uvezi Word tablicu (0 AI)” za uvoz već postojeće tablice ili „AI izdvoji iz mišljenja” da AI sam razbije PDF mišljenja po člancima i predloži odgovore. Sve izvezite u gotov Word (.docx).',
                  },
                  {
                    step: '4',
                    tab: 'diff' as WorkspaceTab,
                    title: 'Usporedba verzija (Diff)',
                    done: draftVersionsCount >= 2,
                    desc: 'Odaberite dvije verzije nacrta (npr. svibanj vs. studeni, ili važeću Uredbu NN 82/10 iz Baze zakona) za trenutni pregled izmjena po člancima (0 AI) i izvoz Redline ili Tablice promjena u .docx.',
                  },
                  {
                    step: '5',
                    tab: 'stress' as WorkspaceTab,
                    title: 'Pravni Stress-test (JMNP + Praksa)',
                    done: stressTests.length > 0,
                    desc: 'Lokalni skener odmah (0 AI) hvata zagrade, neslaganja NN brojeva i razlike tarifa. Gumb „Pokreni dubinski AI Stress-test” dodatno testira nacrt kroz JMNP, ZFVG/ZOV i sudsku praksu s prijedlozima preformulacija.',
                  },
                  {
                    step: '6',
                    tab: 'generatori' as WorkspaceTab,
                    title: 'Generatori: Obrazloženje, FactSheet, Podloga',
                    done: deliverables.length > 0,
                    desc: 'Jednim klikom generirajte Obrazloženje (Opći dio + Uz čl. 1.–N.), službeni 8-rubrični FactSheet ili Podlogu za kabinet ministrice, doradite u uređivaču i preuzmite čist .docx.',
                  },
                ].map((s) => (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => setActiveTab(s.tab)}
                    className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      activeTab === s.tab
                        ? 'bg-blue-600/10 border-blue-400 dark:border-blue-600'
                        : 'bg-white/90 dark:bg-slate-900/90 border-slate-200 dark:border-slate-800 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {s.step}
                        </span>
                        {s.title}
                      </span>
                      {s.done && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {s.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'dokumenti' && (
            <DokumentiTab
              project={project}
              documents={documents}
              onDocumentsChange={setDocuments}
              onRefresh={() => router.refresh()}
            />
          )}

          {activeTab === 'chat' && (
            <PropisAiChat
              project={project}
              documents={documents}
              initialMessages={initialChatMessages}
              praksaCount={praksaCount}
              zakoniCount={zakoniCount}
              onDocumentsChange={setDocuments}
            />
          )}

          {activeTab === 'primjedbe' && (
            <PrimjedbeTab
              project={project}
              documents={documents}
              primjedbe={primjedbe}
              onPrimjedbeChange={setPrimjedbe}
            />
          )}

          {activeTab === 'diff' && <DiffTab project={project} documents={documents} />}

          {activeTab === 'stress' && (
            <StressTestTab
              project={project}
              documents={documents}
              reports={stressTests}
              onReportsChange={setStressTests}
            />
          )}

          {activeTab === 'generatori' && (
            <GeneratoriTab
              project={project}
              deliverables={deliverables}
              hasDraft={draftVersionsCount > 0}
              onDeliverablesChange={setDeliverables}
            />
          )}
        </div>
      </div>

      {/* Modal: Postavke projekta */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <form
            onSubmit={handleSaveSettings}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-3.5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Postavke projekta propisa
              </h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Kratki naziv projekta
              </label>
              <input
                type="text"
                value={setForm.naziv}
                onChange={(e) => setSetForm({ ...setForm, naziv: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Puni službeni naziv akta
              </label>
              <input
                type="text"
                value={setForm.puniNazivAkta}
                onChange={(e) => setSetForm({ ...setForm, puniNazivAkta: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  KLASA
                </label>
                <input
                  type="text"
                  value={setForm.klasa}
                  onChange={(e) => setSetForm({ ...setForm, klasa: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  URBROJ
                </label>
                <input
                  type="text"
                  value={setForm.urbroj}
                  onChange={(e) => setSetForm({ ...setForm, urbroj: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Referentna OneDrive mapa
              </label>
              <input
                type="text"
                value={setForm.referentnaMapa}
                onChange={(e) => setSetForm({ ...setForm, referentnaMapa: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Matični propisi (odvojeni zarezom)
              </label>
              <input
                type="text"
                value={setForm.maticniPropisi}
                onChange={(e) => setSetForm({ ...setForm, maticniPropisi: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Opis / bilješka povjerenstva
              </label>
              <textarea
                rows={3}
                value={setForm.opis}
                onChange={(e) => setSetForm({ ...setForm, opis: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer"
              >
                Odustani
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Spremi postavke
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
