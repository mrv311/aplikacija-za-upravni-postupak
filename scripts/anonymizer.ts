import { GoogleGenerativeAI } from '@google/generative-ai';

if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile('.env.local');
  } catch {}
}

const GEMINI_API_KEY =
  process.env.GOOGLE_GEMINI_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');

export interface AnonymizedResult {
  anonymizedText: string;
  anonymizedParty: string;
  location: string;
  ishod: 'Poništeno rješenje' | 'Odbijena žalba' | 'Ostalo';
  storedName: string;
}

export async function anonymizeDocument(
  rawText: string,
  originalFileName: string,
  categoryTag: string,
  year: string,
  fileIndex: number
): Promise<AnonymizedResult> {
  // Pre-filter: brzi regex za OIB, IBAN, email i telefone
  let sanitized = rawText
    .replace(/\b\d{11}\b/g, '[OIB]')
    .replace(/\bHR\d{19}\b/g, '[IBAN]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[E-MAIL]')
    .replace(/\b(\+385|00385|0)\s?[0-9]{1,2}[0-9\s\/-]{6,10}\b/g, '[TELEFON]');

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.8-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const prompt = `Ti si stručni pravni asistent za zaštitu osobnih podataka (GDPR) u Republici Hrvatskoj.
Tvoj zadatak je anonimizirati ovaj upravni akt / presudu po ovim pravilima:

1. FIZIČKE OSOBE (žalitelji, opunomoćenici, građani, direktori):
   - Zamijeni imena i prezimena u SVIM padežima inicijalima (npr. "Marko Marković" -> "M. M.", "Ivana Horvata" -> "I. H.").
2. PRIVATNE PRAVNE OSOBE (trgovačka društva d.o.o., d.d., j.d.o.o., obrti, zadruge):
   - Naziv tvrtke zamijeni SAMO s prvim slovima i pravnim oblikom (npr. "Graditeljstvo Horvat d.o.o." -> "G. H. d.o.o.", "Crotram d.d." -> "C. d.d.").
3. JAVNOPRAVNA TIJELA:
   - NE ANONIMIZIRATI! Nazivi: "Hrvatske vode", "Ministarstvo zaštite okoliša...", "Grad Zagreb", "Vodoopskrba i odvodnja d.o.o." (isporučitelji vodnih usluga) ostaju netaknuti.
4. ADRESE I IDENTIFIKATORI:
   - Kućne adrese (ulicu i broj) zamijeni s [Adresa]. Grad/naselje OSTAVI (npr. [Adresa], Rijeka).
5. PRAVNI MERITUM:
   - Zadrži sve članke zakona, obrazloženje, iznose i pravne stavove netaknutima.
6. ISHOD:
   - Odredi ishod postupka: "Poništeno rješenje" (ako je žalba uvažena/rješenje poništeno), "Odbijena žalba" (ako je žalba odbijena ili odbačena) ili "Ostalo".

Vrati JSON:
{
  "anonymizedParty": "Inicijali stranke (npr. 'M. M.' ili 'G. H. d.o.o.')",
  "location": "Grad/mjesto stranke ili nekretnine (npr. 'Zagreb', 'Split', 'Rijeka')",
  "ishod": "Poništeno rješenje" | "Odbijena žalba" | "Ostalo",
  "anonymizedText": "Cjelokupni anonimizirani tekst rješenja"
}

Izvorni naziv datoteke: "${originalFileName}"
Tekst za anonimizaciju:
${sanitized.substring(0, 45000)}`;

  let parsed: any = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await model.generateContent(prompt);
      const rawResText = res.response.text();
      const cleaned = rawResText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
      break;
    } catch (err: any) {
      if (attempt < 5) {
        const waitMs = attempt * 4000;
        console.log(`\n      ⏳ Rate limit / greška anonimizacije (${err.message}), čekam ${waitMs / 1000}s (pokušaj ${attempt}/5)...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.warn(`\n      ⚠️ Greška AI anonimizacije nakon 5 pokušaja (${err.message}), koristim fallback.`);
    }
  }

  if (parsed) {
    const anonymizedParty = (parsed.anonymizedParty || 'Anonimna stranka').trim();
    const location = (parsed.location || '').trim();
    const ishod = (parsed.ishod as AnonymizedResult['ishod']) || 'Ostalo';
    const locPart = location ? ` - ${location}` : '';
    const ishodPart = ishod !== 'Ostalo' ? ` - ${ishod}` : '';
    
    // Čisti format naziva za bazu prakse:
    // [Naknada za uređenje voda - 2024] G. H. d.o.o. - Rijeka - Poništeno rješenje (#01)
    const fileId = String(fileIndex).padStart(2, '0');
    const storedName = `[${categoryTag} - ${year}] ${anonymizedParty}${locPart}${ishodPart} (#${fileId})`;

    return {
      anonymizedText: parsed.anonymizedText || sanitized,
      anonymizedParty,
      location,
      ishod,
      storedName,
    };
  }

  const fileId = String(fileIndex).padStart(2, '0');
  return {
    anonymizedText: sanitized,
    anonymizedParty: 'Anonimna stranka',
    location: '',
    ishod: 'Ostalo',
    storedName: `[${categoryTag} - ${year}] Anonimna stranka (#${fileId})`,
  };
}
