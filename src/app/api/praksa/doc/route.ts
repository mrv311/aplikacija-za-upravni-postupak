import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { stitchChunks } from '@/lib/rag';
import { parsePraksaMetadata } from '@/lib/ai-types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const nazivDatoteke = searchParams.get('name');
    const zakon = searchParams.get('zakon');
    const clanak = searchParams.get('clanak');
    const dir = searchParams.get('dir'); // 'prev' | 'next' | null

    // 1. Dohvat punog teksta odluke iz tablice `praksa`
    if (nazivDatoteke) {
      const { data, error } = await supabase
        .from('praksa')
        .select('chunk_index, ukupno_chunkova, sadrzaj')
        .eq('naziv_datoteke', nazivDatoteke)
        .order('chunk_index', { ascending: true });

      if (error) {
        return NextResponse.json(
          { error: `Greška pri dohvaćanju odluke: ${error.message}` },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) {
        return NextResponse.json({ error: 'Odluka nije pronađena u bazi.' }, { status: 404 });
      }

      const chunks = data.map((row: any) => row.sadrzaj || '');
      const fullText = stitchChunks(chunks);
      const meta = parsePraksaMetadata(nazivDatoteke);

      return NextResponse.json({
        naziv_datoteke: nazivDatoteke,
        fullText,
        chunkCount: data.length,
        meta,
      });
    }

    // 2. Dohvat članka zakona (ili susjednog prethodnog/sljedećeg članka)
    if (zakon && clanak) {
      const numMatch = clanak.match(/(\d+)/);
      if (!numMatch) {
        return NextResponse.json({ error: 'Neispravan broj članka.' }, { status: 400 });
      }

      let targetNum = parseInt(numMatch[1], 10);
      if (dir === 'prev') targetNum = Math.max(1, targetNum - 1);
      if (dir === 'next') targetNum = targetNum + 1;

      const candidates = [`Članak ${targetNum}.`, `Članak ${targetNum}`];
      const { data, error } = await supabase
        .from('zakoni')
        .select('id, naziv_zakona, clanak_broj, tekst')
        .eq('naziv_zakona', zakon)
        .in('clanak_broj', candidates)
        .limit(1);

      if (error) {
        return NextResponse.json(
          { error: `Greška pri dohvaćanju članka: ${error.message}` },
          { status: 500 }
        );
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: `Članak ${targetNum}. u propisu "${zakon}" nije pronađen.` },
          { status: 404 }
        );
      }

      return NextResponse.json({ article: data[0] });
    }

    return NextResponse.json({ error: 'Nedostaju parametri upita.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Greška poslužitelja.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
