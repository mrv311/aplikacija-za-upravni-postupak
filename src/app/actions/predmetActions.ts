'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

// Koristi serverski klijent ako je konfiguriran, inače defaultni supabase klijent
const db = supabaseServer || supabase;

export async function createPredmet(formData: FormData) {
  const klasa = formData.get('klasa') as string;
  const urbroj = formData.get('urbroj') as string;
  const stranka = formData.get('stranka') as string;
  const datum = formData.get('datum_primitka') as string;

  if (!klasa || !urbroj || !stranka || !datum) {
    return { error: 'Sva polja su obavezna.' };
  }

  try {
    const { data, error } = await db
      .from('predmeti')
      .insert({
        klasa,
        urbroj,
        stranka,
        datum_zaprimanja: datum,
        status: 'aktivan',
      })
      .select()
      .single();

    if (error) {
      console.error('Greška pri unosu predmeta:', error);
      return { error: `Greška u bazi: ${error.message}` };
    }

    revalidatePath('/');
    revalidatePath('/arhiva');
    return { success: true, data };
  } catch (err: any) {
    console.error('Server Action Error (createPredmet):', err);
    return { error: err.message || 'Neočekivana greška na poslužitelju.' };
  }
}

export async function archivePredmet(id: string) {
  if (!id) {
    return { error: 'ID predmeta je obavezan.' };
  }

  try {
    const { data, error } = await db
      .from('predmeti')
      .update({ status: 'arhiviran' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Greška pri arhiviranju predmeta:', error);
      if (error.code === '23514') {
        return {
          error:
            'Baza podataka još ima staro ograničenje statusa. Pokrenite SQL skriptu "02_arhiviranje_predmeta.sql" u Supabase SQL Editoru.',
        };
      }
      return { error: `Greška pri arhiviranju: ${error.message}` };
    }

    revalidatePath('/');
    revalidatePath('/arhiva');
    revalidatePath(`/predmeti/${id}`);
    return { success: true, data };
  } catch (err: any) {
    console.error('Server Action Error (archivePredmet):', err);
    return { error: err.message || 'Greška pri arhiviranju predmeta.' };
  }
}

export async function unarchivePredmet(id: string) {
  if (!id) {
    return { error: 'ID predmeta je obavezan.' };
  }

  try {
    const { data, error } = await db
      .from('predmeti')
      .update({ status: 'aktivan' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Greška pri vraćanju predmeta u aktivne:', error);
      if (error.code === '23514') {
        return {
          error:
            'Baza podataka još ima staro ograničenje statusa. Pokrenite SQL skriptu "02_arhiviranje_predmeta.sql" u Supabase SQL Editoru.',
        };
      }
      return { error: `Greška pri vraćanju predmeta: ${error.message}` };
    }

    revalidatePath('/');
    revalidatePath('/arhiva');
    revalidatePath(`/predmeti/${id}`);
    return { success: true, data };
  } catch (err: any) {
    console.error('Server Action Error (unarchivePredmet):', err);
    return { error: err.message || 'Greška pri vraćanju predmeta.' };
  }
}
