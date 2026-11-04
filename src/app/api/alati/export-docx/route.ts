import { NextRequest, NextResponse } from 'next/server';
import { generateDocxBuffer, SlužbeniAktData } from '@/lib/docx-generator';

export async function POST(req: NextRequest) {
  try {
    const data: SlužbeniAktData = await req.json();

    if (!data.rawFullActText && (!data.predmet || !data.izreka)) {
      return NextResponse.json({ error: 'Nedostaju obvezna polja (predmet, izreka)' }, { status: 400 });
    }

    const buffer = await generateDocxBuffer(data);

    const filename = `${data.vrsta.toUpperCase()}_${data.klasa.replace(/[/\\?%*:|"<>]/g, '_') || 'akt'}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err: any) {
    console.error('Greška pri izvozu docx:', err);
    return NextResponse.json({ error: err.message || 'Greška pri generiranju Word dokumenta' }, { status: 500 });
  }
}
