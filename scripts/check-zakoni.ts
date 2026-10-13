import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fetchAll(zakon: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('zakoni')
      .select('id, clanak_broj')
      .eq('naziv_zakona', zakon)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const { data: zakoni } = await supabase.rpc('get_dostupni_zakoni');
  console.log('Zakoni u bazi:', zakoni?.map((z: any) => z.naziv_zakona));

  for (const { naziv_zakona } of zakoni || []) {
    const rows = await fetchAll(naziv_zakona);
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.clanak_broj, (counts.get(r.clanak_broj) || 0) + 1);
    const nums = [...counts.keys()].map((k) => parseInt(k.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
    const max = Math.max(...nums);
    const missing: number[] = [];
    for (let i = 1; i <= max; i++) {
      if (!counts.has(`Članak ${i}.`) && !counts.has(`Članak ${i}`)) missing.push(i);
    }
    const dupes = [...counts.entries()].filter(([, c]) => c > 1);
    console.log(`\n== ${naziv_zakona}: ${rows.length} redaka, najveći članak ${max}`);
    console.log('   Nedostaju:', missing.length ? missing.join(', ') : 'nijedan');
    console.log('   Duplikati:', dupes.length ? dupes.map(([k, c]) => `${k}×${c}`).join(', ') : 'nema');
  }

  const p = await supabase.from('praksa').select('id', { count: 'exact', head: true });
  console.log('\nPraksa redaka:', p.count, p.error?.message || '');
}
main().catch(console.error);
