-- Create predmeti table
CREATE TABLE IF NOT EXISTS public.predmeti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    klasa TEXT NOT NULL,
    urbroj TEXT,
    stranka TEXT,
    datum_zaprimanja DATE,
    status TEXT CHECK (status IN ('Otvoren', 'U radu', 'Riješen')) DEFAULT 'Otvoren'
);

-- Create dokumenti table
CREATE TABLE IF NOT EXISTS public.dokumenti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predmet_id UUID REFERENCES public.predmeti(id) ON DELETE CASCADE,
    tip_dokumenta TEXT,
    raw_text TEXT,
    storage_url TEXT
);
