'use server';

import { google } from '@/lib/google';
import { generateText } from 'ai';

export interface GenerateAiOdgovorParams {
  tuzitelj: string;
  sud: string;
  poslovniBroj: string;
  vrstaSpora: string;
  predmet: string;
  sazetakTuzbe?: string;
  pobijaniAkt?: string;
  dodatneUpute?: string;
}

export interface GenerateAiOdgovorResult {
  success: boolean;
  tekst?: string;
  error?: string;
}

export async function generateAiOdgovorAction(
  params: GenerateAiOdgovorParams
): Promise<GenerateAiOdgovorResult> {
  try {
    const prompt = `Ti si viši pravni savjetnik u Ministarstvu zaštite okoliša i zelene tranzicije Republike Hrvatske.
Tvoj zadatak je sastaviti tekst obrazloženja za "ODGOVOR NA TUŽBU" u upravnom sporu pred Upravnim sudom.

PODACI O PREDMETU:
- Sud: ${params.sud || 'Upravni sud'}
- Poslovni broj: ${params.poslovniBroj || 'Us I-'}
- Tužitelj: ${params.tuzitelj}
- Tuženik: Republika Hrvatska, Ministarstvo zaštite okoliša i zelene tranzicije
- Vrsta spora: ${params.vrstaSpora || 'Upravni spor'}
- Predmet spora / upravna stvar: ${params.predmet || 'upravna stvar'}
${params.pobijaniAkt ? `- Pobijani akt / rješenje: ${params.pobijaniAkt}` : ''}
${params.sazetakTuzbe ? `- Sažetak tužbenih navoda: ${params.sazetakTuzbe}` : ''}
${params.dodatneUpute ? `- Dodatne upute / fokus argumentacije: ${params.dodatneUpute}` : ''}

ZAHTJEVI ZA TEKST:
1. Stil mora biti formalan, visokostručan, dosljedan hrvatskoj upravnosudskoj praksi i Zakonu o upravnim sporovima (NN 36/24 i 39/26).
2. Piši u prvom licu množine / trećem licu kao tuženik ("Tuženik u cijelosti osporava...", "Tuženik predlaže...").
3. Podijeli tekst u 3-4 logična odlomka odvojena dvostrukim novim redom (\\n\\n):
   - Odlomak 1: Prikaz zaprimanja tužbe i sažetak onoga što tužitelj navodi/osporava.
   - Odlomak 2: Pravna i činjenična argumentacija tuženika (zašto su navodi tužitelja neosnovani, pravilnost utvrđenog stanja i primjene mjerodavnih propisa).
   - Odlomak 3: Pozivanje na praksu Visokog upravnog suda RH i neosnovanost zahtjeva za troškove postupka.
   - Odlomak 4: Završni prijedlog sudu (odbiti tužbeni zahtjev u cijelosti kao neosnovan, te odbiti zahtjev za naknadu troškova spora).
4. Vrati ISKLJUČIVO čisti tekst odlomaka (bez zaglavlja, bez "KLASA", bez "S poštovanjem", bez potpisa jer se to dodaje automatski u predložak).`;

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
