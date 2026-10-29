import { createClient } from '@supabase/supabase-js';

if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile('.env.local');
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Nedostaju Supabase varijable.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function check() {
  const { count, error } = await supabase
    .from('praksa')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching count:', error);
    return;
  }

  console.log(`Ukupno chunkova u 'praksa': ${count}`);

  // Fetch all unique filenames (chunk_index = 0) with pagination
  let allFirstChunks: { naziv_datoteke: string }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error: e2 } = await supabase
      .from('praksa')
      .select('naziv_datoteke')
      .eq('chunk_index', 0)
      .range(from, from + pageSize - 1);

    if (e2) {
      console.error('Error fetching distinct files:', e2);
      break;
    }
    if (!data || data.length === 0) break;
    allFirstChunks.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Ukupno distinct dokumenata (chunk_index=0): ${allFirstChunks.length}`);

  // Group by prefix if any
  const prefixes: Record<string, number> = {};
  for (const doc of allFirstChunks) {
    const match = doc.naziv_datoteke.match(/^\[(.*?)\]/);
    const prefix = match ? match[1] : 'Bez prefiksa';
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  }

  console.log('\nRaspodjela po prefiksima / kategorijama:');
  const sorted = Object.entries(prefixes).sort((a, b) => b[1] - a[1]);
  for (const [p, c] of sorted) {
    console.log(` - ${p}: ${c} spisa`);
  }
}

check();
