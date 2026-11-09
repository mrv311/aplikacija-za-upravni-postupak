import { NextResponse } from 'next/server';
import { confirmPublishSudskaOdlukaAction } from '@/app/actions/praksaActions';

export async function POST(req: Request) {
  try {
    const { naslov, sadrzaj } = await req.json();

    if (!naslov || !sadrzaj) {
      return NextResponse.json({ error: 'Nedostaju podaci (naslov, sadrzaj).' }, { status: 400 });
    }

    const res = await confirmPublishSudskaOdlukaAction({
      nazivDatoteke: naslov,
      anonymizedText: sadrzaj,
    });

    if (res.error) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Uspješno dodano u bazu prakse.',
      chunkCount: res.chunkCount,
      nazivDatoteke: res.nazivDatoteke,
    });
  } catch (error: any) {
    console.error('API Praksa Error:', error);
    return NextResponse.json({ error: error.message || 'Greška pri obradi.' }, { status: 500 });
  }
}
