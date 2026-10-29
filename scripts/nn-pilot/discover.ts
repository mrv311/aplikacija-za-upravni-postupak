import { PILOT_LAWS } from './pilot-config';
import { listIssueActs, parseNnList, fetchActHtml, parseBaseArticles, fetchEliMetadata, eliAmendedActs } from './nn-client';

async function main() {
  for (const law of PILOT_LAWS) {
    console.log(`\n=== ${law.kratica} – ${law.naziv} (${law.nn}) ===`);
    const refs = parseNnList(law.nn);
    for (const r of refs) {
      const acts = await listIssueActs(r.year, r.issue);
      const matches = acts.filter((a) => law.matchBase.test(a.title) || law.matchAmend.test(a.title));
      if (matches.length === 0) {
        console.log(`  NN ${r.issue}/${r.year}: ⚠️ nije pronađen akt (u broju ${acts.length} akata)`);
        continue;
      }
      for (const m of matches) {
        const kind = law.matchBase.test(m.title) ? 'TEMELJNI' : 'IZMJENA';
        let extra = '';
        if (kind === 'TEMELJNI') {
          const html = await fetchActHtml(m);
          const arts = parseBaseArticles(html);
          extra = ` → ${arts.length} članaka (prvi: ${arts[0]?.label}, zadnji: ${arts[arts.length - 1]?.label})`;
        } else {
          const meta = await fetchEliMetadata(m);
          const amends = eliAmendedActs(meta);
          extra = meta ? ` → ELI amends: ${amends.join(', ') || '(nema)'}` : ' → ELI: godište nije podržano';
        }
        console.log(`  NN ${r.issue}/${r.year}: [${kind}] ${m.slug} "${m.title}"${extra}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
