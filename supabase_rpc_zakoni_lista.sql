create or replace function get_dostupni_zakoni()
returns table(naziv_zakona text)
language sql stable
as $$
  select distinct naziv_zakona from zakoni;
$$;

create or replace function get_dostupna_praksa()
returns table(naziv_datoteke text)
language sql stable
as $$
  select distinct naziv_datoteke from praksa;
$$;
