import { runPropisiCheck } from '../src/lib/propisi-checker';

async function main() {
  console.log('🔄 Osvježavam status propisa...');
  const res = await runPropisiCheck();
  console.log(`✅ Status ažuriran! Ukupno članaka u bazi: ${res.totalArticlesInDb}, Zastarjelo: ${res.outdatedCount}`);
  for (const r of res.results) {
    console.log(` - [${r.status}] ${r.kratica.padEnd(8)}: ${r.naziv} (u bazi: ${r.dbClanciCount} čl.)`);
  }
}

main().catch(console.error);
