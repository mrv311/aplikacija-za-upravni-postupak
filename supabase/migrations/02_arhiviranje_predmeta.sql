-- ==============================================================================
-- Migracija: Funkcionalnost arhiviranja (A/A) za predmete
-- ==============================================================================
-- Pokrenite ovu SQL skriptu u Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Uklanjamo staro CHECK ograničenje (koje je dopuštalo samo 'Otvoren', 'U radu', 'Riješen')
ALTER TABLE public.predmeti DROP CONSTRAINT IF EXISTS predmeti_status_check;

-- 2. Ako stupac ne postoji, dodajemo ga s defaultom 'aktivan'; ako postoji, postavljamo default na 'aktivan'
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'predmeti' 
      AND column_name = 'status'
  ) THEN 
    ALTER TABLE public.predmeti ADD COLUMN status TEXT DEFAULT 'aktivan';
  ELSE 
    ALTER TABLE public.predmeti ALTER COLUMN status SET DEFAULT 'aktivan';
  END IF; 
END $$;

-- 3. Postavljamo novo CHECK ograničenje koje dopušta 'aktivan' i 'arhiviran' (i opcionalno stare statuse radi kompatibilnosti)
ALTER TABLE public.predmeti ADD CONSTRAINT predmeti_status_check 
  CHECK (status IN ('aktivan', 'arhiviran', 'Otvoren', 'U radu', 'Riješen'));

-- 4. Ažuriramo sve postojeće predmete u bazi da imaju status 'aktivan'
UPDATE public.predmeti 
SET status = 'aktivan' 
WHERE status IS NULL OR status IN ('Otvoren', 'U radu', 'Riješen');
