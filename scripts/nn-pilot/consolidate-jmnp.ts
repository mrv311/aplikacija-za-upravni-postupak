import fs from 'fs';
import path from 'path';
import { consolidateLaw, LawDef } from './engine';
import { syncLawToDatabase } from './sync-db';

export const JMNP_NAZIV =
  'Jedinstvena metodološko-nomotehnička pravila za izradu akata koje donosi Hrvatski sabor';

export const JMNP_DEF: LawDef = {
  kratica: 'JMNP',
  naziv: JMNP_NAZIV,
  baseSlug: '2015_07_74_1410',
  baseNn: 'NN 74/15',
  amendments: [],
};

async function updatePropisiStructureJson(
  articles: Array<{
    clanak_broj: string;
    naslov?: string;
    struktura?: string;
    dio?: string;
    glava?: string;
    poglavlje?: string;
    odjeljak?: string;
  }>
) {
  const structPath = path.resolve('src', 'data', 'propisi-structure.json');
  const existing = JSON.parse(fs.readFileSync(structPath, 'utf-8'));

  existing[JMNP_NAZIV] = {};
  for (const a of articles) {
    existing[JMNP_NAZIV][a.clanak_broj] = {
      naslov: a.naslov || undefined,
      struktura: a.struktura || undefined,
      dio: a.dio || undefined,
      glava: a.glava || undefined,
      poglavlje: a.poglavlje || undefined,
      odjeljak: a.odjeljak || undefined,
    };
  }

  fs.writeFileSync(structPath, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`📚 Ažuriran src/data/propisi-structure.json s ${articles.length} članaka JMNP-a.`);
}

async function main() {
  console.log(`🏗️ POKREĆEM UVOZ: ${JMNP_NAZIV} (NN 74/15)`);
  const result = await consolidateLaw(JMNP_DEF, { force: true });
  console.log(`✅ Uspješno raščlanjeno: ${result.articles.length} članaka.\n`);

  console.log('--- SADRŽAJ JMNP-a (članci i naslovi) ---');
  for (const a of result.articles) {
    console.log(`${a.clanak_broj.padEnd(11)} | ${a.naslov || '(bez naslova)'} | [${a.struktura || ''}]`);
  }

  await updatePropisiStructureJson(result.articles);

  console.log('\n📤 SINHRONIZIRAM U SUPABASE (tablica: zakoni)...');
  await syncLawToDatabase('JMNP');
  console.log(`🎉 ${JMNP_NAZIV} (NN 74/15) uspješno je spremljen u Supabase bazu!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
