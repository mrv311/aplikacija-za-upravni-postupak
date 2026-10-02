'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadAndParseDocument, deleteDocument } from '@/app/actions/documentActions';

type Dokument = {
  id: string;
  tip_dokumenta: string;
  storage_url: string;
};

export function DocumentManager({ predmetId }: { predmetId: string }) {
  const [dokumenti, setDokumenti] = useState<Dokument[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [tipDokumenta, setTipDokumenta] = useState<string>('Prvostupanjsko rješenje');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDokumenti();
  }, [predmetId]);

  async function fetchDokumenti() {
    const { data, error } = await supabase
      .from('dokumenti')
      .select('*')
      .eq('predmet_id', predmetId);
    
    if (data) setDokumenti(data);
    if (error) console.error(error);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('predmetId', predmetId);
        formData.append('tipDokumenta', tipDokumenta);

        const result = await uploadAndParseDocument(formData);

        if (result.error) {
          throw new Error(`Greška kod dokumenta ${file.name}: ${result.error}`);
        }
      }

      // Reset and refresh
      setFiles([]);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchDokumenti();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Greška prilikom uploada.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string, storageUrl: string) {
    if (!confirm('Jeste li sigurni da želite obrisati ovaj dokument?')) return;
    
    setError(null);
    try {
      const result = await deleteDocument(id, storageUrl);
      if (result.error) throw new Error(result.error);
      fetchDokumenti();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Greška pri brisanju dokumenta.');
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Upload Form */}
      <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Dodaj dokument(e) u spis</h3>
        {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
        <div className="flex flex-col gap-3">
          <select 
            value={tipDokumenta} 
            onChange={(e) => setTipDokumenta(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
          >
            <option value="Prvostupanjsko rješenje">Prvostupanjsko rješenje</option>
            <option value="Žalba">Žalba</option>
            <option value="Spis">Spis</option>
            <option value="Ostalo">Ostalo</option>
          </select>
          <input 
            id="file-upload"
            type="file" 
            multiple
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          <button 
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
            className="mt-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {isUploading ? 'Učitavanje...' : 'Spremi dokumente'}
          </button>
        </div>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto">
        {dokumenti.length === 0 ? (
          <p className="text-sm text-slate-500 text-center mt-10">Nema priloženih dokumenata.</p>
        ) : (
          <ul className="space-y-3">
            {dokumenti.map(doc => (
              <li key={doc.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{doc.tip_dokumenta}</p>
                  <div className="flex items-center space-x-3">
                    <a 
                      href={doc.storage_url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Pregledaj
                    </a>
                    <button 
                      onClick={() => handleDelete(doc.id, doc.storage_url)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium"
                    >
                      Obriši
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
