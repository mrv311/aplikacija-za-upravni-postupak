import pdf from 'pdf-parse';
import { google } from '@/lib/google';
import { generateText } from 'ai';
import { calculateZupRok, type ZupRokResult } from '@/lib/rok-kalkulator';
import { parseCroatianDate } from '@/lib/upravni-sporovi';

export interface ExtractedCourtCase {
  sud: string;
  poslovniBroj: string;
  tuzitelj: string;
  oib?: string;
  opunomocenik?: string;
  vrstaSpora: 'Šutnja uprave' | 'Pobijanje rješenja' | 'Upravni spor';
  predmet: string;
  pobijaniAkt?: string;
  datumPreuzimanja: string; // YYYY-MM-DD
  datumPreuzimanjaFormat: string; // DD.MM.YYYY.
  rokDana: number;
  rokKalkulacija: ZupRokResult | null;
  rokDospijeca: string; // YYYY-MM-DD
  rokDospijecaFormat: string; // DD.MM.YYYY.
  rjesavateljPreporuka?: string;
  sazetak: string;
  povezaniPredmet?: {
    id: string;
    klasa: string;
    stranka: string;
  } | null;
  detektiraneDatoteke: {
    potvrda?: string;
    dopisNalog?: string;
    tuzba?: string;
    ostalo: string[];
  };
}

interface FileInput {
  name: string;
  buffer: Buffer;
}

export async function parseCourtPacket(files: FileInput[]): Promise<ExtractedCourtCase> {
  const fileTexts: { name: string; text: string; role: 'potvrda' | 'nalog' | 'tuzba' | 'ostalo' }[] = [];

  for (const f of files) {
    let text = '';
    const nameLower = f.name.toLowerCase();
    try {
      if (nameLower.endsWith('.pdf')) {
        const parsed = await pdf(f.buffer);
        text = parsed.text || '';
      } else {
        text = f.buffer.toString('utf-8');
      }
    } catch (err) {
      console.warn(`Neuspjelo čitanje teksta iz ${f.name}:`, err);
    }

    let role: 'potvrda' | 'nalog' | 'tuzba' | 'ostalo' = 'ostalo';
    const combined = (nameLower + ' ' + text.toLowerCase()).slice(0, 3000);

    if (
      nameLower.includes('potvrda') ||
      combined.includes('potvrda o preuzimanju') ||
      combined.includes('potvrda primitka') ||
      combined.includes('potvrda uručenja') ||
      combined.includes('preuzeo navedena pismena')
    ) {
      role = 'potvrda';
    } else if (
      nameLower.includes('dopis') ||
      nameLower.includes('rješenje') ||
      nameLower.includes('odluka') ||
      combined.includes('tužba s prilozima se dostavlja tuženiku na odgovor') ||
      combined.includes('poziva se tuženika')
    ) {
      role = 'nalog';
    } else if (
      nameLower.includes('tužba') ||
      nameLower.includes('tuzba') ||
      combined.includes('t u ž b a') ||
      combined.includes('tužba')
    ) {
      role = 'tuzba';
    }

    fileTexts.push({ name: f.name, text, role });
  }

  const allText = fileTexts.map((ft) => `--- DATOTEKA: ${ft.name} ---\n${ft.text}`).join('\n\n');
  const nalogText = fileTexts.find((f) => f.role === 'nalog')?.text || '';
  const tuzbaText = fileTexts.find((f) => f.role === 'tuzba')?.text || '';
  const potvrdaText = fileTexts.find((f) => f.role === 'potvrda')?.text || allText;

  // 1. DETERMINISTIČKO IZDVAJANJE REGEXOM
  // Poslovni broj suda
  let poslovniBroj = '';
  const pbMatch =
    potvrdaText.match(/(?:predmeta|oznake)\s+(Us\s*I-?\s*\d+\/\d{2,4}(?:-\d+)?)/i) ||
    nalogText.match(/Poslovni\s+broj:\s*(Us\s*I-?\s*\d+\/\d{2,4}(?:-\d+)?)/i) ||
    allText.match(/\b(Us\s*I-?\s*\d+[\/_-]\d{2,4}(?:-\d+)?)\b/i) ||
    allText.match(/\b(Usl-?\s*\d+[\/_-]\d{2,4})\b/i);

  if (pbMatch) {
    poslovniBroj = pbMatch[1].replace(/\s+/g, ' ').replace('_', '/');
    if (!poslovniBroj.includes('/')) {
      poslovniBroj = poslovniBroj.replace(/[-_](\d{2,4})/, '/$1');
    }
    // Clean trailing document index (e.g. Us I-2546/2026-2 -> Us I-2546/2026)
    poslovniBroj = poslovniBroj.replace(/-\d+$/, '');
  }

  // Sud
  let sud = 'Upravni sud u Zagrebu';
  if (/upravni\s+sud\s+u\s+splitu|US\s*ST/i.test(allText)) sud = 'Upravni sud u Splitu';
  else if (/upravni\s+sud\s+u\s+rijeci|US\s*RI/i.test(allText)) sud = 'Upravni sud u Rijeci';
  else if (/upravni\s+sud\s+u\s+osijeku|US\s*OS/i.test(allText)) sud = 'Upravni sud u Osijeku';
  else if (/visoki\s+upravni\s+sud|VUS/i.test(allText)) sud = 'Visoki upravni sud Republike Hrvatske';
  else if (/upravni\s+sud\s+u\s+zagrebu|US\s*ZG/i.test(allText)) sud = 'Upravni sud u Zagrebu';

  // Datum primitka s Potvrde primitka pošiljke
  let datumPreuzimanjaObj: Date | null = null;
  const preuzetoMatch =
    potvrdaText.match(/preuzeo\s+navedena\s+pismena.*?(\d{1,2}\.\d{1,2}\.\d{4}\.?)/i) ||
    potvrdaText.match(/dana\s+(\d{1,2}\.\d{1,2}\.\d{4}\.?)\s+preuzeo/i) ||
    potvrdaText.match(/otprema\s+od\s+(\d{1,2}\.\d{1,2}\.\d{4}\.?)/i) ||
    potvrdaText.match(/poslana\s+sljedeća\s+pismena.*?dana\s+(\d{1,2}\.\d{1,2}\.\d{4}\.?)/i);

  if (preuzetoMatch) {
    datumPreuzimanjaObj = parseCroatianDate(preuzetoMatch[1]);
  }
  if (!datumPreuzimanjaObj) {
    datumPreuzimanjaObj = new Date();
  }

  // Rok u danima (prioritet ima nalog suda / dopis)
  let rokDana = 30;
  const targetNalogText = nalogText || allText;
  if (/roku\s+od\s+60\s+dana/i.test(targetNalogText)) {
    rokDana = 60;
  } else if (/roku\s+od\s+30\s+dana/i.test(targetNalogText)) {
    rokDana = 30;
  } else if (/roku\s+od\s+(\d+)\s+dana/i.test(targetNalogText)) {
    const rm = targetNalogText.match(/roku\s+od\s+(\d+)\s+dana/i);
    if (rm) rokDana = parseInt(rm[1], 10);
  }

  // OIB
  let oib: string | undefined = undefined;
  const oibMatch = allText.match(/OIB:\s*(\d{11})/i);
  if (oibMatch) {
    oib = oibMatch[1];
  }

  // Tužitelj regex fallback
  let regexTuzitelj = '';
  const tuziteljMatch =
    tuzbaText.match(/Tužitelj:\s*[\r\n\s]*([A-ZČĆĐŠŽa-zčćđšž\s\.-]+?)(?:,|\s+OIB:|\s+Ulica|\s+kojeg|\r?\n)/i) ||
    nalogText.match(/upravnom\s+sporu\s+tužitelja\s+([A-ZČĆĐŠŽa-zčćđšž\s\.-]+?)(?:,|\s+OIB:|\s+Podgora|\s+Zagreb|\s+zastupan)/i);
  if (tuziteljMatch) {
    regexTuzitelj = tuziteljMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Opunomoćenik regex fallback
  let regexOpunomocenik = '';
  const opMatch =
    allText.match(/(?:opunomoćeniku|punomoćnik)\s+([A-ZČĆĐŠŽa-zčćđšž\s\.-]+?,\s*odvjetnik[^\r\n,]*)/i) ||
    allText.match(/ODVJETNIK\s*[\r\n\s]*([A-ZČĆĐŠŽ\s]+)/i);
  if (opMatch) {
    regexOpunomocenik = opMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Šutnja uprave ili pobijanje rješenja
  let isSutnja = false;
  if (
    /radi\s+šutnje\s+uprave/i.test(allText) ||
    /radi\s+donošenja\s+pojedinačne\s+odluke/i.test(allText) ||
    /člank(?:a|u)\s+24\.\s+Zakona\s+o\s+upravnim\s+sporovima/i.test(allText) ||
    /nije\s+donijelo\s+rješenje\s+o\s+žalbi/i.test(allText)
  ) {
    isSutnja = true;
  }

  // Klasa i Urbroj pobijanog akta
  let pobijaniAkt: string | undefined = undefined;
  const klasaMatch =
    allText.match(/(KLASA:\s*UP\/[I|II]-[\d\w\/-]+)/i) ||
    allText.match(/(UP\/[I|II]-[\d\w\/-]+)/i);
  if (klasaMatch) {
    pobijaniAkt = klasaMatch[1].trim();
  }

  // 2. AI ENRICHMENT POMOĆU GEMINI MODELA
  let aiData: {
    tuzitelj?: string;
    opunomocenik?: string;
    predmet?: string;
    sazetak?: string;
    vrstaSpora?: string;
  } = {};

  try {
    const prompt = `Analiziraj tekst dostavljenog paketa sa suda (upravni spor u RH):
${allText.slice(0, 12000)}

Molim te izvuci točne podatke u čistom JSON formatu:
{
  "tuzitelj": "Točno puno ime i prezime fizičke osobe ili točan naziv pravne osobe koja je tužitelj (npr. Matko Vela)",
  "opunomocenik": "Ime odvjetnika ili punomoćnika tužitelja ako postoji (npr. Zoran Antunović, odvjetnik u Makarskoj)",
  "vrstaSpora": "Šutnja uprave" ako tuži jer drugostupanjsko tijelo nije u roku od 60 dana riješilo žalbu, ili "Pobijanje rješenja" ako pobija konkretno rješenje,
  "predmet": "Jedna ili dvije riječi za pravno područje: npr. 'nuv', 'vodni doprinos', 'ozakonjenje', 'zakup jvd', 'troškovi postupka'",
  "sazetak": "Sažeti i precizni pravni prikaz tužbe u 2-3 rečenice: zašto tuži, koji akt navodi, što tužitelj traži od suda i traži li troškove."
}
Vrati isključivo validan JSON bez markdown backtickova.`;

    const { text: aiResponse } = await generateText({
      model: google('gemini-3.8-flash'),
      prompt,
    });

    const cleanJson = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
    aiData = JSON.parse(cleanJson);
  } catch (err) {
    console.warn('AI obogaćivanje nije uspjelo (koristim regex fallback):', err);
  }

  // Format datuma bez timezone pomaka
  const yyyy = datumPreuzimanjaObj.getFullYear();
  const mm = String(datumPreuzimanjaObj.getMonth() + 1).padStart(2, '0');
  const dd = String(datumPreuzimanjaObj.getDate()).padStart(2, '0');
  const datumPreuzimanjaStr = `${yyyy}-${mm}-${dd}`;
  const datumPreuzimanjaFormat = `${datumPreuzimanjaObj.getDate()}.${datumPreuzimanjaObj.getMonth() + 1}.${yyyy}.`;

  // Izračun roka prema ZUS/ZUP kalkulatoru
  const rokCalc = calculateZupRok(
    datumPreuzimanjaStr,
    rokDana,
    rokDana === 60 ? 'zus_odgovor_tuzba_60' : 'zus_odgovor_tuzba_30'
  );

  const tuziteljFinal = aiData.tuzitelj || regexTuzitelj || (oib ? `Tužitelj (OIB: ${oib})` : 'Tužitelj');
  const opunomocenikFinal = aiData.opunomocenik || regexOpunomocenik;

  const vrstaSporaFinal = isSutnja
    ? 'Šutnja uprave'
    : aiData.vrstaSpora === 'Šutnja uprave'
    ? 'Šutnja uprave'
    : 'Pobijanje rješenja';

  const dRok = new Date(`${rokCalc.konacniIstekRoka}T00:00:00`);
  const rokDospijecaFormat = `${dRok.getDate()}.${dRok.getMonth() + 1}.${dRok.getFullYear()}.`;

  const detektiraneDatoteke = {
    potvrda: fileTexts.find((f) => f.role === 'potvrda')?.name,
    dopisNalog: fileTexts.find((f) => f.role === 'nalog')?.name,
    tuzba: fileTexts.find((f) => f.role === 'tuzba')?.name,
    ostalo: fileTexts.filter((f) => f.role === 'ostalo').map((f) => f.name),
  };

  return {
    sud,
    poslovniBroj: poslovniBroj || 'Us I-____/2026',
    tuzitelj: tuziteljFinal,
    oib,
    opunomocenik: opunomocenikFinal || undefined,
    vrstaSpora: vrstaSporaFinal,
    predmet: aiData.predmet || (isSutnja ? 'šutnja uprave' : 'upravni postupak'),
    pobijaniAkt: pobijaniAkt || (isSutnja ? 'šutnja uprave' : undefined),
    datumPreuzimanja: datumPreuzimanjaStr,
    datumPreuzimanjaFormat,
    rokDana,
    rokKalkulacija: rokCalc,
    rokDospijeca: rokCalc.konacniIstekRoka,
    rokDospijecaFormat,
    rjesavateljPreporuka: 'Dino Malbaša',
    sazetak:
      aiData.sazetak ||
      `Tužitelj ${tuziteljFinal} podnio je tužbu ${sud}-u (${poslovniBroj}). Sud je naložio dostavu odgovora na tužbu i spisa u roku od ${rokDana} dana (do ${rokDospijecaFormat}).`,
    detektiraneDatoteke,
  };
}
