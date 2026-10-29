'use server';

import { revalidatePath } from 'next/cache';
import { runPropisiCheck, readStoredPropisiStatus, PropisiStatusFile } from '@/lib/propisi-checker';

export interface RefreshPropisiResult {
  success: boolean;
  status?: PropisiStatusFile;
  error?: string;
  message?: string;
}

export async function refreshPropisiStatusAction(): Promise<RefreshPropisiResult> {
  try {
    const updatedStatus = await runPropisiCheck();
    revalidatePath('/propisi');
    revalidatePath('/');
    revalidatePath('/savjetnik');

    return {
      success: true,
      status: updatedStatus,
      message: updatedStatus.allUpToDate
        ? 'Baza propisa je uspješno osvježena! Svi propisi (14/14) su 100% ažurni s Narodnim novinama.'
        : `Provjera dovršena. Dostupne su nove izmjene za ${updatedStatus.outdatedCount} propisa.`,
    };
  } catch (err: any) {
    console.error('Greška pri osvježavanju statusa propisa:', err);
    return {
      success: false,
      error: err.message || 'Došlo je do greške prilikom osvježavanja baze propisa.',
    };
  }
}

export async function getPropisiStatusAction(): Promise<PropisiStatusFile | null> {
  try {
    return await readStoredPropisiStatus();
  } catch (err) {
    console.error('Greška pri čitanju statusa propisa:', err);
    return null;
  }
}
