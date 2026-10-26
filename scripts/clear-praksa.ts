import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function clearPraksaInBatches() {
  console.log('🔄 Pokrećem paketno brisanje tablice "praksa"...');

  let totalDeleted = 0;
  const batchSize = 400; // sigurna veličina za brisanje teških 3072-dim vektora bez timeouta

  while (true) {
    // Dohvati sljedećih N ID-jeva
    const { data: rows, error: selectErr } = await supabase
      .from('praksa')
      .select('id')
      .limit(batchSize);

    if (selectErr) {
      console.error('Greška pri dohvatu ID-jeva:', selectErr);
      break;
    }

    if (!rows || rows.length === 0) {
      console.log('\nNema više zapisa za brisanje.');
      break;
    }

    const ids = rows.map((r) => r.id);

    const { error: deleteErr } = await supabase
      .from('praksa')
      .delete()
      .in('id', ids);

    if (deleteErr) {
      console.error('\nGreška pri brisanju paketa:', deleteErr);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    totalDeleted += ids.length;
    process.stdout.write(`\rObrisano ${totalDeleted} chunkova...`);
  }

  console.log(`\n✅ Uspješno dovršeno! Ukupno obrisano: ${totalDeleted} chunkova.`);

  const { count } = await supabase
    .from('praksa')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Stanje u tablici "praksa": ${count ?? 0} zapisa.`);
}

clearPraksaInBatches().catch(console.error);
