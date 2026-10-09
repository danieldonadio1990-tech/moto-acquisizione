-- Verifica dei permessi di backup_reader. Da lanciare CONNESSI COME backup_reader (stringa diretta):
--
--   psql "$BACKUP_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backup/check-permissions.sql
--
-- Controlla che possa leggere tutte le tabelle e sequenze di public e drizzle (ciò che serve a pg_dump) e che NON possa scrivere.
-- Non legge dati e non modifica nulla; stampa solo nomi di controlli falliti. Esce con errore se qualcosa non va.
do $$
declare
  problems text[] := '{}';
  r record;
begin
  if (select rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls from pg_roles where rolname = current_user) then
    problems := problems || 'il ruolo ha privilegi di amministrazione (superuser/createrole/createdb/replication/bypassrls)';
  end if;
  if to_regnamespace('drizzle') is null then
    problems := problems || 'schema drizzle assente (migrazioni non ancora applicate?)';
  end if;

  for r in select nspname from pg_namespace where nspname in ('public', 'drizzle') loop
    if not has_schema_privilege(current_user, r.nspname, 'USAGE') then
      problems := problems || format('manca USAGE sullo schema %s', r.nspname);
    end if;
    if has_schema_privilege(current_user, r.nspname, 'CREATE') then
      problems := problems || format('ha CREATE sullo schema %s (non serve)', r.nspname);
    end if;
  end loop;

  for r in
    select n.nspname, c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'drizzle') and c.relkind in ('r', 'p', 'S')
      and has_schema_privilege(current_user, n.nspname, 'USAGE') -- senza USAGE il controllo sulle tabelle darebbe solo un errore generico
  loop
    if r.relkind = 'S' then
      if not has_sequence_privilege(current_user, format('%I.%I', r.nspname, r.relname), 'SELECT') then
        problems := problems || format('manca SELECT sulla sequenza %s.%s', r.nspname, r.relname);
      end if;
      if has_sequence_privilege(current_user, format('%I.%I', r.nspname, r.relname), 'UPDATE') then
        problems := problems || format('ha UPDATE sulla sequenza %s.%s (non serve)', r.nspname, r.relname);
      end if;
    else
      if not has_table_privilege(current_user, format('%I.%I', r.nspname, r.relname), 'SELECT') then
        problems := problems || format('manca SELECT sulla tabella %s.%s', r.nspname, r.relname);
      end if;
      if has_table_privilege(current_user, format('%I.%I', r.nspname, r.relname), 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
        problems := problems || format('ha privilegi di scrittura sulla tabella %s.%s (non servono)', r.nspname, r.relname);
      end if;
    end if;
  end loop;

  if has_database_privilege(current_user, current_database(), 'CREATE') then
    problems := problems || 'ha CREATE sul database (non serve)';
  end if;

  if array_length(problems, 1) > 0 then
    raise exception E'Permessi di backup_reader NON corretti:\n  - %', array_to_string(problems, E'\n  - ');
  end if;
  raise notice 'OK: backup_reader può leggere tutto ciò che serve a pg_dump e non ha privilegi di scrittura';
end
$$;
