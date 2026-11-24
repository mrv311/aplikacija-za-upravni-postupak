import type { PropisDocument, StressTestFinding } from './izrada-propisa-types';
import { parseNormativeDraft } from './propis-article-parser';

/**
 * Sloj 1 Stress-testa: 100% deterministička lokalna provjera nomotehničkih pravila (JMNP, NN 74/15),
 * internih upućivanja, dosljednosti citiranja Narodnih novina i tarifnih iznosa.
 * 0 AI troška, trenutno izvršavanje.
 */
export function runLocalStressChecks(
  draftDoc: PropisDocument,
  excelDocs: PropisDocument[] = []
): StressTestFinding[] {
  const findings: StressTestFinding[] = [];
  const struct = draftDoc.parsedDraft || parseNormativeDraft(draftDoc.rawText || '');
  const fullText = draftDoc.rawText || '';

  let seq = 1;
  const pushFinding = (f: Omit<StressTestFinding, 'id' | 'source'>) => {
    findings.push({
      ...f,
      id: `local-${seq++}`,
      source: 'lokalni',
    });
  };

  // 1. Provjera osnovnih JMNP formalnih sastojaka akta
  if (!/Na temelju članka\s+\d+/i.test(struct.preambula)) {
    pushFinding({
      axis: 'jmnp',
      severity: 'kriticno',
      clanak: 'Preambula',
      naslov: 'Nedostaje standardna uvodna rečenica s pravnom osnovom',
      opis:
        'Prema čl. 5. JMNP-a (NN 74/15), podzakonski akt mora započinjati preambulom („Na temelju članka ... Zakona o ...“) s točnim navođenjem zakonske osnove i donositelja.',
      pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 5. (Preambula)',
    });
  }

  if (struct.clanci.length === 0) {
    pushFinding({
      axis: 'jmnp',
      severity: 'kriticno',
      clanak: 'Cijeli tekst',
      naslov: 'Nisu prepoznati numerirani članci („Članak 1.“)',
      opis: 'Lokalni parser nije pronašao oznake članaka u standardnom formatu „Članak 1.“.',
      pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 29. (Članak)',
    });
    return findings;
  }

  // 2. Provjera slijeda numeracije članaka
  const numericArts: number[] = [];
  const seenKeys = new Set<string>();
  for (const cl of struct.clanci) {
    if (seenKeys.has(cl.key)) {
      pushFinding({
        axis: 'jmnp',
        severity: 'kriticno',
        clanak: cl.oznaka,
        naslov: `Duplicirana oznaka članka (${cl.oznaka})`,
        opis: `Članak ${cl.oznaka} pojavljuje se više puta u tekstu nacrta.`,
        pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 29. (Članak)',
      });
    }
    seenKeys.add(cl.key);
    if (/^\d+$/.test(cl.broj)) {
      numericArts.push(parseInt(cl.broj, 10));
    }
  }
  for (let i = 1; i < numericArts.length; i++) {
    if (numericArts[i] !== numericArts[i - 1] + 1) {
      pushFinding({
        axis: 'jmnp',
        severity: 'kriticno',
        clanak: `Članak ${numericArts[i]}.`,
        naslov: `Prekid slijeda numeracije članaka (${numericArts[i - 1]}. → ${numericArts[i]}.)`,
        opis: `Između Članka ${numericArts[i - 1]}. i Članka ${numericArts[i]}. nedostaje redni broj članka.`,
        pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 29. (Članak)',
      });
    }
  }

  const existingArticleNums = new Set(struct.clanci.map((c) => c.broj.toLowerCase()));

  // 3. Analiza svakog pojedinog članka: zagrade, stavci, interna upućivanja
  let nkdBracketsCount = 0;
  for (const cl of struct.clanci) {
    // 3a. Provjera slijeda stavaka (1), (2), (3)...
    const stavakMatches = Array.from(cl.tekst.matchAll(/^\((\d+)\)/gm)).map((m) =>
      parseInt(m[1], 10)
    );
    for (let i = 0; i < stavakMatches.length; i++) {
      if (stavakMatches[i] !== i + 1) {
        pushFinding({
          axis: 'jmnp',
          severity: 'upozorenje',
          clanak: cl.oznaka,
          naslov: `Nepravilan redoslijed stavaka (${stavakMatches.join(', ')})`,
          opis: `U ${cl.oznaka} očekivan je redoslijed stavaka (1), (2)...; pronađen je stavak (${stavakMatches[i]}) na poziciji ${i + 1}.`,
          pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 31. (Stavak)',
        });
        break;
      }
    }

    // 3b. Provjera unutarnjih upućivanja na stavke istog članka ("iz stavka X.")
    const maxStavak = stavakMatches.length > 0 ? Math.max(...stavakMatches) : 1;
    const stavakRefs = Array.from(
      cl.tekst.matchAll(/(?:iz|u|iznad|sukladno)\s+stavk(?:a|u|om|e)\s+(\d+)\.(?!\s*(?:članka|Zakona|Uredbe))/gi)
    );
    for (const ref of stavakRefs) {
      const refNum = parseInt(ref[1], 10);
      if (refNum > maxStavak) {
        pushFinding({
          axis: 'dosljednost',
          severity: 'kriticno',
          clanak: cl.oznaka,
          naslov: `Unutarnje upućivanje na nepostojeći stavak ${refNum}.`,
          opis: `${cl.oznaka} upućuje na „${ref[0]}“, ali taj članak ima ukupno ${maxStavak} stavaka.`,
          pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 39. i 43. (Precizni izričaj i navođenje)',
        });
      }
    }

    // 3c. Provjera unutarnjih upućivanja na druge članke ove Uredbe/akta
    const artRefs = Array.from(
      cl.tekst.matchAll(/člank(?:a|u|om)\s+(\d+[a-z]?)\.\s+ov(?:e|og|oga)\s+(?:Uredbe|Pravilnika|Zakona|Odluke)/gi)
    );
    for (const ref of artRefs) {
      const target = ref[1].toLowerCase();
      if (!existingArticleNums.has(target)) {
        pushFinding({
          axis: 'dosljednost',
          severity: 'kriticno',
          clanak: cl.oznaka,
          naslov: `Upućivanje na nepostojeći Članak ${ref[1]}.`,
          opis: `${cl.oznaka} poziva se na „${ref[0]}“, ali Članak ${ref[1]}. ne postoji u ovom nacrtu.`,
          pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 39. i 43.',
        });
      }
    }

    // 3d. Detekcija opisnih zagrada u normativnim rečenicama (česta primjedba UZZ-a!)
    const parenMatches = Array.from(cl.tekst.matchAll(/\(([^()\n]{2,140})\)/g));
    for (const pm of parenMatches) {
      const inner = pm[1].trim();
      // Preskoči oznake stavaka (1), (2), mjerne jedinice (EUR), (m2) i kratke NKD šifre (B), (08.93)
      if (/^\d{1,2}$/.test(inner)) continue;
      if (/^(EUR|m²|m2|ha|km)$/i.test(inner)) continue;
      if (/^[A-Z]{1,2}$|^\d{2}(?:\.\d{1,2})?$/.test(inner)) {
        nkdBracketsCount++;
        continue;
      }
      // Preskoči citate Narodnih novina u zagradama
      if (/Narodne novine/i.test(inner)) continue;

      pushFinding({
        axis: 'jmnp',
        severity: 'upozorenje',
        clanak: cl.oznaka,
        naslov: 'Korištenje opisnog teksta u zagradama u normativnoj odredbi',
        opis: `U ${cl.oznaka} pronađen je opisni tekst u zagradama: „(${inner})“. Ured za zakonodavstvo Vlade RH (UZZ) dosljedno traži brisanje zagrada u normativnom dijelu i preformuliranje sadržaja kao sastavnog dijela rečenice (npr. uz „odnosno“ ili zasebnim stavkom).`,
        pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 37., 39. i 41. (Jasni izričaj i stil) te praksa UZZ-a',
        prijedlogPreformulacije: `Ukloniti zagrade oko „${inner}“ i ugraditi uvjet izravno u tekst odredbe (npr. „..., odnosno ...“).`,
      });
    }
  }

  if (nkdBracketsCount > 0) {
    pushFinding({
      axis: 'jmnp',
      severity: 'preporuka',
      clanak: 'Članak 2.',
      naslov: `NKD oznake u zagradama (${nkdBracketsCount} pojavljivanja)`,
      opis: `U tekstu nacrta pronađeno je ${nkdBracketsCount} NKD šifri navedenih u zagradama (npr. (B), (08.93), (G)). Provjerite hoće li UZZ ponovno tražiti navođenje bez zagrada (npr. „oznaka B“ ili u zasebnoj tablici/prilogu).`,
      pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 41. i 44. te prethodna praksa UZZ-a',
    });
  }

  // 4. Provjera dosljednosti citiranja brojeva „Narodnih novina“ između preambule i Obrazloženja
  const extractNnCitations = (src: string): string[] => {
    const matches = Array.from(
      src.matchAll(/„?Narodne novine“?,?\s*(?:br\.?|broj)\s*:?\s*([0-9/.,\s]+(?:i\s+\d+\/\d+\.?)?)/gi)
    );
    return matches.map((m) => m[1].replace(/\s+/g, ' ').trim());
  };

  const preambulaNn = extractNnCitations(struct.preambula);
  const obrNn = extractNnCitations(struct.obrazlozenje);
  if (preambulaNn.length > 0 && obrNn.length > 0) {
    const extractNums = (s: string) =>
      Array.from(s.matchAll(/\d+\/\d+/g)).map((m) => m[0]);
    const pNums = extractNums(preambulaNn[0]);
    const oNums = extractNums(obrNn[0]);
    // Usporedi ako se odnose na isti matični zakon (dijele prvi broj NN, npr. 153/09)
    if (pNums.length > 0 && oNums.length > 0 && pNums[0] === oNums[0]) {
      const missingInObr = pNums.filter((n) => !oNums.includes(n));
      const missingInPre = oNums.filter((n) => !pNums.includes(n));
      if (missingInObr.length > 0 || missingInPre.length > 0) {
        pushFinding({
          axis: 'dosljednost',
          severity: 'kriticno',
          clanak: 'Preambula / Obrazloženje',
          naslov: 'Neslaganje brojeva „Narodnih novina“ između Preambule i Obrazloženja',
          opis: `Preambula citira NN: ${pNums.join(', ')}, dok Obrazloženje citira NN: ${oNums.join(', ')}.${
            missingInObr.length > 0 ? ` U Obrazloženju nedostaju brojevi: ${missingInObr.join(', ')}.` : ''
          }${
            missingInPre.length > 0 ? ` U Preambuli nedostaju brojevi: ${missingInPre.join(', ')}.` : ''
          }`,
          pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 43. (Navođenje) i čl. 51. (Pozivanje na osnovni propis)',
          prijedlogPreformulacije: `Uskladiti popis brojeva Narodnih novina na oba mjesta: („Narodne novine“, br. ${pNums
            .map((n) => `${n}.`)
            .join(', ')
            .replace(/, ([^,]+)$/, ' i $1')}).`,
        });
      }
    }
  }

  // 5. Provjera obveznih završnih i prijelaznih odredaba (JMNP)
  const lastThreeText = struct.clanci
    .slice(-3)
    .map((c) => c.tekst)
    .join('\n');

  if (!/zapo[čc]et\w*\s+(?:prije|do)\s+stupanja\s+na\s+snagu|prijelazn/i.test(lastThreeText)) {
    pushFinding({
      axis: 'jmnp',
      severity: 'upozorenje',
      clanak: 'Prijelazne odredbe',
      naslov: 'Provjeriti postojanje prijelazne odredbe za započete upravne postupke',
      opis:
        'U zadnjim člancima nije jasno prepoznata standardna prijelazna odredba o dovršetku upravnih postupaka započetih prije stupanja na snagu novog propisa.',
      pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 20. (Prijelazne odredbe)',
    });
  }

  if (!/prestaj[eu]\s+va[žz]iti/i.test(lastThreeText)) {
    pushFinding({
      axis: 'jmnp',
      severity: 'upozorenje',
      clanak: 'Završne odredbe',
      naslov: 'Nedostaje izričita odredba o prestanku važenja starog propisa',
      opis:
        'Kada se donosi novi cjeloviti propis, nužno je izričito propisati da danom stupanja na snagu prestaje važiti dosadašnji propis s točnim brojevima Narodnih novina.',
      pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 21. (Završne odredbe)',
    });
  }

  if (!/objavit\s+[ćc]e\s+se\s+u\s+„?Narodnim\s+novinama“?/i.test(lastThreeText)) {
    pushFinding({
      axis: 'jmnp',
      severity: 'kriticno',
      clanak: 'Završna odredba',
      naslov: 'Nedostaje standardna klauzula o objavi u „Narodnim novinama“ i stupanju na snagu',
      opis: 'Završni članak mora sadržavati odredbu o objavi u „Narodnim novinama“ i danu stupanja na snagu.',
      pravnaOsnovaIliPraksa: 'JMNP (NN 74/15), čl. 21. (Završne odredbe)',
    });
  }

  // 6. Unakrsna provjera tarifa između Članka 3. (tablica) i ostalih članaka (npr. Čl. 5. 0,04 EUR vs TR 4. 0,05 EUR)
  const art3 = struct.clanci.find((c) => c.key === '3');
  const art5 = struct.clanci.find((c) => c.key === '5');
  if (art3 && art5) {
    const tr4Match = art3.tekst.match(/Tarifni\s+razred\s+4\.?[^|\n]*\|\s*([0-9]+[,.][0-9]+)/i);
    const art5EurMatch = art5.tekst.match(/([0-9]+[,.][0-9]+)\s*eur/i);
    if (tr4Match && art5EurMatch) {
      const tr4Val = tr4Match[1].replace('.', ',');
      const art5Val = art5EurMatch[1].replace('.', ',');
      if (tr4Val !== art5Val) {
        pushFinding({
          axis: 'dosljednost',
          severity: 'upozorenje',
          clanak: 'Članak 3. / Članak 5.',
          naslov: `Razlika iznosa naknade: Članak 3. TR 4. (${tr4Val} EUR) vs. Članak 5. (${art5Val} EUR)`,
          opis: `U tablici tarifa u Članku 3. Tarifni razred 4. (stambeni prostor) iznosi ${tr4Val} EUR/m², dok Članak 5. za poslovni prostor u sastavu obiteljske kuće koji nije u upotrebi propisuje ${art5Val} EUR/m². Provjerite je li ${art5Val} EUR ostao iz ranije verzije nacrta (kad je stambena tarifa bila 0,04 EUR) ili je to namjerno različit iznos.`,
          pravnaOsnovaIliPraksa: 'Unakrsna provjera tarifa unutar nacrta',
          prijedlogPreformulacije: `Provjeriti treba li u Članku 5. uskladiti iznos na ${tr4Val} EUR ili uputiti izravno na „visinu propisanu za tarifni razred 4. iz članka 3. ove Uredbe“.`,
        });
      }
    }
  }

  // 7. Provjera prisutnosti Excel tarifa i usporedbe s tekstom
  if (excelDocs.length === 0 && /tarifn\w+\s+razred/i.test(fullText)) {
    pushFinding({
      axis: 'dosljednost',
      severity: 'preporuka',
      clanak: 'Članak 3.',
      naslov: 'Nisu učitane Excel tarife za automatsku financijsku usporedbu',
      opis: 'Učitajte tablicu tarifa (.xlsx) pod ulogom „Excel tarife“ kako bi AI Stress-test i generatori mogli provjeriti svaku brojku i izračunati točne financijske učinke.',
    });
  }

  return findings;
}
