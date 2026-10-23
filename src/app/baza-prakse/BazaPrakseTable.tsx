'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  FileText,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
  MapPin,
  Tag,
  Filter,
  Layers,
  X,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { deletePraksaDoc, deletePraksaFolder } from '@/app/actions/praksaActions';

export type PraksaDoc = {
  naziv_datoteke: string;
  ukupno_chunkova: number;
};

export interface ParsedPraksaDoc {
  naziv_datoteke: string;
  ukupno_chunkova: number;
  podrucje: string;
  godina: string;
  ishod: 'Poništeno rješenje' | 'Odbijena žalba' | 'Ostalo';
  stranka: string;
  lokacija: string | null;
  tagovi: string[];
}

const LOCATIONS: Record<string, string> = {
  'zagrebačko prisavlje': 'Zagrebačko prisavlje',
  'zagrebacko prisavlje': 'Zagrebačko prisavlje',
  'slavonski brod': 'Slavonski Brod',
  šibenik: 'Šibenik',
  sibenik: 'Šibenik',
  zadar: 'Zadar',
  split: 'Split',
  rijeka: 'Rijeka',
  gospić: 'Gospić',
  gospic: 'Gospić',
  matica: 'Matica',
  bakar: 'Bakar',
  pag: 'Pag',
};

function parseDocument(doc: PraksaDoc): ParsedPraksaDoc {
  const name = doc.naziv_datoteke;
  
  // Izvuci kategoriju i godinu ako postoje u formatu [Kategorija - YYYY] ili [YYYY]
  let podrucje = 'Opća upravna praksa';
  let godina = 'Ostalo';
  let cleanName = name;

  const fullTagMatch = name.match(/^\[(.*?)\s*-\s*(\d{4})\]\s*/);
  const yearOnlyMatch = name.match(/^\[(\d{4})\]\s*/);

  if (fullTagMatch) {
    podrucje = fullTagMatch[1].trim();
    godina = fullTagMatch[2].trim();
    cleanName = name.replace(/^\[.*?\]\s*/, '');
  } else if (yearOnlyMatch) {
    godina = yearOnlyMatch[1].trim();
    podrucje = 'Vodni doprinos';
    cleanName = name.replace(/^\[\d{4}\]\s*/, '');
  } else if (name.toLowerCase().includes('vodn') || name.toLowerCase().includes('doprinos')) {
    podrucje = 'Vodni doprinos';
  }

  const clean = cleanName.replace(/\.(docx?|pdf|txt)$/i, '');
  const lower = clean.toLowerCase();

  let ishod: ParsedPraksaDoc['ishod'] = 'Ostalo';
  if (lower.includes('poništ') || lower.includes('ponist')) {
    ishod = 'Poništeno rješenje';
  } else if (lower.includes('odbijen') || lower.includes('odbijena')) {
    ishod = 'Odbijena žalba';
  }

  let lokacija: string | null = null;
  for (const [key, label] of Object.entries(LOCATIONS)) {
    if (lower.includes(key)) {
      lokacija = label;
      break;
    }
  }

  let stranka = clean;
  const tagovi: string[] = [];

  // Provjera formata npr: XX-Stranka-Broj-...
  if (/^\d{2}-/.test(clean)) {
    const parts = clean.split('-').map((p) => p.trim());
    if (parts.length >= 2) {
      stranka = parts[1];
    }

    for (let i = 2; i < parts.length; i++) {
      const p = parts[i];
      const pLow = p.toLowerCase();
      const isIshod = pLow.includes('poništ') || pLow.includes('odbij');
      const isLoc = Object.keys(LOCATIONS).some((loc) => pLow === loc || pLow.includes(loc));
      const isNumber = /^\d+$/.test(p);

      if (!isIshod && !isLoc && !isNumber && p.length > 2) {
        tagovi.push(p);
      }
    }
  }

  return {
    naziv_datoteke: name,
    ukupno_chunkova: doc.ukupno_chunkova || 1,
    podrucje,
    godina,
    ishod,
    stranka,
    lokacija,
    tagovi,
  };
}

export function BazaPrakseTable({ documents }: { documents: PraksaDoc[] }) {
  const router = useRouter();
  const [items, setItems] = useState<PraksaDoc[]>(documents);
  const [search, setSearch] = useState('');
  const [filterPodrucje, setFilterPodrucje] = useState('sve');
  const [filterGodina, setFilterGodina] = useState('sve');
  const [filterIshod, setFilterIshod] = useState('sve');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [, startTransition] = useTransition();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const parsedDocs = useMemo(() => {
    return items.map(parseDocument);
  }, [items]);

  const podrucjaList = useMemo(() => {
    const set = new Set(parsedDocs.map((d) => d.podrucje));
    return Array.from(set).sort();
  }, [parsedDocs]);

  const godineList = useMemo(() => {
    const set = new Set(parsedDocs.map((d) => d.godina));
    return Array.from(set).sort((a, b) => {
      if (a === 'Ostalo') return 1;
      if (b === 'Ostalo') return -1;
      return parseInt(b) - parseInt(a);
    });
  }, [parsedDocs]);

  const filteredDocs = useMemo(() => {
    return parsedDocs.filter((doc) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = doc.naziv_datoteke.toLowerCase().includes(q);
        const matchesStranka = doc.stranka.toLowerCase().includes(q);
        const matchesLoc = doc.lokacija?.toLowerCase().includes(q);
        const matchesTags = doc.tagovi.some((t) => t.toLowerCase().includes(q));
        if (!matchesName && !matchesStranka && !matchesLoc && !matchesTags) {
          return false;
        }
      }

      if (filterPodrucje !== 'sve' && doc.podrucje !== filterPodrucje) {
        return false;
      }

      if (filterGodina !== 'sve' && doc.godina !== filterGodina) {
        return false;
      }

      if (filterIshod !== 'sve') {
        if (filterIshod === 'ponisteno' && doc.ishod !== 'Poništeno rješenje') return false;
        if (filterIshod === 'odbijeno' && doc.ishod !== 'Odbijena žalba') return false;
      }

      return true;
    });
  }, [parsedDocs, search, filterPodrucje, filterGodina, filterIshod]);

  const groupedDocs = useMemo(() => {
    const groups: Record<string, ParsedPraksaDoc[]> = {};
    for (const doc of filteredDocs) {
      const key = `${doc.podrucje} - ${doc.godina}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    }
    return groups;
  }, [filteredDocs]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleAllGroups = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    Object.keys(groupedDocs).forEach((k) => {
      updated[k] = expand;
    });
    setOpenGroups(updated);
  };

  const totalChunks = useMemo(() => {
    return items.reduce((acc, d) => acc + (d.ukupno_chunkova || 1), 0);
  }, [items]);

  // Brisanje pojedinačnog dokumenta
  const handleDeleteDoc = async (doc: ParsedPraksaDoc) => {
    const confirmMsg = `Jeste li sigurni da želite trajno obrisati dokument:\n"${doc.stranka}" (${doc.naziv_datoteke})\ni sve njegove pripadajuće vektore iz baze prakse?`;
    if (!window.confirm(confirmMsg)) return;

    setLoadingAction(doc.naziv_datoteke);
    setFeedback(null);

    // Optimističko uklanjanje
    const previousItems = [...items];
    setItems((prev) => prev.filter((d) => d.naziv_datoteke !== doc.naziv_datoteke));

    try {
      const res = await deletePraksaDoc(doc.naziv_datoteke);
      if (res?.error) {
        setItems(previousItems);
        setFeedback({ message: res.error, type: 'error' });
      } else {
        setFeedback({
          message: `Dokument "${doc.stranka}" je uspješno uklonjen iz baze prakse.`,
          type: 'success',
        });
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err: unknown) {
      setItems(previousItems);
      const msg = err instanceof Error ? err.message : 'Greška pri brisanju dokumenta.';
      setFeedback({ message: msg, type: 'error' });
    } finally {
      setLoadingAction(null);
    }
  };

  // Brisanje cijele mape / grupe
  const handleDeleteFolder = async (groupKey: string, docs: ParsedPraksaDoc[], e: React.MouseEvent) => {
    e.stopPropagation();

    const confirmMsg = `UPOZORENJE:\nŽelite li obrisati SVE dokumente (${docs.length}) iz mape "${groupKey}" iz baze prakse?`;
    if (!window.confirm(confirmMsg)) return;

    const namesToDelete = docs.map((d) => d.naziv_datoteke);
    setLoadingAction(`folder:${groupKey}`);
    setFeedback(null);

    const previousItems = [...items];
    const deleteSet = new Set(namesToDelete);
    setItems((prev) => prev.filter((d) => !deleteSet.has(d.naziv_datoteke)));

    try {
      const res = await deletePraksaFolder(namesToDelete);
      if (res?.error) {
        setItems(previousItems);
        setFeedback({ message: res.error, type: 'error' });
      } else {
        setFeedback({
          message: `Uspješno obrisano svih ${docs.length} dokumenata iz mape "${groupKey}".`,
          type: 'success',
        });
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err: unknown) {
      setItems(previousItems);
      const msg = err instanceof Error ? err.message : 'Greška pri brisanju mape.';
      setFeedback({ message: msg, type: 'error' });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Obavijest o uspjehu ili greški */}
      {feedback && (
        <div
          className={`flex items-start justify-between p-4 rounded-xl border text-sm transition-all shadow-xs ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            )}
            <p className="font-medium">{feedback.message}</p>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-4 hover:opacity-75 transition-opacity"
          >
            Zatvori
          </button>
        </div>
      )}

      {/* Kartice sa statistikom */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ukupno spisa u bazi</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{items.length}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Vektorskih odlomaka (RAG)</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalChunks}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Teme i mape</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{Object.keys(groupedDocs).length}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FolderOpen className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Kontrolna traka: Tražilica + Filteri */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pretraži po stranci, pravnom prigovoru (npr. zastara, IM obrazac) ili gradu..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium pl-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filteri:</span>
            </div>

            <select
              value={filterPodrucje}
              onChange={(e) => setFilterPodrucje(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="sve">Sva područja</option>
              {podrucjaList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={filterGodina}
              onChange={(e) => setFilterGodina(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="sve">Sve godine</option>
              {godineList.map((g) => (
                <option key={g} value={g}>
                  {g === 'Ostalo' ? 'Ostalo' : `${g}.`}
                </option>
              ))}
            </select>

            <select
              value={filterIshod}
              onChange={(e) => setFilterIshod(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="sve">Svi ishodi</option>
              <option value="ponisteno">Poništena rješenja</option>
              <option value="odbijeno">Odbijene žalbe</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Prikazano <strong>{filteredDocs.length}</strong> od ukupno <strong>{items.length}</strong> spisa
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleAllGroups(true)}
              className="hover:text-blue-600 font-medium transition-colors"
            >
              Proširi sve
            </button>
            <span>&bull;</span>
            <button
              onClick={() => toggleAllGroups(false)}
              className="hover:text-blue-600 font-medium transition-colors"
            >
              Skupi sve
            </button>
          </div>
        </div>
      </div>

      {/* Popis grupa (Harmonika / Accordion) */}
      {Object.keys(groupedDocs).length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">Nema pronađenih spisa</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Niti jedan dokument ne odgovara zadanim uvjetima pretrage i filtera.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedDocs).map(([groupKey, docs]) => {
            const isOpen = openGroups[groupKey] ?? true;
            const isFolderDeleting = loadingAction === `folder:${groupKey}`;

            return (
              <div
                key={groupKey}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
              >
                {/* Zaglavlje grupe / mape */}
                <div
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full px-6 py-4.5 bg-slate-50/70 hover:bg-slate-100/80 transition-colors flex items-center justify-between text-left border-b border-slate-200/70 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                        {groupKey}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Zbirka upravnih rješenja i pravnih stavova
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-700 shadow-2xs">
                      {docs.length} {docs.length === 1 ? 'predmet' : 'predmeta'}
                    </span>

                    {/* Gumb za brisanje cijele mape */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteFolder(groupKey, docs, e)}
                      disabled={isFolderDeleting}
                      title="Ukloni cijelu mapu i sve njezine dokumente iz baze"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 rounded-lg transition-all shadow-2xs disabled:opacity-50 cursor-pointer ml-1"
                    >
                      {isFolderDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      <span className="hidden sm:inline">Obriši mapu</span>
                    </button>

                    <div className="text-slate-400 pl-1">
                      {isOpen ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Sadržaj grupe (Rasklopljene kartice rješenja) */}
                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {docs.map((doc, idx) => {
                      const isDeletingThis = loadingAction === doc.naziv_datoteke;

                      return (
                        <div
                          key={idx}
                          className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                        >
                          {/* Lijeva strana: Stranka, ishod, prigovori */}
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Ishod bedž */}
                              {doc.ishod === 'Poništeno rješenje' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                                <RotateCcw className="w-3 h-3 text-amber-600" />
                                Poništeno rješenje
                              </span>
                            )}
                            {doc.ishod === 'Odbijena žalba' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Odbijena žalba
                              </span>
                            )}

                            {/* Lokacija */}
                            {doc.lokacija && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {doc.lokacija}
                              </span>
                            )}

                            {/* Stranka */}
                            <h3 className="text-sm font-bold text-slate-900 truncate">
                              {doc.stranka}
                            </h3>
                          </div>

                          {/* Pravni prigovori / tagovi */}
                          {doc.tagovi.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {doc.tagovi.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-blue-50/70 text-blue-700 border border-blue-100/80"
                                >
                                  <Tag className="w-2.5 h-2.5 text-blue-400" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Izvorni naziv datoteke */}
                          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono truncate">
                            <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            <span className="truncate">{doc.naziv_datoteke}</span>
                          </div>
                        </div>

                        {/* Desna strana: Broj RAG chunkova + Gumb za brisanje */}
                        <div className="shrink-0 flex items-center justify-end gap-2.5">
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/70"
                            title="Broj indeksiranih vektorskih dijelova dostupnih AI asistentu"
                          >
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {doc.ukupno_chunkova} {doc.ukupno_chunkova === 1 ? 'dio' : 'dijelova'}
                            </span>
                          </span>

                          <button
                            type="button"
                            onClick={() => handleDeleteDoc(doc)}
                            disabled={isDeletingThis}
                            title="Trajno ukloni ovaj spis iz baze prakse"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isDeletingThis ? (
                              <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);
}
