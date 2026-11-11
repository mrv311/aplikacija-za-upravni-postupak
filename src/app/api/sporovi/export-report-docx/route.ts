import { NextRequest, NextResponse } from 'next/server';
import {
  generateSporoviReportDocxBuffer,
  type SporoviReportDocxInput,
} from '@/lib/docx-sporovi-report-generator';

export async function POST(req: NextRequest) {
  try {
    const input: SporoviReportDocxInput = await req.json();

    if (!input.metrics || !input.sporovi) {
      return NextResponse.json(
        { error: 'Nedostaju podaci za generiranje izvješća o upravnim sporovima.' },
        { status: 400 }
      );
    }

    const buffer = await generateSporoviReportDocxBuffer(input);

    const safePeriod = (input.periodLabel || 'svi_sporovi')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Izvjesce_upravni_sporovi_${safePeriod}_${dateStr}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err: any) {
    console.error('Greška pri izvozu izvješća o upravnim sporovima (.docx):', err);
    return NextResponse.json(
      { error: err.message || 'Greška pri generiranju Word dokumenta izvješća.' },
      { status: 500 }
    );
  }
}
