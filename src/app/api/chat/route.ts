import { supabase } from '@/lib/supabase';
import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages } from 'ai';

export async function POST(req: Request) {
  try {
    const { messages, predmetId, modelPreference } = await req.json();

    if (!predmetId) {
      return new Response(JSON.stringify({ error: 'Nedostaje predmetId' }), { status: 400 });
    }

    const aiModelName = modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

    const { data: dokumenti, error: dbError } = await supabase
      .from('dokumenti')
      .select('tip_dokumenta, raw_text, id')
      .eq('predmet_id', predmetId);

    if (dbError) {
      return new Response(JSON.stringify({ error: 'Greška pri dohvaćanju dokumenata.' }), { status: 500 });
    }

    let documentsContext = '';
    if (dokumenti && dokumenti.length > 0) {
      documentsContext = dokumenti.map((doc: any) => `--- DOKUMENT: ${doc.tip_dokumenta} ---\n${doc.raw_text}\n`).join('\n');
    } else {
      documentsContext = 'Trenutno nema učitanih dokumenata u spisu.';
    }

    const systemPrompt = `Ti si stručni pravni asistent za drugostupanjski upravni postupak. Korisnik ti šalje cjelokupni spis koji se sastoji od više dokumenata. Tvoj zadatak je analizirati te dokumente u cjelini i precizno odgovarati na korisnikova pitanja temeljem tog spisa. Ako korisnik pošalje upit 'Analiziraj', napravi detaljan sažetak spisa, izdvoji ključne pravne probleme i predloži smjer rješavanja.

Sadržaj spisa (dokumenti):
${documentsContext}`;

    const result = streamText({
      model: google(aiModelName),
      messages: await convertToModelMessages(messages),
      system: systemPrompt,
    });

    return result.toUIMessageStreamResponse({
      onError: error => {
        const msg = error instanceof Error ? error.message : String(error);
        return msg;
      }
    });
  } catch (error: any) {
    console.error('API Chat Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Greška pri obradi.' }), { status: 500 });
  }
}
