import { consolidateLaw, LawDef } from './engine';
import { syncLawToDatabase } from './sync-db';

const POVRSINA_DEF: LawDef = {
  kratica: 'P-POVRŠINA',
  naziv: 'Pravilnik o načinu obračuna površine i obujma u projektima zgrada',
  baseSlug: '2010_07_90_2544',
  baseNn: 'NN 90/10',
  amendments: [
    { slug: '2010_09_111_2923', nn: 'NN 111/10' },
  ],
};

async function main() {
  console.log('📐 POKREĆEM KONSOLIDACIJU: Pravilnik o načinu obračuna površine i obujma u projektima zgrada');
  const result = await consolidateLaw(POVRSINA_DEF, { force: true });
  console.log(`✅ Uspješno konsolidirano: ${result.articles.length} članaka.`);

  console.log('\n📤 SINHRONIZIRAM U SUPABASE (baza: zakoni)...');
  await syncLawToDatabase('P-POVRŠINA');
  console.log('🎉 Pravilnik o obračunu površine i obujma je uspješno spremljen u bazu!');
}

main().catch(console.error);
