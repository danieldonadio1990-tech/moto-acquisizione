CREATE TYPE "public"."buy_box_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('whatsapp', 'phone', 'email');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'to_contact', 'contacted', 'interesting', 'appointment', 'offer_made', 'accepted', 'purchased', 'rejected', 'not_interesting');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."tri_state" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "buy_box_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"model" text,
	"min_year" integer,
	"max_year" integer,
	"max_mileage" integer,
	"max_purchase_price" integer,
	"require_running" boolean DEFAULT false NOT NULL,
	"market" text DEFAULT 'milano' NOT NULL,
	"priority" "buy_box_priority" DEFAULT 'medium' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"city" text NOT NULL,
	"privacy_consent_at" timestamp with time zone NOT NULL,
	"privacy_policy_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"session_id" text,
	"lead_id" uuid,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"motorcycle_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"mileage" integer NOT NULL,
	"is_running" boolean NOT NULL,
	"accident" "tri_state" NOT NULL,
	"mechanical_issues" "tri_state" NOT NULL,
	"maintenance" "tri_state" NOT NULL,
	"preferred_contact" "contact_channel" NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"market" text DEFAULT 'milano' NOT NULL,
	"notes" text,
	"purchase_price" integer,
	"purchased_at" timestamp with time zone,
	"photo_upload_token_hash" text,
	"photo_upload_token_expires_at" timestamp with time zone,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "motorcycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_model_id" text,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"version" text,
	"year" integer NOT NULL,
	"displacement" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"status" "offer_status" DEFAULT 'proposed' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_photos" ADD CONSTRAINT "lead_photos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_name_created_idx" ON "events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");