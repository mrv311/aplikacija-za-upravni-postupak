if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile('.env.local');
  } catch {}
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function check() {
  const allArticles: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('zakoni')
      .select('id, naziv_zakona, clanak_broj')
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('Error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allArticles.push(...data);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  console.log(`📊 UKUPNO ČLANAKA U BAZI ZAKONI: ${allArticles.length}`);

  const counts: Record<string, number> = {};
  for (const art of allArticles) {
    counts[art.naziv_zakona] = (counts[art.naziv_zakona] || 0) + 1;
  }

  console.log('\nRaspodjela po propisima:');
  for (const [naziv, count] of Object.entries(counts)) {
    console.log(` - ${naziv.padEnd(65)}: ${count} članaka`);
  }
}

check().catch(console.error);
