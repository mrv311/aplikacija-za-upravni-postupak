import { consolidateLaw, LawDef } from './engine';
import { syncLawToDatabase } from './sync-db';

export const PRAVILNIK_JEDNOSTAVNE_DEF: LawDef = {
  kratica: 'P-JEDNOSTAVNE',
  naziv: 'Pravilnik o jednostavnim i drugim građevinama i radovima',
  baseSlug: '2017_11_112_2625',
  baseNn: 'NN 112/17',
  amendments: [
    { slug: '2018_04_34_656', nn: 'NN 34/18' },
    { slug: '2019_04_36_755', nn: 'NN 36/19' },
    { slug: '2019_10_98_1985', nn: 'NN 98/19' },
    { slug: '2020_03_31_677', nn: 'NN 31/20' },
    { slug: '2022_06_74_1094', nn: 'NN 74/22' },
    { slug: '2023_12_155_2378', nn: 'NN 155/23' },
  ],
};

async function main() {
  console.log('🏗️ POKREĆEM KONSOLIDACIJU: Pravilnik o jednostavnim i drugim građevinama i radovima');
  const result = await consolidateLaw(PRAVILNIK_JEDNOSTAVNE_DEF, { force: true });
  console.log(`✅ Uspješno konsolidirano: ${result.articles.length} članaka.`);

  console.log('\n📤 SINHRONIZIRAM U SUPABASE (baza: zakoni)...');
  await syncLawToDatabase('P-JEDNOSTAVNE');
  console.log('🎉 Pravilnik o jednostavnim i drugim građevinama i radovima je uspješno spremljen u bazu!');
}

main().catch(console.error);
