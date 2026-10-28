'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { supabase as supabaseClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
// @ts-ignore
import WordExtractor from 'word-extractor';
import { google } from '@/lib/google';
import { generateText, embed } from 'ai';
import {
  META_DOC_TYPE,
  encodeDocLabel,
  decodeDocLabel,
  encodePredmetMetaUrl,
  decodePredmetMetaUrl,
  type IzvorTekstaTip,
  type PredmetPodrucje,
  type PredmetIshod,
} from '@/lib/predmet-meta';
import { normalizeExtractedLegalText } from '@/lib/text-formatter';

const db = supabaseServer || supabaseClient;
// @ts-ignore
const ExtractorClass = WordExtractor.default || WordExtractor;
const wordExtractor = new ExtractorClass();

const OCR_SYSTEM_PROMPT = `Ti si precizni pravni OCR sustav za hrvatske upravne spise i skenirane dokumente.
Tvoj zadatak je vjerno i u potpunosti prepisati sav tekst sa skeniranog dokumenta ili slike:
- Posebnu pozornost obrati na PRIJAMNI ŠTAMBILJ (pečat zaprimanja pisarnice Ministarstva ili prvostupanjskog tijela), zaglavlje, KLASU, URBROJ, datume donošenja, datume na prijamnom štambilju i dostavnici, iznose (EUR, m², m³), članke propisa te potpisnike.
- Ako se na dokumentu nalazi prijamni štambilj / pečat zaprimanja ili rukopisni datum primitka/dostave, obavezno ga istakni i prepiši s oznakom npr. [Prijamni štambilj / zaprimljeno: ...].
- Ne dodaj svoje komentare ni objašnjenja — vrati isključivo pročitani tekst dokumenta.`;

function resolveMediaType(fileName: string, providedMime?: string): string {
  if (providedMime && providedMime !== 'application/octet-stream') return providedMime;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/pdf';
  }
}

export async function parseFileBufferWithOcrFallback(
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
  forceDeepOcr = false
): Promise<{ rawText: string; izvorTeksta: IzvorTekstaTip }> {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) || (mimeType || '').startsWith('image/');

  let rawText = '';
  let izvorTeksta: IzvorTekstaTip = 'Izvorni tekst';

  if (!forceDeepOcr && !isImage) {
    if (ext === 'pdf' || mimeType === 'application/pdf') {
      try {
        const pdfData = await pdfParse(buffer);
        rawText = pdfData.text || '';
      } catch (e) {
        console.warn('pdf-parse fallback na Gemini OCR:', e);
      }
    } else if (ext === 'docx') {
      try {
        const mammothData = await mammoth.extractRawText({ buffer });
        rawText = mammothData.value || '';
      } catch {
        const doc = await wordExtractor.extract(buffer);
        rawText = doc.getBody() || '';
      }
    } else if (ext === 'doc') {
      const doc = await wordExtractor.extract(buffer);
      rawText = doc.getBody() || '';
    } else if (ext === 'txt') {
      rawText = buffer.toString('utf-8');
    }
  }

  const cleanCheck = rawText.replace(/\s+/g, '');
  if (forceDeepOcr || isImage || cleanCheck.length < 65) {
    if (ext === 'doc' || ext === 'docx') {
      // Word dokumenti nemaju slikovni OCR preko PDF mimeTypea ako su prazni
      if (!rawText.trim()) {
        throw new Error('Word dokument ne sadrži čitljiv tekst.');
      }
      return { rawText, izvorTeksta: 'Izvorni tekst' };
    }

    const mediaType = resolveMediaType(fileName, mimeType);
    const { text } = await generateText({
      model: google('gemini-3.8-flash'),
      system: OCR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Prepiši sav vidljivi tekst iz ovog skeniranog upravnog dokumenta, uključujući zaglavlja, brojeve, tablice, pečate i datume:',
            },
            {
              type: 'file',
              data: buffer.toString('base64'),
              mediaType,
            },
          ],
        },
      ],
    });
    rawText = text || '';
    izvorTeksta = 'OCR sken';
  }

  return { rawText: normalizeExtractedLegalText(rawText.trim()), izvorTeksta };
}

function sanitizeStorageFileName(originalName: string): string {
  const cleaned = originalName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return cleaned.slice(-90) || 'dokument.pdf';
}

export async function uploadAndParseDocument(formData: FormData) {
  const file = formData.get('file') as File | null;
  const predmetId = formData.get('predmetId') as string;
  const tipDokumenta = (formData.get('tipDokumenta') as string) || 'Prvostupanjsko rješenje';

  if (!file || !predmetId) {
    return { error: 'Nedostaju obavezni podaci (datoteka ili predmet).' };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parsedResult: { rawText: string; izvorTeksta: IzvorTekstaTip };
    try {
      parsedResult = await parseFileBufferWithOcrFallback(buffer, file.name, file.type);
    } catch (ocrErr: any) {
      console.error('Greška pri ekstrakciji/OCR-u:', ocrErr);
      return {
        error: `Greška pri čitanju skena "${file.name}": ${ocrErr.message || 'Nečitljiv dokument.'}`,
      };
    }

    if (!parsedResult.rawText) {
      return {
        error: `Nije moguće izvući tekst iz datoteke "${file.name}". Provjerite je li datoteka ispravna.`,
      };
    }

    const safeName = sanitizeStorageFileName(file.name);
    const filePath = `${predmetId}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await db.storage.from('spisi').upload(filePath, buffer, {
      contentType: resolveMediaType(file.name, file.type),
    });

    if (uploadError) {
      return { error: `Greška pri spremanju datoteke u pohranu: ${uploadError.message}` };
    }

    const { data: publicUrlData } = db.storage.from('spisi').getPublicUrl(filePath);

    const richLabel = encodeDocLabel({
      vrsta: tipDokumenta,
      izvorniNaziv: file.name,
      izvorTeksta: parsedResult.izvorTeksta,
      velicinaBajta: file.size,
    });

    const { data: insertedDoc, error: dbError } = await db
      .from('dokumenti')
      .insert({
        predmet_id: predmetId,
        tip_dokumenta: richLabel,
        storage_url: publicUrlData.publicUrl,
        raw_text: parsedResult.rawText,
      })
      .select()
      .single();

    if (dbError) {
      return { error: `Greška pri upisu dokumenta u bazu: ${dbError.message}` };
    }

    revalidatePath('/');
    revalidatePath('/arhiva');
    revalidatePath(`/predmeti/${predmetId}`);

    return {
      success: true,
      doc: insertedDoc,
      izvorTeksta: parsedResult.izvorTeksta,
    };
  } catch (err: any) {
    console.error('uploadAndParseDocument Error:', err);
    return { error: err.message || 'Neočekivana greška na poslužitelju.' };
  }
}

export async function updateDocumentMetaAndText(
  docId: string,
  payload: {
    predmetId: string;
    rawText: string;
    vrsta: string;
  }
) {
  if (!docId || !payload.predmetId) {
    return { error: 'Nedostaje ID dokumenta ili predmeta.' };
  }

  try {
    const { data: existing, error: fetchErr } = await db
      .from('dokumenti')
      .select('tip_dokumenta, raw_text')
      .eq('id', docId)
      .single();

    if (fetchErr || !existing) {
      return { error: 'Dokument nije pronađen u bazi.' };
    }

    const prevMeta = decodeDocLabel(existing.tip_dokumenta);
    const textChanged = (existing.raw_text || '').trim() !== payload.rawText.trim();

    const updatedLabel = encodeDocLabel({
      vrsta: payload.vrsta || prevMeta.vrsta,
      izvorniNaziv: prevMeta.izvorniNaziv,
      izvorTeksta: textChanged ? 'Ručno uređeno' : prevMeta.izvorTeksta,
      velicinaPrikaz: prevMeta.velicinaPrikaz,
    });

    const { error: updateErr } = await db
      .from('dokumenti')
      .update({
        tip_dokumenta: updatedLabel,
        raw_text: payload.rawText,
      })
      .eq('id', docId);

    if (updateErr) {
      return { error: `Greška pri spremanju izmjena: ${updateErr.message}` };
    }

    revalidatePath(`/predmeti/${payload.predmetId}`);
    return { success: true, tip_dokumenta: updatedLabel };
  } catch (err: any) {
    return { error: err.message || 'Greška pri ažuriranju dokumenta.' };
  }
}

export async function rerunDeepOcr(docId: string, predmetId: string) {
  if (!docId) return { error: 'Nedostaje ID dokumenta.' };

  try {
    const { data: doc, error: fetchErr } = await db
      .from('dokumenti')
      .select('id, tip_dokumenta, storage_url')
      .eq('id', docId)
      .single();

    if (fetchErr || !doc || !doc.storage_url) {
      return { error: 'Izvorna datoteka nije dostupna za ponovni OCR.' };
    }

    const prevMeta = decodeDocLabel(doc.tip_dokumenta);
    const response = await fetch(doc.storage_url);
    if (!response.ok) {
      return { error: 'Nije moguće preuzeti izvornu datoteku iz pohrane.' };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = prevMeta.izvorniNaziv || doc.storage_url.split('/').pop() || 'sken.pdf';
    const contentType = response.headers.get('content-type') || undefined;

    const { rawText } = await parseFileBufferWithOcrFallback(buffer, fileName, contentType, true);
    if (!rawText) {
      return { error: 'Ponovni AI OCR nije uspio pročitati tekst.' };
    }

    const updatedLabel = encodeDocLabel({
      vrsta: prevMeta.vrsta,
      izvorniNaziv: prevMeta.izvorniNaziv,
      izvorTeksta: 'OCR sken',
      velicinaPrikaz: prevMeta.velicinaPrikaz,
    });

    const { error: updErr } = await db
      .from('dokumenti')
      .update({
        raw_text: rawText,
        tip_dokumenta: updatedLabel,
      })
      .eq('id', docId);

    if (updErr) {
      return { error: `Greška pri spremanju novog OCR teksta: ${updErr.message}` };
    }

    revalidatePath(`/predmeti/${predmetId}`);
    return { success: true, rawText, tip_dokumenta: updatedLabel };
  } catch (err: any) {
    return { error: err.message || 'Greška pri ponovnom OCR čitanju.' };
  }
}

export async function deleteDocument(id: string, storageUrl: string) {
  try {
    const { data: docRow } = await db
      .from('dokumenti')
      .select('predmet_id')
      .eq('id', id)
      .maybeSingle();

    const { error: dbError } = await db.from('dokumenti').delete().eq('id', id);

    if (dbError) {
      return { error: `Greška pri brisanju iz baze: ${dbError.message}` };
    }

    if (storageUrl && storageUrl.includes('/spisi/')) {
      const rawPath = storageUrl.split('/spisi/')[1];
      if (rawPath) {
        const cleanPath = decodeURIComponent(rawPath.split('?')[0]);
        await db.storage.from('spisi').remove([cleanPath]);
      }
    }

    revalidatePath('/');
    revalidatePath('/arhiva');
    if (docRow?.predmet_id) {
      revalidatePath(`/predmeti/${docRow.predmet_id}`);
    }

    return { success: true };
  } catch (err: any) {
    console.error('deleteDocument Error:', err);
    return { error: err.message || 'Neočekivana greška pri brisanju.' };
  }
}

const PODRUCJE_FULL_NAME: Record<string, string> = {
  NUV: 'Naknada za uređenje voda',
  VD: 'Vodni doprinos',
  NZZV: 'Naknada za zaštitu voda',
  Ostalo: 'Upravni postupak',
};

function chunkPraksaText(text: string, maxSize = 1400, overlap = 200): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (clean.length <= maxSize) return [clean];

  const chunks: string[] = [];
  let currentIndex = 0;

  while (currentIndex < clean.length) {
    let endIndex = currentIndex + maxSize;
    if (endIndex >= clean.length) {
      chunks.push(clean.substring(currentIndex).trim());
      break;
    }

    const window = clean.substring(endIndex - 120, endIndex);
    const match = window.match(/[.!?]\s/);
    if (match && match.index !== undefined) {
      endIndex = endIndex - 120 + match.index + 1;
    } else {
      const lastSpace = clean.lastIndexOf(' ', endIndex);
      if (lastSpace > currentIndex + maxSize / 2) {
        endIndex = lastSpace;
      }
    }

    const chunk = clean.substring(currentIndex, endIndex).trim();
    if (chunk.length > 40) chunks.push(chunk);
    currentIndex = endIndex - overlap;
  }

  return chunks;
}

/**
 * Korak 1: GDPR anonimizacija dokumenta spisa za pregled prije trajnog upisa u Bazu prakse.
 */
export async function previewAnonymizedForPraksa(params: {
  docId: string;
  predmetId: string;
  podrucje: PredmetPodrucje;
  ishod: PredmetIshod;
  godina?: string;
}) {
  try {
    const { data: doc, error } = await db
      .from('dokumenti')
      .select('raw_text, tip_dokumenta')
      .eq('id', params.docId)
      .single();

    if (error || !doc || !doc.raw_text) {
      return { error: 'Odabrani dokument nema čitljiv tekst za anonimizaciju.' };
    }

    const preSanitized = doc.raw_text
      .replace(/\b\d{11}\b/g, '[OIB]')
      .replace(/\bHR\d{19}\b/g, '[IBAN]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[E-MAIL]');

    const { text: jsonResponse } = await generateText({
      model: google('gemini-3.8-flash'),
      system: `Ti si stručni GDPR pravni asistent u Republici Hrvatskoj.
Vrati ISKLJUČIVO valjani JSON objekt s poljima:
{
  "anonymizedParty": "npr. I. H. ili G. H. d.o.o.",
  "location": "grad/mjesto ako se spominje ili prazan string",
  "anonymizedText": "potpuni anonimizirani tekst rješenja"
}
Pravila anonimizacije:
1. Fizičke osobe u svim padežima zamijeni inicijalima (npr. Ivan Horvat -> I. H.).
2. Privatne pravne osobe zamijeni inicijalima i oblikom (npr. Gradnja Plus d.o.o. -> G. P. d.o.o.).
3. Javnopravna tijela (Hrvatske vode, Ministarstvo..., Grad..., upravni sudovi) NE anonimizirati!
4. Ulicu i kućni broj zamijeni s [Adresa], ali grad/naselje ostavi.
5. Sav pravni meritum, članke zakona, obrazloženje i iznose zadrži u cijelosti!`,
      prompt: preSanitized.slice(0, 35000),
    });

    const cleanedJson = jsonResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    let parsed: { anonymizedParty?: string; location?: string; anonymizedText?: string } = {};
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      parsed = {
        anonymizedParty: 'N. N.',
        location: '',
        anonymizedText: preSanitized,
      };
    }

    const year = params.godina || new Date().getFullYear().toString();
    const catFull = PODRUCJE_FULL_NAME[params.podrucje] || 'Naknada za uređenje voda';
    const party = (parsed.anonymizedParty || 'N. N.').trim();
    const loc = (parsed.location || '').trim();
    const ishodShort =
      params.ishod === 'Poništeno rješenje'
        ? 'poništeno rješenje'
        : params.ishod === 'Odbijena žalba'
        ? 'odbijena žalba'
        : params.ishod.toLowerCase();

    const proposedTitle = `[${catFull} - ${year}] ${party}${loc ? ' - ' + loc : ''} - ${ishodShort}`;

    return {
      success: true,
      proposedTitle,
      anonymizedText: parsed.anonymizedText || preSanitized,
    };
  } catch (err: any) {
    console.error('previewAnonymizedForPraksa Error:', err);
    return { error: err.message || 'Greška prilikom GDPR anonimizacije.' };
  }
}

/**
 * Korak 2: Vektorizacija (3072 dimenzije) i upis pregledane anonimizirane odluke u `praksa` tablicu.
 */
export async function confirmPublishToPraksa(params: {
  predmetId: string;
  nazivDatoteke: string;
  anonymizedText: string;
}) {
  const title = params.nazivDatoteke.trim();
  const content = params.anonymizedText.trim();

  if (!title || content.length < 60) {
    return { error: 'Naziv odluke i anonimizirani tekst su obavezni.' };
  }

  try {
    const { data: existing } = await db
      .from('praksa')
      .select('id')
      .eq('naziv_datoteke', title)
      .limit(1);

    if (existing && existing.length > 0) {
      return { error: `Odluka pod nazivom "${title}" već postoji u Bazi prakse.` };
    }

    const chunks = chunkPraksaText(content);
    for (let i = 0; i < chunks.length; i++) {
      const { embedding } = await embed({
        model: google.textEmbeddingModel('gemini-embedding-001'),
        value: chunks[i],
        providerOptions: {
          google: { outputDimensionality: 3072, taskType: 'RETRIEVAL_DOCUMENT' },
        },
      });

      const { error: insErr } = await db.from('praksa').insert({
        naziv_datoteke: title,
        sadrzaj: chunks[i],
        chunk_index: i,
        ukupno_chunkova: chunks.length,
        embedding,
      });

      if (insErr) {
        return { error: `Greška pri spremanju dijela ${i + 1} u bazu prakse: ${insErr.message}` };
      }
    }

    // Označi u metapodacima predmeta da je rješenje ugrađeno u Bazu prakse
    const { data: metaRow } = await db
      .from('dokumenti')
      .select('id, storage_url')
      .eq('predmet_id', params.predmetId)
      .eq('tip_dokumenta', META_DOC_TYPE)
      .maybeSingle();

    const currentMeta = metaRow ? decodePredmetMetaUrl(metaRow.storage_url) : {};
    const updatedMetaUrl = encodePredmetMetaUrl({
      ...currentMeta,
      poslano_u_praksu: true,
    });

    if (metaRow) {
      await db.from('dokumenti').update({ storage_url: updatedMetaUrl }).eq('id', metaRow.id);
    } else {
      await db.from('dokumenti').insert({
        predmet_id: params.predmetId,
        tip_dokumenta: META_DOC_TYPE,
        storage_url: updatedMetaUrl,
        raw_text: '',
      });
    }

    revalidatePath('/baza-prakse');
    revalidatePath('/savjetnik');
    revalidatePath('/');
    revalidatePath('/arhiva');
    revalidatePath(`/predmeti/${params.predmetId}`);

    return { success: true, chunkCount: chunks.length };
  } catch (err: any) {
    console.error('confirmPublishToPraksa Error:', err);
    return { error: err.message || 'Greška pri upisu odluke u Bazu prakse.' };
  }
}
