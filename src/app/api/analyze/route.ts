import { NextResponse } from 'next/server';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { google } from '@/lib/google';
import { generateText } from 'ai';
import { searchKnowledge, formatPraksa, formatZakoni } from '@/lib/rag';

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
      return NextResponse.json(
        { error: 'Dokument ne sadrži tekstualan sadržaj za analizu.' },
        { status: 400 }
      );
    }

    // 2. Hibridna pretraga propisa i baze prakse (ključne riječi + vektorsko rangiranje)
    const { zakoni, praksa } = await searchKnowledge(dokument.raw_text.substring(0, 6000), {
      zakoniCount: 8,
      praksaCount: 6,
      preferAdvisorDecisions: true,
    });

    const praksaKontekst = formatPraksa(praksa);
    const zakoniKontekst = formatZakoni(zakoni);

    // 3. Finalna analiza s proširenim kontekstom
    const finalPrompt = `Ti si viši upravni savjetnik. 
Ovo je tekst nove žalbe / akta:
${dokument.raw_text}

Prilikom rješavanja, OBAVEZNO uzmi u obzir ove relevantne propise i pravnu praksu:
=== PROPISI ===
${zakoniKontekst}

=== SUDSKA I UPRAVNA PRAKSA ===
${praksaKontekst}

Napiši analizu i predloži smjer rješavanja baziran na toj praksi i propisima.`;

    const { text: finalAnalysis } = await generateText({
      model: google('gemini-3.8-flash'),
      prompt: finalPrompt,
    });

    return NextResponse.json({ analysis: finalAnalysis });
  } catch (error: any) {
    console.error('API Analyze Error:', error);
    return NextResponse.json({ error: error.message || 'Greška pri obradi.' }, { status: 500 });
  }
}
