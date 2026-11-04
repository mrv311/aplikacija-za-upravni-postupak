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
  getFullPracticeTextByName,
} from '@/lib/rag';
import type { LegalUIMessage, PraksaFilterScope, RagSourcesPayload } from '@/lib/ai-types';
import {
  META_DOC_TYPE,
  CHAT_DOC_TYPE,
  SLUZBENICI_DOC_TYPE,
  decodeDocLabel,
  decodePredmetMetaUrl,
} from '@/lib/predmet-meta';
import {
  buildAuthenticAdvisorStructurePrompt,
  detectCompetentAdministrativeCourt,
} from '@/lib/advisor-blueprint';

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

      const { zakoni, praksa, dostupniZakoni, dostupnaPraksa, extractedKeywords } =
        await searchKnowledge(queryText, {
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
        extractedKeywords,
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
        .select('tip_dokumenta, storage_url, raw_text, id')
        .eq('predmet_id', predmetId),
    ]);

    if (dbError) {
      return Response.json({ error: 'Greška pri dohvaćanju dokumenata spisa.' }, { status: 500 });
    }

    const metaRow = (dokumenti || []).find((d: any) => d.tip_dokumenta === META_DOC_TYPE);
    const meta = metaRow ? decodePredmetMetaUrl(metaRow.storage_url) : {};
    const casePodrucje = meta.podrucje || 'NUV';
    const combinedNotes = [meta.napomena, meta.uputa_voditelja].filter(Boolean).join(' | ');

    const validDocs = (dokumenti || []).filter(
      (d: any) =>
        d.tip_dokumenta !== META_DOC_TYPE &&
        d.tip_dokumenta !== CHAT_DOC_TYPE &&
        d.tip_dokumenta !== SLUZBENICI_DOC_TYPE &&
        d.raw_text &&
        d.raw_text.trim().length > 0
    );

    const zalbaDoc = validDocs.find((d: any) => {
      const docMeta = decodeDocLabel(d.tip_dokumenta);
      const v = (docMeta.vrsta || '').toLowerCase();
      const n = (docMeta.izvorniNaziv || '').toLowerCase();
      const raw = (d.tip_dokumenta || '').toLowerCase();
      return v.includes('žalb') || n.includes('žalb') || raw.includes('žalb');
    });

    let documentsContext = '';
    if (validDocs.length > 0) {
      documentsContext = validDocs
        .map((doc: any, idx: number) => `=== DOKUMENT ${idx + 1}: ${doc.tip_dokumenta} ===\n${doc.raw_text}\n`)
        .join('\n');
    } else {
      documentsContext = 'U ovom predmetu još nema učitanih dokumenata s čitljivim tekstom.';
    }

    const predmetMetaText = predmet
      ? `KLASA: ${predmet.klasa || 'Nije upisana'} | URBROJ: ${predmet.urbroj || 'Nije upisan'} | STRANKA: ${predmet.stranka || 'Nije upisana'} | PODRUČJE: ${casePodrucje} | STATUS: ${predmet.status || '-'}${
          combinedNotes ? `\nNAPOMENA / UPUTA O PREDMETU: ${combinedNotes}` : ''
        }`
      : `Predmet ID: ${predmetId}`;

    const queryText = buildRetrievalQuery(messages);
    let zakoni: RagSourcesPayload['zakoni'] = [];
    let praksa: RagSourcesPayload['praksa'] = [];
    let extractedKeywords: string[] = [];
    let fullAdvisorBlueprintText = '';
    let fullAdvisorBlueprintTitle = '';

    try {
      const semanticQuery = buildCaseRetrievalQuery(queryText, validDocs, combinedNotes);
      const ragRes = await searchKnowledge(semanticQuery, {
        zakoniCount: 9,
        praksaCount: 8,
        extraTextForRefs: documentsContext.slice(0, 35000),
        filterScope,
        napomena: combinedNotes,
        casePodrucje,
        zalbaText: zalbaDoc?.raw_text || '',
        preferAdvisorDecisions: true,
      });
      zakoni = ragRes.zakoni;
      praksa = ragRes.praksa;
      extractedKeywords = ragRes.extractedKeywords;

      // Za potrebe izrade nacrta rješenja ili duboke usporedbe, dohvati CJELOVITI tekst
      // najsličnijeg drugostupanjskog rješenja savjetnika iz Baze prakse!
      const topAdvisorDecision = praksa.find((p) => p.vrsta === 'Drugostupanjsko rješenje');
      if (topAdvisorDecision) {
        fullAdvisorBlueprintTitle = topAdvisorDecision.naziv_datoteke;
        fullAdvisorBlueprintText = await getFullPracticeTextByName(topAdvisorDecision.naziv_datoteke);
      }
    } catch (ragError) {
      console.error('RAG Error u predmetu:', ragError);
    }

    const nadlezniSudHint = detectCompetentAdministrativeCourt(
      `${predmet?.stranka || ''}\n${documentsContext.slice(0, 2500)}`
    );
    const authenticStructurePrompt = buildAuthenticAdvisorStructurePrompt({
      citirajCijeluZalbu: true,
      nadlezniSudHint,
      podrucje: casePodrucje,
    });

    const systemPrompt = `Ti si iskusni viši upravni savjetnik / sektorski savjetnik za drugostupanjski upravni postupak u Republici Hrvatskoj (Ministarstvo zaštite okoliša i zelene tranzicije).
Pomažeš pri analizi spisa, usporedbi sa sličnim predmetima iz Baze prakse, ocjeni žalbenih navoda i izradi nacrta drugostupanjskih rješenja.

PODACI O PREDMETU:
${predmetMetaText}
${extractedKeywords.length > 0 ? `PREPOZNATE KLJUČNE RIJEČI PREDMETA: ${extractedKeywords.join(', ')}` : ''}

DOKUMENTI U SPISU:
<spis>
${documentsContext}
</spis>

MJERODAVNI ČLANCI ZAKONA I PODZAKONSKIH PROPISA IZ BAZE:
<zakoni>
${formatZakoni(zakoni)}
</zakoni>

PRONAĐENI SLIČNI PREDMETI I PRESUDE IZ BAZE PRAKSE (filtar: ${filterScope}):
<praksa>
${formatPraksa(praksa)}
</praksa>
${
  fullAdvisorBlueprintText
    ? `\nCJELOVITI OGLEDNI PRIMJER RJEŠENJA OVOG SAVJETNIKA IZ BAZE PRAKSE (${fullAdvisorBlueprintTitle}):\n<ogledno_rjesenje>\n${fullAdvisorBlueprintText.slice(
        0,
        7500
      )}\n</ogledno_rjesenje>\n`
    : ''
}

PRAVILA RADA I UPRAVNOG STILA:
1. AKTIVNO KORIŠTENJE BAZE PRAKSE: U <praksa> (i <ogledno_rjesenje>) nalaze se stvarna ranija drugostupanjska rješenja ovog savjetnika i presude upravnih sudova pronađene prema ključnim riječima ovog predmeta. Uvijek se osloni na njihovu pravnu argumentaciju i izričito navedi konkretne srodne odluke iz <praksa> pri analizi spisa!
2. ČINJENIČNA TOČNOST: Utvrđuj činjenice isključivo iz <spis>. Ako neki podatak nedostaje u tekstu spisa, označi ga uglatim zagradama npr. \`[provjeriti datum dostave]\`.
3. STROGA ZUP TERMINOLOGIJA: Upravno tijelo donosi **rješenje** ili **zaključak** (nikada "presudu"). Pojam **presuda** rabi isključivo za odluke upravnih sudova / VUSRH.
4. KADA KORISNIK TRAŽI ANALIZU ILI USPOREDBU S PRAKSOM: Piši pregledno koristeći Markdown podnaslove (\`###\`) i grafičke točke te za svaki žalbeni navod poveži odredbu iz <zakoni> i konkretno rješenje/presudu iz <praksa>.
5. KADA KORISNIK TRAŽI NACRT RJEŠENJA (ILI KLIKNE "PRIPREMI NACRT RJEŠENJA"):
   STROGO I BEZ IZNIMKE piši rješenje u višegodišnjoj autentičnoj strukturi ovog savjetnika navedenoj ispod i prema uzoru iz <ogledno_rjesenje> — kao ČISTI TEKST bez Markdown zvjezdica (**) i bez naslova s ljestvama (###), s doslovnim citatom žalbe u navodnim znakovima! Ne spominji interne XML oznake (\`<spis>\`, \`<zakoni>\`, \`<praksa>\`, \`<ogledno_rjesenje>\`).

${authenticStructurePrompt}`;

    const sourcesPayload: RagSourcesPayload = {
      zakoni,
      praksa,
      filterScope,
      modelName: aiModelName,
      extractedKeywords,
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
