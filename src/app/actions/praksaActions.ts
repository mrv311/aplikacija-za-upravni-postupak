'use server';

import { supabase } from '@/lib/supabase';
import pdfParse from 'pdf-parse';
import { google } from '@ai-sdk/google';
import { embed, generateText } from 'ai';

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
        model: google('gemini-flash-latest'),
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
