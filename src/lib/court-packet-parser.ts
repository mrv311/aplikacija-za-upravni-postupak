import pdf from 'pdf-parse';
import { google } from '@/lib/google';
import { generateText } from 'ai';
import { calculateZupRok, type ZupRokResult } from '@/lib/rok-kalkulator';
import { parseCroatianDate } from '@/lib/upravni-sporovi';
import type { PovezanoDrugostupanjskoRjesenje } from '@/lib/spor-zup-matcher';

export interface ExtractedCourtCase {
  sud: string;
  poslovniBroj: string;
  tuzitelj: string;
  oib?: string;
  opunomocenik?: string;
  vrstaSpora: 'Šutnja uprave' | 'Pobijanje rješenja' | 'Upravni spor';
  predmet: string;
  pobijaniAkt?: string;
  prvostupanjskiAkt?: string;
  datumPreuzimanja: string; // YYYY-MM-DD
  datumPreuzimanjaFormat: string; // DD.MM.YYYY.
  rokDana: number;
  rokKalkulacija: ZupRokResult | null;
  rokDospijeca: string; // YYYY-MM-DD
  rokDospijecaFormat: string; // DD.MM.YYYY.
  rjesavateljPreporuka?: string;
  sazetak: string;
  autoBiljeska?: string;
  povezaniPredmet?: (PovezanoDrugostupanjskoRjesenje & { id: string }) | null;
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
      combined.includes('potvrda o nepreuzimanju') ||
      combined.includes('potvrda primitka') ||
      combined.includes('potvrda uručenja') ||
      combined.includes('smatra da je dostava izvršena') ||
      combined.includes('preuzeo navedena pismena')
    ) {
      role = 'potvrda';
    } else if (
      nameLower.includes('dopis') ||
      nameLower.includes('rješenje') ||
      nameLower.includes('rjesenje') ||
      nameLower.includes('odluka') ||
      combined.includes('tužba s prilozima se dostavlja tuženiku na odgovor') ||
      combined.includes('tužba sa svim prilozima se dostavlja na odgovor') ||
      combined.includes('poziva se tuženika') ||
      combined.includes('poziva se tuženik')
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

  // Datum primitka s Potvrde primitka / Potvrde o nepreuzimanju pošiljke
  let datumPreuzimanjaObj: Date | null = null;
  const preuzetoMatch =
    potvrdaText.match(/preuzeo\s+navedena\s+pismena.*?(\d{1,2}\.\d{1,2}\.\d{4}\.?)/i) ||
    potvrdaText.match(/dana\s+(\d{1,2}\.\d{1,2}\.\d{4}\.?)\s+preuzeo/i) ||
    potvrdaText.match(/dostava\s+izvr[sš]ena\s+dana\s+(\d{1,2}\.\d{1,2}\.\d{4}\.?)/i) ||
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
    tuzbaText.match(/Tužitelj(?:ica)?:\s*[\r\n\s]*([A-ZČĆĐŠŽa-zčćđšž\s\.-]+?)(?:,|\s+iz\s+|\s+OIB:|\s+Ulica|\s+koj[ea]g?|\r?\n)/i) ||
    nalogText.match(/upravnom\s+sporu\s+tužitelj(?:a|ice)\s+([A-ZČĆĐŠŽa-zčćđšž\s\.-]+?)(?:,|\s+iz\s+|\s+OIB:|\s+Podgora|\s+Zagreb|\s+zastupan)/i);
  if (tuziteljMatch) {
    regexTuzitelj = tuziteljMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Opunomoćenik regex fallback
  let regexOpunomocenik = '';
  const opMatch =
    allText.match(/(?:opunomoćeniku|opunomoćenik|punomoćnik)\s+([A-ZČĆĐŠŽa-zčćđšž\s\.-]+?,\s*odvjetnik[^\r\n,]*)/i) ||
    allText.match(/ODVJETNIK\s*[\r\n\s]*([A-ZČĆĐŠŽ\s]+)/i);
  if (opMatch) {
    regexOpunomocenik = opMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Šutnja uprave ili pobijanje rješenja (široko prepoznavanje sudskih i tužbenih formulacija)
  const normalizedAllForSutnja = allText.replace(/\s+/g, ' ');
  let isSutnja = false;
  if (
    /[sš]utnj[aeiu]\s+(?:uprav[en]|upravnog\s+tijela|administracij)/i.test(normalizedAllForSutnja) ||
    /propu[sš]tanj[aeu]\s+dono[sš]enj[aeu]\s+(?:pojedina[cč]ne\s+)?(?:odluk|rje[sš]enj|upravnog\s+akta)/i.test(normalizedAllForSutnja) ||
    /nedono[sš]enj[aeu]\s+(?:upravnog\s+akta|pojedina[cč]ne\s+odluke|rje[sš]enja)/i.test(normalizedAllForSutnja) ||
    /radi\s+dono[sš]enj[aeu]\s+pojedina[cč]ne\s+odluke/i.test(normalizedAllForSutnja) ||
    /nije\s+donijel[oa]\s+(?:rje[sš]enje|odluku|upravni\s+akt)\s+(?:o|po)\s+[zž]albi/i.test(normalizedAllForSutnja) ||
    /nije\s+donesen[oa]\s+(?:rje[sš]enje|odluka)\s+(?:o|po|protiv)/i.test(normalizedAllForSutnja) ||
    /ne\s*rje[sš]avanjem\s+(?:o|po)\s+[zž]albi/i.test(normalizedAllForSutnja) ||
    /[cč]lank(?:a|u)\s+24\.(?:\s+stavk(?:a|u)\s+\d+\.)?\s+Zakona\s+o\s+upravnim\s+sporovima/i.test(normalizedAllForSutnja) ||
    /[cč]l\.\s*24\.(?:\s*st\.\s*\d+\.)?\s*ZUS/i.test(normalizedAllForSutnja) ||
    fileTexts.some((ft) => /[sš]utnj/i.test(ft.name))
  ) {
    isSutnja = true;
  }

  // Odvojeno izdvajanje drugostupanjske (UP/II-) i prvostupanjske (UP/I-) KLASE
  const upIiMatch = allText.match(/(?:KLASA:\s*|kl\.?:\s*)?(UP\/II-\s*[\dA-Za-z\/-]+)/i);
  const upIMatch = allText.match(/(?:KLASA:\s*|kl\.?:\s*)?(UP\/I-\s*[\dA-Za-z\/-]+)/i);
  const upIiKlasa = upIiMatch ? upIiMatch[1].replace(/\s+/g, '').replace(/[.,;:)\]]+$/, '') : undefined;
  const upIKlasa = upIMatch ? upIMatch[1].replace(/\s+/g, '').replace(/[.,;:)\]]+$/, '') : undefined;

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
  "vrstaSpora": "Šutnja uprave" ako tužitelj tuži zbog propuštanja donošenja odluke u propisanom roku / nedonošenja upravnog akta o žalbi / šutnje upravnog tijela (čl. 24. ZUS) — VAŽNO: čak i kada sud u rješenju ili tužitelj u tužbi navodi točnu KLASU prvostupanjskog rješenja Hrvatskih voda (UP/I-...) protiv kojeg je žalba podnesena, radi se o 'Šutnja uprave' ako drugostupanjsko rješenje Ministarstva (UP/II-...) nije bilo doneseno! Koristi "Pobijanje rješenja" ISKLJUČIVO ako tužitelj pobija već doneseno drugostupanjsko rješenje (UP/II-...).,
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

  const isSutnjaFinal =
    isSutnja ||
    (aiData.vrstaSpora || '').toLowerCase().includes('šutnj') ||
    (aiData.vrstaSpora || '').toLowerCase().includes('sutnj');

  const vrstaSporaFinal: ExtractedCourtCase['vrstaSpora'] = isSutnjaFinal
    ? 'Šutnja uprave'
    : 'Pobijanje rješenja';

  const prvostupanjskiAkt = upIKlasa ? `KLASA: ${upIKlasa}` : undefined;
  const pobijaniAktFinal = isSutnjaFinal
    ? upIKlasa
      ? `Šutnja uprave (I. stupanj: ${upIKlasa})`
      : 'Šutnja uprave'
    : upIiKlasa
    ? `KLASA: ${upIiKlasa}`
    : upIKlasa
    ? `KLASA: ${upIKlasa}`
    : undefined;

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
    predmet: aiData.predmet || (isSutnjaFinal ? 'šutnja uprave' : 'upravni postupak'),
    pobijaniAkt: pobijaniAktFinal,
    prvostupanjskiAkt,
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
