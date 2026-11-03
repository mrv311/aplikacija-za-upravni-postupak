-- ====================================================================
-- Migracija 04: Dodavanje hijerarhijskih oznaka i naslova članaka u tablicu 'zakoni'
-- Omogućuje strukturirani prikaz glava, poglavlja i naziva članaka
-- ====================================================================

-- 1. Dodavanje stupaca za hijerarhijsku strukturu ako već ne postoje
ALTER TABLE public.zakoni ADD COLUMN IF NOT EXISTS naslov TEXT;
ALTER TABLE public.zakoni ADD COLUMN IF NOT EXISTS struktura TEXT;
ALTER TABLE public.zakoni ADD COLUMN IF NOT EXISTS dio TEXT;
ALTER TABLE public.zakoni ADD COLUMN IF NOT EXISTS glava TEXT;
ALTER TABLE public.zakoni ADD COLUMN IF NOT EXISTS poglavlje TEXT;
ALTER TABLE public.zakoni ADD COLUMN IF NOT EXISTS odjeljak TEXT;

-- 2. Indeksi za brzo pretraživanje i filtriranje po dijelovima i glavama
CREATE INDEX IF NOT EXISTS idx_zakoni_dio ON public.zakoni(dio);
CREATE INDEX IF NOT EXISTS idx_zakoni_glava ON public.zakoni(glava);
CREATE INDEX IF NOT EXISTS idx_zakoni_struktura ON public.zakoni(struktura);
