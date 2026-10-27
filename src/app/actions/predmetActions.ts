'use server';

import { supabaseServer } from '@/lib/supabase-server';
import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { google } from '@/lib/google';
import { generateText } from 'ai';
import {
  META_DOC_TYPE,
  encodePredmetMetaUrl,
  decodePredmetMetaUrl,
  guessDocRoleFromFilename,
  type PredmetExtendedMeta,
  type PredmetFaza,
  type PredmetIshod,
  type PredmetPodrucje,
} from '@/lib/predmet-meta';
import {
  parseFileBufferWithOcrFallback,
  uploadAndParseDocument,
} from '@/app/actions/documentActions';

const db = supabaseServer || supabase;

async function upsertPredmetMeta(predmetId: string, patch: Partial<PredmetExtendedMeta>) {
  const { data: existing } = await db
    .from('dokumenti')
    .select('id, storage_url')
    .eq('predmet_id', predmetId)
    .eq('tip_dokumenta', META_DOC_TYPE)
    .maybeSingle();

  const current = existing ? decodePredmetMetaUrl(existing.storage_url) : {};
  const merged: PredmetExtendedMeta = { ...current, ...patch };
  const encodedUrl = encodePredmetMetaUrl(merged);

  if (existing) {
    await db.from('dokumenti').update({ storage_url: encodedUrl }).eq('id', existing.id);
  } else {
    await db.from('dokumenti').insert({
      predmet_id: predmetId,
      tip_dokumenta: META_DOC_TYPE,
      storage_url: encodedUrl,
      raw_text: '',
    });
  }
}

const EXTRACT_SCAN_SYSTEM_PROMPT = `Ti si stručni pravni asistent za pisarnicu i drugostupanjski upravni postupak u Ministarstvu (Republika Hrvatska).
Iz priloženog dokumenta (najčešće popratni dopis Hrvatskih voda kojim se dostavlja spis povodom žalbe, sama žalba ili prvostupanjsko rješenje) izvuci metapodatke za otvaranje novog drugostupanjskog predmeta i vrati ISKLJUČIVO valjani JSON:
{
  "klasa": "npr. UP/II-325-08/... ili UP/I-325-08/...",
  "stranka": "puno ime i prezime fizičke osobe ili puni naziv pravne osobe (žalitelja / stranke)",
  "datumZaprimanja": "YYYY-MM-DD",
  "izvorDatuma": "prijamni štambilj" | "datum dokumenta" | "",
  "podrucje": "NUV" | "VD" | "NZZV" | "Ostalo",
  "vrstaDokumenta": "Popratni dopis I. stupnja" | "Žalba" | "Prvostupanjsko rješenje" | "Dostavnica" | "Kompletni spis",
  "napomena": "kratki opis predmeta u 1 rečenici do 95 znakova"
}

STROGA PRAVILA ZA DATUM ZAPRIMANJA ("datumZaprimanja"):
1. PRVO I NAJVAŽNIJE: Pažljivo vizualno pregledaj cijelu prvu stranicu (osobito gornji desni, gornji lijevi i donji dio) i potraži PRIJAMNI ŠTAMBILJ / PRIJEMNI PEČAT (pravokutni pečat pisarnice s oznakama "REPUBLIKA HRVATSKA", "MINISTARSTVO...", "Primljeno", "Zaprimljeno", "KLASA", "URBROJ" ili datumom otisnutim ili upisanim rukom u sredini štambilja).
2. Ako se na dokumentu nalaze dva prijamna štambilja (npr. raniji štambilj Hrvatskih voda i noviji štambilj Ministarstva / drugostupanjskog tijela), OBAVEZNO uzmi datum s prijamnog štambilja Ministarstva (odnosno noviji datum zaprimanja na štambilju).
3. Pretvori pročitani datum sa štambilja u ISO format "YYYY-MM-DD" (npr. "14. 02. 2025." ili "14.II.2025." -> "2025-02-14") i postavi "izvorDatuma": "prijamni štambilj".
4. Tek ako na dokumentu uopće NEMA nikakvog prijamnog štambilja/pečata, uzmi datum iz zaglavlja samog akta/dopisa u formatu "YYYY-MM-DD" i postavi "izvorDatuma": "datum dokumenta".
5. Nikada ne izmišljaj današnji datum ako nije napisan na dokumentu. Ako nijedan datum nije čitljiv, vrati "".

STROGA PRAVILA ZA KLASU ("klasa"):
- Ako je u prijamnom štambilju Ministarstva upisana KLASA (npr. UP/II-...), prednost daj toj KLASI.
- Inače uzmi KLASU predmeta navedenu na dopisu/rješenju (ako postoje i UP/II i UP/I, prednost daj UP/II, a ako postoji samo UP/I ili klasifikacijska oznaka predmeta iz popratnog dopisa, uzmi nju).
- NE izvlači URBROJ prvostupanjskog tijela (Hrvatskih voda) jer URBROJ Ministarstvo generira tek po izradi drugostupanjskog akta.

PRAVILA ZA PODRUČJE ("podrucje"):
- "NUV" za naknadu za uređenje voda,
- "VD" za vodni doprinos,
- "NZZV" za naknadu za zaštitu voda,
- "Ostalo" za sve ostalo.`;

function normalizeDateToIso(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Podrška za DD.MM.YYYY. ili DD. MM. YYYY. ili DD/MM/YYYY
  const match = trimmed.match(/(\d{1,2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return '';
}

function resolveScanMediaType(fileName: string, providedMime?: string): string {
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

/**
 * Pametno čitanje skena pri otvaranju novog predmeta:
 * Vizualno (multimodalno) pregledava PDF/sliku kako bi pročitao datum s PRIJAMNOG ŠTAMBILJA,
 * KLASU, Stranku, Područje i kratku napomenu (bez URBROJ-a prvostupanjskog tijela).
 */
export async function extractCaseInfoFromScan(formData: FormData) {
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return { error: 'Odaberite skenirani dokument ili PDF.' };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isVisualDoc =
      ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext) ||
      (file.type || '').startsWith('image/') ||
      file.type === 'application/pdf';

    let jsonRaw = '';

    if (isVisualDoc) {
      // Za PDF i slike šaljemo datoteku izravno multimodalnom Gemini modelu kako bi
      // vizualno vidio prijamni štambilj (pečat zaprimanja), rukopisne datume i zaglavlje!
      const mediaType = resolveScanMediaType(file.name, file.type);
      const { text } = await generateText({
        model: google('gemini-3.8-flash'),
        system: EXTRACT_SCAN_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiziraj ovaj dokument (${file.name}), posebno potraži prijamni štambilj (pečat zaprimanja) za točan datum primitka, te izvuci traženi JSON:`,
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
      jsonRaw = text;
    } else {
      // Za Word (.doc / .docx) i tekstualne datoteke čitamo tekstualni sadržaj
      const { rawText } = await parseFileBufferWithOcrFallback(buffer, file.name, file.type);
      if (!rawText || rawText.length < 20) {
        return { error: 'Iz dokumenta nije bilo moguće pročitati tekst.' };
      }

      const { text } = await generateText({
        model: google('gemini-3.8-flash'),
        system: EXTRACT_SCAN_SYSTEM_PROMPT,
        prompt: rawText.slice(0, 14000),
      });
      jsonRaw = text;
    }

    const cleaned = jsonRaw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    const datumZaprimanja = normalizeDateToIso(parsed.datumZaprimanja);

    return {
      success: true,
      extracted: {
        klasa: (parsed.klasa || '').trim(),
        stranka: (parsed.stranka || '').trim(),
        datumZaprimanja,
        izvorDatuma: (parsed.izvorDatuma || '').trim(),
        podrucje: (['NUV', 'VD', 'NZZV', 'Ostalo'].includes(parsed.podrucje)
          ? parsed.podrucje
          : 'Ostalo') as PredmetPodrucje,
        vrstaDokumenta:
          parsed.vrstaDokumenta || guessDocRoleFromFilename(file.name),
        napomena: (parsed.napomena || '').trim(),
      },
    };
  } catch (err: any) {
    console.error('extractCaseInfoFromScan Error:', err);
    return {
      error:
        err.message || 'Nije uspjelo automatsko čitanje podataka iz skena. Podatke možete unijeti ručno.',
    };
  }
}

export async function createPredmet(formData: FormData) {
  const klasa = (formData.get('klasa') as string)?.trim();
  const urbroj = ((formData.get('urbroj') as string) || '').trim();
  const stranka = (formData.get('stranka') as string)?.trim();
  const datum = (formData.get('datum_primitka') as string)?.trim();
  const podrucje = ((formData.get('podrucje') as string) || 'NUV') as PredmetPodrucje;
  const napomena = ((formData.get('napomena') as string) || '').trim();

  if (!klasa || !stranka || !datum) {
    return { error: 'KLASA, Stranka i Datum zaprimanja su obavezni.' };
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

    if (error || !data) {
      console.error('Greška pri unosu predmeta:', error);
      return { error: `Greška u bazi: ${error?.message || 'Nepoznata greška'}` };
    }

    await upsertPredmetMeta(data.id, {
      podrucje,
      faza: 'Novo',
      napomena,
    });

    // Podrška za jedan ili više inicijalnih dokumenata ako su poslani u istom pozivu
    const multiFiles = formData.getAll('initialFiles').filter((f): f is File => f instanceof File && f.size > 0);
    const multiDocTypes = formData.getAll('initialDocTypes').map((t) => String(t));

    const singleFile = formData.get('initialFile') as File | null;
    const singleDocType = (formData.get('initialDocType') as string) || '';

    const filesToUpload: Array<{ file: File; docType: string }> =
      multiFiles.length > 0
        ? multiFiles.map((file, idx) => ({
            file,
            docType: multiDocTypes[idx] || guessDocRoleFromFilename(file.name),
          }))
        : singleFile && singleFile.size > 0
        ? [
            {
              file: singleFile,
              docType: singleDocType || guessDocRoleFromFilename(singleFile.name),
            },
          ]
        : [];

    const warnings: string[] = [];
    for (const item of filesToUpload) {
      const docForm = new FormData();
      docForm.append('file', item.file);
      docForm.append('predmetId', data.id);
      docForm.append('tipDokumenta', item.docType);
      const uploadRes = await uploadAndParseDocument(docForm);
      if (uploadRes.error) {
        warnings.push(`${item.file.name}: ${uploadRes.error}`);
      }
    }

    revalidatePath('/');
    revalidatePath('/arhiva');
    return {
      success: true,
      data,
      docUploadWarning: warnings.length > 0 ? warnings.join(' | ') : null,
    };
  } catch (err: any) {
    console.error('Server Action Error (createPredmet):', err);
    return { error: err.message || 'Neočekivana greška na poslužitelju.' };
  }
}

export async function updatePredmet(
  id: string,
  payload: {
    klasa: string;
    urbroj: string;
    stranka: string;
    datum_zaprimanja: string;
    podrucje: PredmetPodrucje;
    faza?: PredmetFaza;
    ishod?: PredmetIshod;
    napomena?: string;
  }
) {
  if (!id) return { error: 'ID predmeta je obavezan.' };
  if (!payload.klasa?.trim() || !payload.stranka?.trim()) {
    return { error: 'KLASA i Stranka ne smiju biti prazni.' };
  }

  try {
    const { error } = await db
      .from('predmeti')
      .update({
        klasa: payload.klasa.trim(),
        urbroj: (payload.urbroj || '').trim(),
        stranka: payload.stranka.trim(),
        datum_zaprimanja: payload.datum_zaprimanja,
      })
      .eq('id', id);

    if (error) {
      return { error: `Greška pri ažuriranju predmeta: ${error.message}` };
    }

    await upsertPredmetMeta(id, {
      podrucje: payload.podrucje,
      ...(payload.faza ? { faza: payload.faza } : {}),
      ...(payload.ishod ? { ishod: payload.ishod } : {}),
      napomena: (payload.napomena || '').trim(),
    });

    revalidatePath('/');
    revalidatePath('/arhiva');
    revalidatePath(`/predmeti/${id}`);
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Greška pri spremanju izmjena predmeta.' };
  }
}

export async function updatePredmetFaza(id: string, faza: PredmetFaza) {
  if (!id) return { error: 'ID predmeta je obavezan.' };
  try {
    await upsertPredmetMeta(id, { faza });
    revalidatePath('/');
    revalidatePath(`/predmeti/${id}`);
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Greška pri promjeni faze predmeta.' };
  }
}

export async function archivePredmet(
  id: string,
  archiveMeta?: {
    ishod?: PredmetIshod;
    napomena?: string;
    datum_rjesavanja?: string;
  }
) {
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

    await upsertPredmetMeta(id, {
      ishod: archiveMeta?.ishod || 'Odbijena žalba',
      datum_rjesavanja:
        archiveMeta?.datum_rjesavanja || new Date().toISOString().split('T')[0],
      ...(archiveMeta?.napomena !== undefined ? { napomena: archiveMeta.napomena.trim() } : {}),
    });

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
      return { error: `Greška pri vraćanju predmeta: ${error.message}` };
    }

    await upsertPredmetMeta(id, { faza: 'U radu' });

    revalidatePath('/');
    revalidatePath('/arhiva');
    revalidatePath(`/predmeti/${id}`);
    return { success: true, data };
  } catch (err: any) {
    console.error('Server Action Error (unarchivePredmet):', err);
    return { error: err.message || 'Greška pri vraćanju predmeta.' };
  }
}

export async function deleteMultiplePredmeti(ids: string[]) {
  if (!ids || ids.length === 0) {
    return { error: 'Nije odabran nijedan predmet za brisanje.' };
  }

  try {
    // 1. Dohvati sve dokumente tih predmeta radi čišćenja datoteka iz Supabase Storagea (`spisi`)
    const { data: docs } = await db
      .from('dokumenti')
      .select('storage_url')
      .in('predmet_id', ids);

    const storagePaths: string[] = [];
    for (const d of docs || []) {
      if (d.storage_url && d.storage_url.includes('/spisi/')) {
        const rawPath = d.storage_url.split('/spisi/')[1];
        if (rawPath) {
          storagePaths.push(decodeURIComponent(rawPath.split('?')[0]));
        }
      }
    }

    if (storagePaths.length > 0) {
      const { error: storageErr } = await db.storage.from('spisi').remove(storagePaths);
      if (storageErr) {
        console.warn('Upozorenje pri brisanju datoteka iz spisi pohrane:', storageErr.message);
      }
    }

    // 2. Obriši predmete (ON DELETE CASCADE automatski briše redove u `dokumenti`)
    const { error: deleteErr } = await db.from('predmeti').delete().in('id', ids);

    if (deleteErr) {
      return { error: `Greška pri brisanju predmeta iz baze: ${deleteErr.message}` };
    }

    revalidatePath('/');
    revalidatePath('/arhiva');
    return { success: true, deletedFilesCount: storagePaths.length };
  } catch (err: any) {
    console.error('deleteMultiplePredmeti Error:', err);
    return { error: err.message || 'Neočekivana greška pri brisanju predmeta.' };
  }
}

export async function deletePredmet(id: string) {
  return deleteMultiplePredmeti([id]);
}
