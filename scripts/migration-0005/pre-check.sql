-- VERIFICA PRE-MIGRAZIONE 0005 — SOLA LETTURA (solo SELECT sui cataloghi e conteggi: nessuna scrittura, nessun dato personale).
-- Si può incollare nell'SQL Editor di Neon oppure lanciare con psql (stringa DIRETTA, stesso ruolo che applica le migrazioni):
--   psql "<URL diretta>" -v ON_ERROR_STOP=1 -f scripts/migration-0005/pre-check.sql
-- Risultato: una tabella di controlli. Se l'ultima riga (ESITO) è `false`, NON migrare. Se lo schema drizzle non esiste
-- la query stessa va in errore: è già un motivo per non migrare.
with m as (
  select count(*)::int as n, max(created_at) as last from drizzle.__drizzle_migrations
), checks(ord, controllo, ok, dettaglio) as (
  select 1, 'versione PostgreSQL >= 14', current_setting('server_version_num')::int >= 140000, current_setting('server_version')
  union all select 2, 'ruolo e database (solo nomi)', true, current_user || ' @ ' || current_database()
  union all select 3, 'migrazioni registrate = 5 (0000–0004)', (select n = 5 from m), (select n::text from m)
  union all select 4, 'ultima migrazione registrata = 0004_rate_limit_and_throttled', (select last = 1792676806531 from m), (select last::text from m)
  union all select 5, 'tabelle del motore ancora ASSENTI (0005 non applicata né parziale)',
    to_regclass('public.valuations') is null and to_regclass('public.market_references') is null and to_regclass('public.valuation_settings') is null,
    concat_ws(', ', coalesce(to_regclass('public.valuations')::text, '-'), coalesce(to_regclass('public.market_references')::text, '-'), coalesce(to_regclass('public.valuation_settings')::text, '-'))
  union all select 6, 'stato «throttled» presente nel vincolo delle notifiche (0004 applicata)',
    exists (select 1 from pg_constraint where conname = 'leads_notification_status_valid' and pg_get_constraintdef(oid) like '%throttled%'), 'leads_notification_status_valid'
  union all select 7, 'tabella rate_limit_buckets presente (0004)', to_regclass('public.rate_limit_buckets') is not null, ''
  union all select 8, 'il ruolo può creare tabelle nello schema public', has_schema_privilege(current_user, 'public', 'CREATE'), current_user
  union all select 9, 'nessuna transazione aperta da più di 5 minuti',
    (select count(*) = 0 from pg_stat_activity where datname = current_database() and state = 'idle in transaction' and xact_start < now() - interval '5 minutes'),
    'visibilità limitata ai propri processi se il ruolo non è amministratore'
  -- informazioni da annotare e CONFRONTARE con il post-controllo (nessun esito): le richieste e le offerte possono aumentare se nel frattempo
  -- arrivano clienti; le COLONNE di leads e il numero di tabelle non devono cambiare
  union all select 20, 'INFO richieste (leads) — annota: può crescere se arrivano nuove richieste', true, (select count(*)::text from leads)
  union all select 21, 'INFO offerte (offers)', true, (select count(*)::text from offers)
  union all select 22, 'INFO colonne della tabella leads', true, (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'leads')
  union all select 23, 'INFO tabelle nello schema public', true, (select count(*)::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
)
select ord as n, controllo, ok, dettaglio from checks
union all select 99, 'ESITO (tutti i controlli numerati 1–9)', coalesce(bool_and(coalesce(ok, false)) filter (where ord < 20), false), '' from checks
order by 1;
