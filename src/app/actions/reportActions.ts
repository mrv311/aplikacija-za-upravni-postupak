'use server';

import { google } from '@/lib/google';
import { generateText } from 'ai';
import type { ReportMetrics } from '@/lib/report-utils';

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
