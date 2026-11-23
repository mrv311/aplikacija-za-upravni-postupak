import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageOrientation,
  ShadingType,
  UnderlineType,
  VerticalAlign,
} from 'docx';
import type {
  ArticleDiffItem,
  FactSheetData,
  PrimjedbaItem,
  StressTestReport,
} from './izrada-propisa-types';

const FONT_NAME = 'Times New Roman';

const THIN_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
};

const CELL_MARGINS = {
  top: 90,
  bottom: 90,
  left: 120,
  right: 120,
};

function makeCellParagraphs(
  text: string,
  opts?: { bold?: boolean; color?: string; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }
): Paragraph[] {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) {
    return [
      new Paragraph({
        children: [new TextRun({ text: '—', font: FONT_NAME, size: opts?.size ?? 20, color: '64748B' })],
      }),
    ];
  }
  const blocks = clean.split(/\n{1,}/).filter((l) => l.trim().length > 0);
  return blocks.map(
    (line) =>
      new Paragraph({
        alignment: opts?.align ?? AlignmentType.LEFT,
        spacing: { after: 70, line: 240 },
        children: [
          new TextRun({
            text: line.trim(),
            font: FONT_NAME,
            size: opts?.size ?? 20,
            bold: opts?.bold,
            color: opts?.color || '000000',
          }),
        ],
      })
  );
}

function headerCell(text: string, widthPct: number, fill = '1E3A8A'): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
    verticalAlign: VerticalAlign.CENTER,
    margins: CELL_MARGINS,
    borders: THIN_BORDERS,
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            font: FONT_NAME,
            bold: true,
            size: 20,
            color: 'FFFFFF',
          }),
        ],
      }),
    ],
  });
}

function bodyCell(
  paragraphs: Paragraph[],
  widthPct: number,
  fill?: string
): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
    verticalAlign: VerticalAlign.TOP,
    margins: CELL_MARGINS,
    borders: THIN_BORDERS,
    children: paragraphs,
  });
}

function parseInlineRuns(line: string, size = 22): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*[^*]+\*\*)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(line)) !== null) {
    if (m.index > lastIdx) {
      runs.push(new TextRun({ text: line.slice(lastIdx, m.index), font: FONT_NAME, size }));
    }
    runs.push(
      new TextRun({
        text: m[1].slice(2, -2),
        font: FONT_NAME,
        size,
        bold: true,
      })
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < line.length) {
    runs.push(new TextRun({ text: line.slice(lastIdx), font: FONT_NAME, size }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text: line, font: FONT_NAME, size })];
}

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const paragraphs: Paragraph[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#{1,2}\s+/.test(line)) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: line.replace(/^#+\s+/, '').replace(/\*\*/g, ''),
              font: FONT_NAME,
              bold: true,
              size: 26,
              color: '0F172A',
            }),
          ],
        })
      );
      continue;
    }

    if (/^###\s+/.test(line)) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: line.replace(/^###\s+/, '').replace(/\*\*/g, ''),
              font: FONT_NAME,
              bold: true,
              size: 24,
              color: '1E3A8A',
            }),
          ],
        })
      );
      continue;
    }

    if (/^[-•*]\s+/.test(line)) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 90, line: 276 },
          children: parseInlineRuns(line.replace(/^[-•*]\s+/, ''), 22),
        })
      );
      continue;
    }

    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 140, line: 276 },
        children: parseInlineRuns(line, 22),
      })
    );
  }

  return paragraphs;
}

// ============================================================================
// 1. TABLICA PRIMJEDBI TDU-a / UZZ-a / DIONIKA (.docx — A4 Landscape)
// ============================================================================
export async function generateTablicaPrimjedbiDocx(params: {
  puniNazivAkta: string;
  fazaPostupka?: string;
  includeClanakColumn?: boolean;
  items: PrimjedbaItem[];
}): Promise<Buffer> {
  const includeClanak = params.includeClanakColumn ?? true;
  const today = new Date().toLocaleDateString('hr-HR');

  const headerRow = new TableRow({
    tableHeader: true,
    children: includeClanak
      ? [
          headerCell('TDU / DIONICI', 18),
          headerCell('Članak / Odredba', 12),
          headerCell('Primjedbe / Mišljenja', 31),
          headerCell('Prihvaćenost primjedbi', 13),
          headerCell('Obrazloženje', 26),
        ]
      : [
          headerCell('TDU / DIONICI', 20),
          headerCell('Primjedbe / Mišljenja', 35),
          headerCell('Prihvaćenost primjedbi', 15),
          headerCell('Obrazloženje', 30),
        ],
  });

  const dataRows = params.items.map((item) => {
    const statusColor =
      item.status === 'Prihvaća se'
        ? '15803D'
        : item.status === 'Ne prihvaća se'
        ? 'B91C1C'
        : item.status === 'Djelomično se prihvaća'
        ? 'B45309'
        : '1E40AF';

    const statusFill =
      item.status === 'Prihvaća se'
        ? 'F0FDF4'
        : item.status === 'Ne prihvaća se'
        ? 'FEF2F2'
        : item.status === 'Djelomično se prihvaća'
        ? 'FFFBEB'
        : 'F8FAFC';

    const obrFull = [
      item.obrazlozenje,
      item.predlozenaIzmjena ? `Prijedlog izmjene teksta: ${item.predlozenaIzmjena}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    return new TableRow({
      cantSplit: true,
      children: includeClanak
        ? [
            bodyCell(makeCellParagraphs(item.tijelo, { bold: true }), 18),
            bodyCell(makeCellParagraphs(item.clanakOznaka || 'Opće', { bold: true, color: '1E3A8A' }), 12),
            bodyCell(makeCellParagraphs(item.tekstPrimjedbe), 31),
            bodyCell(
              makeCellParagraphs(`${item.status}.`, { bold: true, color: statusColor }),
              13,
              statusFill
            ),
            bodyCell(makeCellParagraphs(obrFull), 26),
          ]
        : [
            bodyCell(makeCellParagraphs(item.tijelo, { bold: true }), 20),
            bodyCell(
              makeCellParagraphs(
                item.clanakOznaka && item.clanakOznaka !== 'Opće primjedbe'
                  ? `[${item.clanakOznaka}] ${item.tekstPrimjedbe}`
                  : item.tekstPrimjedbe
              ),
              35
            ),
            bodyCell(
              makeCellParagraphs(`${item.status}.`, { bold: true, color: statusColor }),
              15,
              statusFill
            ),
            bodyCell(makeCellParagraphs(obrFull), 30),
          ],
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, bottom: 850, left: 850, right: 850 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: 'Tablica sa zaprimljenim primjedbama/mišljenjima tijela državne uprave i ostalih dionika',
                font: FONT_NAME,
                bold: true,
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: `na ${params.puniNazivAkta}${params.fazaPostupka ? ` (${params.fazaPostupka})` : ''} — stanje na dan ${today}`,
                font: FONT_NAME,
                size: 22,
                color: '334155',
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ============================================================================
// 2. USPOREDBA VERZIJA PO ČLANCIMA — REDLINE & TABLICA PROMJENA (.docx)
// ============================================================================
export async function generateDiffDocx(params: {
  puniNazivAkta: string;
  versionALabel: string;
  versionBLabel: string;
  mode: 'diff_redline' | 'diff_tablica_promjena';
  onlyChanged?: boolean;
  items: ArticleDiffItem[];
}): Promise<Buffer> {
  const filtered = params.onlyChanged
    ? params.items.filter((i) => i.status !== 'nepromijenjeno')
    : params.items;

  if (params.mode === 'diff_tablica_promjena') {
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        headerCell('Dio / Članak propisa', 14),
        headerCell(`Prethodna verzija (${params.versionALabel})`, 30),
        headerCell(`Nova verzija (${params.versionBLabel})`, 30),
        headerCell('Obrazloženje promjene', 26),
      ],
    });

    const rows = filtered.map((item) => {
      const statusLabel =
        item.status === 'dodano'
          ? ' [DODANO]'
          : item.status === 'brisano'
          ? ' [BRISANO]'
          : item.status === 'izmijenjeno'
          ? ' [IZMIJENJENO]'
          : '';
      return new TableRow({
        cantSplit: true,
        children: [
          bodyCell(
            makeCellParagraphs(`${item.oznaka}${statusLabel}`, {
              bold: true,
              color: item.status === 'nepromijenjeno' ? '475569' : '1E3A8A',
            }),
            14
          ),
          bodyCell(makeCellParagraphs(item.oldText || '— (nije postojalo)'), 30),
          bodyCell(makeCellParagraphs(item.newText || '— (brisano)'), 30),
          bodyCell(
            makeCellParagraphs(
              item.aiObrazlozenje ||
                (item.status === 'nepromijenjeno'
                  ? 'Bez izmjena.'
                  : `Izmjena teksta (+${item.addedWords} / -${item.removedWords} riječi).`)
            ),
            26
          ),
        ],
      });
    });

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { orientation: PageOrientation.LANDSCAPE },
              margin: { top: 850, bottom: 850, left: 850, right: 850 },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: `TABLICA PROMJENA — ${params.puniNazivAkta.toUpperCase()}`,
                  font: FONT_NAME,
                  bold: true,
                  size: 26,
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: `Usporedba: „${params.versionALabel}”  →  „${params.versionBLabel}”`,
                  font: FONT_NAME,
                  size: 21,
                  color: '334155',
                }),
              ],
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [headerRow, ...rows],
            }),
          ],
        },
      ],
    });

    return Buffer.from(await Packer.toBuffer(doc));
  }

  // REDLINE PRIKAZ (A4 Portrait — crveno precrtano + zeleno podcrtano po člancima)
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `USPOREDNI PRIKAZ IZMJENA (REDLINE) — ${params.puniNazivAkta}`,
          font: FONT_NAME,
          bold: true,
          size: 26,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: 'Verzija A: ', font: FONT_NAME, bold: true, size: 20 }),
        new TextRun({ text: `${params.versionALabel}   |   `, font: FONT_NAME, size: 20 }),
        new TextRun({ text: 'Verzija B: ', font: FONT_NAME, bold: true, size: 20 }),
        new TextRun({ text: params.versionBLabel, font: FONT_NAME, size: 20 }),
      ],
    }),
  ];

  for (const item of filtered) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: `${item.oznaka}  `,
            font: FONT_NAME,
            bold: true,
            size: 24,
            color: '1E3A8A',
          }),
          new TextRun({
            text: `[${item.status.toUpperCase()}]`,
            font: FONT_NAME,
            bold: true,
            size: 18,
            color:
              item.status === 'dodano'
                ? '15803D'
                : item.status === 'brisano'
                ? 'B91C1C'
                : item.status === 'izmijenjeno'
                ? 'B45309'
                : '64748B',
          }),
        ],
      })
    );

    const runs: TextRun[] = [];
    for (const tok of item.tokens) {
      const pieces = tok.text.split('\n');
      pieces.forEach((piece, idx) => {
        if (piece) {
          runs.push(
            new TextRun({
              text: piece,
              font: FONT_NAME,
              size: 22,
              strike: tok.type === 'removed',
              underline: tok.type === 'added' ? { type: UnderlineType.SINGLE } : undefined,
              color:
                tok.type === 'removed'
                  ? 'B91C1C'
                  : tok.type === 'added'
                  ? '15803D'
                  : '0F172A',
              bold: tok.type === 'added',
            })
          );
        }
        if (idx < pieces.length - 1) {
          runs.push(new TextRun({ break: 1 }));
        }
      });
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 140, line: 276 },
        children: runs.length > 0 ? runs : [new TextRun({ text: '—', font: FONT_NAME, size: 22 })],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ============================================================================
// 3. STRESS-TEST IZVJEŠĆE (FAZA 3 — .docx)
// ============================================================================
export async function generateStressTestDocx(params: {
  puniNazivAkta: string;
  report: StressTestReport;
}): Promise<Buffer> {
  const { report } = params;
  const allFindings = [...report.localFindings, ...report.aiFindings];

  const axisLabel: Record<string, string> = {
    jmnp: 'Nomotehnika (JMNP)',
    zakonitost: 'Zakonitost (ZFVG / ZOV)',
    sudska_praksa: 'Sudska i upravna praksa',
    dosljednost: 'Unutarnja i tarifna dosljednost',
  };

  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('Os / Razina', 16),
        headerCell('Članak', 12),
        headerCell('Nalaz i pravna ocjena', 42),
        headerCell('Prijedlog preformulacije', 30),
      ],
    }),
    ...allFindings.map((f) => {
      const sevColor =
        f.severity === 'kriticno'
          ? 'B91C1C'
          : f.severity === 'upozorenje'
          ? 'B45309'
          : f.severity === 'ok'
          ? '15803D'
          : '1E40AF';
      const sevFill =
        f.severity === 'kriticno'
          ? 'FEF2F2'
          : f.severity === 'upozorenje'
          ? 'FFFBEB'
          : 'F8FAFC';

      const opisFull = [
        f.naslov,
        f.opis,
        f.pravnaOsnovaIliPraksa ? `Pravna osnova / praksa: ${f.pravnaOsnovaIliPraksa}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      return new TableRow({
        cantSplit: true,
        children: [
          bodyCell(
            makeCellParagraphs(
              `${axisLabel[f.axis] || f.axis}\n[${f.severity.toUpperCase()}]`,
              { bold: true, color: sevColor, size: 19 }
            ),
            16,
            sevFill
          ),
          bodyCell(makeCellParagraphs(f.clanak || 'Opće', { bold: true, size: 19 }), 12),
          bodyCell(makeCellParagraphs(opisFull, { size: 19 }), 42),
          bodyCell(makeCellParagraphs(f.prijedlogPreformulacije || '—', { size: 19 }), 30),
        ],
      });
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, bottom: 850, left: 850, right: 850 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: 'IZVJEŠĆE O PRAVNOM I NOMOTEHNIČKOM STRESS-TESTU',
                font: FONT_NAME,
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: `${params.puniNazivAkta} · Nacrt: ${report.draftDocName} · Ocjena: ${report.ukupnaOcjena}`,
                font: FONT_NAME,
                size: 21,
                color: '334155',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 200 },
            children: [
              new TextRun({ text: 'Sažetak revizije: ', font: FONT_NAME, bold: true, size: 22 }),
              new TextRun({ text: report.sazetak, font: FONT_NAME, size: 22 }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ============================================================================
// 4. FACTSHEET (FAZA 3 — točna 8-rubrična tablica Vlade RH)
// ============================================================================
export async function generateFactSheetDocx(data: FactSheetData): Promise<Buffer> {
  const pairs: Array<[string, string]> = [
    ['Zakonska osnova za donošenje:', data.zakonskaOsnova],
    ['Što je problem koji zahtijeva izradu novog ili promjenu važećeg normativnog uređenja?', data.problem],
    ['Što je cilj koji se namjerava postići?', data.cilj],
    [
      'Koje su pozitivne, a koje negativne posljedice odnosno učinci?',
      `Pozitivne posljedice: ${data.posljedicePozitivne}\n\nNegativne posljedice: ${data.posljediceNegativne}`,
    ],
    ['Koje se novine uvode predloženim zakonskim odnosno drugim rješenjem?', data.novine],
    ['Koji su financijski učinci za državu, za jedinice lokalne i područne samouprave i za građane?', data.financijskiUcinci],
    ['Koja su otvorena pitanja?', data.otvorenaPitanja],
    ['Koji je status i željeni hodogram?', data.statusIHodogram],
  ];

  const rows = pairs.map(
    ([q, a]) =>
      new TableRow({
        cantSplit: true,
        children: [
          bodyCell(makeCellParagraphs(q, { bold: true, size: 21 }), 32, 'F1F5F9'),
          bodyCell(makeCellParagraphs(a, { size: 21, align: AlignmentType.JUSTIFIED }), 68),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1050, bottom: 1050, left: 1050, right: 1050 } },
        },
        children: [
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: 'STRUČNI NOSITELJ: ', font: FONT_NAME, bold: true, size: 22 }),
              new TextRun({
                text: (data.strucniNositelj || 'MINISTARSTVO ZAŠTITE OKOLIŠA I ZELENE TRANZICIJE').toUpperCase(),
                font: FONT_NAME,
                bold: true,
                size: 22,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: 'NAZIV ZAKONSKOG PRIJEDLOGA ILI DRUGOG AKTA: ',
                font: FONT_NAME,
                bold: true,
                size: 22,
              }),
              new TextRun({ text: data.nazivAkta, font: FONT_NAME, size: 22 }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

// ============================================================================
// 5. OBRAZLOŽENJE & PODLOGA ZA KABINET (FAZA 3 — A4 Portrait)
// ============================================================================
export async function generateNarrativeDeliverableDocx(params: {
  title: string;
  subtitle?: string;
  markdown: string;
}): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: params.title.toUpperCase(),
          font: FONT_NAME,
          bold: true,
          size: 28,
        }),
      ],
    }),
  ];

  if (params.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: params.subtitle,
            font: FONT_NAME,
            size: 22,
            color: '334155',
          }),
        ],
      })
    );
  }

  children.push(...markdownToDocxParagraphs(params.markdown));

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
