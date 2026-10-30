import { consolidateLaw, LawDef } from './engine';
import { syncLawToDatabase } from './sync-db';

const GRADNJA_LAWS: LawDef[] = [
  {
    kratica: 'ZKG',
    naziv: 'Zakon o komunalnom gospodarstvu',
    baseSlug: '2018_07_68_1393',
    baseNn: 'NN 68/18',
    amendments: [
      { slug: '2018_12_110_2138', nn: 'NN 110/18 (USRH)' },
      { slug: '2020_03_32_708', nn: 'NN 32/20' },
      { slug: '2024_12_145_2376', nn: 'NN 145/24' },
    ],
  },
  {
    kratica: 'ZG',
    naziv: 'Zakon o gradnji',
    baseSlug: '2013_12_153_3221',
    baseNn: 'NN 153/13',
    amendments: [
      { slug: '2017_03_20_456', nn: 'NN 20/17' },
      { slug: '2019_04_39_802', nn: 'NN 39/19' },
      { slug: '2019_12_125_2489', nn: 'NN 125/19' },
    ],
  },
];

async function main() {
  console.log('🏗️ POKREĆEM KONSOLIDACIJU PAKETA: GRADNJA I KOMUNALNO GOSPODARSTVO');
  console.log(`Broj propisa za obradu: ${GRADNJA_LAWS.length}\n`);

  for (const lawDef of GRADNJA_LAWS) {
    console.log(`\n=============================================================`);
    console.log(`▶️ KORAK 1: KONSOLIDACIJA -> ${lawDef.kratica} (${lawDef.naziv})`);
    console.log(`=============================================================`);
    const consolidated = await consolidateLaw(lawDef, { force: true });
    console.log(`✅ Uspješno konsolidirano: ${consolidated.articles.length} članaka.`);

    console.log(`\n▶️ KORAK 2: SINHRONIZACIJA U SUPABASE (baza: 'zakoni')...`);
    await syncLawToDatabase(lawDef.kratica);
  }

  console.log('\n🎉 SVI PROPISI IZ PAKETA GRADNJE I KOMUNALNOG GOSPODARSTVA SU USPJEŠNO KONSOLIDIRANI I POHRANJENI U BAZU!');
}

main().catch(console.error);
