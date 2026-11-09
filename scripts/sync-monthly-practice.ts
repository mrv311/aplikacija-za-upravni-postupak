import { scrapeAndIndexDecisions } from './scrape-sudske-odluke';

// Teme za redoviti periodički sync
const SYNC_TOPICS = [
  { q: 'vodni doprinos', cat: 'Vodni doprinos', lim: 10 },
  { q: 'naknada za uređenje voda', cat: 'Naknada za uređenje voda', lim: 10 },
  { q: 'naknada za zaštitu voda', cat: 'Naknada za zaštitu voda', lim: 10 },
  { q: 'šutnja uprave troškovi', cat: 'Troškovi postupka', lim: 10 },
  { q: 'obnova postupka nove činjenice', cat: 'Obnova postupka i pravni lijekovi', lim: 10 },
  { q: 'poništavanje rješenja nezakonitost', cat: 'Obnova postupka i pravni lijekovi', lim: 10 },
  { q: 'nezakonito izgrađena zgrada naknada', cat: 'Ozakonjenje i građenje', lim: 10 },
];

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function main() {
  console.log('=============================================================');
  console.log('🔄 PERIODIČKA SINKRONIZACIJA SUDSKE PRAKSE (odluke.sudovi.hr)');
  console.log(`📅 Datum: ${new Date().toLocaleDateString('hr-HR')}`);
  console.log('=============================================================\n');

  for (const t of SYNC_TOPICS) {
    try {
      console.log(`\n➡️  Provjera teme: "${t.q}"...`);
      await scrapeAndIndexDecisions({
        query: t.q,
        category: t.cat,
        limit: t.lim,
        courtFilter: 'all',
        dryRun: false,
        skipDb: false,
      });
      await delay(1200);
    } catch (err: any) {
      console.error(`❌ Greška pri sinkronizaciji teme "${t.q}":`, err.message);
    }
  }

  console.log('\n=============================================================');
  console.log('✅ Periodička sinkronizacija sudske prakse uspješno završena!');
  console.log('=============================================================\n');
}

main().catch((err) => {
  console.error('Fatalna greška:', err);
  process.exit(1);
});
