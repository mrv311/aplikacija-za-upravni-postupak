import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { google } from '@ai-sdk/google';
import { generateText, embed } from 'ai';

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

    // 2. Ekstrakcija ključnih riječi / sažetka za vektor pretragu
    const { text: sazetak } = await generateText({
      model: google('gemini-flash-latest'),
      system: 'Izvuci ključne pravne koncepte i sažetak iz ovog teksta u obliku nekoliko rečenica.',
      prompt: dokument.raw_text.substring(0, 5000), // Ograničavamo zbog brzine
    });

    // 3. Generiranje embeddinga sažetka
    const { embedding } = await embed({
      model: google.textEmbeddingModel('gemini-embedding-001'),
      value: sazetak || dokument.raw_text.substring(0, 1000),
    });

    // 4. Pretraživanje vektorske baze (RAG)
    const { data: praksa, error: rpcError } = await supabase
      .rpc('match_praksa', {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 3
      });

    if (rpcError) {
      console.error('Greška pri match_praksa RPC pozivu:', rpcError);
      // Nastavljamo bez prakse ako RAG fejla da ne srušimo cijelu analizu
    }

    let praksaKontekst = '';
    if (praksa && praksa.length > 0) {
      praksaKontekst = praksa.map((p: any) => `Kategorija: ${p.kategorija}\nNaslov: ${p.naslov}\nSadržaj: ${p.sadrzaj}\n`).join('\n---\n');
    } else {
      praksaKontekst = 'Nema pronađene relevantne prakse za ovaj slučaj.';
    }

    // 5. Finalna analiza s proširenim kontekstom
    const finalPrompt = `Ti si viši upravni savjetnik. 
Ovo je tekst nove žalbe:
${dokument.raw_text}

Prilikom rješavanja, OBAVEZNO uzmi u obzir ovu relevantnu pravnu praksu i zakone:
${praksaKontekst}

Napiši analizu i predloži smjer rješavanja baziran na toj praksi.`;

    const { text: finalAnalysis } = await generateText({
      model: google('gemini-flash-latest'),
      prompt: finalPrompt
    });

    return NextResponse.json({ analysis: finalAnalysis });
  } catch (error: any) {
    console.error('API Analyze Error:', error);
    return NextResponse.json({ error: error.message || 'Greška pri obradi.' }, { status: 500 });
  }
}
