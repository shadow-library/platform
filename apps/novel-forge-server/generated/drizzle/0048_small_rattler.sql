CREATE TYPE "public"."blueprint_round_status" AS ENUM('pending', 'running', 'ready', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."refinement_kind" ADD VALUE 'blueprint';--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'blueprint';--> statement-breakpoint
CREATE TABLE "blueprint_rounds" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"step_key" varchar(60) NOT NULL,
	"round" integer NOT NULL,
	"status" "blueprint_round_status" DEFAULT 'pending' NOT NULL,
	"job_id" uuid,
	"steer" text,
	"nudges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keep_as_direction" boolean DEFAULT false NOT NULL,
	"feedback" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input" jsonb,
	"focus" varchar(60),
	"options" jsonb,
	"coach_message" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blueprint_rounds_project_id_step_key_round_unique" UNIQUE("project_id","step_key","round")
);
--> statement-breakpoint
ALTER TABLE "decision_ledger_entries" ADD COLUMN "step_key" varchar(60);--> statement-breakpoint
ALTER TABLE "blueprint_rounds" ADD CONSTRAINT "blueprint_rounds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blueprint_rounds" ADD CONSTRAINT "blueprint_rounds_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_rounds_one_active_per_step_idx" ON "blueprint_rounds" USING btree ("project_id","step_key") WHERE "blueprint_rounds"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "blueprint_rounds_job_id_idx" ON "blueprint_rounds" USING btree ("job_id");