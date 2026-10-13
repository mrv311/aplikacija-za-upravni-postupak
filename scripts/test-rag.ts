import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const { searchKnowledge, extractArticleRefs } = await import('../src/lib/rag');

  const pitanja = [
    'što se smatra upravnom stvari prema Zakonu o općem upravnom postupku?',
    'Kada se žalba odbacuje i kako to primjenjuje praksa?',
  ];

  for (const q of pitanja) {
    console.log('\n=== ' + q);
    const r = await searchKnowledge(q);
    r.zakoni.forEach((z) => console.log(`  [${z.izvor}] ${z.naziv_zakona} | ${z.clanak_broj} | ${z.tekst.slice(0, 80)}`));
    r.praksa.forEach((p) => console.log(`  [praksa ${p.similarity?.toFixed(3)}] ${p.naziv_datoteke}`));
  }

  console.log('\nRegex test:', extractArticleRefs(
    'temeljem članka 116. stavka 1. točke 2. i 117. Zakona o općem upravnom postupku te čl. 8. ZUS-a',
    ['Zakon o općem upravnom postupku', 'Zakon o upravnim sporovima', 'Zakon o vodama'],
    null
  ));
}

main().catch(console.error);
