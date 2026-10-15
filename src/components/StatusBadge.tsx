import React from 'react';

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

export function StatusBadge({ status }: { status: string }) {
  return getStatusBadge(status);
}

export default StatusBadge;
