import { supabaseServer as supabase } from '@/lib/supabase-server';
import { google } from '@/lib/google';
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';
import {
  searchKnowledge,
  buildRetrievalQuery,
  buildCaseRetrievalQuery,
  formatZakoni,
  formatPraksa,
} from '@/lib/rag';
import type { LegalUIMessage, PraksaFilterScope, RagSourcesPayload } from '@/lib/ai-types';

const VALID_SCOPES = new Set<PraksaFilterScope>(['sve', 'nuv', 'vd', 'sudska', 'upravna']);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      predmetId,
      modelPreference = 'flash',
      filterScope: rawScope = 'sve',
    } = body as {
      messages: LegalUIMessage[];
      predmetId?: string;
      modelPreference?: 'flash' | 'pro';
      filterScope?: PraksaFilterScope;
    };

    const filterScope: PraksaFilterScope = VALID_SCOPES.has(rawScope) ? rawScope : 'sve';
    const aiModelName = modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';
    const modelMessages = await convertToModelMessages(messages);

    // =========================================================================
    // 1. GLOBALNI AI SAVJETNIK (nema predmetId)
    // =========================================================================
    if (!predmetId) {
      const queryText = buildRetrievalQuery(messages);

      const { zakoni, praksa, dostupniZakoni, dostupnaPraksa } = await searchKnowledge(queryText, {
        zakoniCount: 8,
        praksaCount: 6,
        filterScope,
      });

      let availableKnowledgeText = 'Dostupni propisi u bazi:\n';
      availableKnowledgeText += dostupniZakoni.map((n) => `- ${n}`).join('\n') + '\n';
      availableKnowledgeText += `\nBroj dostupnih odluka u praksi (aktivni filtar: ${filterScope}): ${dostupnaPraksa.length}\n`;
      if (dostupnaPraksa.length > 0) {
        availableKnowledgeText +=
          'Primjeri dostupnih odluka:\n' +
          dostupnaPraksa
            .slice(0, 40)
            .map((n) => `- ${n}`)
            .join('\n') +
          (dostupnaPraksa.length > 40 ? `\n... i još ${dostupnaPraksa.length - 40} odluka.` : '') +
          '\n';
      }

      const systemPrompt = `Ti si viši upravni savjetnik i stručnjak za upravno pravo Republike Hrvatske (posebice ZUP, ZUS, vodno gospodarstvo – naknadu za uređenje voda, vodni doprinos te srodne upravne postupke).

PRAVILA RADA I TERMINOLOGIJE:
1. Odgovaraj isključivo temeljem članaka propisa u <zakoni> i odluka u <praksa>. Ne izmišljaj članke, poslovne brojeve ni pravna shvaćanja koja nisu u izvorima.
2. STROGA PRAVNA TERMINOLOGIJA: U upravnom postupku tijela donose **rješenje** ili **zaključak** (nikada "presudu"). Izraz **presuda** koristi isključivo za odluke upravnih sudova i Visokog upravnog suda RH. Jasno razlikuj *odbacivanje žalbe* (čl. 114. ZUP-a – procesni nedostaci), *odbijanje žalbe* (čl. 116. ZUP-a – meritum) i *poništavanje/izmjenu rješenja* (čl. 117. ZUP-a).
3. POVEZIVANJE IZVORA: Kad odluka iz <praksa> citira određeni članak zakona, poveži ga s tekstom tog članka u <zakoni> i objasni kako se primjenjuje u upravnoj i sudskoj praksi.
4. PRECIZNO CITIRANJE: Svaku pravnu tvrdnju potkrijepi točnim citatom propisa (npr. *čl. 116. st. 1. Zakona o općem upravnom postupku*) te nazivom odluke iz baze (npr. *(Drugostupanjsko rješenje: [naziv])* ili *(Sudska presuda: [naziv])*). Ključne citate možeš istaknuti u Markdown blockquote (\`>\`).
5. FORMATIRANJE: Piši pregledno koristeći Markdown podnaslove (\`###\`), podebljane ključne pojmove (\`**...**\`) i grafičke oznake kako bi tekst bio čitljiv i spreman za kopiranje u službene akte.
6. Ne spominji korisniku interne XML oznake (\`<zakoni>\`, \`<praksa>\`, \`<sadrzaj_baze>\`). Ako u bazi nema izravnog odgovora na usko pitanje, jasno to napomeni i uputi koje propise/činjenice treba provjeriti.

<sadrzaj_baze>
${availableKnowledgeText}
</sadrzaj_baze>

<zakoni>
${formatZakoni(zakoni)}
</zakoni>

<praksa>
${formatPraksa(praksa)}
</praksa>`;

      const sourcesPayload: RagSourcesPayload = {
        zakoni,
        praksa,
        filterScope,
        modelName: aiModelName,
      };

      const stream = createUIMessageStream<LegalUIMessage>({
        execute: ({ writer }) => {
          writer.write({ type: 'start' });
          writer.write({
            type: 'data-sources',
            id: 'rag-sources',
            data: sourcesPayload,
          });

          const result = streamText({
            model: google(aiModelName),
            messages: modelMessages,
            system: systemPrompt,
          });

          writer.merge(
            toUIMessageStream({
              stream: result.stream,
              sendStart: false,
              sendReasoning: true,
              onError: (error) => (error instanceof Error ? error.message : String(error)),
            })
          );
        },
        onError: (error) => (error instanceof Error ? error.message : String(error)),
      });

      return createUIMessageStreamResponse({ stream });
    }

    // =========================================================================
    // 2. AI PANEL U KONKRETNOM PREDMETU (postoji predmetId)
    // =========================================================================
    const [{ data: predmet }, { data: dokumenti, error: dbError }] = await Promise.all([
      supabase
        .from('predmeti')
        .select('klasa, urbroj, stranka, status')
        .eq('id', predmetId)
        .maybeSingle(),
      supabase
        .from('dokumenti')
        .select('tip_dokumenta, raw_text, id')
        .eq('predmet_id', predmetId)
        .neq('tip_dokumenta', '__META__'),
    ]);

    if (dbError) {
      return Response.json({ error: 'Greška pri dohvaćanju dokumenata spisa.' }, { status: 500 });
    }

    const validDocs = (dokumenti || []).filter(
      (d: any) =>
        d.tip_dokumenta !== '__META__' &&
        d.tip_dokumenta !== '__CHAT__' &&
        d.raw_text &&
        d.raw_text.trim().length > 0
    );

    let documentsContext = '';
    if (validDocs.length > 0) {
      documentsContext = validDocs
        .map((doc: any, idx: number) => `=== DOKUMENT ${idx + 1}: ${doc.tip_dokumenta} ===\n${doc.raw_text}\n`)
        .join('\n');
    } else {
      documentsContext = 'U ovom predmetu još nema učitanih dokumenata s čitljivim tekstom.';
    }

    const predmetMetaText = predmet
      ? `KLASA: ${predmet.klasa || 'Nije upisana'} | URBROJ: ${predmet.urbroj || 'Nije upisan'} | STRANKA: ${predmet.stranka || 'Nije upisana'} | STATUS: ${predmet.status || '-'}`
      : `Predmet ID: ${predmetId}`;

    const queryText = buildRetrievalQuery(messages);
    let zakoni: RagSourcesPayload['zakoni'] = [];
    let praksa: RagSourcesPayload['praksa'] = [];

    try {
      const semanticQuery = buildCaseRetrievalQuery(queryText, validDocs);
      const ragRes = await searchKnowledge(semanticQuery, {
        zakoniCount: 9,
        praksaCount: 6,
        extraTextForRefs: documentsContext.slice(0, 35000),
        filterScope,
      });
      zakoni = ragRes.zakoni;
      praksa = ragRes.praksa;
    } catch (ragError) {
      console.error('RAG Error u predmetu:', ragError);
    }

    const systemPrompt = `Ti si iskusni viši upravni savjetnik za drugostupanjski upravni postupak u Republici Hrvatskoj.
Pomažeš službi za drugostupanjski postupak pri analizi spisa, ocjeni žalbenih navoda i izradi nacrta drugostupanjskih akata.

PODACI O PREDMETU:
${predmetMetaText}

DOKUMENTI U SPISU:
<spis>
${documentsContext}
</spis>

MJERODAVNI ČLANCI ZAKONA I PODZAKONSKIH PROPISA IZ BAZE:
<zakoni>
${formatZakoni(zakoni)}
</zakoni>

RELEVANTNA UPRAVNA I SUDSKA PRAKSA IZ BAZE (filtar: ${filterScope}):
<praksa>
${formatPraksa(praksa)}
</praksa>

PRAVILA RADA I HRVATSKOG UPRAVNOG STILA:
1. ČINJENIČNA TOČNOST: Utvrđuj činjenice isključivo iz <spis>. Ako neki bitan podatak (npr. datum dostave prvostupanjskog rješenja u dostavnici, potpis punomoćnika ili točan KLASA/URBROJ) nije vidljiv u učitanom tekstu, izričito upozori službenu osobu što treba provjeriti u spisu i na tom mjestu u nacrtu stavi oznaku u uglatim zagradama npr. \`[provjeriti datum dostave]\`.
2. STROGA ZUP TERMINOLOGIJA:
   - Upravno tijelo donosi **rješenje** ili **zaključak** (nikada "presudu"). Pojam **presuda** rabi samo za odluke upravnih sudova / Visokog upravnog suda RH.
   - Razlikuj: *odbacivanje žalbe* (čl. 114. ZUP-a – nepravodobna, nedopuštena ili izjavljena od neovlaštene osobe), *odbijanje žalbe* (čl. 116. ZUP-a – kad je rješenje zakonito i pravilno), *poništavanje/izmjenu prvostupanjskog rješenja* (čl. 117. ZUP-a).
3. SADRŽAJ OBRAZLOŽENJA (čl. 98. st. 5. i čl. 115.–117. ZUP-a): Drugostupanjsko tijelo u obrazloženju rješenja mora ocijeniti **sve žalbene navode stranke**. Pri izradi analize ili nacrta rješenja obradi svaki žalbeni prigovor pojedinačno i poveži ga s odredbom zakona iz <zakoni> te ranijim odlukama iz <praksa>.
4. CITIRANJE: Uvijek točno citiraj članak i naziv propisa te puni naziv korištene odluke iz <praksa> (razlikujući drugostupanjsko rješenje od sudske presude).
5. UREĐIVANJE TEKSTA: Koristi uredan Markdown (\`###\` podnaslove, podebljani tekst, numerirane ili grafičke točke i \`>\` za bitne citate) kako bi se tekst jednim klikom mogao prenijeti u Microsoft Word. Ne spominji XML oznake (\`<spis>\`, \`<zakoni>\`, \`<praksa>\`).`;

    const sourcesPayload: RagSourcesPayload = {
      zakoni,
      praksa,
      filterScope,
      modelName: aiModelName,
    };

    const stream = createUIMessageStream<LegalUIMessage>({
      execute: ({ writer }) => {
        writer.write({ type: 'start' });
        writer.write({
          type: 'data-sources',
          id: 'rag-sources',
          data: sourcesPayload,
        });

        const result = streamText({
          model: google(aiModelName),
          messages: modelMessages,
          system: systemPrompt,
        });

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            sendStart: false,
            sendReasoning: true,
            onError: (error) => (error instanceof Error ? error.message : String(error)),
          })
        );
      },
      onError: (error) => (error instanceof Error ? error.message : String(error)),
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error: any) {
    console.error('API Chat Error:', error);
    return Response.json({ error: error.message || 'Greška pri obradi.' }, { status: 500 });
  }
}
