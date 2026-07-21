export default function Home() {
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
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Broj predmeta</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Stranka / Žalitelj</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Datum primitka</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Referent</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Dummy Data for demonstration */}
              <tr className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-900 font-medium">UP/II-001-26</td>
                <td className="px-6 py-4 text-sm text-slate-600">Marko Marković</td>
                <td className="px-6 py-4 text-sm text-slate-600">15.07.2026.</td>
                <td className="px-6 py-4 text-sm text-slate-600">Ana Anić</td>
                <td className="px-6 py-4 text-sm">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    U rješavanju
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-right">
                  <button className="text-slate-400 hover:text-slate-900 transition-colors">
                    Detalji
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-900 font-medium">UP/II-002-26</td>
                <td className="px-6 py-4 text-sm text-slate-600">Tvrtka d.o.o.</td>
                <td className="px-6 py-4 text-sm text-slate-600">10.07.2026.</td>
                <td className="px-6 py-4 text-sm text-slate-600">Ivan Horvat</td>
                <td className="px-6 py-4 text-sm">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                    Na čekanju
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-right">
                  <button className="text-slate-400 hover:text-slate-900 transition-colors">
                    Detalji
                  </button>
                </td>
              </tr>
              <tr className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-900 font-medium">UP/II-003-26</td>
                <td className="px-6 py-4 text-sm text-slate-600">Ivana Ivanović</td>
                <td className="px-6 py-4 text-sm text-slate-600">01.07.2026.</td>
                <td className="px-6 py-4 text-sm text-slate-600">Ana Anić</td>
                <td className="px-6 py-4 text-sm">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                    Riješeno
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-right">
                  <button className="text-slate-400 hover:text-slate-900 transition-colors">
                    Detalji
                  </button>
                </td>
              </tr>
              
              {/* Empty state (optional, if no data is present)
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  Nema aktivnih predmeta za prikaz.
                </td>
              </tr>
              */}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
