'use server';

import { supabase } from '@/lib/supabase';
import { supabaseServer } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import pdfParse from 'pdf-parse';
import { google } from '@/lib/google';
import { embed, generateText } from 'ai';

const db = supabaseServer || supabase;

export async function addPraksa(formData: FormData) {
  const naslov = formData.get('naslov') as string;
  const kategorija = formData.get('kategorija') as string;
  const sadrzajTekst = formData.get('sadrzaj') as string;
  const url = formData.get('url') as string;
  const file = formData.get('file') as File | null;

  if (!naslov || !kategorija) {
    return { error: 'Nedostaju naslov ili kategorija.' };
  }

  let finalContent = '';

  try {
    if (sadrzajTekst && sadrzajTekst.trim().length > 0) {
      finalContent = sadrzajTekst;
    } else if (file && file.size > 0) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const pdfData = await pdfParse(buffer);
        finalContent = pdfData.text;
      } else {
        finalContent = buffer.toString('utf-8');
      }
    } else if (url && url.startsWith('http')) {
      const response = await fetch(url);
      const html = await response.text();
      
      const { text } = await generateText({
        model: google('gemini-3.8-flash'),
        system: 'Ti si asistent za ekstrakciju teksta. Izvuci SAMO glavni čitljivi tekst iz ovog HTML dokumenta, ignoriraj izbornike, footere, skripte i CSS. Vrati čisti tekst.',
        prompt: html.substring(0, 80000), // ograničavamo da ne probijemo limit tokena
      });
      finalContent = text;
    } else {
      return { error: 'Morate unijeti tekst, odabrati datoteku ili upisati validnu web adresu.' };
    }

    if (!finalContent || finalContent.trim().length === 0) {
      return { error: 'Nije moguće ekstrahirati čitljiv sadržaj.' };
    }

    // Generiranje vektora za sadrzaj (ograničavamo duljinu za embedding kako ne bi prešli limit modela)
    const embeddingText = finalContent.substring(0, 25000);
    const { embedding } = await embed({
      model: google.textEmbeddingModel('gemini-embedding-001'),
      value: embeddingText,
    });

    const { error: dbError } = await supabase
      .from('pravna_praksa')
      .insert([{ 
        naslov, 
        sadrzaj: finalContent, 
        kategorija, 
        embedding 
      }]);

    if (dbError) {
      return { error: 'Greška pri spremanju u bazu: ' + dbError.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Add Praksa Error:', error);
    return { error: error.message || 'Neočekivana greška prilikom obrade sadržaja.' };
  }
}

export async function deletePraksaDoc(nazivDatoteke: string) {
  if (!nazivDatoteke) {
    return { error: 'Naziv datoteke je obavezan.' };
  }

  try {
    const { error } = await db
      .from('praksa')
      .delete()
      .eq('naziv_datoteke', nazivDatoteke);

    if (error) {
      console.error('Greška pri brisanju prakse:', error);
      return { error: `Greška u bazi: ${error.message}` };
    }

    revalidatePath('/baza-prakse');
    revalidatePath('/savjetnik');
    return { success: true };
  } catch (err: unknown) {
    console.error('deletePraksaDoc Error:', err);
    const msg = err instanceof Error ? err.message : 'Greška na poslužitelju.';
    return { error: msg };
  }
}

export async function deletePraksaFolder(naziviDatoteka: string[]) {
  if (!naziviDatoteka || naziviDatoteka.length === 0) {
    return { error: 'Popis datoteka je prazan.' };
  }

  try {
    const { error } = await db
      .from('praksa')
      .delete()
      .in('naziv_datoteke', naziviDatoteka);

    if (error) {
      console.error('Greška pri brisanju mape prakse:', error);
      return { error: `Greška u bazi: ${error.message}` };
    }

    revalidatePath('/baza-prakse');
    revalidatePath('/savjetnik');
    return { success: true };
  } catch (err: unknown) {
    console.error('deletePraksaFolder Error:', err);
    const msg = err instanceof Error ? err.message : 'Greška na poslužitelju.';
    return { error: msg };
  }
}
