-- Omogućavanje pgvector ekstenzije (ako već nije)
create extension if not exists vector;

-- Uklanjamo staru funkciju ako postoji kako bi izbjegli grešku s povratnim tipom
drop function if exists match_zakoni(vector, float, int);

-- RPC funkcija za pretraživanje zakona (vektori su 768 dimenzija)
create or replace function match_zakoni (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  naziv_zakona text,
  clanak_broj text,
  tekst text,
  similarity float
)
language sql stable
as $$
  select
    id,
    naziv_zakona,
    clanak_broj,
    tekst,
    1 - (zakoni.embedding <=> query_embedding) as similarity
  from zakoni
  where 1 - (zakoni.embedding <=> query_embedding) > match_threshold
  order by (zakoni.embedding <=> query_embedding) asc
  limit match_count;
$$;

-- Uklanjamo staru funkciju ako postoji
drop function if exists match_praksa(vector, float, int);

-- RPC funkcija za pretraživanje sudske prakse (vektori su 768 dimenzija)
create or replace function match_praksa (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  naziv_datoteke text,
  sadrzaj text,
  similarity float
)
language sql stable
as $$
  select
    id,
    naziv_datoteke,
    sadrzaj,
    1 - (praksa.embedding <=> query_embedding) as similarity
  from praksa
  where 1 - (praksa.embedding <=> query_embedding) > match_threshold
  order by (praksa.embedding <=> query_embedding) asc
  limit match_count;
$$;
