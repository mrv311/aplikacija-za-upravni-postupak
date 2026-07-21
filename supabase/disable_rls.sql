-- Omogući anonimno čitanje, pisanje, brisanje i ažuriranje za tablicu predmeti
DROP POLICY IF EXISTS "Allow anonymous access to predmeti" ON public.predmeti;
CREATE POLICY "Allow anonymous access to predmeti" 
ON public.predmeti 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- Omogući anonimno čitanje, pisanje, brisanje i ažuriranje za tablicu dokumenti
DROP POLICY IF EXISTS "Allow anonymous access to dokumenti" ON public.dokumenti;
CREATE POLICY "Allow anonymous access to dokumenti" 
ON public.dokumenti 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- Provjeri da je RLS omogućen (ukoliko nije, politike se ne primjenjuju, ali dobro je biti siguran)
ALTER TABLE public.predmeti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dokumenti ENABLE ROW LEVEL SECURITY;

-- Alternativni način (potpuno isključivanje RLS-a, manje sigurno ali dobro za lokalni razvoj):
-- ALTER TABLE public.predmeti DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.dokumenti DISABLE ROW LEVEL SECURITY;
