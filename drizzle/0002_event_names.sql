-- Nomi eventi allineati alla Phase 1.6
UPDATE "events" SET "name" = 'valuation_start' WHERE "name" = 'funnel_start';--> statement-breakpoint
UPDATE "events" SET "name" = 'contact_submitted', "props" = NULL WHERE "name" = 'funnel_step_completed' AND "props"->>'step' = 'Contatti';--> statement-breakpoint
UPDATE "events" SET "name" = 'step_completed' WHERE "name" = 'funnel_step_completed';
