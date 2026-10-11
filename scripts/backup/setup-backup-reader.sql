-- Permessi di SOLA LETTURA per il ruolo di backup. Da lanciare UNA volta DOPO la prima migrazione, come proprietario del database
-- (lo stesso ruolo che applica le migrazioni, cioè quello di DATABASE_URL_DIRECT), con la stringa DIRETTA (non -pooler):
--
--   psql "<URL diretta, ruolo proprietario>" -v ON_ERROR_STOP=1 -f scripts/backup/setup-backup-reader.sql
--   (altro nome di ruolo:  -v reader=backup_reader_20261101)
--
-- Prima crea il ruolo con una password forte (Neon Console → Roles); la password non va in questo file. Lo script NON crea il
-- ruolo e NON ne cambia la password: concede solo SELECT/USAGE/CONNECT. Poi verifica con scripts/backup/check-permissions.sql
-- (connesso come il ruolo di backup).
\if :{?reader}
\else
  \set reader backup_reader
\endif
select set_config('moto.reader', :'reader', false) as moto_reader \gset

do $$
declare
  r text := current_setting('moto.reader');
begin
  if not exists (select 1 from pg_roles where rolname = r) then
    raise exception 'Il ruolo % non esiste: crealo prima (Neon Console → Roles)', r;
  end if;
  if to_regnamespace('drizzle') is null then
    raise exception 'Lo schema drizzle non esiste: applica prima le migrazioni (primo avvio del sito oppure npm run db:migrate)';
  end if;

  execute format('grant connect on database %I to %I', current_database(), r);
  execute format('grant usage on schema public, drizzle to %I', r);
  execute format('grant select on all tables in schema public, drizzle to %I', r);
  execute format('grant select on all sequences in schema public, drizzle to %I', r);

  -- tabelle e sequenze create da migrazioni future dallo stesso ruolo
  execute format('alter default privileges for role %I in schema public, drizzle grant select on tables to %I', current_user, r);
  execute format('alter default privileges for role %I in schema public, drizzle grant select on sequences to %I', current_user, r);

  -- difesa in più: le sessioni di questo ruolo sono comunque in sola lettura
  begin
    execute format('alter role %I set default_transaction_read_only = on', r);
  exception when others then
    raise notice 'Impossibile impostare default_transaction_read_only (%): imposta lo stesso da Neon se vuoi la difesa in più', sqlerrm;
  end;
end
$$;
