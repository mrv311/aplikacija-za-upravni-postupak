'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  FileText,
  Building2,
  Droplets,
  Scale,
  Coins,
  FileCheck2,
} from 'lucide-react';
import { PROPISI_MAP, PROPISI_LIST, PropisDef } from '@/lib/propisi-config';

export interface ClanakItem {
  id: number;
  naziv_zakona: string;
  clanak_broj: string;
  tekst: string;
}

export interface GroupedPropis {
  naziv: string;
  kratica: string;
  podrucje: string;
  tip: 'Zakon' | 'Uredba' | 'Pravilnik';
  nn: string;
  opis: string;
  clanci: ClanakItem[];
}

const PODRUCJE_ICONS: Record<string, React.ReactNode> = {
  'Opći upravni propisi': <Scale className="w-5 h-5 text-indigo-600" />,
  'Vodno pravo i naknade': <Droplets className="w-5 h-5 text-blue-600" />,
  'Gradnja, prostor i ozakonjenje': <Building2 className="w-5 h-5 text-amber-600" />,
  'Porezi i pristojbe': <Coins className="w-5 h-5 text-emerald-600" />,
};

function parseArticleSort(clanakBroj: string): number {
  const match = clanakBroj.match(/\d+/);
  return match ? parseInt(match[0], 10) : 9999;
}

function resolvePropisMeta(naziv: string): PropisDef {
  if (PROPISI_MAP[naziv]) return PROPISI_MAP[naziv];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9čćžšđ]/gi, '');
  const target = norm(naziv);
  const found = PROPISI_LIST.find((p) => norm(p.naziv) === target || norm(p.kratica) === target);
  if (found) return found;
  return {
    naziv,
    kratica: naziv.split(' ').map((w) => w[0]?.toUpperCase()).join(''),
    podrucje: 'Opći upravni propisi',
    tip: naziv.toLowerCase().includes('uredb')
      ? 'Uredba'
      : naziv.toLowerCase().includes('pravilnik')
      ? 'Pravilnik'
      : 'Zakon',
    nn: '',
    izvor: 'lokalno',
    opis: 'Pravni propis',
  };
}

export function PropisiTable({ articles }: { articles: ClanakItem[] }) {
  const [search, setSearch] = useState('');
  const [filterPodrucje, setFilterPodrucje] = useState('sve');
  const [filterTip, setFilterTip] = useState('sve');

  // Stanja otvorenih harmonika (zadano sva polja i propisi zatvoreni)
  const [openPodrucja, setOpenPodrucja] = useState<Record<string, boolean>>({});
  const [openPropisi, setOpenPropisi] = useState<Record<string, boolean>>({});
  const [expandedClanci, setExpandedClanci] = useState<Record<number, boolean>>({});

  // Grupiranje članaka po propisima i obogaćivanje metapodacima
  const groupedPropisi = useMemo(() => {
    const map = new Map<string, ClanakItem[]>();

    for (const art of articles) {
      const naziv = art.naziv_zakona;
      if (!map.has(naziv)) map.set(naziv, []);
      map.get(naziv)!.push(art);
    }

    const list: GroupedPropis[] = [];

    for (const [naziv, clanci] of map.entries()) {
      const meta: PropisDef = PROPISI_MAP[naziv] || {
        naziv,
        kratica: naziv.split(' ').map((w) => w[0]?.toUpperCase()).join(''),
        podrucje: 'Opći upravni propisi',
        tip: naziv.toLowerCase().includes('uredb')
          ? 'Uredba'
          : naziv.toLowerCase().includes('pravilnik')
          ? 'Pravilnik'
          : 'Zakon',
        nn: '',
        izvor: 'lokalno',
        opis: 'Pravni propis',
      };

      // Sortiraj članke numerički
      clanci.sort((a, b) => parseArticleSort(a.clanak_broj) - parseArticleSort(b.clanak_broj));

      list.push({
        naziv,
        kratica: meta.kratica,
        podrucje: meta.podrucje,
        tip: meta.tip,
        nn: meta.nn,
        opis: meta.opis || '',
        clanci,
      });
    }

    return list;
  }, [articles]);

  // Statistički podaci
  const stats = useMemo(() => {
    let ukupnoClanaka = 0;
    let brojZakona = 0;
    let brojPodzakonskih = 0;

    for (const p of groupedPropisi) {
      ukupnoClanaka += p.clanci.length;
      if (p.tip === 'Zakon') brojZakona++;
      else brojPodzakonskih++;
    }

    return {
      ukupnoPropisa: groupedPropisi.length,
      ukupnoClanaka,
      brojZakona,
      brojPodzakonskih,
    };
  }, [groupedPropisi]);

  // Filtrirani propisi prema pretrazi i filterima
  const filteredPropisi = useMemo(() => {
    const q = search.trim().toLowerCase();

    return groupedPropisi.filter((p) => {
      // Filter po području
      if (filterPodrucje !== 'sve' && p.podrucje !== filterPodrucje) return false;

      // Filter po tipu
      if (filterTip === 'zakon' && p.tip !== 'Zakon') return false;
      if (filterTip === 'podzakonski' && p.tip === 'Zakon') return false;

      // Pretraga
      if (q) {
        const matchesNaziv = p.naziv.toLowerCase().includes(q);
        const matchesKratica = p.kratica.toLowerCase().includes(q);
        const matchesNN = p.nn.toLowerCase().includes(q);
        const matchesClanak = p.clanci.some(
          (c) => c.clanak_broj.toLowerCase().includes(q) || c.tekst.toLowerCase().includes(q)
        );

        if (!matchesNaziv && !matchesKratica && !matchesNN && !matchesClanak) {
          return false;
        }
      }

      return true;
    });
  }, [groupedPropisi, search, filterPodrucje, filterTip]);

  // Dvorazinsko grupiranje: Područje -> Propisi
  const nestedGroups = useMemo(() => {
    const groups: Record<string, GroupedPropis[]> = {};

    for (const p of filteredPropisi) {
      if (!groups[p.podrucje]) groups[p.podrucje] = [];
      groups[p.podrucje].push(p);
    }

    return groups;
  }, [filteredPropisi]);

  const togglePodrucje = (podrucje: string) => {
    setOpenPodrucja((prev) => ({ ...prev, [podrucje]: !prev[podrucje] }));
  };

  const togglePropis = (naziv: string) => {
    setOpenPropisi((prev) => ({ ...prev, [naziv]: !prev[naziv] }));
  };

  const toggleClanak = (id: number) => {
    setExpandedClanci((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Statističke kartice */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Propisi</span>
            <BookOpen className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.ukupnoPropisa}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">učitano u bazu</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Članci</span>
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.ukupnoClanaka}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">indeksirano članaka</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Zakoni</span>
            <Scale className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.brojZakona}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">temeljnih zakona</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Podzakonski akti</span>
            <FileCheck2 className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{stats.brojPodzakonskih}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">uredbi i pravilnika</span>
        </div>
      </div>

      {/* Tražilica i Filteri */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pretraži propise, kratice (npr. ZUP, ZOV), članke (npr. 116) ili tekst..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filteri:</span>
            </div>

            <select
              value={filterPodrucje}
              onChange={(e) => setFilterPodrucje(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="sve">Sva područja</option>
              <option value="Opći upravni propisi">Opći upravni propisi</option>
              <option value="Vodno pravo i naknade">Vodno pravo i naknade</option>
              <option value="Gradnja, prostor i ozakonjenje">Gradnja, prostor i ozakonjenje</option>
              <option value="Porezi i pristojbe">Porezi i pristojbe</option>
            </select>

            <select
              value={filterTip}
              onChange={(e) => setFilterTip(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="sve">Svi tipovi</option>
              <option value="zakon">Samo zakoni</option>
              <option value="podzakonski">Uredbe i pravilnici</option>
            </select>
          </div>
        </div>
      </div>

      {/* Dvorazinska harmonika propisa */}
      {Object.keys(nestedGroups).length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">Nema pronađenih propisa</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Niti jedan zakon ili pravilnik ne odgovara zadanim uvjetima pretrage i filtera.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(nestedGroups).map(([podrucje, propisiInPodrucje]) => {
            const isPodrucjeOpen = !!openPodrucja[podrucje];
            const icon = PODRUCJE_ICONS[podrucje] || <Layers className="w-5 h-5 text-slate-600" />;
            const totalArticles = propisiInPodrucje.reduce((acc, p) => acc + p.clanci.length, 0);

            return (
              <div
                key={podrucje}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
              >
                {/* RAZINA 1: Područje */}
                <div
                  onClick={() => togglePodrucje(podrucje)}
                  className="w-full px-6 py-4.5 bg-slate-50/80 hover:bg-slate-100/90 transition-colors flex items-center justify-between text-left border-b border-slate-200/70 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs">
                      {icon}
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-base">{podrucje}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {propisiInPodrucje.length} {propisiInPodrucje.length === 1 ? 'propis' : 'propisa'} • {totalArticles} članaka
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    {isPodrucjeOpen ? (
                      <ChevronDown className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>
                </div>

                {/* RAZINA 2: Kartice pojedinih propisa */}
                {isPodrucjeOpen && (
                  <div className="p-4 bg-slate-50/40 space-y-3">
                    {propisiInPodrucje.map((propis) => {
                      const isPropisOpen = !!openPropisi[propis.naziv];

                      return (
                        <div
                          key={propis.naziv}
                          className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden transition-all"
                        >
                          {/* Zaglavlje propisa */}
                          <div
                            onClick={() => togglePropis(propis.naziv)}
                            className="w-full px-5 py-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between text-left cursor-pointer select-none"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-blue-100">
                                {propis.kratica}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-slate-900 text-sm">{propis.naziv}</h3>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      propis.tip === 'Zakon'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {propis.tip}
                                  </span>
                                  {propis.nn && (
                                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                      {propis.nn}
                                    </span>
                                  )}
                                </div>
                                {propis.opis && (
                                  <p className="text-xs text-slate-500 mt-1 max-w-2xl line-clamp-1">
                                    {propis.opis}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 ml-4">
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                {propis.clanci.length} {propis.clanci.length === 1 ? 'članak' : 'članaka'}
                              </span>
                              <div className="text-slate-400">
                                {isPropisOpen ? (
                                  <ChevronDown className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* RAZINA 3: Popis članaka propisa */}
                          {isPropisOpen && (
                            <div className="border-t border-slate-100 bg-slate-50/70 p-4 space-y-2">
                              {propis.clanci.map((clanak) => {
                                const isExpanded = !!expandedClanci[clanak.id];
                                const lines = clanak.tekst.split('\n').map((l) => l.trim()).filter(Boolean);
                                const hasTitle = lines.length > 1 && lines[0].length < 100 && !lines[0].startsWith('(');
                                const title = hasTitle ? lines[0] : '';
                                const preview = hasTitle ? lines.slice(1).join(' ') : lines.join(' ');

                                return (
                                  <div
                                    key={clanak.id}
                                    onClick={() => toggleClanak(clanak.id)}
                                    className="bg-white rounded-xl border border-slate-200/70 p-3.5 hover:border-blue-300 hover:shadow-2xs transition-all cursor-pointer select-none"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-xs font-bold rounded-md shrink-0">
                                          {clanak.clanak_broj}
                                        </span>
                                        {title && (
                                          <span className="font-semibold text-slate-900 text-xs">
                                            {title}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-slate-400 text-xs shrink-0">
                                        {isExpanded ? 'Sklopi' : 'Proširi tekst'}
                                      </span>
                                    </div>

                                    {isExpanded ? (
                                      <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-700 leading-relaxed whitespace-pre-line font-serif">
                                        {clanak.tekst}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
                                        {preview}
                                      </p>
                                    )}
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
          })}
        </div>
      )}
    </div>
  );
}
