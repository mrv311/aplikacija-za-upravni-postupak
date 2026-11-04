import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';

export interface SlužbeniAktData {
  vrsta: 'rjesenje' | 'zakljucak' | 'poziv';
  nazivTijela: string;
  klasa: string;
  urbroj: string;
  mjesto: string;
  datum: string;
  stranka: string;
  predmet: string;
  pravniOsnov: string; // npr. članak 96. Zakona o općem upravnom postupku
  izreka: string; // Dispozitiv
  obrazlozenje: string;
  uputaOPravnomLijeku?: string;
  sluzbenaOsoba: string;
  funkcijaOsobe: string;
  dostaviti: string[];
  /**
   * Ako je proslijeđen već potpuno sastavljen autentični tekst akta (Uvod + RJEŠENJE + Obrazloženje + Uputa + Potpis + Dostaviti),
   * izvozi se izravno s autentičnim poravnanjima bez dodavanja dvostrukog zaglavlja ili generičke izreke.
   */
  rawFullActText?: string;
}

function buildParagraphsFromAuthenticActText(rawText: string): Paragraph[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n{2,}/);
  const paragraphs: Paragraph[] = [];
  let inDostaviti = false;

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;

    // Provjeri sadrži li blok više zasebnih strukturnih redaka (npr. potpis ili DOSTAVITI)
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);

    if (
      lines.length === 1 &&
      /^R\s*J\s*E\s*Š\s*E\s*N\s*J\s*E$/i.test(lines[0])
    ) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'R J E Š E N J E', bold: true, size: 28 })],
          spacing: { before: 280, after: 280 },
        })
      );
      continue;
    }

    if (
      lines.length === 1 &&
      /^O\s*b\s*r\s*a\s*z\s*l\s*o\s*ž\s*e\s*n\s*j\s*e$/i.test(lines[0])
    ) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'O b r a z l o ž e n j e', bold: false, size: 24 })],
          spacing: { before: 280, after: 240 },
        })
      );
      continue;
    }

    // Provjeri potpisni blok (SEKTORSKI SAVJETNIK / Dino Malbaša, dipl. iur.)
    if (
      lines.some((l) =>
        /SEKTORSKI SAVJETNIK|VIŠI UPRAVNI SAVJETNIK|Dino Malbaša|MINISTAR|DRŽAVNI TAJNIK/i.test(l)
      ) &&
      lines.length <= 4 &&
      !inDostaviti
    ) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: lines.map(
            (line, idx) =>
              new TextRun({
                text: idx < lines.length - 1 ? `${line}\n` : line,
                bold: idx === 0 && line === line.toUpperCase(),
              })
          ),
          spacing: { before: 360, after: 320 },
        })
      );
      continue;
    }

    // Provjeri DOSTAVITI blok
    if (/^DOSTAVITI:?/i.test(lines[0]) || inDostaviti) {
      inDostaviti = true;
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: lines.map((line, idx) => {
            const isHeader = /^DOSTAVITI:?$/i.test(line);
            return new TextRun({
              text: idx < lines.length - 1 ? `${line}\n` : line,
              bold: isHeader,
              size: 22,
            });
          }),
          spacing: { before: /^DOSTAVITI:?/i.test(lines[0]) ? 240 : 60, after: 120 },
        })
      );
      continue;
    }

    // UPUTA O PRAVNOM LIJEKU
    if (/^UPUTA O PRAVNOM LIJEKU:?/i.test(lines[0])) {
      if (lines.length > 1 && /^UPUTA O PRAVNOM LIJEKU:?$/i.test(lines[0])) {
        const rest = lines.slice(1).join(' ');
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({ text: `${lines[0]}\n`, bold: true }),
              new TextRun({ text: rest }),
            ],
            spacing: { before: 280, after: 240 },
          })
        );
      } else {
        const match = block.match(/^(UPUTA O PRAVNOM LIJEKU:?)\s*([\s\S]*)$/i);
        if (match) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              children: [
                new TextRun({ text: `${match[1]} `, bold: true }),
                new TextRun({ text: match[2].replace(/\n+/g, ' ').trim() }),
              ],
              spacing: { before: 280, after: 240 },
            })
          );
        }
      }
      continue;
    }

    // Standardni odlomak (uvod, točke izreke, odlomci obrazloženja)
    // Ako su u bloku numerirane točke izreke (1. ... \n 2. ...), zadrži prijelome redaka
    const hasNumberedLines =
      lines.length > 1 && lines.every((l) => /^\d+\.\s+/.test(l));

    if (hasNumberedLines) {
      for (const nl of lines) {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({ text: nl })],
            spacing: { after: 160 },
          })
        );
      }
    } else {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: lines.join(' ') })],
          spacing: { after: 180 },
        })
      );
    }
  }

  return paragraphs;
}

export async function generateDocxBuffer(data: SlužbeniAktData): Promise<Buffer> {
  if (data.rawFullActText && data.rawFullActText.trim().length > 0) {
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: 'Times New Roman',
              size: 24, // 12pt
              color: '000000',
            },
            paragraph: {
              spacing: {
                line: 276, // 1.15 prored
                after: 140,
              },
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: buildParagraphsFromAuthenticActText(data.rawFullActText),
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  const isRjesenje = data.vrsta === 'rjesenje';
  const isZakljucak = data.vrsta === 'zakljucak';
  const naslovDokumenta = isRjesenje ? 'R J E Š E N J E' : isZakljucak ? 'Z A K L J U Č A K' : 'P O Z I V';

  const defaultUputa = isRjesenje
    ? 'UPUTA O PRAVNOM LIJEKU:\nProtiv ovog rješenja može se izjaviti žalba nadležnom drugostupanjskom tijelu u roku od 15 dana od dana dostave rješenja. Žalba se predaje neposredno ili šalje poštom preporučeno ovom tijelu u dva istovjetna primjerka, uz naplatu propisane upravne pristojbe.'
    : isZakljucak
    ? 'UPUTA O PRAVNOM LIJEKU:\nProtiv ovog zaključka nije dopuštena posebna žalba, sukladno članku 67. stavku 4. Zakona o općem upravnom postupku. Zaključak se može pobijati žalbom protiv rješenja kojim se rješava o upravnoj stvari.'
    : 'U slučaju spriječenosti odazivu ovom pozivu, stranka je dužna pravodobno obavijestiti ovo tijelo o razlozima spriječenosti sukladno članku 73. Zakona o općem upravnom postupku.';

  const uputaTekst = data.uputaOPravnomLijeku || defaultUputa;

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: 24, // 12pt (docx uses half-points)
            color: '000000',
          },
          paragraph: {
            spacing: {
              line: 276, // 1.15 line spacing
              after: 120, // 6pt after
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch = 1440 twips (2.54 cm)
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          // 1. ZAGLAVLJE / MEMORANDUM (lijevo poravnato, službeno)
          new Paragraph({
            children: [
              new TextRun({ text: 'REPUBLIKA HRVATSKA\n', bold: true, size: 24 }),
              new TextRun({ text: `${data.nazivTijela}\n`, bold: true, size: 24 }),
              new TextRun({ text: `KLASA: ${data.klasa}\n` }),
              new TextRun({ text: `URBROJ: ${data.urbroj}\n` }),
              new TextRun({ text: `${data.mjesto}, ${data.datum}` }),
            ],
            spacing: { after: 300 },
          }),

          // 2. UVOD
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: `${data.nazivTijela}, po službenoj osobi ${data.sluzbenaOsoba}, na temelju ${data.pravniOsnov}, u upravnom postupku pokrenutom povodom predmeta: ${data.predmet}, u povodu zahtjeva stranke ${data.stranka}, donosi sljedeće:`,
              }),
            ],
            spacing: { after: 360 },
          }),

          // 3. NASLOV AKTA (RJEŠENJE / ZAKLJUČAK / POZIV)
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: naslovDokumenta,
                bold: true,
                size: 32, // 16pt
              }),
            ],
            spacing: { before: 200, after: 360 },
          }),

          // 4. IZREKA / DISPOZITIV
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: data.izreka,
                bold: true,
              }),
            ],
            spacing: { after: 400 },
          }),

          // 5. NASLOV: Obrazloženje
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'O b r a z l o ž e n j e',
                bold: true,
                size: 26,
              }),
            ],
            spacing: { before: 200, after: 240 },
          }),

          // 6. TEKST OBRAZLOŽENJA
          ...data.obrazlozenje.split('\n\n').map(
            (p) =>
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                children: [new TextRun({ text: p.trim() })],
                spacing: { after: 180 },
              })
          ),

          // 7. UPUTA O PRAVNOM LIJEKU
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: uputaTekst,
                italics: true,
                size: 22,
              }),
            ],
            spacing: { before: 300, after: 500 },
          }),

          // 8. POTPIS SLUŽBENE OSOBE (desno poravnat blok)
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `${data.funkcijaOsobe}\n`, bold: true }),
              new TextRun({ text: `${data.sluzbenaOsoba}, v. r.` }),
            ],
            spacing: { before: 300, after: 400 },
          }),

          // 9. DOSTAVITI (Dostavna naredba na dnu)
          new Paragraph({
            children: [
              new TextRun({ text: 'Dostaviti:\n', bold: true, size: 20 }),
              ...data.dostaviti.map((d, i) => new TextRun({ text: `${i + 1}. ${d}\n`, size: 20 })),
              new TextRun({ text: `${data.dostaviti.length + 1}. Pismohrana, ovdje`, size: 20 }),
            ],
            spacing: { before: 200 },
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
