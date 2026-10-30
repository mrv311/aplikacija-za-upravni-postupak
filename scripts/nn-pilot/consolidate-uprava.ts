import { consolidateLaw, LawDef } from './engine';
import { syncLawToDatabase } from './sync-db';

const UPRAVA_LAWS: LawDef[] = [
  {
    kratica: 'ZUS',
    naziv: 'Zakon o upravnim sporovima',
    baseSlug: '2024_03_36_564',
    baseNn: 'NN 36/24',
    amendments: [],
  },
  {
    kratica: 'ZSDU',
    naziv: 'Zakon o sustavu državne uprave',
    baseSlug: '2019_07_66_1290',
    baseNn: 'NN 66/19',
    amendments: [],
  },
  {
    kratica: 'UUP',
    naziv: 'Uredba o uredskom poslovanju',
    baseSlug: '2021_07_75_1415',
    baseNn: 'NN 75/21',
    amendments: [],
  },
  {
    kratica: 'ZPPI',
    naziv: 'Zakon o pravu na pristup informacijama',
    baseSlug: '2013_02_25_403',
    baseNn: 'NN 25/13',
    amendments: [
      { slug: '2015_08_85_1649', nn: 'NN 85/15' },
      { slug: '2022_06_69_1025', nn: 'NN 69/22' },
    ],
  },
];

async function main() {
  console.log('🏛️ POKREĆEM KONSOLIDACIJU PAKETA: OPĆA UPRAVA I SUDOVI');
  console.log(`Broj zakona/uredbi za obradu: ${UPRAVA_LAWS.length}\n`);

  for (const lawDef of UPRAVA_LAWS) {
    console.log(`\n=============================================================`);
    console.log(`▶️ KORAK 1: KONSOLIDACIJA -> ${lawDef.kratica} (${lawDef.naziv})`);
    console.log(`=============================================================`);
    const consolidated = await consolidateLaw(lawDef, { force: true });
    console.log(`✅ Uspješno konsolidirano: ${consolidated.articles.length} članaka.`);

    console.log(`\n▶️ KORAK 2: SINHRONIZACIJA U SUPABASE (baza: 'zakoni')...`);
    await syncLawToDatabase(lawDef.kratica);
  }

  console.log('\n🎉 SVI PROPISI IZ PAKETA OPĆE UPRAVE I SUDOVA SU USPJEŠNO KONSOLIDIRANI I POHRANJENI U BAZU!');
}

main().catch(console.error);
