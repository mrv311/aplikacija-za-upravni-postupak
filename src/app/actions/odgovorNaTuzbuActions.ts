'use server';

import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { google } from '@/lib/google';
import { generateText } from 'ai';
import { E_KOMUNIKACIJA_PATH } from '@/lib/upravni-sporovi';
import { supabaseServer as dbServer } from '@/lib/supabase-server';
import { supabase as dbClient } from '@/lib/supabase';

const db = dbServer || dbClient;

export interface ExtractedDocResult {
  success: boolean;
  filename: string;
  text?: string;
  charCount?: number;
  pageCount?: number;
  error?: string;
}

/**
 * Parsira prenesenu datoteku (.pdf, .docx, .txt) i vraća čisti tekst za pravnu analizu
 */
export async function parseDocumentTextAction(formData: FormData): Promise<ExtractedDocResult> {
  try {
    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, filename: '', error: 'Datoteka nije priložena.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const nameLower = file.name.toLowerCase();
    let text = '';
    let pageCount: number | undefined = undefined;

    if (nameLower.endsWith('.pdf')) {
      const parsed = await pdf(buffer);
      text = parsed.text || '';
      pageCount = parsed.numpages;
    } else if (nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) {
      const parsed = await mammoth.extractRawText({ buffer });
      text = parsed.value || '';
    } else {
      text = buffer.toString('utf-8');
    }

    const cleanText = text.replace(/\r\n/g, '\n').trim();

    return {
      success: true,
      filename: file.name,
      text: cleanText,
      charCount: cleanText.length,
      pageCount,
    };
  } catch (err: any) {
    console.error('Greška pri parsiranju priložene datoteke:', err);
    return {
      success: false,
      filename: '',
      error: err.message || 'Neuspjelo čitanje teksta iz datoteke.',
    };
  }
}

export interface CourtFolderFileItem {
  name: string;
  role: 'tuzba' | 'rjesenje' | 'dopis' | 'potvrda' | 'prilog' | 'ostalo';
  sizeBytes: number;
}

/**
 * Automatski pretražuje mapu na OneDrive-u (e_komunikacija sa sudovima)
 * i pronalazi mapu spora prema poslovnom broju ili prezimenu tužitelja.
 */
export async function findOneDriveCourtFilesAction(
  poslovniBroj?: string,
  tuzitelj?: string
): Promise<{
  success: boolean;
  folderName?: string;
  files?: CourtFolderFileItem[];
  error?: string;
}> {
  try {
    if (!fs.existsSync(E_KOMUNIKACIJA_PATH)) {
      return { success: false, error: 'Putanja e-Komunikacije na disku nije dostupna.' };
    }

    const entries = fs.readdirSync(E_KOMUNIKACIJA_PATH, { withFileTypes: true });
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    // Normalizacija za pretragu
    const numMatch = poslovniBroj ? poslovniBroj.match(/\d+[\/-]\d+/) || poslovniBroj.match(/\d+/) : null;
    const numClean = numMatch ? numMatch[0].replace(/[^0-9]/g, '') : '';
    const tuziteljWords = (tuzitelj || '')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((w) => w.length > 3);

    let matchedFolder: string | null = null;

    for (const d of dirNames) {
      const dLower = d.toLowerCase();
      const dClean = dLower.replace(/[^0-9a-zA-Z]/g, '');

      // Provjera poslovnog broja
      if (numClean && numClean.length >= 3 && dClean.includes(numClean)) {
        matchedFolder = d;
        break;
      }

      // Provjera riječi iz imena/prezimena
      for (const w of tuziteljWords) {
        if (dLower.includes(w)) {
          matchedFolder = d;
          break;
        }
      }
      if (matchedFolder) break;
    }

    if (!matchedFolder) {
      return { success: false, error: 'Nije pronađena odgovarajuća mapa na e-Komunikaciji.' };
    }

    const folderPath = path.join(E_KOMUNIKACIJA_PATH, matchedFolder);
    const folderFiles = fs.readdirSync(folderPath, { withFileTypes: true });

    const files: CourtFolderFileItem[] = [];

    for (const f of folderFiles) {
      if (!f.isFile()) continue;
      const fLower = f.name.toLowerCase();

      let role: CourtFolderFileItem['role'] = 'ostalo';
      if (fLower.includes('tužba') || fLower.includes('tuzba') || (fLower.includes('podnesak') && !fLower.includes('prilog'))) {
        role = 'tuzba';
      } else if (fLower.includes('rješenje') || fLower.includes('rjesenje') || fLower.includes('presuda') || fLower.includes('odluka')) {
        role = 'rjesenje';
      } else if (fLower.includes('dopis') || fLower.includes('nalog')) {
        role = 'dopis';
      } else if (fLower.includes('potvrda')) {
        role = 'potvrda';
      } else if (fLower.includes('prilog')) {
        role = 'prilog';
      }

      let sizeBytes = 0;
      try {
        const stats = fs.statSync(path.join(folderPath, f.name));
        sizeBytes = stats.size;
      } catch {
        // zanemari
      }

      files.push({
        name: f.name,
        role,
        sizeBytes,
      });
    }

    // Sortiraj tako da tužba i rješenja budu na vrhu
    files.sort((a, b) => {
      const order = { tuzba: 0, rjesenje: 1, dopis: 2, potvrda: 3, prilog: 4, ostalo: 5 };
      return order[a.role] - order[b.role];
    });

    return {
      success: true,
      folderName: matchedFolder,
      files,
    };
  } catch (err: any) {
    console.error('Greška pri pretrazi mapa e-Komunikacije:', err);
    return { success: false, error: err.message || 'Greška pri pretraživanju mapa.' };
  }
}

/**
 * Učitava i parsira tekst datoteke iz pronađene OneDrive e-Komunikacija mape
 */
export async function loadOneDriveCourtFileAction(
  folderName: string,
  fileName: string
): Promise<ExtractedDocResult> {
  try {
    const safeFolder = path.basename(folderName);
    const safeFile = path.basename(fileName);
    const fullPath = path.join(E_KOMUNIKACIJA_PATH, safeFolder, safeFile);

    if (!fs.existsSync(fullPath)) {
      return { success: false, filename: safeFile, error: 'Datoteka ne postoji na disku.' };
    }

    const buffer = fs.readFileSync(fullPath);
    const nameLower = safeFile.toLowerCase();
    let text = '';
    let pageCount: number | undefined = undefined;

    if (nameLower.endsWith('.pdf')) {
      const parsed = await pdf(buffer);
      text = parsed.text || '';
      pageCount = parsed.numpages;
    } else if (nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) {
      const parsed = await mammoth.extractRawText({ buffer });
      text = parsed.value || '';
    } else {
      text = buffer.toString('utf-8');
    }

    const cleanText = text.replace(/\r\n/g, '\n').trim();

    return {
      success: true,
      filename: safeFile,
      text: cleanText,
      charCount: cleanText.length,
      pageCount,
    };
  } catch (err: any) {
    console.error('Greška pri čitanju datoteke s diska:', err);
    return {
      success: false,
      filename: fileName,
      error: err.message || 'Neuspjelo učitavanje datoteke s diska.',
    };
  }
}

/**
 * Pretražuje povezane podatke iz evidencije drugostupanjskih upravnih predmeta (ZUP)
 */
export async function findLinkedZupPredmetAction(klasaOrUpIi?: string, stranka?: string) {
  try {
    if (!klasaOrUpIi && !stranka) return null;

    let query = db.from('predmeti').select('id, klasa, stranka, opis, pravna_osnova, status, datum_zaprimanja');
    if (klasaOrUpIi && klasaOrUpIi.includes('325-')) {
      const clean = klasaOrUpIi.replace(/KLASA:\s*/i, '').trim();
      const { data } = await query.ilike('klasa', `%${clean}%`).limit(1).maybeSingle();
      if (data) return data;
    }

    if (stranka && stranka.length > 4) {
      const prezime = stranka.split(/[\s,]+/).pop() || stranka;
      const { data } = await query.ilike('stranka', `%${prezime}%`).limit(1).maybeSingle();
      if (data) return data;
    }

    return null;
  } catch (err) {
    console.warn('Greška pri dohvatu povezanog ZUP predmeta:', err);
    return null;
  }
}

export interface GenerateAiOdgovorParams {
  tuzitelj: string;
  sud: string;
  poslovniBroj: string;
  vrstaSpora: string;
  predmet: string;
  sazetakTuzbe?: string;
  pobijaniAkt?: string;
  dodatneUpute?: string;
  // Meritum: Izvorni tekstovi
  tuzbaTekst?: string;
  rjesenjeTekst?: string;
  zupPodaci?: string;
}

export interface GenerateAiOdgovorResult {
  success: boolean;
  tekst?: string;
  analizaTuzbe?: string;
  error?: string;
}

export async function generateAiOdgovorAction(
  params: GenerateAiOdgovorParams
): Promise<GenerateAiOdgovorResult> {
  try {
    const hasDocuments = Boolean(params.tuzbaTekst || params.rjesenjeTekst);

    const docContext = `
${params.tuzbaTekst ? `=== IZVORNI TEKST TUŽBE (odvjetnik / tužitelj) ===\n${params.tuzbaTekst.slice(0, 15000)}\n=== KRAJ TEKSTA TUŽBE ===` : ''}

${params.rjesenjeTekst ? `=== IZVORNI TEKST POBIJANOG RJEŠENJA / SPISA ===\n${params.rjesenjeTekst.slice(0, 15000)}\n=== KRAJ TEKSTA RJEŠENJA ===` : ''}

${params.zupPodaci ? `=== PODACI IZ DRUGOSTUPANJSKOG PREDMETA MINISTARSTVA ===\n${params.zupPodaci}\n` : ''}
`;

    const prompt = `Ti si viši pravni savjetnik u Ministarstvu zaštite okoliša i zelene tranzicije Republike Hrvatske.
Tvoj zadatak je sastaviti VISOKOSTRUČNO, PODROBNO I MERITUMSKO obrazloženje za službeni "ODGOVOR NA TUŽBU" u upravnom sporu pred Upravnim sudom.

PODACI O SPORU:
- Sud: ${params.sud || 'Upravni sud'}
- Poslovni broj suda: ${params.poslovniBroj || 'Us I-'}
- Tužitelj: ${params.tuzitelj}
- Tuženik: Republika Hrvatska, Ministarstvo zaštite okoliša i zelene tranzicije
- Vrsta spora: ${params.vrstaSpora || 'Upravni spor'}
- Predmet spora / upravna stvar: ${params.predmet || 'upravna stvar'}
${params.pobijaniAkt ? `- Pobijani akt / rješenje: ${params.pobijaniAkt}` : ''}
${params.sazetakTuzbe ? `- Prethodna napomena / sažetak: ${params.sazetakTuzbe}` : ''}
${params.dodatneUpute ? `- POSEBNE UPUTE I FOKUS ODVJETNIKA/SAVJETNIKA MINISTARSTVA: ${params.dodatneUpute}` : ''}

${hasDocuments ? `PRILOŽENI IZVORNI DOKUMENTI:\n${docContext}` : ''}

UPUTE ZA SASTAVLJANJE OBRAZLOŽENJA:
1. Stil mora biti besprijekoran, autoritativan, stručan, dosljedan hrvatskoj upravnosudskoj praksi i Zakonu o upravnim sporovima („Narodne novine“, broj: 36/24 i 39/26).
2. Piši iz perspektive tuženika ("Tuženik u cijelosti osporava...", "Tuženik ističe...", "Tuženik predlaže...").
3. Ako su priloženi tekst tužbe i/ili rješenja:
   - IZVUCI TOČNE navode tužitelja (npr. pogrešno utvrđeno činjenično stanje, prigovor zastare, osporavanje statusa obveznika/fiducijara, prigovor nenadležnosti, troškovi).
   - ARGUMENTIRANO IH POBIJJ točku po točku, pozivajući se na točne činjenice iz pobijanog rješenja i mjerodavne članke zakona (npr. Zakon o financiranju vodnoga gospodarstva, Zakon o vodama, ZUP, itd.).
4. Strukturiraj tekst u 4 cjeline označene rimskim brojevima (I., II., III., IV.), s jasnim odlomcima odvojenim praznim redom:
   - I. Prikaz tužbe i tužbenih navoda (točan sažetak onoga što tužitelj traži, koje rješenje pobija i na čemu temelji tužbu).
   - II. Očitovanje tuženika po tužbenim navodima (meritum: detaljno pobijanje svakog razloga iz tužbe uz pozivanje na dokaze u spisu i mjerodavno materijalno pravo).
   - III. Sudska praksa i troškovi upravnog spora (referenca na ustaljenu praksu Visokog upravnog suda RH u istovrsnim predmetima, te obrazloženje neosnovanosti zahtjeva za troškove postupka sukladno članku 79. ZUS-a).
   - IV. Zaključak i prijedlog sudu (jasan prijedlog da Sud odbije tužbeni zahtjev tužitelja u cijelosti kao neosnovan, te odbije zahtjev za naknadom troškova spora).
5. Vrati ISKLJUČIVO čisti tekst odlomaka (bez zaglavlja KLASA/URBROJ, bez "Zagreb,", bez "S poštovanjem" i bez potpisa, jer se to automatski uklapa u Word predložak).`;

    const { text } = await generateText({
      model: google('gemini-3.8-flash'),
      prompt,
    });

    const cleanedText = text
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/\n?```$/gm, '')
      .trim();

    return {
      success: true,
      tekst: cleanedText,
    };
  } catch (err: any) {
    console.error('Greška pri AI generiranju odgovora na tužbu:', err);
    return {
      success: false,
      error: err.message || 'Neuspjelo generiranje teksta pomoću AI-ja.',
    };
  }
}
