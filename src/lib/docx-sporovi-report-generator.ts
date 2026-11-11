import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  Packer,
} from 'docx';
import type { UpravniSpor } from '@/lib/upravni-sporovi';
import type { SporoviReportMetrics } from '@/lib/report-sporovi-utils';

export interface SporoviReportDocxInput {
  periodLabel: string;
  metrics: SporoviReportMetrics;
  sporovi: UpravniSpor[];
  aiNarrative?: string | null;
  autorIme?: string;
  autorFunkcija?: string;
}

export async function generateSporoviReportDocxBuffer(
  input: SporoviReportDocxInput
): Promise<Buffer> {
  const font = 'Times New Roman';
  const normalSize = 22; // 11pt
  const smallSize = 18; // 9pt
  const titleSize = 28; // 14pt
  const subtitleSize = 22; // 11pt
  const lineSpacing = 276; // 1.15 line spacing

  const autorIme = input.autorIme || 'Dino Malbaša, dipl. iur.';
  const autorFunkcija = input.autorFunkcija || 'Viši upravni savjetnik';

  const formatEur = (val: number) =>
    val.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  const todayStr = new Date().toLocaleDateString('hr-HR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const children: Array<Paragraph | Table> = [];

  // ============================================================
  // 1. SLUŽBENO ZAGLAVLJE MINISTARSTVA
  // ============================================================
  const headerLines = [
    'REPUBLIKA HRVATSKA',
    'MINISTARSTVO ZAŠTITE OKOLIŠA I ZELENE TRANZICIJE',
    'Uprava za vodno gospodarstvo i zaštitu mora',
    'Služba za upravne postupke i upravne sporove',
    'KLASA: 035-01/26-01/01',
    'URBROJ: 517-05-2-26-1',
    `Zagreb, ${todayStr}`,
  ];

  for (let i = 0; i < headerLines.length; i++) {
    const isMain = i < 2;
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: headerLines[i],
            font,
            size: isMain ? 22 : 18,
            bold: isMain,
          }),
        ],
        spacing: { after: i === headerLines.length - 1 ? 300 : 40 },
      })
    );
  }

  // ============================================================
  // 2. NASLOV DOKUMENTA
  // ============================================================
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'I Z V J E Š Ć E',
          font,
          size: titleSize,
          bold: true,
        }),
      ],
      spacing: { before: 180, after: 60 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'O STANJU UPRAVNIH SPOROVA I SUDSKIM TROŠKOVIMA',
          font,
          size: 24, // 12pt
          bold: true,
        }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Promatrano razdoblje: ${input.periodLabel}`,
          font,
          size: subtitleSize,
          italics: true,
        }),
      ],
      spacing: { after: 360 },
    })
  );

  // ============================================================
  // 3. AI ANALITIČKI SAŽETAK (AKO POSTOJI)
  // ============================================================
  if (input.aiNarrative && input.aiNarrative.trim().length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: 'I. ANALITIČKI SAŽETAK I NALAZ SLUŽBE',
            font,
            size: 24,
            bold: true,
          }),
        ],
        spacing: { before: 240, after: 160 },
      })
    );

    const narrativeBlocks = input.aiNarrative.split('\n');
    for (const rawLine of narrativeBlocks) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('###') || line.startsWith('##')) {
        const cleanTitle = line.replace(/^#+\s*/, '');
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: cleanTitle,
                font,
                size: 22,
                bold: true,
              }),
            ],
            spacing: { before: 180, after: 80 },
          })
        );
      } else if (line.startsWith('*') || line.startsWith('-')) {
        const cleanItem = line.replace(/^[\*\-]\s*/, '');
        children.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: cleanItem,
                font,
                size: normalSize,
              }),
            ],
            spacing: { line: lineSpacing, after: 60 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
              new TextRun({
                text: line,
                font,
                size: normalSize,
              }),
            ],
            spacing: { line: lineSpacing, after: 140 },
          })
        );
      }
    }
  }

  // ============================================================
  // 4. KLJUČNI STATISTIČKI POKAZATELJI (TABLICA KPI)
  // ============================================================
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: input.aiNarrative
            ? 'II. KLJUČNI STATISTIČKI I FINANCIJSKI POKAZATELJI'
            : 'I. KLJUČNI STATISTIČKI I FINANCIJSKI POKAZATELJI',
          font,
          size: 24,
          bold: true,
        }),
      ],
      spacing: { before: 300, after: 160 },
    })
  );

  const kpiData = [
    ['Ukupan broj sporova u evidenciji', `${input.metrics.ukupno}`],
    ['Aktivni sporovi u tijeku pred upravnim sudovima', `${input.metrics.uTijeku}`],
    ['Pravomoćno okončani sporovi', `${input.metrics.rijeseno} (${input.metrics.stopaRijesenosti}%)`],
    ['Redovni upravni sporovi (ocjena zakonitosti akta)', `${input.metrics.redovniSporovi}`],
    ['Sporovi zbog šutnje uprave (čl. 24. ZUS)', `${input.metrics.sutnjaUprave}`],
    ['Podneseni odgovori na tužbu pred sudovima', `${input.metrics.odgovoreno} (${input.metrics.stopaOdgovoreno}%)`],
    ['Potvrđena rješenja Ministarstva (odbijena/odbačena tužba)', `${input.metrics.ishodi.odbijeno}`],
    ['Poništena rješenja (uvažene tužbe tužitelja)', `${input.metrics.ishodi.uvazeno}`],
    ['Obustavljeni postupci (naknadno doneseno rješenje - čl. 24. st. 3. ZUS)', `${input.metrics.ishodi.obustavljeno}`],
    ['STOPA USPJEŠNOSTI MINISTARSTVA NA SUDU', `${input.metrics.ishodi.stopaUspjehaMinistarstva}%`],
    ['UKUPNO DOSUĐENI TROŠKOVI NA TERET MINISTARSTVA', formatEur(input.metrics.financije.ukupnoDosudenoEur)],
    ['Podmireni troškovi (plaćeno / nalog računovodstvu)', formatEur(input.metrics.financije.placenoEur)],
    ['NEPODMIRENI TROŠKOVI (ČEKA NALOG ZA PLAĆANJE)', formatEur(input.metrics.financije.neplacenoEur)],
    ['Broj hitnih predmeta s dospjelim/paritetnim rokom', `${input.metrics.financije.hitniRokovi.length}`],
  ];

  const kpiRows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          shading: { fill: 'E2E8F0' },
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Pokazatelj / Kategorija', font, size: smallSize, bold: true })],
              spacing: { before: 60, after: 60 },
            }),
          ],
        }),
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          shading: { fill: 'E2E8F0' },
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: 'Vrijednost', font, size: smallSize, bold: true })],
              spacing: { before: 60, after: 60 },
            }),
          ],
        }),
      ],
    }),
    ...kpiData.map((row, idx) => {
      const isBold =
        row[0].includes('STOPA USPJEŠNOSTI') ||
        row[0].includes('UKUPNO DOSUĐENI') ||
        row[0].includes('NEPODMIRENI TROŠKOVI');
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            shading: idx % 2 === 1 ? { fill: 'F8FAFC' } : undefined,
            children: [
              new Paragraph({
                children: [new TextRun({ text: row[0], font, size: smallSize, bold: isBold })],
                spacing: { before: 40, after: 40 },
              }),
            ],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: idx % 2 === 1 ? { fill: 'F8FAFC' } : undefined,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: row[1], font, size: smallSize, bold: isBold })],
                spacing: { before: 40, after: 40 },
              }),
            ],
          }),
        ],
      });
    }),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: kpiRows,
    })
  );

  // ============================================================
  // 5. RAŠČLAMBA PO UPRAVNIM SUDOVIMA
  // ============================================================
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: input.aiNarrative
            ? 'III. STATISTIČKA RAŠČLAMBA PO UPRAVNIM SUDOVIMA'
            : 'II. STATISTIČKA RAŠČLAMBA PO UPRAVNIM SUDOVIMA',
          font,
          size: 24,
          bold: true,
        }),
      ],
      spacing: { before: 300, after: 160 },
    })
  );

  const courtHeaders = [
    'Upravni sud',
    'Ukupno',
    'U radu',
    'Riješeno',
    'Potvrđeno',
    'Poništeno',
    'Uspjeh (%)',
    'Dosuđeni trošak (€)',
  ];

  const courtRows: TableRow[] = [
    new TableRow({
      children: courtHeaders.map((h, i) =>
        new TableCell({
          shading: { fill: 'E2E8F0' },
          children: [
            new Paragraph({
              alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
              children: [new TextRun({ text: h, font, size: 16, bold: true })],
              spacing: { before: 50, after: 50 },
            }),
          ],
        })
      ),
    }),
  ];

  for (const s of input.metrics.sudovi) {
    courtRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: s.sud, font, size: 16, bold: true })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${s.ukupno}`, font, size: 16 })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${s.uTijeku}`, font, size: 16 })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${s.rijeseno}`, font, size: 16 })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${s.odbijeno}`, font, size: 16 })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${s.uvazeno}`, font, size: 16 })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${s.stopaUspjeha}%`, font, size: 16, bold: true })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: formatEur(s.ukupnoTroskovaEur), font, size: 16 })],
                spacing: { before: 30, after: 30 },
              }),
            ],
          }),
        ],
      })
    );
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: courtRows,
    })
  );

  // ============================================================
  // 6. POPIS FILTRIRANIH SPOROVA
  // ============================================================
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: input.aiNarrative
            ? 'IV. POPIS UPRAVNIH SPOROVA I STANJE OBVEZA'
            : 'III. POPIS UPRAVNIH SPOROVA I STANJE OBVEZA',
          font,
          size: 24,
          bold: true,
        }),
      ],
      spacing: { before: 300, after: 160 },
    })
  );

  const disputeHeaders = [
    'Rbr.',
    'Posl. broj suda',
    'Sud',
    'Tužitelj',
    'Predmet',
    'Ishod / Status',
    'Dosuđeni trošak',
    'Status troška',
  ];

  const disputeRows: TableRow[] = [
    new TableRow({
      children: disputeHeaders.map((h, i) =>
        new TableCell({
          shading: { fill: 'E2E8F0' },
          children: [
            new Paragraph({
              alignment: i === 0 ? AlignmentType.CENTER : i === 6 ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: h, font, size: 15, bold: true })],
              spacing: { before: 40, after: 40 },
            }),
          ],
        })
      ),
    }),
  ];

  const sampleSporovi = input.sporovi.slice(0, 100);
  for (let idx = 0; idx < sampleSporovi.length; idx++) {
    const s = sampleSporovi[idx];
    const trosakStatus =
      s.troskoviInfo?.status === 'poslan_nalog' ||
      s.troskoviInfo?.status === 'placeno' ||
      s.troskoviInfo?.bojaOznake === 'smedje'
        ? 'Plaćeno'
        : s.troskoviInfo?.status === 'neplaceno'
        ? 'Čeka nalog'
        : s.presudaTroskovi
        ? 'Dosuđeno'
        : '-';

    disputeRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${idx + 1}.`, font, size: 14 })],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: s.poslovniBroj || '-', font, size: 14, bold: true })],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: s.sud || '-', font, size: 14 })],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: (s.tuzitelj || '-').slice(0, 35), font, size: 14 })],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: (s.predmet || '-').slice(0, 30), font, size: 14 })],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: s.presudaTroskovi || (s.isPresudeno ? 'Presuđeno' : 'U radu'),
                    font,
                    size: 14,
                  }),
                ],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: s.troskoviInfo?.iznos || s.presudaTroskovi || '-',
                    font,
                    size: 14,
                    bold: !!s.troskoviInfo?.iznos,
                  }),
                ],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: trosakStatus, font, size: 14 })],
                spacing: { before: 20, after: 20 },
              }),
            ],
          }),
        ],
      })
    );
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: disputeRows,
    })
  );

  // ============================================================
  // 7. POTPISNI BLOK
  // ============================================================
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: 'S poštovanjem,', font, size: normalSize })],
      spacing: { before: 360, after: 180 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: autorFunkcija,
          font,
          size: normalSize,
          bold: true,
        }),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: autorIme,
          font,
          size: normalSize,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1418, // 2.5cm
              right: 1418,
              bottom: 1418,
              left: 1418,
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
