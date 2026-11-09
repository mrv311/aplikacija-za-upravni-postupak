import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const { searchKnowledge } = await import('../src/lib/rag');

  const testQueries = [
    {
      label: 'Šutnja uprave & Troškovi upravnog spora',
      query: 'šutnja uprave obustava spora i troškovi postupka za sastav tužbe odvjetnika',
      podrucje: 'ZUP',
    },
    {
      label: 'Vodni doprinos & Zastara povrata',
      query: 'zastara prava na povrat plaćenog vodnog doprinosa nakon isteka potvrde glavnog projekta',
      podrucje: 'VD',
    },
    {
      label: 'Naknada za uređenje voda & Dostava',
      query: 'naknada za uređenje voda obveza plaćanja utvrđivanje obveznika i dostava rješenja',
      podrucje: 'NUV',
    },
  ];

  console.log('\n=============================================================');
  console.log('🧪 VERIFIKACIJA RAG SUSTAVA I DOHVATA PREUZETIH PRESUDA');
  console.log('=============================================================\n');

  for (const t of testQueries) {
    console.log(`\n📌 TEST UPIT: "${t.query}" (Područje: ${t.podrucje})`);
    const t0 = Date.now();
    const res = await searchKnowledge(t.query, {
      casePodrucje: t.podrucje,
      praksaCount: 5,
      preferAdvisorDecisions: false,
    });
    const elapsed = Date.now() - t0;

    console.log(`   ⏱️ Vrijeme pretrage: ${elapsed}ms`);
    console.log(`   🏷️ Prepoznate ključne riječi: ${res.extractedKeywords.slice(0, 6).join(', ')}`);
    console.log(`   🏛️ Pronađene odluke u Bazi prakse (${res.praksa.length}):`);
    
    res.praksa.forEach((p, idx) => {
      const simPercent = p.similarity ? (p.similarity * 100).toFixed(1) + '%' : 'N/A';
      console.log(`      ${idx + 1}. [${simPercent}] ${p.naziv_datoteke}`);
      console.log(`         Vrsta: ${p.vrsta} | Područje: ${p.podrucje} | Godina: ${p.godina || '-'}`);
    });
  }

  console.log('\n✅ Verifikacija uspješno završena!');
}

main().catch(console.error);
