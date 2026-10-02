import { supabase } from '@/lib/supabase';
import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, embed } from 'ai';

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

    const lastUserMessage = messages[messages.length - 1];
    let queryText = '';
    if (lastUserMessage) {
      if (typeof lastUserMessage.content === 'string') {
        queryText = lastUserMessage.content;
      } else if (Array.isArray(lastUserMessage.parts)) {
        queryText = lastUserMessage.parts.map((p: any) => p.text || '').join(' ');
      }
    }

    let retrievedPracticeContext = 'Nema pronađene relevantne prakse za ovaj slučaj.';
    try {
      const embedValue = (queryText + '\n\n' + documentsContext).substring(0, 1000);
      const { embedding } = await embed({
        model: google.textEmbeddingModel('gemini-embedding-001'),
        value: embedValue,
      });

      const { data: praksa, error: rpcError } = await supabase
        .rpc('match_praksa', {
          query_embedding: embedding,
          match_threshold: 0.5,
          match_count: 5
        });

      if (rpcError) {
        console.error('Greška pri match_praksa RPC pozivu:', rpcError);
      } else if (praksa && praksa.length > 0) {
        retrievedPracticeContext = praksa.map((p: any) => `Kategorija: ${p.kategorija}\nNaslov: ${p.naslov}\nSadržaj: ${p.sadrzaj}\n`).join('\n---\n');
      }
    } catch (ragError) {
      console.error('RAG Error:', ragError);
    }

    const systemPrompt = `Ti si stručni pravni asistent za drugostupanjski upravni postupak. 
Evo teksta konkretnog predmeta (spisa) koji analiziraš:
<spis>
${documentsContext}
</spis>

A ovo su relevantni izvadci iz zakona i sudske prakse iz naše baze koji ti mogu pomoći u rješavanju ovog predmeta:
<praksa>
${retrievedPracticeContext}
</praksa>

Zadatak: Odgovori na korisnikov upit temeljem činjenica iz spisa, ali strogo primjenjujući pravna shvaćanja i zakone iz priložene baze prakse. U svom odgovoru obavezno citiraj (navedi klasu, broj presude ili članak zakona) iz baze prakse ako je relevantno. Ako korisnik pošalje upit 'Analiziraj', napravi detaljan sažetak spisa, izdvoji ključne pravne probleme i predloži smjer rješavanja.`;

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
