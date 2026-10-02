'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function createPredmet(formData: FormData) {
  const klasa = formData.get('klasa') as string;
  const urbroj = formData.get('urbroj') as string;
  const stranka = formData.get('stranka') as string;
  const datum = formData.get('datum_primitka') as string;

  if (!klasa || !urbroj || !stranka || !datum) {
    return { error: 'Sva polja su obavezna.' };
  }

  try {
    const { data, error } = await supabase
      .from('predmeti')
      .insert({
        klasa,
        urbroj,
        stranka,
        // Using datum_zaprimanja since it's what page.tsx uses, even though prompt said datum_primitka
        datum_zaprimanja: datum,
        status: 'U radu'
      })
      .select()
      .single();

    if (error) {
      console.error("Greška pri unosu predmeta:", error);
      return { error: `Baza greška: ${error.message}` };
    }

    revalidatePath('/');
    return { success: true, data };
  } catch (err: any) {
    console.error("Server Action Error:", err);
    return { error: err.message || 'Neočekivana greška na poslužitelju.' };
  }
}
