CREATE TYPE "public"."metric_direction" AS ENUM('higher', 'lower', 'range', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."metric_entry_source" AS ENUM('quest_log', 'manual', 'food');--> statement-breakpoint
CREATE TYPE "public"."metric_value_type" AS ENUM('number', 'duration', 'count', 'currency', 'boolean', 'text');--> statement-breakpoint
CREATE TABLE "metric_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"metric_id" bigint NOT NULL,
	"date" date NOT NULL,
	"value" numeric NOT NULL,
	"source" "metric_entry_source" DEFAULT 'manual' NOT NULL,
	"quest_log_id" bigint,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(100) NOT NULL,
	"unit" varchar(32),
	"value_type" "metric_value_type" NOT NULL,
	"direction" "metric_direction" NOT NULL,
	"default_value" numeric,
	"glyph" varchar(16),
	"builtin" boolean DEFAULT false NOT NULL,
	"is_health" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_account_id_name_unique" UNIQUE("account_id","name")
);
--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_account_id_metric_id_date_source_unique" ON "metric_entries" USING btree ("account_id","metric_id","date","source") WHERE "metric_entries"."source" <> 'quest_log';--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_quest_log_id_metric_id_unique" ON "metric_entries" USING btree ("quest_log_id","metric_id") WHERE "metric_entries"."quest_log_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "metric_entries_account_id_sync_seq_idx" ON "metric_entries" USING btree ("account_id","sync_seq");--> statement-breakpoint
ALTER TABLE "quest_consequences" ADD CONSTRAINT "quest_consequences_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE no action ON UPDATE no action;