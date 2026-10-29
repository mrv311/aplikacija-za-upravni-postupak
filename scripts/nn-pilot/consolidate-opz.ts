import { consolidateLaw, LawDef } from './engine';

const OPZ_DEF: LawDef = {
  kratica: 'OPZ',
  naziv: 'Opći porezni zakon',
  baseSlug: '2016_12_115_2519',
  baseNn: 'NN 115/16',
  amendments: [
    { slug: '2018_11_106_2065', nn: 'NN 106/18' },
    { slug: '2019_12_121_2386', nn: 'NN 121/19' },
    { slug: '2020_03_32_691', nn: 'NN 32/20' },
    { slug: '2020_04_42_882', nn: 'NN 42/20' },
    { slug: '2022_10_114_1677', nn: 'NN 114/22' },
    { slug: '2024_12_152_2509', nn: 'NN 152/24' },
    { slug: '2025_12_151_2263', nn: 'NN 151/25' },
  ],
};

async function main() {
  const result = await consolidateLaw(OPZ_DEF, { force: true });
  console.log('\n=============================================================');
  console.log(`🎉 OPZ KONSOLIDIRAN! Ukupno članaka: ${result.articleCount}`);
  console.log('=============================================================');

  // Primjeri ključnih članaka u poreznom postupku:
  // Članak 108. (zastara prava na utvrđivanje/naplatu poreza)
  const cl108 = result.articles.find((a) => a.clanak_broj === 'Članak 108.');
  if (cl108) {
    console.log('\n--- Članak 108. (Zastara): ---');
    console.log(cl108.tekst.substring(0, 400) + '...');
  }
}

main().catch(console.error);
