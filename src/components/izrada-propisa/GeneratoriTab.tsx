'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Table2,
  Briefcase,
  Sparkles,
  Download,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Pencil,
} from 'lucide-react';
import type {
  DeliverableRecord,
  DeliverableType,
  FactSheetData,
  PropisProject,
} from '@/lib/izrada-propisa-types';
import {
  generateDeliverableAction,
  saveDeliverableAction,
} from '@/app/actions/izradaPropisaPhase3Actions';
import { LegalMarkdown } from '@/components/LegalMarkdown';

interface GeneratoriTabProps {
  project: PropisProject;
  deliverables: DeliverableRecord[];
  hasDraft: boolean;
  onDeliverablesChange: (items: DeliverableRecord[]) => void;
}

const DELIVERABLE_CARDS: Array<{
  type: DeliverableType;
  title: string;
  subtitle: string;
  icon: typeof FileText;
  placeholderHint: string;
}> = [
  {
    type: 'obrazlozenje',
    title: 'Obrazloženje nacrta propisa',
    subtitle: 'Opći dio (pravna osnova, razlozi, proračun) + Objašnjenje po člancima (Uz čl. 1.–N.)',
    icon: FileText,
    placeholderHint:
      'npr. Navedi zaključak Radne skupine od 10. 11. 2026. i uskladi sve brojeve NN za ZFVG.',
  },
  {
    type: 'factsheet',
    title: 'FactSheet (obrazac Vlade RH)',
    subtitle: 'Službena 8-rubrična tablica: problem, cilj, učinci, novine, financije i hodogram',
    icon: Table2,
    placeholderHint:
      'npr. U financijske učinke obavezno uvrsti primjer stana od 80 m² i podatak o rastu prihoda HV-a.',
  },
  {
    type: 'podloga_kabinet',
    title: 'Podloga za kabinet ministrice',
    subtitle: 'Sažeti izvršni brifing (1–2 str.) za kolegij i predstavljanje na sjednici Vlade RH',
    icon: Briefcase,
    placeholderHint:
      'npr. Naglasi socijalna oslobođenja i administrativno rasterećenje općina ispod 5.000 stanovnika.',
  },
];

const FACTSHEET_FIELDS: Array<{ key: keyof FactSheetData; label: string; rows: number }> = [
  { key: 'strucniNositelj', label: 'Stručni nositelj', rows: 1 },
  { key: 'nazivAkta', label: 'Naziv zakonskog prijedloga ili drugog akta', rows: 1 },
  { key: 'zakonskaOsnova', label: '1. Zakonska osnova za donošenje', rows: 2 },
  {
    key: 'problem',
    label: '2. Što je problem koji zahtijeva izradu novog ili promjenu važećeg normativnog uređenja?',
    rows: 4,
  },
  { key: 'cilj', label: '3. Što je cilj koji se namjerava postići?', rows: 3 },
  { key: 'posljedicePozitivne', label: '4a. Pozitivne posljedice odnosno učinci', rows: 3 },
  { key: 'posljediceNegativne', label: '4b. Negativne posljedice odnosno učinci', rows: 3 },
  {
    key: 'novine',
    label: '5. Koje se novine uvode predloženim zakonskim odnosno drugim rješenjem?',
    rows: 4,
  },
  {
    key: 'financijskiUcinci',
    label: '6. Koji su financijski učinci za državu, JLS i građane?',
    rows: 5,
  },
  { key: 'otvorenaPitanja', label: '7. Koja su otvorena pitanja?', rows: 2 },
  { key: 'statusIHodogram', label: '8. Koji je status i željeni hodogram?', rows: 2 },
];

export function GeneratoriTab({
  project,
  deliverables,
  hasDraft,
  onDeliverablesChange,
}: GeneratoriTabProps) {
  const [activeType, setActiveType] = useState<DeliverableType>('obrazlozenje');
  const [customInstructions, setCustomInstructions] = useState('');
  const [modelPref, setModelPref] = useState<'flash' | 'pro'>('pro');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const currentSaved = deliverables.find((d) => d.type === activeType) || null;
  const [draftMarkdown, setDraftMarkdown] = useState(currentSaved?.contentMarkdown || '');
  const [draftFactSheet, setDraftFactSheet] = useState<FactSheetData | null>(
    currentSaved?.factSheetData || null
  );

  useEffect(() => {
    const found = deliverables.find((d) => d.type === activeType) || null;
    setDraftMarkdown(found?.contentMarkdown || '');
    setDraftFactSheet(found?.factSheetData || null);
    setCustomInstructions(found?.customInstructions || '');
    setFeedback(null);
  }, [activeType, deliverables]);

  const activeMeta = DELIVERABLE_CARDS.find((c) => c.type === activeType)!;

  const handleGenerate = async () => {
    setGenerating(true);
    setFeedback(null);
    const res = await generateDeliverableAction({
      projectId: project.id,
      type: activeType,
      customInstructions: customInstructions.trim() || undefined,
      modelPreference: modelPref,
    });
    setGenerating(false);
    if (res.error) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    if (res.deliverables && res.record) {
      onDeliverablesChange(res.deliverables);
      setDraftMarkdown(res.record.contentMarkdown);
      setDraftFactSheet(res.record.factSheetData || null);
      setFeedback({
        type: 'ok',
        text: `Uspješno generiran dokument „${activeMeta.title}”. Možete ga doraditi ispod i izvesti u .docx.`,
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    const record: DeliverableRecord = {
      id: activeType,
      type: activeType,
      title: `${activeMeta.title} — ${project.naziv}`,
      contentMarkdown: draftMarkdown,
      factSheetData: activeType === 'factsheet' ? draftFactSheet || undefined : undefined,
      customInstructions: customInstructions.trim() || undefined,
      modelName: currentSaved?.modelName,
      updatedAt: new Date().toISOString(),
    };
    const res = await saveDeliverableAction(project.id, record);
    setSaving(false);
    if (res.deliverables) {
      onDeliverablesChange(res.deliverables);
      setFeedback({ type: 'ok', text: 'Izmjene su trajno spremljene u projekt.' });
    }
  };

  const handleExportDocx = async () => {
    setExporting(true);
    setFeedback(null);
    try {
      const payload =
        activeType === 'factsheet'
          ? {
              kind: 'factsheet',
              projectName: project.naziv,
              puniNazivAkta: project.puniNazivAkta,
              factSheetData: draftFactSheet,
            }
          : {
              kind: activeType,
              projectName: project.naziv,
              puniNazivAkta: project.puniNazivAkta,
              markdown: draftMarkdown,
            };

      const res = await fetch('/api/izrada-propisa/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Greška pri generiranju .docx datoteke.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeType}_${project.naziv.replace(/\s+/g, '_')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err?.message || 'Greška pri izvozu.' });
    } finally {
      setExporting(false);
    }
  };

  const hasContent =
    activeType === 'factsheet' ? Boolean(draftFactSheet) : draftMarkdown.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Izbornik 3 generatora */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {DELIVERABLE_CARDS.map((card) => {
          const Icon = card.icon;
          const saved = deliverables.find((d) => d.type === card.type);
          const isSelected = activeType === card.type;
          return (
            <button
              key={card.type}
              type="button"
              onClick={() => setActiveType(card.type)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                {saved && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" />
                    Spremljeno
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {card.title}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {card.subtitle}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Radni prostor odabranog generatora */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            {feedback.text}
          </div>
        )}

        {/* Upute + Generiranje + Spremanje + Izvoz */}
        <div className="space-y-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {activeMeta.title}
              </h3>
              {currentSaved && (
                <p className="text-[11px] text-slate-500">
                  Zadnje spremljeno: {new Date(currentSaved.updatedAt).toLocaleString('hr-HR')}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={modelPref}
                onChange={(e) => setModelPref(e.target.value as 'flash' | 'pro')}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
              >
                <option value="pro">Gemini Pro (najkvalitetniji tekst)</option>
                <option value="flash">Gemini Flash (brzi nacrt)</option>
              </select>

              <button
                type="button"
                disabled={!hasDraft || generating}
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generating
                  ? 'Generiram iz nacrta i tarifa...'
                  : hasContent
                  ? 'Ponovno generiraj (AI)'
                  : 'Generiraj nacrt (AI)'}
              </button>

              <button
                type="button"
                disabled={!hasContent || saving}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Spremi
              </button>

              <button
                type="button"
                disabled={!hasContent || exporting}
                onClick={handleExportDocx}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Preuzmi Word (.docx)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Dodatne smjernice za AI generator (opcionalno):
            </label>
            <input
              type="text"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder={activeMeta.placeholderHint}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Uređivač / Pregled */}
        {!hasDraft ? (
          <div className="py-10 text-center text-xs text-slate-500">
            Učitajte Aktualni nacrt propisa u kartici „Dokumenti i Nacrt” kako biste mogli generirati službene popratne akte.
          </div>
        ) : !hasContent ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Nacrt dokumenta „{activeMeta.title}” još nije generiran.
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Kliknite <strong>„Generiraj nacrt (AI)”</strong> iznad — sustav će automatski povezati Aktualni nacrt, Excel tarife, Zapisnike i Tablicu primjedbi.
            </p>
          </div>
        ) : activeType === 'factsheet' && draftFactSheet ? (
          <div className="space-y-3">
            {FACTSHEET_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {field.label}
                </label>
                <textarea
                  rows={field.rows}
                  value={draftFactSheet[field.key] || ''}
                  onChange={(e) =>
                    setDraftFactSheet({
                      ...draftFactSheet,
                      [field.key]: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'edit'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Pencil className="w-3 h-3" /> Uređivanje
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'preview'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Eye className="w-3 h-3" /> Pregled
              </button>
            </div>

            {viewMode === 'edit' ? (
              <textarea
                rows={22}
                value={draftMarkdown}
                onChange={(e) => setDraftMarkdown(e.target.value)}
                className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40">
                <LegalMarkdown content={draftMarkdown} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
