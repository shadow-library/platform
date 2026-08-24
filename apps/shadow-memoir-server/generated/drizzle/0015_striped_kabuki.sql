CREATE TYPE "public"."ai_consent_data_class" AS ENUM('journal_reflection_reason', 'health');--> statement-breakpoint
CREATE TYPE "public"."ai_task_audit_action" AS ENUM('claimed', 'read_scope', 'finished', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."ai_task_kind" AS ENUM('adhoc', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."ai_task_status" AS ENUM('pending', 'running', 'done', 'failed', 'cancelled', 'held_upgrade');--> statement-breakpoint
CREATE TABLE "ai_consents" (
	"account_id" bigint NOT NULL,
	"data_class" "ai_consent_data_class" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "ai_consents_account_id_data_class_unique" UNIQUE("account_id","data_class")
);
--> statement-breakpoint
CREATE TABLE "ai_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"task_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limitation_note" text,
	"model_id" varchar(64) NOT NULL,
	"prompt_version" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "ai_results_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "ai_scheduled_queries" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"query_text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"task_id" uuid NOT NULL,
	"action" "ai_task_audit_action" NOT NULL,
	"data_classes" text[],
	"row_counts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"query_text" text NOT NULL,
	"status" "ai_task_status" DEFAULT 'pending' NOT NULL,
	"kind" "ai_task_kind" DEFAULT 'adhoc' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_by" timestamp with time zone NOT NULL,
	"quota_month" varchar(7),
	"quota_consumed" boolean DEFAULT false NOT NULL,
	"claimed_by" varchar(64),
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" varchar(500),
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applied_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"result_id" bigint NOT NULL,
	"suggestion_index" smallint NOT NULL,
	"quest_id" bigint NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quest_snapshot_before" jsonb NOT NULL,
	CONSTRAINT "applied_suggestions_result_id_suggestion_index_unique" UNIQUE("result_id","suggestion_index")
);
--> statement-breakpoint
ALTER TABLE "ai_consents" ADD CONSTRAINT "ai_consents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_scheduled_queries" ADD CONSTRAINT "ai_scheduled_queries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_audit" ADD CONSTRAINT "ai_task_audit_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_audit" ADD CONSTRAINT "ai_task_audit_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_suggestions" ADD CONSTRAINT "applied_suggestions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_suggestions" ADD CONSTRAINT "applied_suggestions_result_id_ai_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."ai_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_suggestions" ADD CONSTRAINT "applied_suggestions_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_results_account_id_sync_seq_idx" ON "ai_results" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "ai_tasks_status_submitted_at_idx" ON "ai_tasks" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "ai_tasks_account_id_quota_month_idx" ON "ai_tasks" USING btree ("account_id","quota_month") WHERE "ai_tasks"."quota_consumed";--> statement-breakpoint
CREATE INDEX "ai_tasks_account_id_sync_seq_idx" ON "ai_tasks" USING btree ("account_id","sync_seq");