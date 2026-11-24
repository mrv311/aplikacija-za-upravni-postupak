'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { generateText } from 'ai';
import { google } from '@/lib/google';
import { supabaseServer as supabase } from '@/lib/supabase-server';
import { searchKnowledge, formatZakoni, formatPraksa } from '@/lib/rag';
import {
  getPropisProject,
  listPropisDocuments,
  listPrimjedbe,
  listStressTests,
  saveStressTests,
  listDeliverables,
  saveDeliverables,
} from '@/lib/izrada-propisa-storage';
import { runLocalStressChecks } from '@/lib/propis-stress-local';
import type {
  DeliverableRecord,
  DeliverableType,
  FactSheetData,
  StressTestAxis,
  StressTestFinding,
  StressTestReport,
  StressTestSeverity,
} from '@/lib/izrada-propisa-types';

function extractJsonObject<T = Record<string, any>>(raw: string): T {
  const cleaned = (raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as T;
}

const VALID_AXES = new Set<StressTestAxis>([
  'jmnp',
  'zakonitost',
  'sudska_praksa',
  'dosljednost',
]);
const VALID_SEVS = new Set<StressTestSeverity>([
  'kriticno',
  'upozorenje',
  'preporuka',
  'ok',
]);

const JMNP_LAW_NAME =
  'Jedinstvena metodološko-nomotehnička pravila za izradu akata koje donosi Hrvatski sabor';

/**
 * Dohvaća ključne matične članke (ZFVG čl. 17.–22., 69.–70.) izravno iz tablice `zakoni`.
 */
async function fetchCoreMandateLawArticles(): Promise<string> {
  try {
    const { data } = await supabase
      .from('zakoni')
      .select('naziv_zakona, clanak_broj, tekst')
      .eq('naziv_zakona', 'Zakon o financiranju vodnoga gospodarstva')
      .in('clanak_broj', [
        'Članak 16.',
        'Članak 17.',
        'Članak 18.',
        'Članak 19.',
        'Članak 20.',
        'Članak 21.',
        'Članak 22.',
        'Članak 69.',
        'Članak 70.',
      ]);

    if (!data || data.length === 0) return '';
    return data
      .map((r: any) => `[${r.naziv_zakona} — ${r.clanak_broj}]\n${r.tekst}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

/**
 * Dohvaća ključne odredbe JMNP-a (NN 74/15) izravno iz tablice `zakoni` kako bi AI Stress-test
 * i generatori citirali stvarni, važeći službeni tekst JMNP-a.
 */
async function fetchCoreJmnpArticles(): Promise<string> {
  try {
    const { data } = await supabase
      .from('zakoni')
      .select('clanak_broj, tekst')
      .eq('naziv_zakona', JMNP_LAW_NAME)
      .in('clanak_broj', [
        'Članak 5.',
        'Članak 6.',
        'Članak 7.',
        'Članak 10.',
        'Članak 12.',
        'Članak 17.',
        'Članak 20.',
        'Članak 21.',
        'Članak 29.',
        'Članak 31.',
        'Članak 32.',
        'Članak 37.',
        'Članak 39.',
        'Članak 41.',
        'Članak 43.',
        'Članak 44.',
      ]);

    if (!data || data.length === 0) return '';
    return data
      .map((r: any) => `[JMNP (NN 74/15) — ${r.clanak_broj}]\n${r.tekst}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

/**
 * FAZA 3 — Pokreće dvoslojni Pravni i nomotehnički Stress-test:
 *  - Sloj 1: Deterministička JMNP i dosljednosna provjera (0 AI troška)
 *  - Sloj 2: Dubinski AI Stress-test (JMNP NN 74/15 + ZFVG/ZOV + stvarna sudska i NUV praksa iz Baze prakse!)
 */
export async function runStressTestAction(params: {
  projectId: string;
  draftDocId?: string;
  modelPreference?: 'flash' | 'pro';
}) {
  const project = await getPropisProject(params.projectId);
  if (!project) return { error: 'Projekt nije pronađen.' };

  const [docs, primjedbe] = await Promise.all([
    listPropisDocuments(params.projectId),
    listPrimjedbe(params.projectId),
  ]);
  const draftDoc =
    (params.draftDocId ? docs.find((d) => d.id === params.draftDocId) : undefined) ||
    docs.find((d) => d.uloga === 'aktualni_nacrt') ||
    docs.find((d) => d.uloga === 'prethodna_verzija');

  if (!draftDoc || !draftDoc.rawText?.trim()) {
    return { error: 'Učitajte Aktualni nacrt propisa prije pokretanja Stress-testa.' };
  }

  const excelDocs = docs.filter((d) => d.uloga === 'excel_tarife');
  const localFindings = runLocalStressChecks(draftDoc, excelDocs);

  const aiModelName =
    params.modelPreference === 'flash' ? 'gemini-3.8-flash' : 'gemini-3.1-pro-preview';

  try {
    // Paralelno povuci: (a) ključne članke ZFVG-a, (b) ključne članke JMNP-a (NN 74/15), (c) RAG iz Baze prakse
    const [coreZfvgText, coreJmnpText, ragSudska, ragNuv] = await Promise.all([
      fetchCoreMandateLawArticles(),
      fetchCoreJmnpArticles(),
      searchKnowledge(
        `${project.puniNazivAkta} ruševina neupotrebljiv zabrana korištenja poslovni prostor u stanu nije u upotrebi građevinsko zemljište NKD temeljna djelatnost prijelazne odredbe`,
        {
          zakoniCount: 8,
          praksaCount: 6,
          extraTextForRefs: draftDoc.rawText.slice(0, 22000),
          filterScope: 'sudska',
          casePodrucje: project.pravnoPodrucje || 'NUV',
        }
      ),
      searchKnowledge(
        `${project.puniNazivAkta}\n${draftDoc.rawText.slice(0, 2500)}`,
        {
          zakoniCount: 6,
          praksaCount: 6,
          extraTextForRefs: draftDoc.rawText.slice(0, 22000),
          filterScope: 'nuv',
          casePodrucje: project.pravnoPodrucje || 'NUV',
        }
      ),
    ]);

    // Spoji i dedupliciraj pronađenu praksu i zakone
    const praksaMap = new Map<string, (typeof ragSudska.praksa)[number]>();
    for (const p of [...ragSudska.praksa, ...ragNuv.praksa]) {
      if (!praksaMap.has(p.naziv_datoteke)) praksaMap.set(p.naziv_datoteke, p);
    }
    const mergedPraksa = Array.from(praksaMap.values()).slice(0, 10);

    const zakoniMap = new Map<string, (typeof ragSudska.zakoni)[number]>();
    for (const z of [...ragSudska.zakoni, ...ragNuv.zakoni]) {
      const k = `${z.naziv_zakona}|${z.clanak_broj}`;
      if (!zakoniMap.has(k)) zakoniMap.set(k, z);
    }
    const mergedZakoni = Array.from(zakoniMap.values()).slice(0, 14);

    const excelSnippet = excelDocs
      .map((e) => `=== EXCEL TARIFE: ${e.prikazniNaziv} ===\n${e.rawText.slice(0, 8000)}`)
      .join('\n\n');

    const openPrimjedbeSnippet = primjedbe
      .filter((p) => p.status === 'Na razmatranju' || p.status === 'Ne prihvaća se')
      .slice(0, 20)
      .map((p) => `- [${p.clanakOznaka}] ${p.tijelo} (${p.status}): ${p.tekstPrimjedbe.slice(0, 240)}`)
      .join('\n');

    const systemPrompt = `Ti si vrhunski pravni revizor i nomotehničar Vlade RH (kombinacija Ureda za zakonodavstvo Vlade RH + suca Visokog upravnog suda RH).
Provodiš strogi, dubinski **Pravni i nomotehnički Stress-test** nacrta podzakonskog propisa prije upućivanja u UZZ, e-Savjetovanje i na sjednicu Vlade RH.

Moraš analizirati nacrt kroz točno 4 osi:
1. "jmnp" — Nomotehnika prema JMNP (NN 74/15) i predviđanje primjedbi Ureda za zakonodavstvo (UZZ): jasnoća normi, nejasni/nedefinirani pojmovi, zagrade, podstavci, prijelazne i završne odredbe, terminološka čistoća.
2. "zakonitost" — Usklađenost sa zakonskim ovlaštenjem (ZFVG, ZOV, ZUP, ZKG, OPZ): prelazi li uredba granice zakonskog ovlaštenja (npr. čl. 17.–20. ZFVG), je li nešto materija zakona/pravilnika umjesto uredbe, kolizije s važećim zakonima.
3. "sudska_praksa" — Provedbeni test kroz stvarnu sudsku i drugostupanjsku praksu iz priložene Baze prakse: koje odredbe nacrta će u primjeni izazvati masovne žalbe ili poništenja na upravnim sudovima / VUSRH (npr. dokazivanje "nije u upotrebi", "ruševno stanje / konačno rješenje", "izvan tlocrtne površine", NKD vs stvarna djelatnost, prijelazne odredbe za započete postupke). OBAVEZNO citiraj konkretne nazive odluka iz priložene <praksa>!
4. "dosljednost" — Unutarnja i fiskalno-tarifna dosljednost: neslaganja između članaka nacrta, tablice tarifa, Excel kalkulacija, obrazloženja i otvorenih primjedbi TDU-a.

PRAVILA:
- Ne ponavljaj puko iste formalne nalaze koji su već u <lokalni_nalazi> osim ako ih pravno dublje razrađuješ.
- Za SVAKI nalaz daj konkretan, odmah upotrebljiv "prijedlogPreformulacije" (točan prijedlog novog teksta odredbe).
- Vrati ISKLJUČIVO valjani JSON objekt:
{
  "ukupnaOcjena": "Spremno za UZZ" | "Potrebne manje dorade" | "Potrebne bitne dorade",
  "sazetak": "Sažeta izvršna ocjena (3–5 rečenica) spremnosti nacrta za UZZ, e-Savjetovanje i provedbu",
  "findings": [
    {
      "axis": "jmnp" | "zakonitost" | "sudska_praksa" | "dosljednost",
      "severity": "kriticno" | "upozorenje" | "preporuka",
      "clanak": "npr. Članak 5. st. 2.",
      "naslov": "Kratki precizni naslov problema",
      "opis": "Detaljno pravno obrazloženje rizika",
      "pravnaOsnovaIliPraksa": "Točni članci zakona (npr. čl. 17. i 20. ZFVG) i/ili točni nazivi odluka iz Baze prakse",
      "prijedlogPreformulacije": "Točan prijedlog preformulirane odredbe ili konkretne izmjene"
    }
  ]
}`;

    const userPrompt = `PROJEKT: ${project.puniNazivAkta} (${project.vrstaAkta})
MATIČNI PROPISI: ${project.maticniPropisi.join(', ')}

AKTUALNI NACRT ZA STRESS-TEST (${draftDoc.prikazniNaziv}):
<nacrt>
${draftDoc.rawText.slice(0, 38000)}
</nacrt>

VEĆ OTKRIVENI LOKALNI NALAZI (Sloj 1):
<lokalni_nalazi>
${localFindings.map((f) => `- [${f.severity}] ${f.clanak}: ${f.naslov} — ${f.opis}`).join('\n') || 'Nema lokalnih upozorenja.'}
</lokalni_nalazi>

KLJUČNI ČLANCI ZFVG-a (ZAKONSKO OVLAŠTENJE):
${coreZfvgText || '(Pogledaj <zakoni> ispod)'}

SLUŽBENI TEKST KLJUČNIH ČLANAKA JMNP-a (NN 74/15) IZ BAZE PROPISA:
${coreJmnpText || '(Koristi JMNP NN 74/15 iz <zakoni>)'}

DODATNI ZAKONI IZ BAZE:
<zakoni>
${formatZakoni(mergedZakoni)}
</zakoni>

STVARNA SUDSKA I UPRAVNA PRAKSA IZ BAZE PRAKSE:
<praksa>
${formatPraksa(mergedPraksa)}
</praksa>

${excelSnippet ? `EXCEL TARIFE PROJEKTA:\n${excelSnippet}\n` : ''}
${openPrimjedbeSnippet ? `OTVORENE / ODBIJENE PRIMJEDBE TDU-a:\n${openPrimjedbeSnippet}\n` : ''}`;

    const { text } = await generateText({
      model: google(aiModelName),
      system: systemPrompt,
      prompt: userPrompt,
    });

    const parsed = extractJsonObject<any>(text);
    const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];

    const aiFindings: StressTestFinding[] = rawFindings.map((rf: any, idx: number) => {
      const axis = VALID_AXES.has(rf.axis) ? (rf.axis as StressTestAxis) : 'jmnp';
      const severity = VALID_SEVS.has(rf.severity)
        ? (rf.severity as StressTestSeverity)
        : 'upozorenje';
      return {
        id: `ai-${Date.now()}-${idx}`,
        source: 'ai',
        axis,
        severity,
        clanak: String(rf.clanak || 'Opće').trim(),
        naslov: String(rf.naslov || 'Pravni nalaz').trim(),
        opis: String(rf.opis || '').trim(),
        pravnaOsnovaIliPraksa: String(rf.pravnaOsnovaIliPraksa || '').trim() || undefined,
        prijedlogPreformulacije: String(rf.prijedlogPreformulacije || '').trim() || undefined,
      };
    });

    const validOcjene = new Set([
      'Spremno za UZZ',
      'Potrebne manje dorade',
      'Potrebne bitne dorade',
    ]);
    const ukupnaOcjena = validOcjene.has(parsed.ukupnaOcjena)
      ? parsed.ukupnaOcjena
      : localFindings.some((f) => f.severity === 'kriticno') ||
        aiFindings.some((f) => f.severity === 'kriticno')
      ? 'Potrebne bitne dorade'
      : 'Potrebne manje dorade';

    const report: StressTestReport = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      draftDocId: draftDoc.id,
      draftDocName: draftDoc.prikazniNaziv,
      modelName: aiModelName,
      ukupnaOcjena,
      sazetak: String(parsed.sazetak || 'Proveden je cjeloviti pravni i nomotehnički Stress-test nacrta propisa.').trim(),
      localFindings,
      aiFindings,
      referencedPraksaTitles: mergedPraksa.map((p) => p.naziv_datoteke),
      referencedZakoni: mergedZakoni.map((z) => `${z.clanak_broj} (${z.naziv_zakona})`),
    };

    const existing = await listStressTests(params.projectId);
    const updated = [report, ...existing].slice(0, 15);
    await saveStressTests(params.projectId, updated);
    revalidatePath(`/izrada-propisa/${params.projectId}`);

    return { success: true, report, reports: updated };
  } catch (err: any) {
    console.error('runStressTestAction error:', err);
    return { error: err?.message || 'Greška pri pokretanju AI Stress-testa.' };
  }
}

// ============================================================================
// FAZA 3 — GENERATORI SLUŽBENIH AKATA: OBRAZLOŽENJE, FACTSHEET, PODLOGA ZA KABINET
// ============================================================================

export async function generateDeliverableAction(params: {
  projectId: string;
  type: DeliverableType;
  customInstructions?: string;
  modelPreference?: 'flash' | 'pro';
}) {
  const project = await getPropisProject(params.projectId);
  if (!project) return { error: 'Projekt nije pronađen.' };

  const [docs, primjedbe] = await Promise.all([
    listPropisDocuments(params.projectId),
    listPrimjedbe(params.projectId),
  ]);
  const aktualniNacrt =
    docs.find((d) => d.uloga === 'aktualni_nacrt') ||
    docs.find((d) => d.uloga === 'prethodna_verzija');

  if (!aktualniNacrt || !aktualniNacrt.rawText?.trim()) {
    return { error: 'Učitajte Aktualni nacrt propisa prije generiranja popratnih akata.' };
  }

  const excelDocs = docs.filter((d) => d.uloga === 'excel_tarife');
  const zapisnici = docs.filter((d) => d.uloga === 'zapisnik');
  const popratni = docs.filter((d) => d.uloga === 'popratni_akt' && d.includeInAiContext);

  const aiModelName =
    params.modelPreference === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash';

  const contextBlocks = [
    `=== AKTUALNI NACRT (${aktualniNacrt.prikazniNaziv}) ===\n${aktualniNacrt.rawText.slice(0, 34000)}`,
    ...excelDocs.map((e) => `=== EXCEL TARIFE (${e.prikazniNaziv}) ===\n${e.rawText.slice(0, 12000)}`),
    ...zapisnici.slice(0, 3).map((z) => `=== ZAPISNIK (${z.prikazniNaziv}) ===\n${z.rawText.slice(0, 6000)}`),
    ...popratni.slice(0, 4).map((p) => `=== POPRATNI AKT (${p.prikazniNaziv}) ===\n${p.rawText.slice(0, 7000)}`),
  ].join('\n\n');

  const primjedbeStats =
    primjedbe.length > 0
      ? `Zaprimljene primjedbe u Tablici (${primjedbe.length} ukupno): Prihvaćeno ${
          primjedbe.filter((p) => p.status === 'Prihvaća se').length
        }, Djelomično ${
          primjedbe.filter((p) => p.status === 'Djelomično se prihvaća').length
        }, Ne prihvaća se ${
          primjedbe.filter((p) => p.status === 'Ne prihvaća se').length
        }, Na razmatranju ${
          primjedbe.filter((p) => p.status === 'Na razmatranju').length
        }.\nKljučne stavke:\n${primjedbe
          .slice(0, 25)
          .map((p) => `- ${p.tijelo} (${p.clanakOznaka}, ${p.status}): ${p.tekstPrimjedbe.slice(0, 180)}`)
          .join('\n')}`
      : 'Tablica primjedbi nema otvorenih primjedbi.';

  const coreZfvg = await fetchCoreMandateLawArticles();

  try {
    let record: DeliverableRecord;
    const now = new Date().toISOString();

    if (params.type === 'factsheet') {
      const { text } = await generateText({
        model: google(aiModelName),
        system: `Ti si viši stručni savjetnik u Ministarstvu zaštite okoliša i zelene tranzicije RH.
Sastavi službeni **FactSheet** (sažetak nacrta propisa za Vladu RH / Kabinet ministrice) točno po službenom 8-rubričnom obrascu Vlade RH.
Koristi ISKLJUČIVO stvarne brojke iz priloženih dokumenata i Excel tarifa (postotak rasta prihoda, iznosi tarifa, primjer prosječnog stana od 80 m², uštede za gospodarstvo i JLS). Ne izmišljaj brojke.

Vrati ISKLJUČIVO valjani JSON objekt s točno ovim poljima:
{
  "strucniNositelj": "MINISTARSTVO ZAŠTITE OKOLIŠA I ZELENE TRANZICIJE",
  "nazivAkta": "Puni naziv nacrta prijedloga akta",
  "zakonskaOsnova": "Točan članak, stavak i svi brojevi Narodnih novina matičnog zakona",
  "problem": "Jasan opis problema koji zahtijeva izradu novog propisa",
  "cilj": "Ciljevi koji se namjeravaju postići",
  "posljedicePozitivne": "Pozitivne posljedice odnosno učinci",
  "posljediceNegativne": "Negativne posljedice odnosno učinci (uz ublažavajuće okolnosti)",
  "novine": "Takstativni popis ključnih novina koje se uvode (1., 2., 3., ...)",
  "financijskiUcinci": "Razrađeni financijski učinci za Državni proračun / Hrvatske vode, JLS, građane (konkretan primjer) i gospodarstvo",
  "otvorenaPitanja": "Postoje li otvorena pitanja (provjeriti Tablicu primjedbi; ako nema, napisati 'Nema otvorenih pitanja.')",
  "statusIHodogram": "Trenutni status i željeni hodogram (e-Savjetovanje, sjednica Vlade RH, stupanje na snagu)"
}`,
        prompt: `PROJEKT: ${project.puniNazivAkta}
FAZA: ${project.fazaPostupka}
STRUČNI NOSITELJ: ${project.strucniNositelj}
${params.customInstructions ? `POSEBNE UPUTE KORISNIKA: ${params.customInstructions}\n` : ''}

${contextBlocks}

TABLICA PRIMJEDBI:
${primjedbeStats}

MATIČNI ZAKON (ZFVG):
${coreZfvg}`,
      });

      const fsData = extractJsonObject<FactSheetData>(text);
      const cleanFs: FactSheetData = {
        strucniNositelj: fsData.strucniNositelj || project.strucniNositelj.toUpperCase(),
        nazivAkta: fsData.nazivAkta || project.puniNazivAkta,
        zakonskaOsnova: fsData.zakonskaOsnova || '',
        problem: fsData.problem || '',
        cilj: fsData.cilj || '',
        posljedicePozitivne: fsData.posljedicePozitivne || '',
        posljediceNegativne: fsData.posljediceNegativne || '',
        novine: fsData.novine || '',
        financijskiUcinci: fsData.financijskiUcinci || '',
        otvorenaPitanja: fsData.otvorenaPitanja || 'Nema otvorenih pitanja.',
        statusIHodogram: fsData.statusIHodogram || '',
      };

      record = {
        id: 'factsheet',
        type: 'factsheet',
        title: `FactSheet — ${project.naziv}`,
        contentMarkdown: `## ${cleanFs.nazivAkta}\n\n**Zakonska osnova:** ${cleanFs.zakonskaOsnova}\n\n**Problem:** ${cleanFs.problem}\n\n**Cilj:** ${cleanFs.cilj}`,
        factSheetData: cleanFs,
        customInstructions: params.customInstructions,
        modelName: aiModelName,
        updatedAt: now,
      };
    } else if (params.type === 'obrazlozenje') {
      const { text } = await generateText({
        model: google(aiModelName),
        system: `Ti si viši stručni savjetnik i nomotehničar u Ministarstvu zaštite okoliša i zelene tranzicije RH.
Sastavi cjelovito, službeno **OBRAZLOŽENJE** uz Nacrt prijedloga propisa, spremno za upućivanje u postupak savjetovanja s javnošću i na Vladu RH, u potpunosti usklađeno s Aktualnim nacrtom i JMNP-om (NN 74/15).

STRUKTURA OBRAZLOŽENJA (piši čisti Markdown s podnaslovima ## i ###):
1. ## I. OPĆI DIO (Pravna osnova, ocjena stanja i osnovna pitanja koja se uređuju)
   - Točan citat pravne osnove s PUNIM i točnim nizom brojeva Narodnih novina (provjeri preambulu nacrta!).
   - Opis instituta, obveznika, osnovice i namjene prihoda.
   - Razlozi donošenja novog propisa (podaci od 2006., ukidanje vodnoga doprinosa, smanjenje prihoda, klimatske promjene i investicijski ciklus, obveze izvještavanja DZS/Eurostat).
   - Ocjenjivanje financijskih učinaka i izjava o potrebnosti dodatnih sredstava u Državnom proračunu RH (i eventualni zaključak Radne skupine za administrativne cijene ako je u dokumentima).
2. ## II. OBJAŠNJENJE POJEDINIH ODREDABA
   - Taksativno za SVAKI pojedini članak aktualnog nacrta podnaslov ### Uz članak 1., ### Uz članak 2., ... sve do zadnjeg članka!
   - Precizno objasni svrhu, novine, tarife, oslobođenja/olakšice, obveze JLS-a, prijelazne i završne odredbe.`,
        prompt: `PROJEKT: ${project.puniNazivAkta}
${params.customInstructions ? `POSEBNE UPUTE KORISNIKA: ${params.customInstructions}\n` : ''}

${contextBlocks}

TABLICA PRIMJEDBI:
${primjedbeStats}

MATIČNI ZAKON (ZFVG):
${coreZfvg}`,
      });

      record = {
        id: 'obrazlozenje',
        type: 'obrazlozenje',
        title: `Obrazloženje — ${project.naziv}`,
        contentMarkdown: text.trim(),
        customInstructions: params.customInstructions,
        modelName: aiModelName,
        updatedAt: now,
      };
    } else {
      // podloga_kabinet
      const { text } = await generateText({
        model: google(aiModelName),
        system: `Ti si viši savjetnik koji priprema sažetu, iznimno jasnu i uvjerljivu **PODLOGU ZA KABINET MINISTRICE** (brifing na 1–2 stranice) za predstavljanje nacrta propisa ministrici i na kolegiju Vlade RH.

STRUKTURA PODLOGE (čisti Markdown s jasnim podnaslovima ### i kratkim natuknicama):
1. ### 1. Sažetak i svrha propisa (kratko što se uređuje i zakonski okvir)
2. ### 2. Razlozi donošenja (ključne činjenice i brojke iz priloženih dokumenata i Excel tarifa — bez suvišnog birokratskog stila)
3. ### 3. Cilj i ključne novine (taksativne natuknice: tarife, oslobođenja/olakšice, optimizacija naplate JLS < 5.000 stanovnika, NKD/OIB izvještavanje)
4. ### 4. Financijski i društveni učinak (Hrvatske vode, Državni proračun, JLS, primjer utjecaja na prosječno kućanstvo i gospodarstvo)
5. ### 5. Pregled provedenog usklađivanja (UZZ, TDU i dionici) i otvorena pitanja
6. ### 6. Predloženi daljnji koraci i hodogram

Budi konkretan, brojčano precizan (isključivo na temelju stvarnih podataka u dokumentima) i sažet — idealno za brzo čitanje u Kabinetu ministrice.`,
        prompt: `PROJEKT: ${project.puniNazivAkta}
FAZA: ${project.fazaPostupka}
${params.customInstructions ? `POSEBNE UPUTE KORISNIKA: ${params.customInstructions}\n` : ''}

${contextBlocks}

TABLICA PRIMJEDBI:
${primjedbeStats}`,
      });

      record = {
        id: 'podloga_kabinet',
        type: 'podloga_kabinet',
        title: `Podloga za kabinet — ${project.naziv}`,
        contentMarkdown: text.trim(),
        customInstructions: params.customInstructions,
        modelName: aiModelName,
        updatedAt: now,
      };
    }

    const existing = (await listDeliverables(params.projectId)).filter((r) => r.type !== params.type);
    const updated = [record, ...existing];
    await saveDeliverables(params.projectId, updated);
    revalidatePath(`/izrada-propisa/${params.projectId}`);

    return { success: true, record, deliverables: updated };
  } catch (err: any) {
    console.error('generateDeliverableAction error:', err);
    return { error: err?.message || 'Greška pri generiranju dokumenta.' };
  }
}

export async function saveDeliverableAction(
  projectId: string,
  record: DeliverableRecord
) {
  const existing = (await listDeliverables(projectId)).filter((r) => r.type !== record.type);
  const next: DeliverableRecord = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  const updated = [next, ...existing];
  await saveDeliverables(projectId, updated);
  revalidatePath(`/izrada-propisa/${projectId}`);
  return { success: true, record: next, deliverables: updated };
}
