"use client";

import { useState } from 'react';
import { Search, BookOpen } from 'lucide-react';

type ZakonDoc = {
  naziv_zakona: string;
  ukupno_clanaka: number;
};

export function PropisiTable({ documents }: { documents: ZakonDoc[] }) {
  const [search, setSearch] = useState('');

  const filteredDocs = documents.filter(doc => 
    (doc.naziv_zakona || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
          placeholder="Pretraži po nazivu propisa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Naziv propisa</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 text-right">Broj učitanih članaka</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-6 py-12 text-center text-slate-500">
                    Nema pronađenih propisa u bazi.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-900 font-medium flex items-center">
                      <BookOpen className="w-4 h-4 text-slate-400 mr-3 flex-shrink-0" />
                      {doc.naziv_zakona}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {doc.ukupno_clanaka}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
