import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { google } from '@ai-sdk/google';
import { embed } from 'ai';

const supabase = createClient(
  (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)!
);

async function main() {
  const q = 'što se smatra upravnom stvari prema Zakonu o općem upravnom postupku?';

  const { data: zak, error: e1 } = await supabase.rpc('get_dostupni_zakoni');
  console.log('Dostupni zakoni:', zak, e1?.message);

  const { count } = await supabase.from('zakoni').select('*', { count: 'exact', head: true });
  console.log('Ukupno redaka u zakoni:', count);

  const { data: zupRows } = await supabase
    .from('zakoni')
    .select('naziv_zakona, clanak_broj, tekst')
    .ilike('tekst', '%upravna stvar%')
    .limit(5);
  console.log('Redci s "upravna stvar":', zupRows?.map(r => `${r.naziv_zakona} | ${r.clanak_broj} | ${r.tekst.slice(0, 200)}`));

  // 1) Embedding kao u route.ts (bez dimenzija)
  const { embedding: embDefault } = await embed({
    model: google.textEmbeddingModel('gemini-embedding-001'),
    value: q,
  });
  console.log('Default embedding dim:', embDefault.length);
  const r1 = await supabase.rpc('match_zakoni', { query_embedding: embDefault, match_threshold: 0.3, match_count: 5 });
  console.log('match_zakoni (default):', r1.error?.message, r1.data?.length);

  // 2) Embedding s 768 dimenzija
  const { embedding: emb768 } = await embed({
    model: google.textEmbeddingModel('gemini-embedding-001'),
    value: q,
    providerOptions: { google: { outputDimensionality: 768, taskType: 'RETRIEVAL_QUERY' } },
  });
  console.log('768 embedding dim:', emb768.length);
  const r2 = await supabase.rpc('match_zakoni', { query_embedding: emb768, match_threshold: 0.0, match_count: 8 });
  console.log('match_zakoni (768):', r2.error?.message);
  r2.data?.forEach((z: any) => console.log(`  ${z.similarity.toFixed(3)} | ${z.naziv_zakona} | ${z.clanak_broj} | ${z.tekst.slice(0, 120)}`));

  const r3 = await supabase.rpc('match_praksa', { query_embedding: emb768, match_threshold: 0.0, match_count: 5 });
  console.log('match_praksa (768):', r3.error?.message);
  r3.data?.forEach((p: any) => console.log(`  ${p.similarity.toFixed(3)} | ${p.naziv_datoteke} | ${p.sadrzaj.slice(0, 120)}`));
}

main().catch(console.error);
