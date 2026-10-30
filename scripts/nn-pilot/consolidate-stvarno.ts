import { consolidateLaw, LawDef } from './engine';
import { syncLawToDatabase } from './sync-db';

const ZZK_DEF: LawDef = {
  kratica: 'ZZK',
  naziv: 'Zakon o zemljišnim knjigama',
  baseSlug: '2019_06_63_1234',
  baseNn: 'NN 63/19',
  amendments: [
    { slug: '2022_11_128_1938', nn: 'NN 128/22' },
  ],
};

async function main() {
  console.log('🏛️ POKREĆEM KONSOLIDACIJU: Zakon o zemljišnim knjigama (ZZK)');
  // consolidateLaw will automatically load from cache if test-zzk finished it, or compute it
  const result = await consolidateLaw(ZZK_DEF);
  console.log(`✅ Uspješno konsolidirano: ${result.articles.length} članaka.`);

  console.log('\n📤 SINHRONIZIRAM U SUPABASE (baza: zakoni)...');
  await syncLawToDatabase('ZZK');
  console.log('🎉 Zakon o zemljišnim knjigama je uspješno spremljen u bazu!');
}

main().catch(console.error);
