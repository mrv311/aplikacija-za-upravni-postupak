'use client';

import React, { useState, useEffect } from 'react';
import { Scale } from 'lucide-react';
import UpravniSporoviModal from './UpravniSporoviModal';
import { getUpravniSporoviAction, type SporoviStats } from '@/app/actions/sporoviActions';

export default function UpravniSporoviButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<SporoviStats | null>(null);

  useEffect(() => {
    getUpravniSporoviAction().then((res) => {
      if (res.success) {
        setStats(res.stats);
      }
    });
  }, []);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 shadow-2xs transition-all hover:border-indigo-300 dark:hover:border-indigo-700"
      >
        <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <span>Upravni sporovi (ZUS)</span>

        {/* Status / Urgency Badge */}
        {stats && stats.hitni > 0 ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-2xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {stats.hitni} hitno
          </span>
        ) : stats && stats.uTijeku > 0 ? (
          <span className="px-1.5 py-0.5 rounded-full text-2xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            {stats.uTijeku}
          </span>
        ) : null}
      </button>

      <UpravniSporoviModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
