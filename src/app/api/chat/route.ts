import { supabase } from '@/lib/supabase';
import { google } from '@/lib/google';
import { streamText, convertToModelMessages } from 'ai';
import { searchKnowledge, buildRetrievalQuery, formatZakoni, formatPraksa } from '@/lib/rag';

export async function POST(req: Request) {
  try {
    const { messages, predmetId, modelPreference } = await req.json();

    if (!predmetId) {
      // -------------------------------------------------------------
      // LOGIKA ZA GLOBALNOG AI SAVJETNIKA (Kad nema predmetId)
      // -------------------------------------------------------------
      const queryText = buildRetrievalQuery(messages);

      console.log('Initiating global Savjetnik RAG...');
      const { zakoni, praksa, dostupniZakoni, dostupnaPraksa } = await searchKnowledge(queryText);

      let availableKnowledgeText = 'Dostupni propisi u bazi:\n';
      availableKnowledgeText += dostupniZakoni.map((n) => `- ${n}`).join('\n') + '\n';
      if (dostupnaPraksa.length > 0) {
        availableKnowledgeText += '\nDostupna sudska praksa:\n' + dostupnaPraksa.map((n) => `- ${n}`).join('\n') + '\n';
      }

      const systemPrompt = `Ti si iskusan stručni savjetnik za upravno pravo Republike Hrvatske.

KAKO RADIŠ:
1. Odgovaraš na temelju članaka zakona i sudske prakse u <zakoni> i <praksa>. Ne izmišljaj sadržaj članaka.
2. POVEZUJ izvore: kad isječak prakse citira neki članak (npr. "članak 116. ZUP-a"), pronađi taj članak u <zakoni> i objasni kako ga je tijelo/sud primijenilo. Kad objašnjavaš članak zakona, navedi postoji li praksa koja ga primjenjuje.
3. Svaku tvrdnju potkrijepi citatom: "(čl. 2. st. 1. Zakona o općem upravnom postupku)" ili "(rješenje: naziv_datoteke)".
4. Članci označeni izvor="citirano u sudskoj praksi" dohvaćeni su jer ih praksa spominje – koristi ih kad su relevantni za pitanje, inače ih zanemari.
5. Ako se u kontekstu nalaze i nevažni isječci, zanemari ih bez komentiranja.
6. Samo ako u kontekstu zaista nema odgovora, reci to kratko i navedi što bi korisnik mogao preciznije pitati. Ne opisuj korisniku interne nazive poput "kontekst" ili "isječci".
7. Na pitanja o tome koji su propisi i praksa u bazi odgovori iz <sadrzaj_baze>.

Struktura odgovora (kad je primjereno): kratak odgovor → pravna osnova (citati članaka) → povezana praksa → praktična napomena.

<sadrzaj_baze>
${availableKnowledgeText}
</sadrzaj_baze>

<zakoni>
${formatZakoni(zakoni)}
</zakoni>

<praksa>
${formatPraksa(praksa)}
</praksa>`;

      const aiModelName = modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';
      console.log(`[Savjetnik] Starting stream with model ${aiModelName}...`);

      const result = streamText({
        model: google(aiModelName),
        messages: await convertToModelMessages(messages),
        system: systemPrompt,
      });

      return result.toUIMessageStreamResponse({
        onError: error => {
          console.error('AI SDK Stream Error (Savjetnik):', error);
          return error instanceof Error ? error.message : String(error);
        }
      });
    }

    // -------------------------------------------------------------
    // LOGIKA ZA AI PANEL (Analiza spisa - kada postoji predmetId)
    // -------------------------------------------------------------

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

    const queryText = buildRetrievalQuery(messages);

    let zakoniContext = 'Nema pronađenih relevantnih članaka zakona.';
    let retrievedPracticeContext = 'Nema pronađene relevantne prakse za ovaj slučaj.';
    try {
      const embedValue = (queryText + '\n\n' + documentsContext).substring(0, 2000);
      // Članci koje spominje sam spis (npr. žalba se poziva na čl. 116. ZUP-a) također se dohvaćaju
      const { zakoni, praksa } = await searchKnowledge(embedValue, {
        extraTextForRefs: documentsContext.substring(0, 20000),
      });
      if (zakoni.length > 0) zakoniContext = formatZakoni(zakoni);
      if (praksa.length > 0) retrievedPracticeContext = formatPraksa(praksa);
    } catch (ragError) {
      console.error('RAG Error:', ragError);
    }

    const systemPrompt = `Ti si stručni pravni asistent za drugostupanjski upravni postupak. 
Evo teksta konkretnog predmeta (spisa) koji analiziraš:
<spis>
${documentsContext}
</spis>

Relevantni članci zakona iz naše baze (uključujući članke koje spominju spis ili praksa):
<zakoni>
${zakoniContext}
</zakoni>

Relevantni izvadci iz sudske prakse iz naše baze:
<praksa>
${retrievedPracticeContext}
</praksa>

Zadatak: Odgovori na korisnikov upit temeljem činjenica iz spisa, strogo primjenjujući zakone i pravna shvaćanja iz priložene baze. Povezuj izvore: kad se spis ili praksa pozivaju na neki članak, pronađi ga u <zakoni> i objasni njegovu primjenu na konkretne činjenice. U odgovoru obavezno citiraj (članak zakona, naziv rješenja/presude) ako je relevantno. Ako korisnik pošalje upit 'Analiziraj', napravi detaljan sažetak spisa, izdvoji ključne pravne probleme i predloži smjer rješavanja.`;

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
