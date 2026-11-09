'use server';

import { supabase } from '@/lib/supabase';
import { supabaseServer } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';
import { google } from '@/lib/google';
import { embed, generateText } from 'ai';
import { invalidatePraksaCatalog } from '@/lib/rag';
import { parseFileBufferWithOcrFallback } from './documentActions';

const db = supabaseServer || supabase;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dijeljenje teksta na smislene semantičke chunkove kompatibilne s RAG bazom prakse.
 */
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

export interface SudskaOdlukaPreviewResult {
  success?: boolean;
  error?: string;
  extractedTextLength?: number;
  extractedData?: {
    sud: string;
    poslovniBroj: string;
    vrstaAkta: string;
    kategorija: string;
    ishod: string;
    anonymizedParty: string;
    location: string;
    godina: string;
    pravnaBit: string;
  };
  proposedTitle?: string;
  anonymizedText?: string;
  chunkEstimate?: number;
}

/**
 * Korak 1: Ekstrakcija teksta (uklj. OCR za skenove), AI analiza metapodataka i GDPR anonimizacija
 */
export async function previewSudskaOdlukaAction(formData: FormData): Promise<SudskaOdlukaPreviewResult> {
  try {
    const file = formData.get('file') as File | null;
    const rawTextParam = (formData.get('sadrzajTekst') as string) || '';
    const hintSud = (formData.get('hintSud') as string) || '';
    const hintPodrucje = (formData.get('hintPodrucje') as string) || '';
    const hintPoslovniBroj = (formData.get('hintPoslovniBroj') as string) || '';
    const hintIshod = (formData.get('hintIshod') as string) || '';
    const hintVrstaAkta = (formData.get('hintVrstaAkta') as string) || '';
    const hintGodina = (formData.get('hintGodina') as string) || '';

    let sourceText = rawTextParam.trim();

    // 1. Ekstrakcija iz datoteke (ako je priložena)
    if (file && file.size > 0) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const parseRes = await parseFileBufferWithOcrFallback(buffer, file.name, file.type);
        if (parseRes && parseRes.rawText) {
          sourceText = parseRes.rawText.trim();
        }
      } catch (parseErr: any) {
        console.error('Greška pri parsiranju datoteke:', parseErr);
        return { error: `Greška pri čitanju datoteke: ${parseErr.message || 'Nepodržan format.'}` };
      }
    }

    if (!sourceText || sourceText.length < 50) {
      return { error: 'Nije pronađen dovoljan tekst za analizu (potrebno minimalno 50 znakova).' };
    }

    // 2. Pre-filter osjetljivih podataka regexom (OIB, IBAN, email, tel)
    const preSanitized = sourceText
      .replace(/\b\d{11}\b/g, '[OIB]')
      .replace(/\bHR\d{19}\b/g, '[IBAN]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[E-MAIL]')
      .replace(/\b(\+385|00385|0)\s?[0-9]{1,2}[0-9\s\/-]{6,10}\b/g, '[TELEFON]');

    // 3. AI analiza i GDPR anonimizacija putem Gemini 3.8 Flash
    const aiPrompt = `Ti si stručni pravni asistent za upravno i sudsko pravo te GDPR u Republici Hrvatskoj.
Analiziraj priloženi tekst sudske odluke ili upravnog akta i izvrši:
1. Preciznu identifikaciju metapodataka (sud/tijelo, poslovni broj, vrsta akta, ishod postupka, pravno područje, stranke, mjesto, godina, sažetak merituma).
2. Strogu GDPR anonimizaciju fizičkih i privatnih pravnih osoba.

PRAVILA ZA ANONIMIZACIJU:
- FIZIČKE OSOBE: sve fizičke osobe (tužitelji, žalitelji, punomoćnici odvjetnici, vještaci) zamijeni SAMO inicijalima u svim padežima (npr. "Ivan Horvat" -> "I. H.").
- PRIVATNE PRAVNE OSOBE: trgovačka društva, obrte i zadruge zamijeni inicijalima i pravnim oblikom (npr. "Transporti Horvat d.o.o." -> "T. H. d.o.o.").
- JAVNOPRAVNA TIJELA: Upravni sudovi (Zagreb, Split, Rijeka, Osijek, VUSRH, Ustavni sud RH), ministarstva (npr. Ministarstvo zaštite okoliša i zelene tranzicije), Hrvatske vode, gradovi i općine NE SMIJU biti anonimizirani!
- ADRESE: Ulicu i kućni broj zamijeni s "[Adresa]", a grad/naselje ostavi (npr. "[Adresa], Zagreb").
- MERITUM: SVE zakonske odredbe (članci ZUS-a, ZUP-a, Zakona o vodama itd.), obrazloženje, dosuđene troškove i pravna shvaćanja suda OBAVEZNO ostavi netaknutima!
- SAŽETAK MERITUMA (pravnaBit): napiši 1-2 jasne rečenice o pravnoj srži odluke (npr. "Obustava upravnog spora nakon što je tuženik donio rješenje; tuženiku naložena naknada troškova sastava tužbe zbog šutnje uprave sukladno čl. 79. ZUS-a.").

Vrati ISKLJUČIVO valjani JSON (bez ikakvih markdown code fences ako je moguće):
{
  "sud": "npr. Upravni sud u Zagrebu",
  "poslovniBroj": "npr. UsI-1234/2026",
  "vrstaAkta": "Presuda" | "Rješenje" | "Zaključak" | "Ostalo",
  "kategorija": "Troškovi postupka" | "Ostali upravni sporovi" | "Vodni doprinos" | "Naknada za uređenje voda" | "Naknada za zaštitu voda" | "Naknada za korištenje voda" | "Naknada za koncesiju" | "Poništavanje i ukidanje rješenja (ZUP)" | "Obnova postupka" | "Oglašavanje rješenja ništavim" | "Zakup javnog vodnog dobra",
  "ishod": "npr. Obustava postupka - dosuđeni troškovi, Poništeno rješenje, Odbijena tužba, Odbačena tužba, Dosuđeni troškovi postupka",
  "anonymizedParty": "inicijali tužitelja/stranke, npr. I. H. ili G. P. d.o.o.",
  "location": "grad/mjesto, npr. Zagreb",
  "godina": "2026",
  "pravnaBit": "sažetak merituma i odluke o troškovima",
  "anonymizedText": "cjeloviti anonimizirani tekst odluke"
}

Korisničke smjernice (ako su zadane):
- Sugerirani sud: ${hintSud || 'nije navedeno'}
- Sugerirana kategorija: ${hintPodrucje || 'nije navedeno'}
- Sugerirani poslovni broj: ${hintPoslovniBroj || 'nije navedeno'}
- Sugerirani ishod: ${hintIshod || 'nije navedeno'}
- Sugerirana vrsta: ${hintVrstaAkta || 'nije navedeno'}
- Sugerirana godina: ${hintGodina || 'nije navedeno'}

Tekst odluke:
${preSanitized.slice(0, 42000)}
`;

    const { text: jsonResponse } = await generateText({
      model: google('gemini-3.8-flash'),
      prompt: aiPrompt,
    });

    const cleanedJson = jsonResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      parsed = {
        sud: hintSud || 'Upravni sud',
        poslovniBroj: hintPoslovniBroj || '',
        vrstaAkta: hintVrstaAkta || 'Rješenje',
        kategorija: hintPodrucje || 'Troškovi postupka',
        ishod: hintIshod || 'Ostalo',
        anonymizedParty: 'N. N.',
        location: '',
        godina: hintGodina || new Date().getFullYear().toString(),
        pravnaBit: '',
        anonymizedText: preSanitized,
      };
    }

    const finalSud = hintSud || parsed.sud || 'Upravni sud';
    const finalBroj = hintPoslovniBroj || parsed.poslovniBroj || '';
    const finalKategorija = hintPodrucje || parsed.kategorija || 'Troškovi postupka';
    const finalIshod = hintIshod || parsed.ishod || 'Ostalo';
    const finalGodina = hintGodina || parsed.godina || new Date().getFullYear().toString();
    const finalParty = (parsed.anonymizedParty || 'N. N.').trim();
    const finalLocation = (parsed.location || '').trim();
    const finalPravnaBit = (parsed.pravnaBit || '').trim();
    const anonymizedText = parsed.anonymizedText || preSanitized;

    // Sastavljanje standardiziranog naslova po konvenciji baze prakse
    const isSud = /upravn|sud|vus/i.test(finalSud);
    const prefix = isSud
      ? `Praksa upravnih sudova - ${finalKategorija} - ${finalGodina}`
      : `${finalKategorija} - ${finalGodina}`;

    const titleParts = [
      finalSud,
      finalBroj,
      finalParty,
      finalLocation,
      finalIshod,
    ].filter(Boolean);

    const proposedTitle = `[${prefix}] ${titleParts.join(' - ')}`;
    const estimatedChunks = chunkPraksaText(anonymizedText);

    return {
      success: true,
      extractedTextLength: sourceText.length,
      extractedData: {
        sud: finalSud,
        poslovniBroj: finalBroj,
        vrstaAkta: parsed.vrstaAkta || 'Rješenje',
        kategorija: finalKategorija,
        ishod: finalIshod,
        anonymizedParty: finalParty,
        location: finalLocation,
        godina: finalGodina,
        pravnaBit: finalPravnaBit,
      },
      proposedTitle,
      anonymizedText,
      chunkEstimate: estimatedChunks.length,
    };
  } catch (err: any) {
    console.error('previewSudskaOdlukaAction Error:', err);
    return { error: err.message || 'Neočekivana greška prilikom AI analize odluke.' };
  }
}

/**
 * Korak 2: Potvrda i trajni upis sudske odluke u tablicu 'praksa' uz generiranje 3072-dimenzionalnih vektora
 */
export async function confirmPublishSudskaOdlukaAction(payload: {
  nazivDatoteke: string;
  anonymizedText: string;
  pravnaBit?: string;
}): Promise<{ success?: boolean; error?: string; nazivDatoteke?: string; chunkCount?: number }> {
  const title = (payload.nazivDatoteke || '').trim();
  const text = (payload.anonymizedText || '').trim();

  if (!title || text.length < 50) {
    return { error: 'Naziv odluke i anonimizirani tekst (minimalno 50 znakova) su obavezni.' };
  }

  try {
    // 1. Provjera postoji li već isti naslov u bazi
    const { data: existing } = await db
      .from('praksa')
      .select('id')
      .eq('naziv_datoteke', title)
      .limit(1);

    if (existing && existing.length > 0) {
      return { error: `Dokument pod nazivom "${title}" već postoji u Bazi prakse.` };
    }

    // 2. Podjela u chunkove
    const chunks = chunkPraksaText(text);
    if (chunks.length === 0) {
      return { error: 'Nije moguće podijeliti dokument u smislene odlomke.' };
    }

    // 3. Vektorsko indeksiranje za svaki chunk s dimenzijom 3072
    let savedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        await delay(250); // Pauza radi Google embedding rate limita
      }

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
        return { error: `Greška pri spremanju odlomka ${i + 1}/${chunks.length}: ${insErr.message}` };
      }
      savedCount++;
    }

    // 4. Invalidation RAG kataloga i osvježavanje putanja
    invalidatePraksaCatalog();
    revalidatePath('/baza-prakse');
    revalidatePath('/savjetnik');

    return {
      success: true,
      nazivDatoteke: title,
      chunkCount: savedCount,
    };
  } catch (err: any) {
    console.error('confirmPublishSudskaOdlukaAction Error:', err);
    return { error: err.message || 'Neočekivana greška pri spremanju odluke u Bazu prakse.' };
  }
}

/**
 * Brisanje pojedinačnog spisa iz baze prakse
 */
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

    invalidatePraksaCatalog();
    revalidatePath('/baza-prakse');
    revalidatePath('/savjetnik');
    return { success: true };
  } catch (err: unknown) {
    console.error('deletePraksaDoc Error:', err);
    const msg = err instanceof Error ? err.message : 'Greška na poslužitelju.';
    return { error: msg };
  }
}

/**
 * Brisanje cijele mape / skupa dokumenata iz baze prakse
 */
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

    invalidatePraksaCatalog();
    revalidatePath('/baza-prakse');
    revalidatePath('/savjetnik');
    return { success: true };
  } catch (err: unknown) {
    console.error('deletePraksaFolder Error:', err);
    const msg = err instanceof Error ? err.message : 'Greška na poslužitelju.';
    return { error: msg };
  }
}

/**
 * Zadržano radi kompatibilnosti sa starim pozivima
 */
export async function addPraksa(formData: FormData) {
  return previewSudskaOdlukaAction(formData);
}
