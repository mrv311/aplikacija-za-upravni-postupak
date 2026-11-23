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
  formatZakoni,
  formatPraksa,
} from '@/lib/rag';
import {
  getPropisProject,
  listPropisDocuments,
  listPrimjedbe,
} from '@/lib/izrada-propisa-storage';
import {
  PROPIS_DOC_ROLE_MAP,
  type PropisDocument,
} from '@/lib/izrada-propisa-types';
import type {
  LegalUIMessage,
  PraksaFilterScope,
  RagSourcesPayload,
} from '@/lib/ai-types';

export const runtime = 'nodejs';

const VALID_SCOPES = new Set<PraksaFilterScope>(['sve', 'nuv', 'vd', 'sudska', 'upravna']);
const MAX_PROJECT_CONTEXT_CHARS = 135000;

function buildProjectDocumentsContext(docs: PropisDocument[]): {
  contextText: string;
  includedDocNames: string[];
  totalChars: number;
} {
  // Aktualni nacrt uvijek ide prvi, zatim uključeni dokumenti po prioritetu uloge
  const rolePriority: Record<PropisDocument['uloga'], number> = {
    aktualni_nacrt: 0,
    misljenje: 1,
    excel_tarife: 2,
    zapisnik: 3,
    popratni_akt: 4,
    prethodna_verzija: 5,
  };

  const activeDocs = docs
    .filter(
      (d) =>
        (d.uloga === 'aktualni_nacrt' || d.includeInAiContext) &&
        d.rawText &&
        d.rawText.trim().length > 0
    )
    .sort((a, b) => rolePriority[a.uloga] - rolePriority[b.uloga]);

  if (activeDocs.length === 0) {
    return {
      contextText: 'U projektu još nema učitanih ili u kontekst uključenih dokumenata s čitljivim tekstom.',
      includedDocNames: [],
      totalChars: 0,
    };
  }

  let usedChars = 0;
  const parts: string[] = [];
  const includedDocNames: string[] = [];

  for (const doc of activeDocs) {
    const remaining = MAX_PROJECT_CONTEXT_CHARS - usedChars;
    if (remaining < 600) break;

    const roleLabel = PROPIS_DOC_ROLE_MAP[doc.uloga]?.label || doc.uloga;
    const perDocCap = doc.uloga === 'aktualni_nacrt' ? 45000 : 22000;
    const allowed = Math.min(remaining, perDocCap);
    const body =
      doc.rawText.length > allowed
        ? `${doc.rawText.slice(0, allowed)}\n...[skraćeno radi opsega konteksta]`
        : doc.rawText;

    const header = [
      `=== [${roleLabel.toUpperCase()}] ${doc.prikazniNaziv}`,
      doc.posiljatelj ? `Pošiljatelj: ${doc.posiljatelj}` : null,
      doc.datumVerzije ? `Verzija/datum: ${doc.datumVerzije}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const block = `${header} ===\n${body}`;
    parts.push(block);
    includedDocNames.push(doc.prikazniNaziv);
    usedChars += block.length;
  }

  return {
    contextText: parts.join('\n\n'),
    includedDocNames,
    totalChars: usedChars,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      messages,
      projectId,
      modelPreference = 'flash',
      filterScope: rawScope = 'sve',
    } = body as {
      messages: LegalUIMessage[];
      projectId: string;
      modelPreference?: 'flash' | 'pro';
      filterScope?: PraksaFilterScope;
    };

    if (!projectId) {
      return Response.json({ error: 'Nedostaje ID projekta propisa.' }, { status: 400 });
    }

    const project = getPropisProject(projectId);
    if (!project) {
      return Response.json({ error: 'Projekt propisa nije pronađen.' }, { status: 404 });
    }

    const filterScope: PraksaFilterScope = VALID_SCOPES.has(rawScope) ? rawScope : 'sve';
    const aiModelName = modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';
    const modelMessages = await convertToModelMessages(messages);

    const docs = listPropisDocuments(projectId);
    const primjedbe = listPrimjedbe(projectId);
    const aktualniNacrt = docs.find((d) => d.uloga === 'aktualni_nacrt');
    const { contextText, includedDocNames } = buildProjectDocumentsContext(docs);

    const primjedbeSummary =
      primjedbe.length > 0
        ? primjedbe
            .slice(0, 60)
            .map(
              (p, i) =>
                `${i + 1}. [${p.clanakOznaka}] ${p.tijelo} (${p.status}): ${p.tekstPrimjedbe.slice(0, 280)}${
                  p.obrazlozenje ? ` -> Odgovor: ${p.obrazlozenje.slice(0, 220)}` : ''
                }`
            )
            .join('\n')
        : 'Tablica primjedbi još nema unesenih stavki.';

    // Hibridni RAG iz postojeće Baze prakse (~2.202 odluke) i Baze zakona
    const userQuery = buildRetrievalQuery(messages);
    const semanticQuery = [
      userQuery,
      `Propis u izradi: ${project.puniNazivAkta} (${project.vrstaAkta})`,
      `Matični propisi: ${project.maticniPropisi.join(', ')}`,
      aktualniNacrt ? `Izvadak nacrta:\n${aktualniNacrt.rawText.slice(0, 2200)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 5000);

    const extraTextForRefs = [
      project.maticniPropisi.join(', '),
      aktualniNacrt?.rawText.slice(0, 22000) || '',
      contextText.slice(0, 12000),
    ].join('\n');

    let zakoni: RagSourcesPayload['zakoni'] = [];
    let praksa: RagSourcesPayload['praksa'] = [];
    let extractedKeywords: string[] = [];
    let totalPraksaCount = 0;

    try {
      const ragRes = await searchKnowledge(semanticQuery, {
        zakoniCount: 10,
        praksaCount: 8,
        extraTextForRefs,
        filterScope,
        napomena: `${project.puniNazivAkta} | ${project.maticniPropisi.join(', ')}`,
        casePodrucje: project.pravnoPodrucje || 'NUV',
        preferAdvisorDecisions: false,
      });
      zakoni = ragRes.zakoni;
      praksa = ragRes.praksa;
      extractedKeywords = ragRes.extractedKeywords;
      totalPraksaCount = ragRes.dostupnaPraksa.length;
    } catch (ragErr) {
      console.error('RAG greška u Izradi propisa:', ragErr);
    }

    const systemPrompt = `Ti si iskusni viši stručni savjetnik i nomotehničar u Ministarstvu zaštite okoliša i zelene tranzicije RH, član Povjerenstva za izradu nacrta propisa.
Pomažeš pri izradi, pravnom usklađivanju, analizi mišljenja TDU-a/UZZ-a/dionika i provedbenoj provjeri nacrta propisa prema hrvatskom pravnom sustavu i Jedinstvenim metodološko-nomotehničkim pravilima (JMNP, NN 74/15).

PODACI O PROJEKTU PROPISA:
- Projekt: ${project.naziv}
- Puni naziv akta: ${project.puniNazivAkta}
- Vrsta akta: ${project.vrstaAkta} | Faza: ${project.fazaPostupka}
- Stručni nositelj: ${project.strucniNositelj}
- Matični i srodni propisi: ${project.maticniPropisi.join(', ')}
${project.klasa ? `- KLASA: ${project.klasa}` : ''}${project.urbroj ? ` | URBROJ: ${project.urbroj}` : ''}
- Aktivni dokumenti projekta u kontekstu (${includedDocNames.length}): ${includedDocNames.join(', ') || 'nema'}
- Aktivna baza znanja: ${totalPraksaCount || '2.200+'} odluka u Bazi prakse (filtar: ${filterScope}) + Baza važećih zakona RH.

DOKUMENTI PROJEKTA (NACRT, MIŠLJENJA, TARIFE, ZAPISNICI, POPRATNI AKTI):
<projekt_dokumenti>
${contextText}
</projekt_dokumenti>

STRUKTURIRANA TABLICA PRIMJEDBI PROJEKTA (${primjedbe.length} stavki):
<tablica_primjedbi>
${primjedbeSummary}
</tablica_primjedbi>

MJERODAVNI ČLANCI VAŽEĆIH PROPISA IZ BAZE ZAKONA:
<zakoni>
${formatZakoni(zakoni)}
</zakoni>

RELEVANTNE ODLUKE IZ BAZE UPRAVNE I SUDSKE PRAKSE:
<praksa>
${formatPraksa(praksa)}
</praksa>

PRAVILA RADA I NOMOTEHNIČKI STANDARDI:
1. TOČNOST I IZVORI: Pozivaj se isključivo na stvarni tekst dokumenata iz <projekt_dokumenti>, važeće članke iz <zakoni> i stvarne odluke iz <praksa>. Ne izmišljaj članke, tarife ni poslovne brojeve presuda.
2. NOMOTEHNIKA (JMNP, NN 74/15): Kad predlažeš izmjene članaka, pazi na jasne, nedvosmislene normativne rečenice bez zagrada u normativnom dijelu, ispravno označavanje stavaka (1), (2), podstavaka, precizna unutarnja upućivanja i strogo poštivanje granica zakonskog ovlaštenja (npr. čl. 17.–20. ZFVG-a).
3. PROVEDBENA PROVJERA KROZ PRAKSU: Kad analiziraš rizik pojedinog članka, obavezno ga poveži sa stvarnim žalbenim razlozima i presudama upravnih sudova iz <praksa> (navodeći naziv odluke iz baze), kako bi se u samom nacrtu spriječile buduće nejasnoće i poništenja u upravnom sporu.
4. PRECIZNO BROJČANO IZVJEŠTAVANJE: Kad su uključene Excel tarife, koristi točne brojeve (EUR/m², ha, % povećanja, prihode) iz tablica bez zaokruživanja koje mijenja smisao.
5. FORMATIRANJE: Piši pregledno u Markdownu s jasnim podnaslovima (\`###\`), tablicama gdje je korisno i istaknutim prijedlozima preformulacija u blockquote blokovima (\`>\`). Ne spominji interne XML oznake.`;

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
  } catch (err: any) {
    console.error('API Izrada propisa Chat error:', err);
    return Response.json(
      { error: err?.message || 'Greška pri komunikaciji s AI asistentom.' },
      { status: 500 }
    );
  }
}
