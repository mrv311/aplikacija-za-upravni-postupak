import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export async function POST(req: Request) {
  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Nedostaje documentId' }, { status: 400 });
    }

    // 1. Dohvati raw_text iz Supabasea
    const { data: dokument, error: dbError } = await supabase
      .from('dokumenti')
      .select('raw_text')
      .eq('id', documentId)
      .single();

    if (dbError || !dokument) {
      return NextResponse.json({ error: 'Dokument nije pronađen u bazi.' }, { status: 404 });
    }

    if (!dokument.raw_text) {
      return NextResponse.json({ error: 'Dokument ne sadrži tekstualan sadržaj za analizu.' }, { status: 400 });
    }

    // 2. Poziv prema Gemini modelu
    const systemPrompt = "Ti si viši savjetnik u ministarstvu koji rješava drugostupanjske upravne postupke. Pročitaj priloženi tekst žalbe i ekstrahiraj ključne žalbene navode u jasne, koncizne natuknice. Zanemari formalni pozdravni tekst i fokusiraj se na pravnu argumentaciju.";

    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      system: systemPrompt,
      prompt: `Tekst žalbe:\n\n${dokument.raw_text}`
    });

    return NextResponse.json({ analysis: text });
  } catch (error: any) {
    console.error('API Analyze Error:', error);
    return NextResponse.json({ error: error.message || 'Greška pri obradi.' }, { status: 500 });
  }
}
