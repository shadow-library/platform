CREATE TYPE "public"."catalog_state" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('pending', 'ok', 'error', 'refused', 'cancelled');--> statement-breakpoint
CREATE TABLE "budget_counters" (
	"app" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"window" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"list_cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	CONSTRAINT "budget_counters_pk" PRIMARY KEY("app","subject_type","subject_id","window","window_start")
);
--> statement-breakpoint
CREATE TABLE "catalog_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"state" "catalog_state" DEFAULT 'DRAFT' NOT NULL,
	"document" jsonb NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "catalog_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"request_id" text PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"task" text NOT NULL,
	"alias" text,
	"model" text,
	"provider" text,
	"deployment_id" text,
	"catalog_version" integer NOT NULL,
	"status" "ledger_status" NOT NULL,
	"error_code" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"list_cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"billed_cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"ttft_ms" integer,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"effort" text,
	"stream" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_versions_single_draft_idx" ON "catalog_versions" USING btree ("state") WHERE state = 'DRAFT';--> statement-breakpoint
CREATE INDEX "ledger_created_at_idx" ON "ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ledger_app_task_created_at_idx" ON "ledger" USING btree ("app","task","created_at");--> statement-breakpoint
CREATE INDEX "ledger_alias_created_at_idx" ON "ledger" USING btree ("alias","created_at");