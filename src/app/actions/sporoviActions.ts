'use server';

import { parseExcelSporovi, type UpravniSpor } from '@/lib/upravni-sporovi';

export interface SporoviStats {
  total: number;
  uTijeku: number;
  hitni: number;
  istekli: number;
  danasIKriticno: number;
  sutnjaUprave: number;
  presudeni: number;
}

export async function getUpravniSporoviAction(forceRefresh = false): Promise<{
  success: boolean;
  sporovi: UpravniSpor[];
  stats: SporoviStats;
  lastModified: string;
  source: 'live' | 'cache';
  error?: string;
}> {
  try {
    const result = parseExcelSporovi(forceRefresh);
    const sporovi = result.sporovi;

    const stats: SporoviStats = {
      total: sporovi.length,
      uTijeku: 0,
      hitni: 0,
      istekli: 0,
      danasIKriticno: 0,
      sutnjaUprave: 0,
      presudeni: 0,
    };

    for (const s of sporovi) {
      if (s.isPresudeno) {
        stats.presudeni++;
      } else {
        stats.uTijeku++;
      }

      if (s.isSutnjaUprave) {
        stats.sutnjaUprave++;
      }

      if (s.hitnost === 'isteklo') {
        stats.istekli++;
        stats.hitni++;
      } else if (s.hitnost === 'danas' || s.hitnost === 'kriticno') {
        stats.danasIKriticno++;
        stats.hitni++;
      } else if (s.hitnost === 'hitno') {
        stats.hitni++;
      }
    }

    return {
      success: true,
      sporovi,
      stats,
      lastModified: result.lastModified,
      source: result.source,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('getUpravniSporoviAction error:', message);
    return {
      success: false,
      sporovi: [],
      stats: {
        total: 0,
        uTijeku: 0,
        hitni: 0,
        istekli: 0,
        danasIKriticno: 0,
        sutnjaUprave: 0,
        presudeni: 0,
      },
      lastModified: '',
      source: 'cache',
      error: message,
    };
  }
}
