'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
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
  Copy,
  Check,
  Landmark,
  Loader2,
} from 'lucide-react';
import { PROPISI_MAP, PROPISI_LIST, PropisDef } from '@/lib/propisi-config';
import {
  getRelatedPraksaForArticleAction,
  type ArticlePraksaMatch,
} from '@/app/actions/praksaActions';

export interface ClanakItem {
  id: number;
  naziv_zakona: string;
  clanak_broj: string;
  tekst: string;
  naslov?: string;
  struktura?: string;
  dio?: string;
  glava?: string;
  poglavlje?: string;
  odjeljak?: string;
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
  'Građansko, stvarno i zemljišnoknjižno pravo': <Landmark className="w-5 h-5 text-rose-600" />,
};

/** Prirodno pravno sortiranje članaka (npr. 1, 2, ..., 186, 186a, 186b, ..., 187) */
function parseArticleSortKey(clanakBroj: string): { num: number; suffix: string } {
  const norm = clanakBroj
    .replace(/^(?:članak|clanak)\s+/i, '')
    .replace(/\.$/, '')
    .trim()
    .toLowerCase();
  const match = norm.match(/^(\d+)([a-zčćžšđ]?)/i);
  if (match) {
    return { num: parseInt(match[1], 10), suffix: match[2] || '' };
  }
  return { num: 99999, suffix: norm };
}

function compareArticles(a: ClanakItem, b: ClanakItem): number {
  const keyA = parseArticleSortKey(a.clanak_broj);
  const keyB = parseArticleSortKey(b.clanak_broj);
  if (keyA.num !== keyB.num) return keyA.num - keyB.num;
  return keyA.suffix.localeCompare(keyB.suffix);
}

export function PropisiTable({ articles }: { articles: ClanakItem[] }) {
  const [search, setSearch] = useState('');
  const [filterPodrucje, setFilterPodrucje] = useState('sve');
  const [filterTip, setFilterTip] = useState('sve');

  // Stanja otvorenih harmonika (zadano sva polja i propisi zatvoreni)
  const [openPodrucja, setOpenPodrucja] = useState<Record<string, boolean>>({});
  const [openPropisi, setOpenPropisi] = useState<Record<string, boolean>>({});
  const [expandedClanci, setExpandedClanci] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [praksaForClanak, setPraksaForClanak] = useState<Record<number, ArticlePraksaMatch[]>>({});
  const [loadingPraksaId, setLoadingPraksaId] = useState<number | null>(null);
  const [expandedPraksaId, setExpandedPraksaId] = useState<Record<number, boolean>>({});

  const handleTogglePraksa = async (e: React.MouseEvent, clanak: ClanakItem) => {
    e.stopPropagation();
    const id = clanak.id;
    const isCurrentlyOpen = !!expandedPraksaId[id];

    if (isCurrentlyOpen) {
      setExpandedPraksaId((prev) => ({ ...prev, [id]: false }));
      return;
    }

    setExpandedPraksaId((prev) => ({ ...prev, [id]: true }));

    if (!praksaForClanak[id]) {
      setLoadingPraksaId(id);
      try {
        const res = await getRelatedPraksaForArticleAction(clanak.naziv_zakona, clanak.clanak_broj);
        if (res.success && res.matches) {
          setPraksaForClanak((prev) => ({ ...prev, [id]: res.matches }));
        } else {
          setPraksaForClanak((prev) => ({ ...prev, [id]: [] }));
        }
      } catch {
        setPraksaForClanak((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setLoadingPraksaId(null);
      }
    }
  };

  const handleCopyClanak = (e: React.MouseEvent, clanak: ClanakItem, propis: GroupedPropis) => {
    e.stopPropagation();
    const titlePart = clanak.naslov ? ` (${clanak.naslov})` : '';
    const structurePart = clanak.struktura ? `[${clanak.struktura}]\n` : '';
    const citation = `${propis.naziv}, ${clanak.clanak_broj}${titlePart}${propis.nn ? ` (${propis.nn})` : ''}\n${structurePart}\n${clanak.tekst}`;
    navigator.clipboard.writeText(citation.trim());
    setCopiedId(clanak.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === clanak.id ? null : prev));
    }, 2000);
  };

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

      // Prirodno pravno sortiranje članaka
      clanci.sort(compareArticles);

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

      // Pretraga (naziv, kratica, NN, članci, naslovi članaka ili struktura glava)
      if (q) {
        const matchesNaziv = p.naziv.toLowerCase().includes(q);
        const matchesKratica = p.kratica.toLowerCase().includes(q);
        const matchesNN = p.nn.toLowerCase().includes(q);
        const matchesClanak = p.clanci.some(
          (c) =>
            c.clanak_broj.toLowerCase().includes(q) ||
            c.tekst.toLowerCase().includes(q) ||
            (c.naslov && c.naslov.toLowerCase().includes(q)) ||
            (c.struktura && c.struktura.toLowerCase().includes(q))
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
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Propisi</span>
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.ukupnoPropisa}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">učitano u bazu</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Članci</span>
            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.ukupnoClanaka}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">indeksirano članaka</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Zakoni</span>
            <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.brojZakona}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">temeljnih zakona</span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Podzakonski akti</span>
            <FileCheck2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{stats.brojPodzakonskih}</p>
          <span className="text-xs text-slate-400 mt-0.5 block">uredbi i pravilnika</span>
        </div>
      </div>

      {/* Tražilica i Filteri */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pretraži propise, kratice (npr. ZZK, ZUP), članke (npr. 186a), glave ili tekst..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Filteri:</span>
            </div>

            <select
              value={filterPodrucje}
              onChange={(e) => setFilterPodrucje(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="sve">Sva područja</option>
              <option value="Opći upravni propisi">Opći upravni propisi</option>
              <option value="Vodno pravo i naknade">Vodno pravo i naknade</option>
              <option value="Gradnja, prostor i ozakonjenje">Gradnja, prostor i ozakonjenje</option>
              <option value="Porezi i pristojbe">Porezi i pristojbe</option>
              <option value="Građansko, stvarno i zemljišnoknjižno pravo">Građansko, stvarno i zemljišnoknjižno pravo</option>
            </select>

            <select
              value={filterTip}
              onChange={(e) => setFilterTip(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Nema pronađenih propisa</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
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
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden transition-all"
              >
                {/* RAZINA 1: Područje */}
                <div
                  onClick={() => togglePodrucje(podrucje)}
                  className="w-full px-6 py-4.5 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-slate-100/90 dark:hover:bg-slate-800 transition-colors flex items-center justify-between text-left border-b border-slate-200/70 dark:border-slate-700/60 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 shadow-2xs">
                      {icon}
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 dark:text-white text-base">{podrucje}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {propisiInPodrucje.length} {propisiInPodrucje.length === 1 ? 'propis' : 'propisa'} • {totalArticles} članaka
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400">
                    {isPodrucjeOpen ? (
                      <ChevronDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>
                </div>

                {/* RAZINA 2: Kartice pojedinih propisa */}
                {isPodrucjeOpen && (
                  <div className="p-4 bg-slate-50/40 dark:bg-slate-950/40 space-y-3">
                    {propisiInPodrucje.map((propis) => {
                      const isPropisOpen = !!openPropisi[propis.naziv];

                      // Izračunaj strukturu za razdiobu glava i dijelova u prikazu
                      let currentDio = '';
                      let currentGlava = '';

                      return (
                        <div
                          key={propis.naziv}
                          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden transition-all"
                        >
                          {/* Zaglavlje propisa */}
                          <div
                            onClick={() => togglePropis(propis.naziv)}
                            className="w-full px-5 py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between text-left cursor-pointer select-none"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 border border-blue-100 dark:border-blue-900">
                                {propis.kratica}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{propis.naziv}</h3>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                      propis.tip === 'Zakon'
                                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                    }`}
                                  >
                                    {propis.tip}
                                  </span>
                                  {propis.nn && (
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200/60 dark:border-slate-700">
                                      {propis.nn}
                                    </span>
                                  )}
                                </div>
                                {propis.opis && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl line-clamp-1">
                                    {propis.opis}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 ml-4">
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                                {propis.clanci.length} {propis.clanci.length === 1 ? 'članak' : 'članaka'}
                              </span>
                              <div className="text-slate-400">
                                {isPropisOpen ? (
                                  <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* RAZINA 3: Popis članaka propisa s hijerarhijskim razdjelnicima */}
                          {isPropisOpen && (
                            <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5">
                              {propis.clanci.map((clanak) => {
                                const isExpanded = !!expandedClanci[clanak.id];
                                
                                // Detekcija naslova: prednost ima eksplicitni naslov, a zatim prvi redak ako je kratak
                                const lines = clanak.tekst.split('\n').map((l) => l.trim()).filter(Boolean);
                                const hasImplicitTitle = !clanak.naslov && lines.length > 1 && lines[0].length < 100 && !lines[0].startsWith('(');
                                const articleTitle = clanak.naslov || (hasImplicitTitle ? lines[0] : '');
                                
                                const preview = hasImplicitTitle ? lines.slice(1).join(' ') : lines.join(' ');
                                const isCopied = copiedId === clanak.id;

                                // Provjera prelaska u novi Dio ili Glavu za prikaz razdjelnika
                                let renderDioHeader: string | null = null;
                                let renderGlavaHeader: string | null = null;

                                if (clanak.dio && clanak.dio !== currentDio) {
                                  currentDio = clanak.dio;
                                  currentGlava = ''; // nova glava unutar novog dijela
                                  renderDioHeader = currentDio;
                                }

                                if (clanak.glava && clanak.glava !== currentGlava) {
                                  currentGlava = clanak.glava;
                                  renderGlavaHeader = currentGlava;
                                }

                                return (
                                  <div key={clanak.id} className="space-y-2.5">
                                    {/* Razdjelnik: DIO */}
                                    {renderDioHeader && (
                                      <div className="pt-5 pb-2.5 mt-3 first:mt-0 border-b-2 border-blue-600/30 dark:border-blue-500/30 flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                          <div className="w-2.5 h-4.5 bg-blue-600 dark:bg-blue-500 rounded-sm" />
                                          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                                            {renderDioHeader}
                                          </h4>
                                        </div>
                                      </div>
                                    )}

                                    {/* Razdjelnik: GLAVA */}
                                    {renderGlavaHeader && (
                                      <div className="pt-2.5 pb-1 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                                        <span className="tracking-tight">{renderGlavaHeader}</span>
                                      </div>
                                    )}

                                    {/* Kartica pojedinog članka */}
                                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-2xs transition-all">
                                      {/* Hijerarhijska staza (Breadcrumbs) */}
                                      {clanak.struktura && (
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1.5 tracking-tight truncate">
                                          <FolderOpen className="w-3.5 h-3.5 shrink-0 text-blue-500/70 dark:text-blue-400/70" />
                                          <span className="truncate">{clanak.struktura}</span>
                                        </div>
                                      )}

                                      {/* Zaglavlje članka s akcijom sklapanja i gumbom za kopiranje */}
                                      <div className="flex items-center justify-between gap-3">
                                        <div
                                          onClick={() => toggleClanak(clanak.id)}
                                          className="flex items-center gap-2.5 flex-wrap cursor-pointer select-none flex-1"
                                        >
                                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-md shrink-0 border border-slate-200/80 dark:border-slate-700">
                                            {clanak.clanak_broj}
                                          </span>
                                          {articleTitle && (
                                            <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                                              {articleTitle}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={(e) => handleCopyClanak(e, clanak, propis)}
                                            className="p-1 px-2.5 text-[11px] font-medium text-slate-600 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 bg-slate-50 hover:bg-blue-50/80 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg border border-slate-200/80 dark:border-slate-700 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer select-none"
                                            title="Kopiraj cijeli članak u međuspremnik sa službenim citatom"
                                          >
                                            {isCopied ? (
                                              <>
                                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Kopirano!</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="w-3.5 h-3.5" />
                                                <span>Kopiraj</span>
                                              </>
                                            )}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={(e) => handleTogglePraksa(e, clanak)}
                                            className={`p-1 px-2.5 text-[11px] font-medium rounded-lg border transition-all inline-flex items-center gap-1.5 shadow-2xs cursor-pointer select-none ${
                                              expandedPraksaId[clanak.id]
                                                ? 'bg-amber-100/90 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                                                : 'text-slate-600 hover:text-amber-700 dark:text-slate-300 dark:hover:text-amber-300 bg-slate-50 hover:bg-amber-50/80 dark:bg-slate-800 dark:hover:bg-slate-750 border-slate-200/80 dark:border-slate-700'
                                            }`}
                                            title="Prikaži povezanu sudsku praksu iz baze za ovaj članak"
                                          >
                                            <Scale className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                            <span>Sudska praksa</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => toggleClanak(clanak.id)}
                                            className="p-1 px-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none"
                                          >
                                            {isExpanded ? 'Sklopi' : 'Proširi tekst'}
                                          </button>
                                        </div>
                                      </div>

                                      {/* Tekst članka - potpuno omogućen odabir teksta (select-text) */}
                                      {isExpanded ? (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line font-serif select-text cursor-text"
                                        >
                                          {clanak.tekst}
                                        </div>
                                      ) : (
                                        <p
                                          onClick={() => toggleClanak(clanak.id)}
                                          className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 cursor-pointer select-none"
                                        >
                                          {preview}
                                        </p>
                                      )}

                                      {/* Prikaz povezane sudske prakse za članak */}
                                      {expandedPraksaId[clanak.id] && (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          className="mt-3 p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 space-y-2.5 animate-in fade-in"
                                        >
                                          <div className="flex items-center justify-between text-xs font-bold text-amber-900 dark:text-amber-200">
                                            <div className="flex items-center gap-1.5">
                                              <Scale className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                              <span>Vezana sudska praksa iz Baze prakse</span>
                                            </div>
                                            {praksaForClanak[clanak.id] && praksaForClanak[clanak.id].length > 0 && (
                                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                                                {praksaForClanak[clanak.id].length} pronađene odluke
                                              </span>
                                            )}
                                          </div>

                                          {loadingPraksaId === clanak.id && (
                                            <div className="py-3 flex items-center justify-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                                              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                                              <span>Pretražujem bazu presuda i rješenja za ovaj članak...</span>
                                            </div>
                                          )}

                                          {loadingPraksaId !== clanak.id && (!praksaForClanak[clanak.id] || praksaForClanak[clanak.id].length === 0) && (
                                            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 py-1">
                                              U bazi prakse trenutno nema odluka koje izričito navode ovaj članak. Nove presude možete uvesti u modulu Baza prakse.
                                            </p>
                                          )}

                                          {loadingPraksaId !== clanak.id && praksaForClanak[clanak.id] && praksaForClanak[clanak.id].length > 0 && (
                                            <div className="space-y-2 pt-1">
                                              {praksaForClanak[clanak.id].map((p) => (
                                                <div
                                                  key={p.id}
                                                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/60 dark:border-amber-900/40 text-xs space-y-1"
                                                >
                                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-900 dark:text-white">
                                                      {p.sud} - {p.brojOdluke}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                      {p.ishod}
                                                    </span>
                                                  </div>
                                                  <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                                                    {p.snippet}
                                                  </p>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
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
          })}
        </div>
      )}
    </div>
  );
}
