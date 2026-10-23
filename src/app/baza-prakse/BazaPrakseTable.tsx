'use client';

import { useState, useMemo } from 'react';
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
} from 'lucide-react';

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
  const clean = name.replace(/\.(docx?|pdf|txt)$/i, '');
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

  let podrucje = 'Opća upravna praksa';
  let godina = 'Ostalo';
  let stranka = clean;
  const tagovi: string[] = [];

  // Provjera je li iz zbirke Vodni doprinos 2019 (format: XX-Stranka-Broj-...)
  if (/^\d{2}-/.test(clean)) {
    podrucje = 'Vodni doprinos';
    godina = '2019';
    const parts = clean.split('-').map((p) => p.trim());
    if (parts.length >= 2) {
      stranka = parts[1];
    }

    for (let i = 2; i < parts.length; i++) {
      const p = parts[i];
      const pLow = p.toLowerCase();
      // Filtriraj poznate elemente da ostanu samo stvarni pravni prigovori/tagovi
      const isIshod = pLow.includes('poništ') || pLow.includes('odbij');
      const isLoc = Object.keys(LOCATIONS).some((loc) => pLow === loc || pLow.includes(loc));
      const isNumber = /^\d+$/.test(p);

      if (!isIshod && !isLoc && !isNumber && p.length > 2) {
        tagovi.push(p);
      }
    }
  } else {
    // Stariji pojedinačni unosi
    if (lower.includes('vodn') || lower.includes('doprinos')) {
      podrucje = 'Vodni doprinos';
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
  const [search, setSearch] = useState('');
  const [filterPodrucje, setFilterPodrucje] = useState('sve');
  const [filterIshod, setFilterIshod] = useState('sve');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'Vodni doprinos - 2019': true,
    'Opća upravna praksa - Ostalo': true,
  });

  const parsedDocs = useMemo(() => {
    return documents.map(parseDocument);
  }, [documents]);

  // Izdvajanje jedinstvenih područja za filter
  const podrucjaList = useMemo(() => {
    const set = new Set(parsedDocs.map((d) => d.podrucje));
    return Array.from(set).sort();
  }, [parsedDocs]);

  // Filtriranje dokumenata
  const filteredDocs = useMemo(() => {
    return parsedDocs.filter((doc) => {
      // Pretraga
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

      // Filter područja
      if (filterPodrucje !== 'sve' && doc.podrucje !== filterPodrucje) {
        return false;
      }

      // Filter ishoda
      if (filterIshod !== 'sve') {
        if (filterIshod === 'ponisteno' && doc.ishod !== 'Poništeno rješenje') return false;
        if (filterIshod === 'odbijeno' && doc.ishod !== 'Odbijena žalba') return false;
      }

      return true;
    });
  }, [parsedDocs, search, filterPodrucje, filterIshod]);

  // Grupiranje po "Područje - Godina"
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
    return documents.reduce((acc, d) => acc + (d.ukupno_chunkova || 1), 0);
  }, [documents]);

  return (
    <div className="space-y-6">
      {/* Kartice sa statistikom */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ukupno spisa u bazi</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{documents.length}</p>
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
          {/* Tražilica */}
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

          {/* Filteri */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium pl-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filteri:</span>
            </div>

            {/* Područje */}
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

            {/* Ishod */}
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

        {/* Rezultati info + Brzi gumbi */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Prikazano <strong>{filteredDocs.length}</strong> od ukupno <strong>{documents.length}</strong> spisa
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

            return (
              <div
                key={groupKey}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
              >
                {/* Zaglavlje grupe / mape */}
                <button
                  type="button"
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
                    <div className="text-slate-400">
                      {isOpen ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Sadržaj grupe (Rasklopljene kartice rješenja) */}
                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {docs.map((doc, idx) => (
                      <div
                        key={idx}
                        className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
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

                        {/* Desna strana: Broj RAG chunkova */}
                        <div className="shrink-0 flex items-center justify-end">
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/70"
                            title="Broj indeksiranih vektorskih dijelova dostupnih AI asistentu"
                          >
                            <Layers className="w-3 h-3 text-slate-400" />
                            <span>{doc.ukupno_chunkova} {doc.ukupno_chunkova === 1 ? 'dio' : 'dijelova'}</span>
                          </span>
                        </div>
                      </div>
                    ))}
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
