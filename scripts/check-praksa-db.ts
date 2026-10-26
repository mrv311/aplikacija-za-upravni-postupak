import { createClient } from '@supabase/supabase-js';

if (typeof (process as any).loadEnvFile === 'function') {
  try {
    (process as any).loadEnvFile('.env.local');
  } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

  // Fetch unique filenames (using chunk_index = 0)
  const { data: firstChunks, error: e2 } = await supabase
    .from('praksa')
    .select('naziv_datoteke')
    .eq('chunk_index', 0)
    .range(0, 9999);

  if (e2) {
    console.error('Error fetching distinct files:', e2);
    return;
  }

  console.log(`Ukupno distinct dokumenata (chunk_index=0): ${firstChunks?.length || 0}`);

  // Group by prefix if any
  const prefixes: Record<string, number> = {};
  for (const doc of firstChunks || []) {
    const match = doc.naziv_datoteke.match(/^\[(.*?)\]/);
    const prefix = match ? match[1] : 'Bez prefiksa';
    prefixes[prefix] = (prefixes[prefix] || 0) + 1;
  }

  console.log('\nRaspodjela po prefiksima / kategorijama:');
  for (const [p, c] of Object.entries(prefixes)) {
    console.log(` - ${p}: ${c} spisa`);
  }
}

check().catch(console.error);
