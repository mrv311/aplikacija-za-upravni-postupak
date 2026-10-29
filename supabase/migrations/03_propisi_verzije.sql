-- ====================================================================
-- Migracija 03: Arhitektura viševerzijskih propisa Republike Hrvatske
-- Omogućuje praćenje pročišćenih tekstova i povijesnih verzija zakona.
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Tablica temeljnih propisa (katalog)
CREATE TABLE IF NOT EXISTS public.propisi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kratica TEXT NOT NULL UNIQUE,
    naziv TEXT NOT NULL,
    podrucje TEXT NOT NULL,
    tip TEXT NOT NULL CHECK (tip IN ('Zakon', 'Uredba', 'Pravilnik', 'Odluka')),
    temeljni_nn TEXT NOT NULL,
    eli_uri TEXT,
    izvor TEXT DEFAULT 'Narodne novine (ELI)',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tablica verzija propisa (kronologija izmjena i dopuna)
CREATE TABLE IF NOT EXISTS public.propisi_verzije (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propis_id UUID NOT NULL REFERENCES public.propisi(id) ON DELETE CASCADE,
    verzija_oznaka TEXT NOT NULL, -- npr. "NN 47/09", "NN 110/21 (pročišćeni)"
    vrijedi_od DATE,
    vrijedi_do DATE,
    je_vazeca BOOLEAN DEFAULT false,
    izmjene_obuhvacene TEXT[] DEFAULT '{}',
    broj_clanaka INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tablica članaka po pojedinoj verziji
CREATE TABLE IF NOT EXISTS public.propisi_clanci (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verzija_id UUID NOT NULL REFERENCES public.propisi_verzije(id) ON DELETE CASCADE,
    clanak_broj TEXT NOT NULL, -- npr. "Članak 1.", "Članak 10a."
    naslov TEXT,
    tekst TEXT NOT NULL,
    redoslijed INTEGER,
    embedding VECTOR(768)
);

-- Indeksi za brzo filtriranje i pretragu
CREATE INDEX IF NOT EXISTS idx_propisi_kratica ON public.propisi(kratica);
CREATE INDEX IF NOT EXISTS idx_propisi_podrucje ON public.propisi(podrucje);
CREATE INDEX IF NOT EXISTS idx_propisi_verzije_propis ON public.propisi_verzije(propis_id);
CREATE INDEX IF NOT EXISTS idx_propisi_verzije_vazeca ON public.propisi_verzije(je_vazeca);
CREATE INDEX IF NOT EXISTS idx_propisi_clanci_verzija ON public.propisi_clanci(verzija_id);
CREATE INDEX IF NOT EXISTS idx_propisi_clanci_broj ON public.propisi_clanci(clanak_broj);

-- Vektorski indeks (HNSW za visoke performanse i točnost semantičke pretrage)
CREATE INDEX IF NOT EXISTS idx_propisi_clanci_embedding 
ON public.propisi_clanci 
USING hnsw (embedding vector_cosine_ops);

-- ====================================================================
-- RPC Funkcija: Semantičko pretraživanje članaka u važećim verzijama propisa
-- ====================================================================
CREATE OR REPLACE FUNCTION match_propisi_vazeci (
    query_embedding VECTOR(768),
    match_threshold FLOAT DEFAULT 0.50,
    match_count INT DEFAULT 10,
    filtriraj_podrucje TEXT DEFAULT NULL,
    filtriraj_kratica TEXT DEFAULT NULL
)
RETURNS TABLE (
    clanak_id UUID,
    propis_kratica TEXT,
    propis_naziv TEXT,
    propis_podrucje TEXT,
    verzija_oznaka TEXT,
    clanak_broj TEXT,
    naslov TEXT,
    tekst TEXT,
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        pc.id AS clanak_id,
        p.kratica AS propis_kratica,
        p.naziv AS propis_naziv,
        p.podrucje AS propis_podrucje,
        pv.verzija_oznaka,
        pc.clanak_broj,
        pc.naslov,
        pc.tekst,
        1 - (pc.embedding <=> query_embedding) AS similarity
    FROM public.propisi_clanci pc
    JOIN public.propisi_verzije pv ON pc.verzija_id = pv.id
    JOIN public.propisi p ON pv.propis_id = p.id
    WHERE pv.je_vazeca = true
      AND (filtriraj_podrucje IS NULL OR p.podrucje = filtriraj_podrucje)
      AND (filtriraj_kratica IS NULL OR p.kratica = filtriraj_kratica)
      AND 1 - (pc.embedding <=> query_embedding) > match_threshold
    ORDER BY (pc.embedding <=> query_embedding) ASC
    LIMIT match_count;
$$;
