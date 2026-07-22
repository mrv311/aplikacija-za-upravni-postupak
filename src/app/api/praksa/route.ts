import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { google } from '@ai-sdk/google';
import { embed } from 'ai';

export async function POST(req: Request) {
  try {
    const { naslov, sadrzaj, kategorija } = await req.json();

    if (!naslov || !sadrzaj || !kategorija) {
      return NextResponse.json({ error: 'Nedostaju podaci (naslov, sadrzaj, kategorija).' }, { status: 400 });
    }

    // Generiranje vektora za sadrzaj
    const { embedding } = await embed({
      model: google.textEmbeddingModel('gemini-embedding-001'),
      value: sadrzaj,
    });

    // Spremanje u Supabase tablicu pravna_praksa
    const { error: dbError } = await supabase
      .from('pravna_praksa')
      .insert([{ 
        naslov, 
        sadrzaj, 
        kategorija, 
        embedding 
      }]);

    if (dbError) {
      console.error('Supabase Error:', dbError);
      return NextResponse.json({ error: 'Greška pri spremanju u bazu.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Uspješno dodano u bazu prakse.' });
  } catch (error: any) {
    console.error('API Praksa Error:', error);
    return NextResponse.json({ error: error.message || 'Greška pri obradi.' }, { status: 500 });
  }
}
