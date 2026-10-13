import { createClient } from '@supabase/supabase-js';

/**
 * Supabase klijent SAMO za server (API rute, skripte).
 * Koristi service role ključ jer RLS na tablicama `zakoni` i `praksa` blokira anon ključ
 * (anon vidi 0 redaka, bez greške). Nikad ne importati ovaj modul u klijentske komponente.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY nije postavljen – RAG pretraga zakona/prakse može vraćati 0 rezultata zbog RLS-a.');
}

export const supabaseServer = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
