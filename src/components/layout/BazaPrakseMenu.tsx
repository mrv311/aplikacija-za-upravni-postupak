"use client";

import { useState } from 'react';
import { addPraksa } from '@/app/actions/praksaActions';

export function BazaPrakseMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputType, setInputType] = useState<'tekst' | 'datoteka' | 'web'>('tekst');
  
  const [naslov, setNaslov] = useState('');
  const [kategorija, setKategorija] = useState('');
  const [sadrzaj, setSadrzaj] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('naslov', naslov);
      formData.append('kategorija', kategorija);
      
      if (inputType === 'tekst' && sadrzaj) {
        formData.append('sadrzaj', sadrzaj);
      } else if (inputType === 'datoteka' && file) {
        formData.append('file', file);
      } else if (inputType === 'web' && url) {
        formData.append('url', url);
      }

      const res = await addPraksa(formData);
      
      if (res.success) {
        alert('Uspješno dodano u bazu prakse!');
        setNaslov('');
        setKategorija('');
        setSadrzaj('');
        setUrl('');
        setFile(null);
        setIsOpen(false);
      } else {
        alert('Greška: ' + res.error);
      }
    } catch (error) {
      alert('Greška pri slanju.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center px-4 py-3 text-slate-300 rounded-lg transition-colors hover:bg-slate-800 hover:text-white font-medium"
      >
        <span>Baza prakse</span>
        <span>{isOpen ? '▼' : '▶'}</span>
      </button>

      {isOpen && (
        <form onSubmit={handleSubmit} className="px-4 py-3 mt-2 bg-slate-800 rounded-lg space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Naslov</label>
            <input 
              required
              type="text" 
              value={naslov}
              onChange={e => setNaslov(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="Npr. Članak 15. ZUP-a"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Kategorija</label>
            <input 
              required
              type="text" 
              value={kategorija}
              onChange={e => setKategorija(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="Zakon, Staro rješenje..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Vrsta unosa</label>
            <div className="flex space-x-2 text-xs">
              <button 
                type="button" 
                onClick={() => setInputType('tekst')}
                className={`flex-1 py-1 rounded ${inputType === 'tekst' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Tekst
              </button>
              <button 
                type="button" 
                onClick={() => setInputType('datoteka')}
                className={`flex-1 py-1 rounded ${inputType === 'datoteka' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Datoteka
              </button>
              <button 
                type="button" 
                onClick={() => setInputType('web')}
                className={`flex-1 py-1 rounded ${inputType === 'web' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                Web adresa
              </button>
            </div>
          </div>

          {inputType === 'tekst' && (
            <div>
              <textarea 
                required={inputType === 'tekst'}
                value={sadrzaj}
                onChange={e => setSadrzaj(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500 h-24 resize-none"
                placeholder="Tekst zakona ili prakse..."
              />
            </div>
          )}

          {inputType === 'datoteka' && (
            <div>
              <input 
                required={inputType === 'datoteka'}
                type="file" 
                accept=".pdf,.txt"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-white hover:file:bg-slate-600 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500 mt-1">Dozvoljeni formati: PDF, TXT</p>
            </div>
          )}

          {inputType === 'web' && (
            <div>
              <input 
                required={inputType === 'web'}
                type="url" 
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:outline-none focus:border-blue-500"
                placeholder="https://narodne-novine.nn.hr/..."
              />
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading || (inputType === 'datoteka' && !file)}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded transition-colors disabled:opacity-50 mt-2"
          >
            {isLoading ? 'Spremanje i obrada...' : 'Spremi u bazu'}
          </button>
        </form>
      )}
    </div>
  );
}
