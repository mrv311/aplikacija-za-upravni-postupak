import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// Define the type matching our DB schema
type Predmet = {
  id: string;
  klasa: string;
  urbroj: string;
  stranka: string;
  datum_zaprimanja: string;
  status: 'Otvoren' | 'U radu' | 'Riješen';
};

function getStatusBadge(status: Predmet['status']) {
  switch (status) {
    case 'Otvoren':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">Otvoren</span>;
    case 'U radu':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">U radu</span>;
    case 'Riješen':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Riješen</span>;
    default:
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
  }
}

export default async function Home() {
  const { data: predmeti, error } = await supabase
    .from('predmeti')
    .select('*')
    .order('datum_zaprimanja', { ascending: false });

  return (
    <div className="p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Drugostupanjski upravni predmeti</h1>
          <p className="text-slate-500 mt-1">Pregled i upravljanje aktivnim predmetima</p>
        </div>
        <button className="px-4 py-2 bg-slate-900 text-white rounded-lg shadow hover:bg-slate-800 transition-colors font-medium">
          Novi predmet
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">KLASA</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">URBROJ</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Stranka / Žalitelj</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Datum primitka</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {error && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-red-500">
                    Greška pri dohvaćanju podataka: {error.message}
                  </td>
                </tr>
              )}
              
              {!error && (!predmeti || predmeti.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Nema aktivnih predmeta za prikaz.
                  </td>
                </tr>
              )}

              {!error && predmeti && predmeti.map((predmet: Predmet) => (
                <tr key={predmet.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-900 font-medium">{predmet.klasa}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{predmet.urbroj}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{predmet.stranka}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {predmet.datum_zaprimanja ? new Date(predmet.datum_zaprimanja).toLocaleDateString('hr-HR') : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {getStatusBadge(predmet.status)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <Link href={`/predmeti/${predmet.id}`} className="text-slate-400 hover:text-slate-900 transition-colors font-medium">
                      Detalji
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
