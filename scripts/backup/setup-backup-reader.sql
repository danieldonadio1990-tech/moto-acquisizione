-- Permessi di SOLA LETTURA per il ruolo di backup. Da lanciare UNA volta DOPO la prima migrazione, come proprietario del database
-- (lo stesso ruolo che applica le migrazioni, cioè quello di DATABASE_URL_DIRECT), con la stringa DIRETTA (non -pooler):
--
--   psql "<URL diretta, ruolo proprietario>" -v ON_ERROR_STOP=1 -f scripts/backup/setup-backup-reader.sql
--
-- Prima crea il ruolo con una password forte (Neon Console → Roles → New role "backup_reader"); la password non va in questo file.
-- Lo script concede solo SELECT/USAGE/CONNECT. Poi verifica con scripts/backup/check-permissions.sql (connesso come backup_reader).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    raise exception 'Il ruolo backup_reader non esiste: crealo prima (Neon Console → Roles)';
  end if;
  if to_regnamespace('drizzle') is null then
    raise exception 'Lo schema drizzle non esiste: applica prima le migrazioni (primo avvio del sito oppure npm run db:migrate)';
  end if;

  execute format('grant connect on database %I to backup_reader', current_database());
  grant usage on schema public, drizzle to backup_reader;
  grant select on all tables in schema public, drizzle to backup_reader;
  grant select on all sequences in schema public, drizzle to backup_reader;

  -- tabelle e sequenze create da migrazioni future dallo stesso ruolo
  execute format('alter default privileges for role %I in schema public, drizzle grant select on tables to backup_reader', current_user);
  execute format('alter default privileges for role %I in schema public, drizzle grant select on sequences to backup_reader', current_user);

  -- difesa in più: le sessioni di questo ruolo sono comunque in sola lettura
  begin
    alter role backup_reader set default_transaction_read_only = on;
  exception when others then
    raise notice 'Impossibile impostare default_transaction_read_only (%): imposta lo stesso da Neon se vuoi la difesa in più', sqlerrm;
  end;
end
$$;
