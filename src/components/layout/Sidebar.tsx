import Link from 'next/link';
import { BazaPrakseMenu } from './BazaPrakseMenu';

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-slate-200 h-screen flex flex-col shadow-xl">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-white tracking-tight">Upravni Postupak</h2>
      </div>
      <nav className="flex-1 px-4 space-y-2 mt-4">
        <Link 
          href="/" 
          className="flex items-center px-4 py-3 bg-slate-800 text-white rounded-lg transition-colors hover:bg-slate-700 font-medium mb-2"
        >
          Aktivni predmeti
        </Link>
        <Link 
          href="/baza-prakse" 
          className="flex items-center px-4 py-3 bg-slate-800 text-white rounded-lg transition-colors hover:bg-slate-700 font-medium mb-4"
        >
          Pregled baze prakse
        </Link>
        <BazaPrakseMenu />
      </nav>
      <div className="p-4 text-xs text-slate-500 border-t border-slate-800">
        © 2026 Sustav
      </div>
    </aside>
  );
}
