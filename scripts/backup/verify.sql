-- Conteggi di controllo dopo un ripristino (nessun dato personale).
-- Uso: psql "$DATABASE_URL" -f scripts/backup/verify.sql
-- L'acquisto non ha una tabella propria: vive su leads (stato "purchased", purchase_price, purchased_at).
select 'leads' as controllo, count(*) as n from leads
union all select 'leads acquistati (con prezzo pagato)', count(*) from leads where status = 'purchased' and purchase_price is not null
union all select 'customers', count(*) from customers
union all select 'motorcycles', count(*) from motorcycles
union all select 'offers', count(*) from offers
union all select 'offers accettate', count(*) from offers where status = 'accepted'
union all select 'lead_photos (metadati)', count(*) from lead_photos
union all select 'lead_status_history', count(*) from lead_status_history
union all select 'events', count(*) from events
union all select 'buy_box_rules', count(*) from buy_box_rules
union all select 'admin_users', count(*) from admin_users
union all select 'migrazioni drizzle', count(*) from drizzle.__drizzle_migrations
order by 1;
