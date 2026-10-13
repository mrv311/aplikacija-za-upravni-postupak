import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

/**
 * Briše potpuno identične duplikate u tablici `zakoni`
 * (isti naziv_zakona + clanak_broj + tekst). Zadržava redak s najmanjim id-em.
 * Pokretanje: npx.cmd tsx scripts/dedupe-zakoni.ts [--dry]
 */
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const DRY = process.argv.includes('--dry');

async function main() {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('zakoni')
      .select('id, naziv_zakona, clanak_broj, tekst')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const seen = new Set<string>();
  const toDelete: number[] = [];
  for (const r of rows) {
    const key = `${r.naziv_zakona}\u0000${r.clanak_broj}\u0000${r.tekst}`;
    if (seen.has(key)) toDelete.push(r.id);
    else seen.add(key);
  }

  console.log(`Ukupno redaka: ${rows.length}, identičnih duplikata: ${toDelete.length}`);
  if (DRY || toDelete.length === 0) return;

  for (let i = 0; i < toDelete.length; i += 100) {
    const { error } = await supabase.from('zakoni').delete().in('id', toDelete.slice(i, i + 100));
    if (error) throw error;
  }
  console.log(`✅ Obrisano ${toDelete.length} duplikata.`);
}
main().catch(console.error);
