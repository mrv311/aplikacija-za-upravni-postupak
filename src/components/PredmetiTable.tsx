'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ExternalLink, Search, Inbox, AlertCircle, Loader2 } from 'lucide-react';
import { archivePredmet, unarchivePredmet } from '@/app/actions/predmetActions';

export type Predmet = {
  id: string;
  klasa: string;
  urbroj: string;
  stranka: string;
  datum_zaprimanja: string;
  status: 'aktivan' | 'arhiviran' | string;
};

interface PredmetiTableProps {
  initialPredmeti: Predmet[];
  type: 'aktivni' | 'arhiva';
}

export function getStatusBadge(status: string) {
  switch (status) {
    case 'aktivan':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
          Aktivan
        </span>
      );
    case 'arhiviran':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60 shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
          Arhiviran (A/A)
        </span>
      );
    case 'U radu':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
          U radu
        </span>
      );
    case 'Riješen':
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          Riješen
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
          {status}
        </span>
      );
  }
}

export default function PredmetiTable({ initialPredmeti, type }: PredmetiTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<Predmet[]>(initialPredmeti);
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sinkroniziraj items kad initialPredmeti promijeni vrijednost (npr. nakon revalidate-a)
  // ali ne prepisuj ako je korisnik upravo napravio optimistički potez
  // Prikaz filtriranih stavki
  const filteredItems = items.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.klasa && p.klasa.toLowerCase().includes(q)) ||
      (p.urbroj && p.urbroj.toLowerCase().includes(q)) ||
      (p.stranka && p.stranka.toLowerCase().includes(q))
    );
  });

  const handleAction = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const predmetToModify = items.find((p) => p.id === id);
    if (!predmetToModify) return;

    setLoadingId(id);
    setFeedback(null);

    // Optimističko uklanjanje iz liste
    setItems((prev) => prev.filter((p) => p.id !== id));

    try {
      const res =
        type === 'aktivni'
          ? await archivePredmet(id)
          : await unarchivePredmet(id);

      if (res?.error) {
        // Vrati predmet u listu ako je došlo do greške
        setItems((prev) => [predmetToModify, ...prev]);
        setFeedback({ message: res.error, type: 'error' });
      } else {
        setFeedback({
          message:
            type === 'aktivni'
              ? `Predmet ${predmetToModify.klasa} je uspješno arhiviran (A/A).`
              : `Predmet ${predmetToModify.klasa} je vraćen u aktivne.`,
          type: 'success',
        });
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err: any) {
      setItems((prev) => [predmetToModify, ...prev]);
      setFeedback({
        message: err.message || 'Došlo je do greške prilikom obrade zahtjeva.',
        type: 'error',
      });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Obavijest o statusu akcije */}
      {feedback && (
        <div
          className={`flex items-start justify-between p-4 rounded-xl border text-sm transition-all duration-300 shadow-xs ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
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

      {/* Tražilica i brojač */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pretraži po klasi, urbroju ili stranci..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all shadow-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 self-end sm:self-auto px-1">
          <span>Prikazano:</span>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded-md border border-slate-200/60">
            {filteredItems.length} {filteredItems.length === 1 ? 'predmet' : 'predmeta'}
          </span>
        </div>
      </div>

      {/* Tablica */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="px-6 py-4">KLASA</th>
                <th className="px-6 py-4">URBROJ</th>
                <th className="px-6 py-4">Stranka / Žalitelj</th>
                <th className="px-6 py-4">Datum primitka</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                        {type === 'aktivni' ? (
                          <Inbox className="w-6 h-6" />
                        ) : (
                          <Archive className="w-6 h-6" />
                        )}
                      </div>
                      <h3 className="font-semibold text-slate-800 text-base mb-1">
                        {search.trim()
                          ? 'Nema rezultata pretrage'
                          : type === 'aktivni'
                          ? 'Nema aktivnih predmeta'
                          : 'Arhiva je prazna'}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {search.trim()
                          ? `Niti jedan predmet ne odgovara pojmu "${search}".`
                          : type === 'aktivni'
                          ? 'Svi predmeti su arhivirani ili trenutno nema unesenih predmeta.'
                          : 'Riješeni predmeti koje arhivirate s glavnog ekrana pojavit će se ovdje.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((predmet) => {
                  const isLoading = loadingId === predmet.id;
                  return (
                    <tr
                      key={predmet.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">
                        <Link
                          href={`/predmeti/${predmet.id}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          {predmet.klasa}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                        {predmet.urbroj || '-'}
                      </td>
                      <td className="px-6 py-4 text-slate-800 font-medium max-w-xs truncate">
                        {predmet.stranka || '-'}
                      </td>
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                        {predmet.datum_zaprimanja
                          ? new Date(predmet.datum_zaprimanja).toLocaleDateString('hr-HR')
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(predmet.status)}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {type === 'aktivni' ? (
                            <button
                              onClick={(e) => handleAction(predmet.id, e)}
                              disabled={isLoading}
                              title="Spremi ovaj predmet u arhivu (A/A)"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100/90 active:bg-amber-200/80 border border-amber-200 rounded-lg transition-all shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                              {isLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Archive className="w-3.5 h-3.5 text-amber-600" />
                              )}
                              <span>Spremi u arhivu (A/A)</span>
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleAction(predmet.id, e)}
                              disabled={isLoading}
                              title="Vrati ovaj predmet natrag u aktivne"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100/90 active:bg-blue-200/80 border border-blue-200 rounded-lg transition-all shadow-2xs hover:shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                              {isLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArchiveRestore className="w-3.5 h-3.5 text-blue-600" />
                              )}
                              <span>Vrati u aktivne</span>
                            </button>
                          )}

                          <Link
                            href={`/predmeti/${predmet.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <span>Detalji</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
