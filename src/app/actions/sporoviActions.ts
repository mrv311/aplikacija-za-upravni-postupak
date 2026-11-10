'use server';

import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { supabaseServer as dbServer } from '@/lib/supabase-server';
import { supabase as dbClient } from '@/lib/supabase';
import { parseExcelSporovi, saveSporOverride, type UpravniSpor, E_KOMUNIKACIJA_PATH } from '@/lib/upravni-sporovi';
import { parseCourtPacket, type ExtractedCourtCase } from '@/lib/court-packet-parser';

const db = dbServer || dbClient;

export interface SporoviStats {
  total: number;
  uTijeku: number;
  hitni: number;
  istekli: number;
  danasIKriticno: number;
  sutnjaUprave: number;
  presudeni: number;
  troskoviZaPlacanje: number;
  troskoviZuto: number;
  troskoviSmedje: number;
  troskoviPlaceno: number;
  troskoviUkupno: number;
  hitniTroskovi: number;
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
      troskoviZaPlacanje: 0,
      troskoviZuto: 0,
      troskoviSmedje: 0,
      troskoviPlaceno: 0,
      troskoviUkupno: 0,
      hitniTroskovi: 0,
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

      if (s.troskoviInfo?.imaTroskova) {
        stats.troskoviUkupno++;
        if (s.troskoviInfo.status === 'placeno') {
          stats.troskoviPlaceno++;
        } else if (
          s.troskoviInfo.status === 'poslan_nalog' ||
          s.troskoviInfo.bojaOznake === 'smedje'
        ) {
          stats.troskoviSmedje++;
        } else {
          stats.troskoviZuto++;
          stats.troskoviZaPlacanje++;
          if (['isteklo', 'danas', 'kriticno', 'hitno'].includes(s.troskoviInfo.hitnost)) {
            stats.hitniTroskovi++;
          }
        }
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
        troskoviZaPlacanje: 0,
        troskoviZuto: 0,
        troskoviSmedje: 0,
        troskoviPlaceno: 0,
        troskoviUkupno: 0,
        hitniTroskovi: 0,
      },
      lastModified: '',
      source: 'cache',
      error: message,
    };
  }
}

/**
 * Analizira prenesene PDF datoteke iz paketa e-Komunikacije.
 */
export async function analyzeCourtPacketAction(formData: FormData): Promise<{
  success: boolean;
  data?: ExtractedCourtCase;
  error?: string;
}> {
  try {
    const files = formData.getAll('files') as File[];
    if (!files || files.length === 0) {
      return { success: false, error: 'Niste priložili niti jednu datoteku.' };
    }

    const fileInputs = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        buffer: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const extracted = await parseCourtPacket(fileInputs);

    // Provjeri postoji li povezani predmet u bazi prema klasi ili stranci
    if (extracted.pobijaniAkt || extracted.tuzitelj) {
      try {
        let query = db.from('predmeti').select('id, klasa, stranka');
        if (extracted.pobijaniAkt && extracted.pobijaniAkt.includes('325-')) {
          const cleanKlasa = extracted.pobijaniAkt.replace(/KLASA:\s*/i, '').trim();
          const { data: matched } = await query.ilike('klasa', `%${cleanKlasa}%`).limit(1).maybeSingle();
          if (matched) extracted.povezaniPredmet = matched;
        } else if (extracted.tuzitelj && extracted.tuzitelj.length > 4) {
          const prezime = extracted.tuzitelj.split(' ').pop() || extracted.tuzitelj;
          const { data: matched } = await query.ilike('stranka', `%${prezime}%`).limit(1).maybeSingle();
          if (matched) extracted.povezaniPredmet = matched;
        }
      } catch {
        // Ignoriraj bazu ako nije dostupna
      }
    }

    return { success: true, data: extracted };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('analyzeCourtPacketAction error:', msg);
    return { success: false, error: msg || 'Greška pri analizi paketa dokumenata.' };
  }
}

/**
 * Prikazuje popis mapa unutar lokalnog OneDrive direktorija e_komunikacija sa sudovima.
 */
export async function listOneDriveFoldersAction(): Promise<{
  success: boolean;
  folders: { name: string; mtime: string }[];
  basePath: string;
}> {
  try {
    if (!fs.existsSync(E_KOMUNIKACIJA_PATH)) {
      return { success: false, folders: [], basePath: E_KOMUNIKACIJA_PATH };
    }

    const items = fs.readdirSync(E_KOMUNIKACIJA_PATH, { withFileTypes: true });
    const folders = items
      .filter((d) => d.isDirectory())
      .map((d) => {
        const full = path.join(E_KOMUNIKACIJA_PATH, d.name);
        const stat = fs.statSync(full);
        return {
          name: d.name,
          mtime: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
      .slice(0, 15); // Zadnjih 15 mapa

    return { success: true, folders, basePath: E_KOMUNIKACIJA_PATH };
  } catch (err) {
    console.error('listOneDriveFoldersAction error:', err);
    return { success: false, folders: [], basePath: E_KOMUNIKACIJA_PATH };
  }
}

/**
 * Čita datoteke izravno iz odabrane mape na OneDrive-u (npr. 'Matko Vela - Us I_2546_26').
 */
export async function analyzeFromOneDriveFolderAction(folderName: string): Promise<{
  success: boolean;
  data?: ExtractedCourtCase;
  error?: string;
}> {
  try {
    const targetDir = path.join(E_KOMUNIKACIJA_PATH, folderName);
    if (!fs.existsSync(targetDir)) {
      return { success: false, error: `Mapa ne postoji: ${targetDir}` };
    }

    const filesInDir = fs.readdirSync(targetDir);
    const pdfFiles = filesInDir.filter((f) => f.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      return { success: false, error: 'U odabranoj mapi nema PDF datoteka.' };
    }

    const fileInputs = pdfFiles.map((name) => {
      const full = path.join(targetDir, name);
      return {
        name,
        buffer: fs.readFileSync(full),
      };
    });

    const extracted = await parseCourtPacket(fileInputs);
    return { success: true, data: extracted };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('analyzeFromOneDriveFolderAction error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Sprema novi upravni spor u evidenciju.
 */
export async function saveNewSporAction(payload: {
  sud: string;
  poslovniBroj: string;
  tuzitelj: string;
  oib?: string;
  upIiRjesenje: string;
  predmet: string;
  rjesavatelj: string;
  tuzbaPreuzeta: string;
  odgovorNaTuzbu: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cachePath = path.join(process.cwd(), 'data', 'upravni-sporovi-cache.json');
    let sporovi: UpravniSpor[] = [];
    let fileMtime = new Date().toISOString();

    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        sporovi = cached.sporovi || [];
        fileMtime = cached.fileMtime || fileMtime;
      } catch {}
    }

    const nextRbr = sporovi.length > 0 ? Math.max(...sporovi.map((s) => s.rbr)) + 1 : 1;
    const nextRowNum = sporovi.length > 0 ? Math.max(...sporovi.map((s) => s.rowNum)) + 1 : 5;

    const isSutnja =
      payload.upIiRjesenje.toLowerCase().includes('šutnja') ||
      payload.predmet.toLowerCase().includes('šutnja');

    const newSpor: UpravniSpor = {
      id: `spor-${nextRowNum}`,
      rbr: nextRbr,
      rowNum: nextRowNum,
      tuzitelj: payload.tuzitelj,
      oib: payload.oib,
      sud: payload.sud,
      poslovniBroj: payload.poslovniBroj,
      upIiRjesenje: payload.upIiRjesenje,
      predmet: payload.predmet,
      rjesavatelj: payload.rjesavatelj,
      tuzbaPreuzeta: payload.tuzbaPreuzeta,
      odgovorNaTuzbu: payload.odgovorNaTuzbu,
      presudaTroskovi: '',
      datumZapPresude: '',
      aktUpIiPoPresudi: '',
      zalbaPresuda: '',
      visokiUpravniSud: '',
      vrijednostNapomena: '',
      isSutnjaUprave: isSutnja,
      isOdgovoreno: false,
      isPresudeno: false,
      hitnost: 'kriticno',
      fazaOpis: 'Novi spor — čeka se izrada odgovora na tužbu',
    };

    // Dodaj na početak liste novih
    const updated = [...sporovi, newSpor];

    fs.writeFileSync(
      cachePath,
      JSON.stringify(
        {
          fileMtime,
          savedAt: new Date().toISOString(),
          count: updated.length,
          sporovi: updated,
        },
        null,
        2
      ),
      'utf8'
    );

    revalidatePath('/');
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function updateSporManualDetailsAction(payload: {
  id: string;
  poslovniBroj: string;
  aktUpIiPoPresudi?: string;
  odgovorNaTuzbu?: string;
  presudaTroskovi?: string;
  datumZapPresude?: string;
  zalbaPresuda?: string;
  visokiUpravniSud?: string;
  rjesavatelj?: string;
  vrijednostNapomena?: string;
}): Promise<{
  success: boolean;
  updatedSpor?: UpravniSpor;
  error?: string;
}> {
  try {
    const key = payload.poslovniBroj || payload.id;
    saveSporOverride(key, {
      aktUpIiPoPresudi: payload.aktUpIiPoPresudi,
      odgovorNaTuzbu: payload.odgovorNaTuzbu,
      presudaTroskovi: payload.presudaTroskovi,
      datumZapPresude: payload.datumZapPresude,
      zalbaPresuda: payload.zalbaPresuda,
      visokiUpravniSud: payload.visokiUpravniSud,
      rjesavatelj: payload.rjesavatelj,
      vrijednostNapomena: payload.vrijednostNapomena,
    });

    const res = parseExcelSporovi(false);
    const updated = res.sporovi.find(
      (s) => s.id === payload.id || (payload.poslovniBroj && s.poslovniBroj === payload.poslovniBroj)
    );

    revalidatePath('/');
    return {
      success: true,
      updatedSpor: updated,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
