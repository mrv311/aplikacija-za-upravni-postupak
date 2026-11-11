import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
} from 'docx';

export type OdgovorScenarij =
  | 'sutnja_nije_zaprimljeno' // Šutnja uprave - spis/žalba nije dostavljen Ministarstvu
  | 'sutnja_naknadno_doneseno' // Šutnja uprave - u međuvremenu doneseno rješenje UP/II
  | 'meritum_potvrda_rjesenja' // Redovni upravni spor - potvrda rješenja / meritum
  | 'ai_prilagodeno'; // Prilagođeni pravni navodi / AI generirani odgovor

export interface OdgovorNaTuzbuInput {
  // Evidencijske oznake zaglavlja
  evidencijskaOznaka?: string; // npr. (517-UP/II-325-08/26-02/295-2R2)
  barkodBroj?: string; // npr. P/8284708
  klasa: string; // npr. KLASA: UP/II-325-08/26-02/295
  urbroj: string; // npr. URBROJ: 517-05-2-26-2
  mjesto?: string; // default: Zagreb
  datum?: string; // npr. 11. studenoga 2026.

  // Naslovni sud
  sudNaziv: string; // npr. UPRAVNI SUD U SPLITU
  sudAdresa?: string; // npr. Put Supavla 1, Split

  // Stranke i postupak
  tuzitelj: string; // Ime i prezime / Naziv, adresa, OIB
  opunomocenik?: string; // npr. odvjetnik Luka Matković, Slavonska avenija 20B, Zagreb
  tuzenik?: string; // default: Republika Hrvatska, Ministarstvo zaštite okoliša i zelene tranzicije
  poslovniBrojSuda: string; // npr. Us I-754/2026

  // Scenarij i podaci za automatski tekst
  scenarij: OdgovorScenarij;
  predmetSpora?: string; // npr. šutnja uprave / naknada za uređenje voda / vodni doprinos

  // Specifična polja za scenarije (ako se koriste automatski generatori)
  datumTuzbe?: string; // npr. 1. travnja 2026.
  datumPredajeZalbe?: string; // npr. 20. siječnja 2026.
  prvostupanjskoTijelo?: string; // npr. Hrvatske vode
  prvostupanjskiAkt?: string; // npr. KLASA: UP/I-325-10/22-06/503775, URBROJ: 374-3404-2-25-2 od 14. studenog 2025.
  
  // Za doneseno rješenje
  donesenoRjesenjeKlasaUrbroj?: string; // npr. KLASA: UP/II-325-08/25-02/224, URBROJ: 517-05-2-26-2 od 29. rujna 2026.
  datumDostaveStranci?: string; // npr. 1. listopada 2026.
  ishodRjesenja?: string; // npr. odbijena je kao neosnovana žalba podnositelja

  // Za meritum
  pobijanoRjesenjeKlasaUrbroj?: string; // npr. KLASA: UP/II-325-08/23-02/260, URBROJ: 517-09-2-2-23-5 od ...
  meritumArgumenti?: string;

  // Cjelokupni prilagođeni tekst obrazloženja (ako ga korisnik ili AI definira)
  prilagodeniTekstObrazlozenja?: string;

  // Potpisnik
  potpisnikFunkcija?: string; // default: SEKTORSKI SAVJETNIK
  potpisnikIme?: string; // default: Dino Malbaša, dipl. iur.

  // Dostavna naredba
  dostavitiPopis?: string[];
}

export const POZNATI_SUDOVI_ADRESE: Record<string, { naziv: string; adresa: string }> = {
  zagreb: {
    naziv: 'UPRAVNI SUD U ZAGREBU',
    adresa: 'Avenija Dubrovnik 6 i 8, Zagreb',
  },
  split: {
    naziv: 'UPRAVNI SUD U SPLITU',
    adresa: 'Put Supavla 1, Split',
  },
  rijeka: {
    naziv: 'UPRAVNI SUD U RIJECI',
    adresa: 'Erazma Barčića 9, Rijeka',
  },
  osijek: {
    naziv: 'UPRAVNI SUD U OSIJEKU',
    adresa: 'Europska avenija 7, Osijek',
  },
  visoki: {
    naziv: 'VISOKI UPRAVNI SUD REPUBLIKE HRVATSKE',
    adresa: 'Frankopanska 16, Zagreb',
  },
};

export function detectCourtDetails(sudInput: string): { naziv: string; adresa: string } {
  const lower = (sudInput || '').toLowerCase();
  if (lower.includes('split')) return POZNATI_SUDOVI_ADRESE.split;
  if (lower.includes('rijek')) return POZNATI_SUDOVI_ADRESE.rijeka;
  if (lower.includes('osijek')) return POZNATI_SUDOVI_ADRESE.osijek;
  if (lower.includes('visoki') || lower.includes('vus')) return POZNATI_SUDOVI_ADRESE.visoki;
  if (lower.includes('zagreb')) return POZNATI_SUDOVI_ADRESE.zagreb;

  return {
    naziv: sudInput.trim().toUpperCase() || 'UPRAVNI SUD U ZAGREBU',
    adresa: '',
  };
}

/**
 * Formatira standardni datum na hrvatskom jeziku (npr. "11. studenoga 2026.")
 */
export function getCroatianLongDate(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(date.getTime())) {
    // Ako je već poslan formatirani string (npr. "9. studenog 2026."), vrati ga
    return dateStr || '';
  }

  const months = [
    'siječnja',
    'veljače',
    'ožujka',
    'travnja',
    'svibnja',
    'lipnja',
    'srpnja',
    'kolovoza',
    'rujna',
    'listopada',
    'studenoga',
    'prosinca',
  ];

  return `${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}.`;
}

/**
 * Generira standardni pravni tekst odgovora na tužbu prema odabranom scenariju
 */
export function generateDefaultScenarioText(input: OdgovorNaTuzbuInput): string[] {
  if (input.prilagodeniTekstObrazlozenja && input.prilagodeniTekstObrazlozenja.trim()) {
    return input.prilagodeniTekstObrazlozenja
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  const prvostupanjskoTijelo = input.prvostupanjskoTijelo || 'Hrvatskim vodama';
  const datumTuzbe = input.datumTuzbe || 'zaprimljenom tužbom';
  const datumZalbe = input.datumPredajeZalbe ? `dana ${input.datumPredajeZalbe}` : 'pravovremeno';
  const prvostupanjskiAkt =
    input.prvostupanjskiAkt || 'prvostupanjskog rješenja Hrvatskih voda';

  switch (input.scenarij) {
    case 'sutnja_nije_zaprimljeno':
      return [
        `Tužitelj je ${datumTuzbe} podnio tužbu nadležnom Upravnom sudu zbog propuštanja donošenja odluke povodom žalbe izjavljene protiv ${prvostupanjskiAkt}. Nadalje, tužitelj u tužbi navodi da je žalbu predao ${datumZalbe} prvostupanjskom tijelu (${prvostupanjskoTijelo}).`,
        `Tuženik u cijelosti osporava tužbeni zahtjev jer u Ministarstvu zaštite okoliša i zelene tranzicije nije zaprimljena predmetna žalba tužitelja niti pripadajući spis predmeta na drugostupanjsko rješavanje.`,
        `Iako je prema članku 70. stavku 2. Zakona o financiranju vodnoga gospodarstva („Narodne novine“, broj: 153/09, 90/11, 56/13, 119/15, 120/16, 127/17, 66/19 i 36/24) propisano da o žalbama protiv rješenja o obračunu vodnih naknada odlučuje Ministarstvo, žalba se, sukladno propisima o općem upravnom postupku i samoj uputi o pravnom lijeku iz prvostupanjskog rješenja, predaje prvostupanjskom tijelu (${prvostupanjskoTijelo}). Prvostupanjsko tijelo dužno je ispitati žalbu te je, ako ju ne odbaci ili ne usvoji novim rješenjem, proslijediti drugostupanjskom tijelu (ovdje tuženiku) zajedno sa spisom predmeta.`,
        `S obzirom na to da prvostupanjsko tijelo nikada nije proslijedilo predmetnu žalbu i spis ovom Ministarstvu, rok za donošenje drugostupanjskog rješenja propisan člankom 121. Zakona o općem upravnom postupku za tuženika nije niti počeo teći. Stoga se u ovom konkretnom slučaju ne može raditi o „šutnji uprave“ (nedonošenju upravnog akta u propisanom roku) od strane tuženika, jer tuženik nije bio upoznat s činjenicom podnošenja žalbe niti je raspolagao spisom za rješavanje.`,
        `Slijedom navedenog, tuženik predlaže da Sud donese presudu kojom će odbiti tužbeni zahtjev tužitelja u odnosu na tuženika kao neosnovan te odbiti zahtjev tužitelja za naknadom troškova upravnog spora.`,
      ];

    case 'sutnja_naknadno_doneseno': {
      const doneseniAkt =
        input.donesenoRjesenjeKlasaUrbroj ||
        'drugostupanjsko rješenje Ministarstva zaštite okoliša i zelene tranzicije';
      const ishod = input.ishodRjesenja || 'odbijena je kao neosnovana žalba podnositelja';
      const datumDostave = input.datumDostaveStranci
        ? `dana ${input.datumDostaveStranci}`
        : 'po donošenju';

      return [
        `U vezi pokrenutog upravnog spora tužitelja ${input.tuzitelj}, radi šutnje uprave povodom žalbe izjavljene protiv ${prvostupanjskiAkt}, daje se sljedeća obavijest:`,
        `Ministarstvo zaštite okoliša i zelene tranzicije je, u vezi žalbe tužitelja, donijelo ${doneseniAkt}.`,
        `Navedenim rješenjem Ministarstva zaštite okoliša i zelene tranzicije ${ishod}.`,
        `Napominje se kako je drugostupanjsko rješenje ovoga tijela dostavljeno ${datumDostave} prvostupanjskom tijelu / opunomoćeniku tužitelja radi dostave (preslika rješenja i povratnice u privitku).`,
        `Budući da je upravni akt povodom kojega je podnesena tužba zbog šutnje uprave donesen i otpremljen, tuženik predlaže da Sud, na temelju članka 24. stavka 3. Zakona o upravnim sporovima („Narodne novine“, broj: 36/24 i 39/26), pozove tužitelja na izjašnjenje ostaje li kod tužbe, odnosno donese rješenje o obustavi upravnog spora te odbije zahtjev tužitelja za naknadu troškova spora.`,
      ];
    }

    case 'meritum_potvrda_rjesenja': {
      const pobijaniAkt =
        input.pobijanoRjesenjeKlasaUrbroj ||
        input.prvostupanjskiAkt ||
        'pobijanog drugostupanjskog rješenja tuženika';
      const dodatniRazlozi = input.meritumArgumenti
        ? `\n\nNadalje, u pogledu tužbenih navoda ističe se:\n${input.meritumArgumenti}`
        : '';

      return [
        `Dana ${datumTuzbe} tuženik je zaprimio tužbu kojom tužitelj osporava zakonitost ${pobijaniAkt}.`,
        `Tuženik u cijelosti ostaje kod svih utvrđenja, činjeničnih zaključaka i primjene materijalnog prava navedenih u izreci i obrazloženju pobijanog rješenja te osporava sve tužbene navode kao pravno i činjenično neosnovane.${dodatniRazlozi}`,
        `U postupku koji je prethodio donošenju pobijanog akta potpuno je i pravilno utvrđeno činjenično stanje, bez bitnih povreda pravila postupka, a na tako utvrđeno stanje pravilno je primijenjeno mjerodavno materijalno pravo, što je u skladu i s ustaljenom sudskom praksom Visokog upravnog suda Republike Hrvatske u istovrsnim upravnim stvarima.`,
        `Slijedom navedenog, tuženik predlaže da Upravni sud odbije tužbeni zahtjev u cijelosti kao neosnovan, te odbije zahtjev tužitelja za naknadu troškova upravnog spora.`,
      ];
    }

    case 'ai_prilagodeno':
    default:
      return [
        `U vezi tužbe podnesene Upravnom sudu pod poslovnim brojem ${input.poslovniBrojSuda}, tuženik Ministarstvo zaštite okoliša i zelene tranzicije daje odgovor na tužbu kako slijedi:`,
        input.prilagodeniTekstObrazlozenja?.trim() ||
          `Tuženik u cijelosti osporava tužbeni zahtjev kao neosnovan. Pobijani akt donesen je u zakonito provedenom postupku uz pravilno primijenjeno materijalno pravo.`,
        `Tuženik predlaže Sudu odbiti tužbeni zahtjev tužitelja u cijelosti kao neosnovan, te odbiti zahtjev za naknadom troškova upravnog spora.`,
      ];
  }
}

/**
 * Glavna funkcija koja generira .docx Buffer za Odgovor na tužbu
 */
export async function generateOdgovorNaTuzbuDocxBuffer(input: OdgovorNaTuzbuInput): Promise<Buffer> {
  const font = 'Times New Roman';
  const normalSize = 24; // 12pt u half-points
  const smallSize = 20; // 10pt
  const lineSpacing = 276; // 1.15 line spacing (twips)

  const court = detectCourtDetails(input.sudNaziv);
  const datumFormat = input.datum || getCroatianLongDate();
  const mjesto = input.mjesto || 'Zagreb';
  const klasaStr = input.klasa.startsWith('KLASA:') ? input.klasa : `KLASA: ${input.klasa}`;
  const urbrojStr = input.urbroj.startsWith('URBROJ:') ? input.urbroj : `URBROJ: ${input.urbroj}`;
  const tuzenikStr =
    input.tuzenik || 'Republika Hrvatska, Ministarstvo zaštite okoliša i zelene tranzicije';
  const potpisnikFunkcija = input.potpisnikFunkcija || 'SEKTORSKI SAVJETNIK';
  const potpisnikIme = input.potpisnikIme || 'Dino Malbaša, dipl. iur.';

  const paragraphs: Paragraph[] = [];

  // 1. ZAGLAVLJE (Evidencija / Barkod ako postoji)
  if (input.evidencijskaOznaka) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: input.evidencijskaOznaka,
            font,
            size: smallSize,
            color: '444444',
          }),
        ],
        spacing: { after: 80 },
      })
    );
  }

  if (input.barkodBroj) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: input.barkodBroj,
            font,
            size: smallSize,
            bold: true,
            color: '333333',
          }),
        ],
        spacing: { after: 140 },
      })
    );
  }

  // 2. KLASA, URBROJ, ZAGREB DATUM
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: klasaStr, font, size: normalSize, bold: true }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: urbrojStr, font, size: normalSize, bold: true }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: `${mjesto}, ${datumFormat}`, font, size: normalSize }),
      ],
      spacing: { after: 300 },
    })
  );

  // 3. NASLOVNI SUD (Podebljano, adresa ispod)
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: court.naziv, font, size: normalSize, bold: true }),
      ],
      spacing: { after: 40 },
    })
  );

  if (court.adresa || input.sudAdresa) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: input.sudAdresa || court.adresa,
            font,
            size: normalSize,
          }),
        ],
        spacing: { after: 280 },
      })
    );
  } else {
    paragraphs.push(new Paragraph({ spacing: { after: 200 } }));
  }

  // 4. PREDMET I STRANKE
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: 'PREDMET: ODGOVOR NA TUŽBU;', font, size: normalSize, bold: true }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: '                    - daje se;', font, size: normalSize }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: 'TUŽITELJ: ', font, size: normalSize, bold: true }),
        new TextRun({ text: `${input.tuzitelj};`, font, size: normalSize }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: 'TUŽENIK: ', font, size: normalSize, bold: true }),
        new TextRun({ text: `${tuzenikStr};`, font, size: normalSize }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: 'Veza: Poslovni broj: ', font, size: normalSize, bold: true }),
        new TextRun({ text: input.poslovniBrojSuda, font, size: normalSize, bold: true }),
      ],
      spacing: { after: 260 },
    })
  );

  // 5. PRAVNI UVOD (čl. 48. ZUS)
  const opunomocenikDio = input.opunomocenik
    ? `, zastupanog po opunomoćeniku ${input.opunomocenik}`
    : '';
  const radiCega = input.predmetSpora
    ? `radi ${input.predmetSpora}`
    : input.scenarij === 'sutnja_nije_zaprimljeno' || input.scenarij === 'sutnja_naknadno_doneseno'
    ? 'radi šutnje uprave'
    : 'radi ocjene zakonitosti rješenja';

  const uvodTekst = `U vezi pokrenutog upravnog spora tužitelja ${input.tuzitelj}${opunomocenikDio}, protiv tuženika Ministarstva zaštite okoliša i zelene tranzicije, ${radiCega}, na temelju članka 48. Zakona o upravnim sporovima („Narodne novine“, broj: 36/24 i 39/26), daje se sljedeći:`;

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: uvodTekst, font, size: normalSize })],
      spacing: { line: lineSpacing, after: 280 },
    })
  );

  // 6. SREDIŠNJI NASLOV: O D G O V O R   N A   T U Ž B U
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'O D G O V O R   N A   T U Ž B U',
          font,
          size: 26, // 13pt
          bold: true,
        }),
      ],
      spacing: { before: 200, after: 280 },
    })
  );

  // 7. ODLOMCI OBRAZLOŽENJA
  const paragraphsText = generateDefaultScenarioText(input);
  for (const pText of paragraphsText) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: pText, font, size: normalSize })],
        spacing: { line: lineSpacing, after: 180 },
      })
    );
  }

  // 8. POZDRAV I POTPIS SLUŽBENE OSOBE
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: 'S poštovanjem,', font, size: normalSize })],
      spacing: { before: 240, after: 280 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: potpisnikFunkcija,
          font,
          size: normalSize,
          bold: true,
        }),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: potpisnikIme,
          font,
          size: normalSize,
        }),
      ],
      spacing: { after: 450 },
    })
  );

  // 9. DOSTAVNA NAREDBA (DOSTAVITI)
  const defaultPrilozi: string[] = [];
  if (input.scenarij === 'sutnja_naknadno_doneseno') {
    defaultPrilozi.push(
      `1. Naslovu – putem sustava e-Komunikacija (uz drugostupanjsko rješenje i presliku povratnice);`
    );
  } else if (input.scenarij === 'meritum_potvrda_rjesenja') {
    defaultPrilozi.push(`1. Naslovu – putem sustava e-Komunikacija (uz spis predmeta);`);
  } else {
    defaultPrilozi.push(`1. Naslovu – putem sustava e-Komunikacija;`);
  }
  defaultPrilozi.push(`2. Pismohrana – ovdje`);

  const dostavitiLista =
    input.dostavitiPopis && input.dostavitiPopis.length > 0
      ? input.dostavitiPopis
      : defaultPrilozi;

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: 'DOSTAVITI:',
          font,
          size: normalSize,
          bold: true,
        }),
      ],
      spacing: { before: 200, after: 80 },
    })
  );

  for (const item of dostavitiLista) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: item,
            font,
            size: normalSize,
          }),
        ],
        spacing: { after: 40 },
      })
    );
  }

  // Sastavljanje Word dokumenta
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 2.54 cm
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
