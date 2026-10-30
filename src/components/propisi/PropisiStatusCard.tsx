'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, Eye } from 'lucide-react';
import type { PropisiStatusFile } from '@/lib/propisi-checker';
import { refreshPropisiStatusAction } from '@/app/actions/propisiActions';
import { PropisiStatusModal } from './PropisiStatusModal';

interface PropisiStatusCardProps {
  initialStatus: PropisiStatusFile | null;
}

export function PropisiStatusCard({ initialStatus }: PropisiStatusCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<PropisiStatusFile | null>(initialStatus);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setFeedbackMsg(null);

    try {
      const res = await refreshPropisiStatusAction();
      if (res.success && res.status) {
        setStatus(res.status);
        setFeedbackMsg(res.message || 'Baza propisa je uspješno osvježena!');
        router.refresh();
      } else {
        setFeedbackMsg(res.error || 'Neuspjelo osvježavanje propisa.');
      }
    } catch (err: any) {
      setFeedbackMsg(err.message || 'Greška pri osvježavanju.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const allUpToDate = status?.allUpToDate ?? true;
  const outdatedCount = status?.outdatedCount ?? 0;
  const checkedAtStr = status?.checkedAt
    ? new Date(status.checkedAt).toLocaleString('hr-HR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Nedavno';

  return (
    <>
      <div
        className={`group relative flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all shadow-sm ${
          allUpToDate
            ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200'
        }`}
      >
        {/* Clickable Area to open Modal */}
        <div
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2.5 cursor-pointer flex-1"
          title="Kliknite za detaljni pregled propisa i povijest provjera"
        >
          {allUpToDate ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          )}

          <div>
            <div className="font-semibold flex items-center gap-1.5">
              <span>
                {allUpToDate
                  ? `Svi propisi (${status?.results?.length ?? 16}/${status?.results?.length ?? 16}) su 100% ažurni s Narodnim novinama`
                  : `Dostupne nove izmjene za ${outdatedCount} propisa`}
              </span>
              <Eye className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
            </div>
            <div className="text-[11px] opacity-80 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              <span>Zadnja provjera: {checkedAtStr}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-emerald-200/60 dark:border-emerald-800/60">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
            disabled={isRefreshing}
            className={`p-1.5 rounded-lg transition-all ${
              allUpToDate
                ? 'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50'
                : 'text-amber-700 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-900/50'
            } disabled:opacity-50`}
            title="Ručno osvježi bazu propisa odmah"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              allUpToDate
                ? 'bg-emerald-100/80 dark:bg-emerald-900/60 hover:bg-emerald-200 dark:hover:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-100/80 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-200'
            }`}
          >
            Detalji
          </button>
        </div>
      </div>

      {/* Detailed Modal */}
      <PropisiStatusModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        status={status}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        feedbackMsg={feedbackMsg}
      />
    </>
  );
}
