'use server';

import { supabase } from '@/lib/supabase';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function uploadAndParseDocument(formData: FormData) {
  const file = formData.get('file') as File;
  const predmetId = formData.get('predmetId') as string;
  const tipDokumenta = formData.get('tipDokumenta') as string;

  if (!file || !predmetId || !tipDokumenta) {
    return { error: 'Nedostaju obavezni podaci.' };
  }

  try {
    // 1. Ekstrakcija teksta iz PDF-a ili Word-a
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let rawText = '';
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    if (file.type === 'application/pdf' || fileExt === 'pdf') {
      const pdfData = await pdfParse(buffer);
      rawText = pdfData.text;
    } else if (fileExt === 'doc' || fileExt === 'docx') {
      const mammothData = await mammoth.extractRawText({ buffer });
      rawText = mammothData.value;
    }

    if (!rawText || rawText.trim() === '') {
      return { error: 'Nije moguće izvući tekst iz dokumenta. Ako je ovo PDF, možda je skeniran kao slika, a takve dokumente asistent trenutno ne može pročitati.' };
    }

    // 2. Upload na Supabase Storage
    const fileName = `${Math.random()}.${fileExt || 'pdf'}`;
    const filePath = `${predmetId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('spisi')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/pdf',
      });

    if (uploadError) {
      return { error: `Greška pri uploadu u storage: ${uploadError.message}` };
    }

    // 3. Dohvaćanje javnog URL-a
    const { data: publicUrlData } = supabase.storage
      .from('spisi')
      .getPublicUrl(filePath);

    // 4. Spremanje u bazu s ekstrahiranim tekstom
    const { error: dbError } = await supabase
      .from('dokumenti')
      .insert({
        predmet_id: predmetId,
        tip_dokumenta: tipDokumenta,
        storage_url: publicUrlData.publicUrl,
        raw_text: rawText
      });

    if (dbError) {
      return { error: `Greška pri spremanju u bazu: ${dbError.message}` };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Server Action Error:", err);
    return { error: err.message || 'Neočekivana greška na poslužitelju.' };
  }
}

export async function deleteDocument(id: string, storageUrl: string) {
  try {
    // 1. Delete from DB
    const { error: dbError } = await supabase
      .from('dokumenti')
      .delete()
      .eq('id', id);

    if (dbError) {
      return { error: `Greška pri brisanju iz baze: ${dbError.message}` };
    }

    // 2. Extract path from storage URL and delete from storage
    if (storageUrl && storageUrl.includes('/spisi/')) {
      const filePath = storageUrl.split('/spisi/')[1];
      if (filePath) {
        await supabase.storage.from('spisi').remove([filePath]);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Server Action Error:", err);
    return { error: err.message || 'Neočekivana greška pri brisanju.' };
  }
}
