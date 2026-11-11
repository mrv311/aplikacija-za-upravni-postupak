import { NextRequest, NextResponse } from 'next/server';
import {
  generateOdgovorNaTuzbuDocxBuffer,
  type OdgovorNaTuzbuInput,
} from '@/lib/docx-odgovor-generator';

export async function POST(req: NextRequest) {
  try {
    const input: OdgovorNaTuzbuInput = await req.json();

    if (!input.poslovniBrojSuda || !input.tuzitelj) {
      return NextResponse.json(
        { error: 'Nedostaju obvezni podaci: poslovni broj suda i tužitelj.' },
        { status: 400 }
      );
    }

    const buffer = await generateOdgovorNaTuzbuDocxBuffer(input);

    const safePoslovniBroj = (input.poslovniBrojSuda || 'spor')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_');
    const safeTuzitelj = (input.tuzitelj.split(/[\s,]/)[0] || 'stranka')
      .replace(/[/\\?%*:|"<>]/g, '_');

    const filename = `ODGOVOR_NA_TUZBU_${safePoslovniBroj}_${safeTuzitelj}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err: any) {
    console.error('Greška pri izvozu odgovora na tužbu (.docx):', err);
    return NextResponse.json(
      { error: err.message || 'Greška pri generiranju Word dokumenta.' },
      { status: 500 }
    );
  }
}
