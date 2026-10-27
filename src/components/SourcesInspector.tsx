'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Scale,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  Copy,
  Check,
  Search,
  Landmark,
  BookOpen,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { RagSourcesPayload, RagPraksaSource, RagZakonSource } from '@/lib/ai-types';

type ActiveModalItem =
  | { kind: 'praksa'; item: RagPraksaSource }
  | { kind: 'zakon'; item: RagZakonSource };

const IZVOR_ZAKONA_META: Record<
  RagZakonSource['izvor'],
  { label: string; badgeClass: string }
> = {
  citiran_u_pitanju: {
    label: 'Spomenuto u spisu / upitu',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  semanticki: {
    label: 'Semantička pretraga',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  citiran_u_praksi: {
    label: 'Citirano u praksi',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
};

function highlightSearchTerm(text: string, query: string): React.ReactNode {
  if (!query || query.trim().length < 2) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    regex.test(part) ? (
      <mark key={idx} className="bg-amber-200 text-slate-900 px-0.5 rounded">
        {part}
      </mark>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

export function SourcesInspector({ sources }: { sources: RagSourcesPayload }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'praksa' | 'zakoni'>(
    sources.praksa.length > 0 ? 'praksa' : 'zakoni'
  );
  const [modalItem, setModalItem] = useState<ActiveModalItem | null>(null);

  // State za modalni preglednik
  const [praksaViewMode, setPraksaViewMode] = useState<'excerpt' | 'full'>('excerpt');
  const [fullDocText, setFullDocText] = useState<string | null>(null);
  const [fullDocLoading, setFullDocLoading] = useState(false);
  const [fullDocError, setFullDocError] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState('');
  const [copiedModal, setCopiedModal] = useState(false);

  // State za navigaciju kroz susjedne članke zakona
  const [currentArticle, setCurrentArticle] = useState<RagZakonSource | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleNavError, setArticleNavError] = useState<string | null>(null);

  const totalCount = sources.praksa.length + sources.zakoni.length;

  const closeModal = useCallback(() => {
    setModalItem(null);
    setFullDocText(null);
    setFullDocError(null);
    setDocSearch('');
    setCurrentArticle(null);
    setArticleNavError(null);
  }, []);

  useEffect(() => {
    if (!modalItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalItem, closeModal]);

  const openPraksaModal = async (item: RagPraksaSource) => {
    setModalItem({ kind: 'praksa', item });
    setPraksaViewMode('excerpt');
    setFullDocText(null);
    setFullDocError(null);
    setDocSearch('');
    setFullDocLoading(true);

    try {
      const res = await fetch(
        `/api/praksa/doc?name=${encodeURIComponent(item.naziv_datoteke)}`
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        setFullDocError(data.error || 'Nije moguće dohvatiti cijeli tekst odluke.');
      } else {
        setFullDocText(data.fullText);
      }
    } catch {
      setFullDocError('Greška u komunikaciji s bazom prakse.');
    } finally {
      setFullDocLoading(false);
    }
  };

  const openZakonModal = (item: RagZakonSource) => {
    setModalItem({ kind: 'zakon', item });
    setCurrentArticle(item);
    setArticleNavError(null);
    setDocSearch('');
  };

  const navigateAdjacentArticle = async (dir: 'prev' | 'next') => {
    if (!currentArticle || articleLoading) return;
    setArticleLoading(true);
    setArticleNavError(null);
    try {
      const res = await fetch(
        `/api/praksa/doc?zakon=${encodeURIComponent(
          currentArticle.naziv_zakona
        )}&clanak=${encodeURIComponent(currentArticle.clanak_broj)}&dir=${dir}`
      );
      const data = await res.json();
      if (!res.ok || data.error) {
        setArticleNavError(data.error || 'Susjedni članak nije pronađen.');
      } else if (data.article) {
        setCurrentArticle({
          ...data.article,
          izvor: currentArticle.izvor,
        });
      }
    } catch {
      setArticleNavError('Greška pri dohvaćanju susjednog članka.');
    } finally {
      setArticleLoading(false);
    }
  };

  const handleCopyModalContent = async () => {
    if (!modalItem) return;
    let textToCopy = '';
    if (modalItem.kind === 'praksa') {
      const body =
        praksaViewMode === 'full' && fullDocText ? fullDocText : modalItem.item.sadrzaj;
      textToCopy = `Izvor: ${modalItem.item.naziv_datoteke}\n\n${body}`;
    } else if (currentArticle) {
      textToCopy = `${currentArticle.clanak_broj} (${currentArticle.naziv_zakona})\n\n${currentArticle.tekst}`;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedModal(true);
      setTimeout(() => setCopiedModal(false), 2000);
    } catch {
      // ignore
    }
  };

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="mt-2.5 border-t border-slate-100 pt-2">
      {/* Kompaktna traka "Pravni inspektor" */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 transition-colors text-left group"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            Pravni inspektor:
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-medium">
            <FileText className="w-3 h-3 text-indigo-600" />
            {sources.praksa.length}{' '}
            {sources.praksa.length === 1 ? 'odluka prakse' : 'odluka prakse'}
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-medium">
            <Scale className="w-3 h-3 text-blue-600" />
            {sources.zakoni.length}{' '}
            {sources.zakoni.length === 1 ? 'članak propisa' : 'članaka propisa'}
          </span>
        </div>

        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 group-hover:text-blue-700 shrink-0">
          {isOpen ? 'Sakrij izvore' : 'Pregledaj izvore'}
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>

      {/* Prošireni prikaz kartica izvora */}
      {isOpen && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2.5">
          {/* Tabovi: Praksa vs Propisi */}
          <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('praksa')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'praksa'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Korištena praksa ({sources.praksa.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('zakoni')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'zakoni'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              Korišteni propisi ({sources.zakoni.length})
            </button>
          </div>

          {/* Lista Prakse */}
          {activeTab === 'praksa' && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {sources.praksa.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2 px-1">
                  Za ovaj upit i aktivni filtar nisu pronađene srodne odluke u bazi prakse.
                </p>
              ) : (
                sources.praksa.map((p) => {
                  const pct = p.similarity ? Math.round(p.similarity * 100) : null;
                  const isSudska = p.vrsta === 'Sudska presuda';
                  return (
                    <button
                      key={`${p.id}-${p.naziv_datoteke}`}
                      type="button"
                      onClick={() => openPraksaModal(p)}
                      className="w-full text-left p-2.5 rounded-lg bg-white hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-300 transition-all shadow-2xs group"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                              isSudska
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}
                          >
                            <Landmark className="w-2.5 h-2.5" />
                            {isSudska ? 'Sudska presuda' : 'II. stupanj'}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {p.podrucje}
                          </span>
                          {p.godina && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {p.godina}.
                            </span>
                          )}
                        </div>

                        {pct !== null && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              pct >= 72
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : pct >= 55
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            {pct}% sličnost
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-slate-800 group-hover:text-indigo-700 line-clamp-1">
                        {p.kratkiNaziv}
                      </p>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                        {p.sadrzaj.replace(/\s+/g, ' ').slice(0, 200)}...
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Lista Propisa */}
          {activeTab === 'zakoni' && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {sources.zakoni.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2 px-1">
                  Nema dohvaćenih članaka propisa za ovaj upit.
                </p>
              ) : (
                sources.zakoni.map((z) => {
                  const izvorMeta = IZVOR_ZAKONA_META[z.izvor];
                  return (
                    <button
                      key={`${z.naziv_zakona}-${z.clanak_broj}`}
                      type="button"
                      onClick={() => openZakonModal(z)}
                      className="w-full text-left p-2.5 rounded-lg bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 group-hover:text-blue-900">
                          <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                          {z.clanak_broj} — {z.naziv_zakona}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${izvorMeta.badgeClass}`}
                        >
                          {izvorMeta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug">
                        {z.tekst.replace(/\s+/g, ' ').slice(0, 220)}...
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Skočni prozor (Modal) Pravnog inspektora */}
      {modalItem && (
        <div
          className="fixed inset-0 z-60 bg-slate-900/55 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="min-w-0">
                {modalItem.kind === 'praksa' ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded border ${
                          modalItem.item.vrsta === 'Sudska presuda'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                      >
                        {modalItem.item.vrsta}
                      </span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                        {modalItem.item.podrucje}
                      </span>
                      {modalItem.item.godina && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                          {modalItem.item.godina}. godina
                        </span>
                      )}
                      {modalItem.item.similarity && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Podudarnost: {Math.round(modalItem.item.similarity * 100)}%
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 break-words">
                      {modalItem.item.naziv_datoteke}
                    </h3>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        Važeći propis iz baze
                      </span>
                      {currentArticle && (
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded border ${
                            IZVOR_ZAKONA_META[currentArticle.izvor].badgeClass
                          }`}
                        >
                          {IZVOR_ZAKONA_META[currentArticle.izvor].label}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {currentArticle?.clanak_broj} — {currentArticle?.naziv_zakona}
                    </h3>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors shrink-0"
                title="Zatvori (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Toolbar (Pretraga, Prebacivanje Isječak/Cijeli akt, Navigacija članaka) */}
            <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              {modalItem.kind === 'praksa' ? (
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setPraksaViewMode('excerpt')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      praksaViewMode === 'excerpt'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Relevantni isječak
                  </button>
                  <button
                    type="button"
                    onClick={() => setPraksaViewMode('full')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      praksaViewMode === 'full'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Cijeli anonimizirani akt
                    {fullDocLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={articleLoading}
                    onClick={() => navigateAdjacentArticle('prev')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prethodni članak
                  </button>
                  <button
                    type="button"
                    disabled={articleLoading}
                    onClick={() => navigateAdjacentArticle('next')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 disabled:opacity-50"
                  >
                    Sljedeći članak
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {articleLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                </div>
              )}

              <div className="flex items-center gap-2 flex-1 justify-end min-w-52">
                <div className="relative flex-1 max-w-60">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="Traži pojam u tekstu..."
                    className="w-full pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCopyModalContent}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shrink-0"
                >
                  {copiedModal ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Kopirano
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Kopiraj
                    </>
                  )}
                </button>
              </div>
            </div>

            {articleNavError && (
              <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
                {articleNavError}
              </div>
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              {modalItem.kind === 'praksa' ? (
                praksaViewMode === 'excerpt' ? (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-50/70 border border-indigo-100 px-3 py-1.5 rounded-lg">
                      Najrelevantniji dio odluke koji je AI koristio pri analizi:
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">
                      {highlightSearchTerm(modalItem.item.sadrzaj, docSearch)}
                    </div>
                  </div>
                ) : fullDocLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="text-sm">Spajam sve dijelove anonimizirane odluke...</span>
                  </div>
                ) : fullDocError ? (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    {fullDocError}
                  </div>
                ) : (
                  <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {highlightSearchTerm(fullDocText || '', docSearch)}
                  </div>
                )
              ) : (
                <div className="p-5 rounded-xl bg-blue-50/30 border border-blue-100 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {highlightSearchTerm(currentArticle?.tekst || '', docSearch)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
