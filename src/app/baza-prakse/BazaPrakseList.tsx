"use client";

import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';

type PraksaItem = {
  naslov: string;
  kategorija: string;
  sadrzaj: string;
};

export function BazaPrakseList({ praksa }: { praksa: PraksaItem[] }) {
  // Grupiranje po kategoriji
  const grouped = praksa.reduce((acc, item) => {
    const cat = item.kategorija || 'Ostalo';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, PraksaItem[]>);

  // State za otvorene foldere i dokumente
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(
    Object.keys(grouped).reduce((acc, cat) => ({ ...acc, [cat]: true }), {}) // Svi folderi otvoreni po defaultu
  );
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggleFolder = (cat: string) => {
    setOpenFolders(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const toggleItem = (id: string) => {
    setOpenItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!praksa || praksa.length === 0) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center text-slate-500">
        Baza je trenutno prazna. Dodaj novu praksu putem menija s lijeve strane.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* FOLDER ZAGLAVLJE */}
          <div 
            className="bg-slate-50 p-4 border-b border-slate-200 flex items-center cursor-pointer hover:bg-slate-100 transition-colors"
            onClick={() => toggleFolder(category)}
          >
            {openFolders[category] ? (
              <ChevronDown className="w-5 h-5 text-slate-500 mr-2" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-500 mr-2" />
            )}
            <Folder className="w-5 h-5 text-blue-500 mr-3" />
            <h2 className="text-lg font-bold text-slate-800">
              {category} <span className="text-sm font-normal text-slate-500 ml-2">({items.length})</span>
            </h2>
          </div>
          
          {/* LISTA DOKUMENATA U FOLDERU */}
          {openFolders[category] && (
            <div className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const uniqueId = item.naslov + idx;
                const isItemOpen = openItems[uniqueId];
                
                return (
                  <div key={idx} className="p-4 hover:bg-slate-50/50 transition-colors">
                    {/* DOKUMENT ZAGLAVLJE */}
                    <div 
                      className="flex items-center cursor-pointer"
                      onClick={() => toggleItem(uniqueId)}
                    >
                      {isItemOpen ? (
                        <ChevronDown className="w-4 h-4 text-slate-400 mr-2" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400 mr-2" />
                      )}
                      <FileText className="w-4 h-4 text-slate-400 mr-3" />
                      <h3 className="text-md font-medium text-slate-700 flex-1">{item.naslov}</h3>
                    </div>
                    
                    {/* SADRŽAJ DOKUMENTA (Prikazuje se na klik) */}
                    {isItemOpen && (
                      <div className="mt-4 ml-9 mr-4 bg-white p-6 rounded-lg border border-slate-200 text-sm text-slate-700 max-h-96 overflow-y-auto whitespace-pre-wrap shadow-inner leading-relaxed">
                        {item.sadrzaj}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
