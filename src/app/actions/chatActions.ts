'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { supabase as supabaseClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { CHAT_DOC_TYPE, encodeDocLabel } from '@/lib/predmet-meta';
import type { LegalUIMessage } from '@/lib/ai-types';

const db = supabaseServer || supabaseClient;

/**
 * Dohvaća spremljeni razgovor s AI asistentom za određeni predmet.
 */
export async function getPredmetChatHistory(predmetId: string): Promise<LegalUIMessage[]> {
  if (!predmetId) return [];

  try {
    const { data, error } = await db
      .from('dokumenti')
      .select('raw_text')
      .eq('predmet_id', predmetId)
      .eq('tip_dokumenta', CHAT_DOC_TYPE)
      .maybeSingle();

    if (error || !data || !data.raw_text) {
      return [];
    }

    const parsed = JSON.parse(data.raw_text);
    return Array.isArray(parsed) ? (parsed as LegalUIMessage[]) : [];
  } catch (err) {
    console.warn('Greška pri čitanju povijesti razgovora za predmet:', predmetId, err);
    return [];
  }
}

/**
 * Trajno sprema razgovor s AI asistentom u bazu za određeni predmet.
 */
export async function savePredmetChatHistory(
  predmetId: string,
  messages: LegalUIMessage[]
): Promise<{ success: boolean; error?: string }> {
  if (!predmetId) return { success: false, error: 'Nedostaje ID predmeta.' };

  try {
    const { data: existing } = await db
      .from('dokumenti')
      .select('id')
      .eq('predmet_id', predmetId)
      .eq('tip_dokumenta', CHAT_DOC_TYPE)
      .maybeSingle();

    const payload = JSON.stringify(messages || []);

    if (existing) {
      const { error } = await db
        .from('dokumenti')
        .update({
          raw_text: payload,
          storage_url: 'chat://history',
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      const { error } = await db.from('dokumenti').insert({
        predmet_id: predmetId,
        tip_dokumenta: CHAT_DOC_TYPE,
        raw_text: payload,
        storage_url: 'chat://history',
      });

      if (error) throw error;
    }

    return { success: true };
  } catch (err: any) {
    console.error('Greška pri spremanju razgovora:', err);
    return { success: false, error: err.message || 'Greška pri spremanju razgovora.' };
  }
}

/**
 * Briše spremljenu povijest razgovora za određeni predmet (Restart chata).
 */
export async function clearPredmetChatHistory(
  predmetId: string
): Promise<{ success: boolean; error?: string }> {
  if (!predmetId) return { success: false, error: 'Nedostaje ID predmeta.' };

  try {
    const { error } = await db
      .from('dokumenti')
      .delete()
      .eq('predmet_id', predmetId)
      .eq('tip_dokumenta', CHAT_DOC_TYPE);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Greška pri brisanju razgovora:', err);
    return { success: false, error: err.message || 'Greška pri brisanju razgovora.' };
  }
}

/**
 * Sprema generirani nacrt akta ili obrazloženja izravno kao dokument u spis predmeta.
 */
export async function saveDraftToSpis(params: {
  predmetId: string;
  docRole?: string;
  naziv?: string;
  text: string;
}): Promise<{ success: boolean; error?: string; docId?: string }> {
  const { predmetId, docRole = 'Drugostupanjsko rješenje', naziv = 'Nacrt_obrazlozenja_AI.txt', text } =
    params;

  if (!predmetId || !text.trim()) {
    return { success: false, error: 'Nedostaje tekst nacrta ili ID predmeta.' };
  }

  try {
    const cleanRole = docRole.trim() || 'Drugostupanjsko rješenje';
    const cleanNaziv = (naziv.trim() || 'Nacrt_obrazlozenja_AI.txt').replace(/[|\[\]]/g, '_');

    const encodedTip = encodeDocLabel({
      vrsta: cleanRole,
      izvorniNaziv: cleanNaziv,
      izvorTeksta: 'Ručno uređeno',
      velicinaBajta: Buffer.byteLength(text, 'utf-8'),
    });

    const { data, error } = await db
      .from('dokumenti')
      .insert({
        predmet_id: predmetId,
        tip_dokumenta: encodedTip,
        raw_text: text,
        storage_url: 'draft://internal',
      })
      .select('id')
      .single();

    if (error) throw error;

    revalidatePath(`/predmeti/${predmetId}`);
    return { success: true, docId: data?.id };
  } catch (err: any) {
    console.error('Greška pri spremanju nacrta u spis:', err);
    return { success: false, error: err.message || 'Greška pri spremanju nacrta u spis.' };
  }
}
