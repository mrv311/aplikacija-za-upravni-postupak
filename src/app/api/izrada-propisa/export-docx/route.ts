import { NextRequest, NextResponse } from 'next/server';
import {
  generateTablicaPrimjedbiDocx,
  generateDiffDocx,
  generateStressTestDocx,
  generateFactSheetDocx,
  generateNarrativeDeliverableDocx,
} from '@/lib/docx-izrada-propisa-generator';
import type {
  ArticleDiffItem,
  FactSheetData,
  PrimjedbaItem,
  StressTestReport,
} from '@/lib/izrada-propisa-types';

export const runtime = 'nodejs';

function safeSlug(name: string): string {
  return (name || 'dokument')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 70);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const kind = body?.kind as
      | 'tablica_primjedbi'
      | 'diff_redline'
      | 'diff_tablica_promjena'
      | 'stress_test'
      | 'obrazlozenje'
      | 'factsheet'
      | 'podloga_kabinet';

    const projectName = String(body?.projectName || 'Propis');
    const puniNazivAkta = String(body?.puniNazivAkta || projectName);
    const dateStamp = new Date().toISOString().slice(0, 10);

    let buffer: Buffer;
    let fileName: string;

    if (kind === 'tablica_primjedbi') {
      const items = (body?.items || []) as PrimjedbaItem[];
      buffer = await generateTablicaPrimjedbiDocx({
        puniNazivAkta,
        fazaPostupka: body?.fazaPostupka,
        includeClanakColumn: body?.includeClanakColumn ?? true,
        items,
      });
      fileName = `Tablica_primjedbi_${safeSlug(projectName)}_${dateStamp}.docx`;
    } else if (kind === 'diff_redline' || kind === 'diff_tablica_promjena') {
      const items = (body?.items || []) as ArticleDiffItem[];
      buffer = await generateDiffDocx({
        puniNazivAkta,
        versionALabel: String(body?.versionALabel || 'Verzija A'),
        versionBLabel: String(body?.versionBLabel || 'Verzija B'),
        mode: kind,
        onlyChanged: Boolean(body?.onlyChanged),
        items,
      });
      fileName =
        kind === 'diff_redline'
          ? `Usporedba_Redline_${safeSlug(projectName)}_${dateStamp}.docx`
          : `Tablica_promjena_${safeSlug(projectName)}_${dateStamp}.docx`;
    } else if (kind === 'stress_test') {
      const report = body?.report as StressTestReport;
      if (!report) {
        return NextResponse.json({ error: 'Nedostaje izvješće Stress-testa.' }, { status: 400 });
      }
      buffer = await generateStressTestDocx({ puniNazivAkta, report });
      fileName = `Stress_test_${safeSlug(projectName)}_${dateStamp}.docx`;
    } else if (kind === 'factsheet') {
      const data = body?.factSheetData as FactSheetData;
      if (!data) {
        return NextResponse.json({ error: 'Nedostaju podaci za FactSheet.' }, { status: 400 });
      }
      buffer = await generateFactSheetDocx(data);
      fileName = `FactSheet_${safeSlug(projectName)}_${dateStamp}.docx`;
    } else if (kind === 'obrazlozenje' || kind === 'podloga_kabinet') {
      const title =
        kind === 'obrazlozenje'
          ? 'OBRAZLOŽENJE'
          : `PODLOGA — ${puniNazivAkta}`;
      buffer = await generateNarrativeDeliverableDocx({
        title,
        subtitle: kind === 'obrazlozenje' ? puniNazivAkta : undefined,
        markdown: String(body?.markdown || ''),
      });
      fileName =
        kind === 'obrazlozenje'
          ? `Obrazlozenje_${safeSlug(projectName)}_${dateStamp}.docx`
          : `Podloga_kabinet_${safeSlug(projectName)}_${dateStamp}.docx`;
    } else {
      return NextResponse.json({ error: 'Nepoznata vrsta izvoza.' }, { status: 400 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err: any) {
    console.error('Export DOCX Izrada propisa error:', err);
    return NextResponse.json(
      { error: err?.message || 'Greška pri generiranju Word dokumenta.' },
      { status: 500 }
    );
  }
}
