'use server';

import { supabase } from '@/lib/supabase';
import { PDFParse } from 'pdf-parse';

export async function uploadAndParseDocument(formData: FormData) {
  const file = formData.get('file') as File;
  const predmetId = formData.get('predmetId') as string;
  const tipDokumenta = formData.get('tipDokumenta') as string;

  if (!file || !predmetId || !tipDokumenta) {
    return { error: 'Nedostaju obavezni podaci.' };
  }

  try {
    // 1. Ekstrakcija teksta iz PDF-a
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    let rawText = '';
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      rawText = pdfData.text;
    }

    // 2. Upload na Supabase Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${predmetId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('spisi')
      .upload(filePath, file);

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
