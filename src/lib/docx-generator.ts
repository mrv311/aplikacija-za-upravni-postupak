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
}

export async function generateDocxBuffer(data: SlužbeniAktData): Promise<Buffer> {
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
