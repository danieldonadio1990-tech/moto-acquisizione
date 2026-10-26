-- VERIFICA POST-MIGRAZIONE 0005 — SOLA LETTURA (cataloghi e conteggi: nessuna scrittura, nessun dato personale).
-- Stesso modo d'uso di pre-check.sql. Se l'ultima riga (ESITO) è `false`, vedi docs/MIGRAZIONE-0005.md (rollback).
with m as (
  select count(*)::int as n, max(created_at) as last from drizzle.__drizzle_migrations
), checks(ord, controllo, ok, dettaglio) as (
  select 1, 'migrazioni registrate = 6 (0000–0005)', (select n = 6 from m), (select n::text from m)
  union all select 2, 'ultima migrazione registrata = 0005_valuation_engine', (select last = 1793054993829 from m), (select last::text from m)
  union all select 3, 'le tre tabelle esistono', to_regclass('public.valuations') is not null and to_regclass('public.market_references') is not null and to_regclass('public.valuation_settings') is not null, ''
  union all select 4, 'colonne attese (valuations 25, market_references 14, valuation_settings 9)',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'valuations') = 25
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'market_references') = 14
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'valuation_settings') = 9, ''
  union all select 5, 'chiavi esterne di valuations (verso leads e valuation_settings)',
    (select count(*) from pg_constraint where conrelid = to_regclass('public.valuations') and contype = 'f') = 2, ''
  union all select 6, 'vincoli di coerenza presenti (check e unicità)',
    (select count(*) from pg_constraint where conname in ('valuations_status_valid','valuations_amounts_non_negative','valuations_manual_has_reason','valuation_settings_status_valid','valuation_settings_approval_coherent','valuation_settings_version_unique','market_references_kind_valid','market_references_median_positive','market_references_samples_positive','market_references_years_valid')) = 10, ''
  union all select 7, 'indici unici (una revisione per richiesta, una sola versione approvata)',
    (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('valuations_lead_revision_uq','valuation_settings_one_approved')) = 2, ''
  union all select 8, 'tabelle nuove vuote subito dopo la migrazione (se già usate, il controllo non è un errore)', true,
    case when to_regclass('public.valuations') is not null and to_regclass('public.market_references') is not null and to_regclass('public.valuation_settings') is not null
      then (select string_agg((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', t), false, true, '')))[1]::text, ' / ' order by t)
            from unnest(array['valuations','market_references','valuation_settings']) as t)
      else 'tabelle assenti' end
  union all select 9, 'backup_reader può leggere le tre tabelle nuove (se il ruolo esiste)',
    case when not exists (select 1 from pg_roles where rolname = 'backup_reader') then true
         else coalesce(has_table_privilege('backup_reader', to_regclass('public.valuations'), 'SELECT'), false) and coalesce(has_table_privilege('backup_reader', to_regclass('public.market_references'), 'SELECT'), false) and coalesce(has_table_privilege('backup_reader', to_regclass('public.valuation_settings'), 'SELECT'), false) end,
    case when exists (select 1 from pg_roles where rolname = 'backup_reader') then 'ruolo presente' else 'ruolo assente: controllo saltato' end
  -- da CONFRONTARE con le INFO del pre-controllo: devono essere IDENTICHE (la migrazione non tocca le tabelle esistenti)
  union all select 20, 'INFO richieste (leads)', true, (select count(*)::text from leads)
  union all select 21, 'INFO offerte (offers)', true, (select count(*)::text from offers)
  union all select 22, 'INFO colonne della tabella leads', true, (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'leads')
  union all select 23, 'INFO tabelle nello schema public (pre + 3)', true, (select count(*)::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
)
select ord as n, controllo, ok, dettaglio from checks
union all select 99, 'ESITO (tutti i controlli numerati 1–9)', bool_and(ok) filter (where ord < 20), '' from checks
order by 1;
