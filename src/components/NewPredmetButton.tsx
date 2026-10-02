'use client';

import { useState } from 'react';
import { createPredmet } from '@/app/actions/predmetActions';

export default function NewPredmetButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const formData = new FormData(e.currentTarget);
    const result = await createPredmet(formData);

    if (result.error) {
      setErrorMsg(result.error);
      setLoading(false);
    } else {
      setLoading(false);
      setIsOpen(false);
      // Forma se automatski resetira jer uklanjamo modal iz DOM-a,
      // a revalidatePath na serveru će osvježiti tablicu.
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-slate-900 text-white rounded-lg shadow hover:bg-slate-800 transition-colors font-medium"
      >
        Novi predmet
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 transition-opacity">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Novi predmet</h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
              {errorMsg && (
                <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                  {errorMsg}
                </div>
              )}
              
              <div className="flex flex-col gap-1">
                <label htmlFor="klasa" className="text-sm font-medium text-slate-700 dark:text-slate-300">KLASA</label>
                <input 
                  type="text" 
                  id="klasa" 
                  name="klasa" 
                  required 
                  className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 dark:bg-slate-800 dark:text-white"
                  placeholder="npr. UP/I-123-04/23-01/01"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="urbroj" className="text-sm font-medium text-slate-700 dark:text-slate-300">URBROJ</label>
                <input 
                  type="text" 
                  id="urbroj" 
                  name="urbroj" 
                  required 
                  className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 dark:bg-slate-800 dark:text-white"
                  placeholder="npr. 512-01-23-1"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="stranka" className="text-sm font-medium text-slate-700 dark:text-slate-300">Stranka / Žalitelj</label>
                <input 
                  type="text" 
                  id="stranka" 
                  name="stranka" 
                  required 
                  className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 dark:bg-slate-800 dark:text-white"
                  placeholder="Ime i prezime ili naziv tvrtke"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="datum_primitka" className="text-sm font-medium text-slate-700 dark:text-slate-300">Datum primitka</label>
                <input 
                  type="date" 
                  id="datum_primitka" 
                  name="datum_primitka" 
                  defaultValue={today}
                  required 
                  className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium"
                >
                  Odustani
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg shadow hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors font-medium disabled:opacity-50"
                >
                  {loading ? 'Spremanje...' : 'Spremi predmet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
