'use server';

import { google } from '@/lib/google';
import { generateText } from 'ai';
import type { ReportMetrics } from '@/lib/report-utils';
import type { SporoviReportMetrics } from '@/lib/report-sporovi-utils';

export async function generateAiReportNarrativeAction(payload: {
  periodLabel: string;
  metrics: ReportMetrics;
  sampleItems: Array<{
    klasa: string;
    stranka: string;
    podrucje: string;
    ishod?: string;
    days: number;
    isOverdue: boolean;
  }>;
}): Promise<{ success: boolean; narrative?: string; error?: string }> {
  try {
    const { periodLabel, metrics, sampleItems } = payload;

    const ishodiSummary = metrics.ishodiBreakdown
      .map((i) => `* ${i.ishod}: ${i.count} (${i.percentage}%)`)
      .join('\n');

    const podrucjaSummary = metrics.podrucjaBreakdown
      .map((p) => `* ${p.podrucje}: ${p.count} predmeta (${p.rijeseno} riješeno, ${p.uRadu} u radu)`)
      .join('\n');

    const sampleText = sampleItems
      .slice(0, 15)
      .map(
        (s) =>
          `- ${s.klasa} (${s.stranka}, područje: ${s.podrucje}): ishod "${s.ishod || 'U radu'}", trajanje ${s.days} dana (${s.isOverdue ? 'PREKORAČEN ROK' : 'u roku'})`
      )
      .join('\n');

    const prompt = `Ti si viši upravni savjetnik i analitičar drugostupanjskog upravnog postupanja u Ministarstvu (Republika Hrvatska).
Tvoj zadatak je na temelju sljedećih službenih statističkih podataka sastaviti profesionalno, analitičko i koncizno NARATIVNO IZVJEŠĆE O RADU za voditelja službe / ministra.

PROMATRANO RAZDOBLJE: ${periodLabel}

KLJUČNE METRIKE:
- Ukupno predmeta u obradi u razdoblju: ${metrics.ukupnoPredmeta}
- Riješeno i arhivirano: ${metrics.ukupnoRijeseno} (stopa rješavanja: ${metrics.stopaRjesavanja}%)
- Predmeti trenutno u obradi: ${metrics.ukupnoURadu} (od čega na potpisu: ${metrics.ukupnoNaPotpisu})
- Poštivanje zakonskog roka po ZUP-u (60 dana):
  * U roku riješeno / u tijeku: ${metrics.ukupnoURoku} (${metrics.postotakURoku}%)
  * Prekoračen rok: ${metrics.ukupnoPrekoracenRok}
  * Prosječno trajanje rješavanja predmeta: ${metrics.prosjecnoTrajanjeRjesavanjaDana} dana
  * Prosječna starost aktivnih predmeta: ${metrics.prosjecnoTrajanjeAktivnihDana} dana

STRUKTURA DONESENIH ODLUKA (ISHODI):
${ishodiSummary || 'Nema evidentiranih dovršenih rješenja u ovom razdoblju.'}

RASPODJELA PO UPRAVNIM PODRUČJIMA:
${podrucjaSummary || 'Nema evidentiranih područja.'}

UZORAK PREDMETA IZ EVIDENCIJE:
${sampleText || 'Nema uzoraka.'}

SMJERNICE ZA PISANJE:
- Koristi službeni, dostojanstven stil državne uprave Republike Hrvatske.
- Formatiraj u 4 jasna odlomka s podnaslovima:
  ### 1. Opseg posla i dinamika rješavanja
  ### 2. Efikasnost i poštivanje zakonskog roka (čl. 121. ZUP-a)
  ### 3. Analiza zakonitosti i struktura drugostupanjskih odluka (odbijanje vs. poništavanje)
  ### 4. Zaključna ocjena i preporuke za unaprjeđenje postupanja prvostupanjskih tijela
- Budi analitičan: ako je stopa poništenja visoka, ukaži na potrebu ujednačavanja prakse prvostupanjskih tijela (Hrvatske vode / ispostave); ako dominira odbijanje žalbi, istakni stabilnost upravne prakse i zakonitost prvostupanjskih rješenja.
- Odgovor daj u čistom Markdown formatu, spreman za izravno kopiranje u Word izvješće.`;

    const { text } = await generateText({
      model: google('gemini-3.8-flash'),
      prompt,
      system:
        'Ti si viši upravni savjetnik u Ministarstvu zadužen za pripremu službenih izvješća o drugostupanjskom upravnom postupku.',
    });

    return { success: true, narrative: text };
  } catch (err: any) {
    console.error('Greška pri generiranju AI narativnog izvješća:', err);
    return { success: false, error: err?.message || 'Neuspjelo generiranje narativnog izvješća.' };
  }
}

export async function generateAiSporoviNarrativeAction(payload: {
  periodLabel: string;
  metrics: SporoviReportMetrics;
  sampleSporovi: Array<{
    poslBroj: string;
    sud: string;
    tuzitelj: string;
    vrsta: string;
    ishod: string;
    troskovi: string;
  }>;
}): Promise<{ success: boolean; narrative?: string; error?: string }> {
  try {
    const { periodLabel, metrics, sampleSporovi } = payload;

    const sudoviSummary = metrics.sudovi
      .map(
        (s) =>
          `* ${s.sud}: ${s.ukupno} sporova (${s.rijeseno} riješeno, ${s.uTijeku} u tijeku), stopa potvrđivanja rješenja: ${s.stopaUspjeha}%, dosuđeni troškovi: ${s.ukupnoTroskovaEur.toFixed(2)} €`
      )
      .join('\n');

    const ishodiSummary = `* Potvrđeno rješenje Ministarstva (odbijena/odbačena tužba): ${metrics.ishodi.odbijeno}
* Uvažena tužba (poništeno rješenje Ministarstva): ${metrics.ishodi.uvazeno}
* Obustavljeni sporovi (otklonjena šutnja uprave): ${metrics.ishodi.obustavljeno}
* Stopa uspješnosti Ministarstva pred sudovima: ${metrics.ishodi.stopaUspjehaMinistarstva}%`;

    const financijeSummary = `* Ukupno dosuđeni troškovi na teret Ministarstva: ${metrics.financije.ukupnoDosudenoEur.toFixed(2)} € (u ${metrics.financije.brojPredmetaSTroskovima} predmeta)
* Plaćeno / poslan nalog računovodstvu: ${metrics.financije.placenoEur.toFixed(2)} € (${metrics.financije.brojPlacenih} predmeta)
* Neplaćeno / na čekanju za nalog: ${metrics.financije.neplacenoEur.toFixed(2)} € (${metrics.financije.brojNeplacenih} predmeta)
* Broj predmeta s hitnim paritetnim rokovima: ${metrics.financije.hitniRokovi.length}`;

    const sampleText = sampleSporovi
      .slice(0, 15)
      .map(
        (s) =>
          `- ${s.poslBroj} (${s.sud}): tužitelj "${s.tuzitelj}", vrsta "${s.vrsta}", ishod: "${s.ishod}", troškovi: "${s.troskovi}"`
      )
      .join('\n');

    const prompt = `Ti si viši upravni savjetnik u Ministarstvu, specijaliziran za zastupanje pred upravnim sudovima i Visokim upravnim sudom Republike Hrvatske.
Tvoj zadatak je na temelju službenih statističkih i financijskih podataka sastaviti autoritativno, pravno utemeljeno i analitičko NARATIVNO IZVJEŠĆE O STANJU UPRAVNIH SPOROVA I SUDSKIM TROŠKOVIMA za ministra, kolegij i upravu.

PROMATRANO RAZDOBLJE: ${periodLabel}

KLJUČNE METRIKE SPOROVA:
- Ukupno sporova u evidenciji: ${metrics.ukupno}
- Aktivni sporovi u radu pred sudovima: ${metrics.uTijeku}
- Pravomoćno okončani sporovi: ${metrics.rijeseno} (stopa dovršenosti: ${metrics.stopaRijesenosti}%)
- Odgovoreno na tužbe: ${metrics.odgovoreno} (urednost: ${metrics.stopaOdgovoreno}%)
- Struktura po vrsti: Redovni upravni sporovi: ${metrics.redovniSporovi}, Sporovi zbog šutnje uprave (čl. 24. ZUS): ${metrics.sutnjaUprave}

ANALIZA ISHODA I USPJEŠNOSTI MINISTARSTVA:
${ishodiSummary}

FINANCIJSKO IZVJEŠĆE O SUDSKIM TROŠKOVIMA:
${financijeSummary}

STANJE PO UPRAVNIM SUDOVIMA:
${sudoviSummary || 'Nema evidentiranih podataka po sudovima.'}

UZORAK KARAKTERISTIČNIH PREDMETA:
${sampleText || 'Nema izdvojenih uzoraka.'}

SMJERNICE ZA PISANJE:
- Stil mora biti izrazito profesionalan, pravnički precizan i primjeren kolegiju Ministarstva.
- Strukturiraj izvješće u točno 4 cjeline s Markdown naslovima:
  ### 1. Opseg, dinamika i struktura upravnih sporova
  (Osvrt na ukupan broj predmeta, opterećenost službe, omjer redovnih sporova i sporova zbog šutnje uprave prema čl. 24. ZUS-a)
  ### 2. Ocjena zakonitosti pobijanih akata i uspješnost pred sudovima
  (Komentar na postotak potvrđenih rješenja, specifičnosti sudske prakse Upravnog suda u Zagrebu, Splitu, Rijeci, Osijeku te Visokog upravnog suda RH)
  ### 3. Financijska analiza dosuđenih troškova i paritetni rokovi
  (Pregled financijskih obveza, stanje plaćanja prema računovodstvu, važnost praćenja paritetnih rokova od 15 dana radi sprječavanja blokade/ovrhe računa državnog proračuna)
  ### 4. Prijedlog preventivnih mjera i zaključak za kolegij
  (Konkretne upute za prvostupanjska tijela kako smanjiti šutnju uprave i spriječiti nepotrebne sudske troškove, ujednačavanje pravnih shvaćanja)
- Odgovor daj u čistom Markdown formatu, spremno za preuzimanje i izravno uključivanje u službeni dokument.`;

    const { text } = await generateText({
      model: google('gemini-3.8-flash'),
      prompt,
      system:
        'Ti si viši upravni savjetnik u Ministarstvu, specijalist za upravne sporove i zastupanje pred upravnim sudovima.',
    });

    return { success: true, narrative: text };
  } catch (err: any) {
    console.error('Greška pri generiranju AI narativnog izvješća za upravne sporove:', err);
    return { success: false, error: err?.message || 'Neuspjelo generiranje narativnog izvješća.' };
  }
}
