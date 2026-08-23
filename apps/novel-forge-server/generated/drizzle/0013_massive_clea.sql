CREATE TYPE "public"."reforge_mode" AS ENUM('chapter', 'transform');--> statement-breakpoint
CREATE TYPE "public"."reforge_analysis_status" AS ENUM('pending', 'signals', 'analyzing', 'synthesizing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reforge_cut_disposition" AS ENUM('cut', 'condensed', 'resolved_early');--> statement-breakpoint
CREATE TYPE "public"."reforge_cut_kind" AS ENUM('subplot', 'thread', 'entity', 'arc', 'running_gag', 'scene_pattern');--> statement-breakpoint
CREATE TYPE "public"."reforge_finding_source" AS ENUM('signal', 'model', 'both');--> statement-breakpoint
CREATE TYPE "public"."reforge_finding_type" AS ENUM('filler', 'repetition', 'pacing_stall', 'dead_subplot', 'dropped_thread', 'arc_boundary', 'quality_outlier', 'window_failed');--> statement-breakpoint
CREATE TYPE "public"."reforge_output_status" AS ENUM('written', 'attention', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reforge_plan_status" AS ENUM('draft', 'pending', 'approved', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."reforge_span_action" AS ENUM('keep', 'condense', 'merge', 'drop');--> statement-breakpoint
CREATE TABLE "reforge_analyses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"status" "reforge_analysis_status" DEFAULT 'pending' NOT NULL,
	"window_size" integer DEFAULT 15 NOT NULL,
	"chapters_analyzed" integer DEFAULT 0 NOT NULL,
	"windows_failed" integer DEFAULT 0 NOT NULL,
	"signals" jsonb,
	"report" text,
	"metrics" jsonb,
	"run_ids" jsonb,
	"last_error" varchar(2000),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reforge_chapter_cards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"analysis_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"card" jsonb NOT NULL,
	"movement" varchar(16) NOT NULL,
	"threads_opened" jsonb,
	"threads_closed" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reforge_chapter_cards_analysis_id_chapter_unique" UNIQUE("analysis_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "reforge_cuts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"plan_id" bigint NOT NULL,
	"cut_key" varchar(128) NOT NULL,
	"kind" "reforge_cut_kind" NOT NULL,
	"label" varchar(500) NOT NULL,
	"aliases" jsonb,
	"detail" text,
	"disposition" "reforge_cut_disposition" DEFAULT 'cut' NOT NULL,
	"replacement_note" text,
	"origin_span_ordinal" integer NOT NULL,
	"first_source_chapter" integer NOT NULL,
	"last_source_chapter" integer NOT NULL,
	"effective_from_output" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reforge_cuts_plan_id_cut_key_unique" UNIQUE("plan_id","cut_key")
);
--> statement-breakpoint
CREATE TABLE "reforge_findings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"analysis_id" bigint NOT NULL,
	"type" "reforge_finding_type" NOT NULL,
	"from_chapter" integer NOT NULL,
	"to_chapter" integer NOT NULL,
	"severity" integer NOT NULL,
	"confidence" real NOT NULL,
	"detected_by" "reforge_finding_source" NOT NULL,
	"label" varchar(500) NOT NULL,
	"detail" text,
	"evidence" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reforge_outputs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"plan_id" bigint NOT NULL,
	"output_chapter" integer NOT NULL,
	"span_ordinal" integer NOT NULL,
	"span_key" varchar(64) NOT NULL,
	"from_chapter" integer NOT NULL,
	"to_chapter" integer NOT NULL,
	"index_in_span" integer NOT NULL,
	"title" varchar(500),
	"body" text NOT NULL,
	"summary" text,
	"plan_beats" jsonb,
	"changes" jsonb,
	"fidelity" jsonb,
	"carry_state" jsonb,
	"cut_delta" jsonb,
	"status" "reforge_output_status" NOT NULL,
	"issues" jsonb,
	"word_count" integer,
	"run_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reforge_outputs_plan_chapter_unique" UNIQUE("plan_id","output_chapter")
);
--> statement-breakpoint
CREATE TABLE "reforge_plan_spans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"plan_id" bigint NOT NULL,
	"ordinal" integer NOT NULL,
	"span_key" varchar(64) NOT NULL,
	"from_chapter" integer NOT NULL,
	"to_chapter" integer NOT NULL,
	"action" "reforge_span_action" NOT NULL,
	"target_chapters" integer NOT NULL,
	"arc_label" varchar(200),
	"rationale" text,
	"kept_beats" jsonb,
	"cut_threads" jsonb,
	"continuity_notes" text,
	"bridge_directive" text,
	"finding_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reforge_plan_spans_plan_id_ordinal_unique" UNIQUE("plan_id","ordinal"),
	CONSTRAINT "reforge_plan_spans_plan_id_span_key_unique" UNIQUE("plan_id","span_key")
);
--> statement-breakpoint
CREATE TABLE "reforge_plans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"analysis_id" bigint,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" "reforge_plan_status" DEFAULT 'draft' NOT NULL,
	"summary" text,
	"source_chapter_count" integer NOT NULL,
	"output_chapter_count" integer DEFAULT 0 NOT NULL,
	"promoted_project_id" bigint,
	"approved_at" timestamp,
	"last_error" varchar(2000),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reforge_plans_project_id_revision_unique" UNIQUE("project_id","revision")
);
--> statement-breakpoint
ALTER TABLE "reforges" ADD COLUMN "mode" "reforge_mode" DEFAULT 'chapter' NOT NULL;--> statement-breakpoint
ALTER TABLE "reforge_analyses" ADD CONSTRAINT "reforge_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_chapter_cards" ADD CONSTRAINT "reforge_chapter_cards_analysis_id_reforge_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."reforge_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_cuts" ADD CONSTRAINT "reforge_cuts_plan_id_reforge_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."reforge_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_findings" ADD CONSTRAINT "reforge_findings_analysis_id_reforge_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."reforge_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_outputs" ADD CONSTRAINT "reforge_outputs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_outputs" ADD CONSTRAINT "reforge_outputs_plan_id_reforge_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."reforge_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_plan_spans" ADD CONSTRAINT "reforge_plan_spans_plan_id_reforge_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."reforge_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_plans" ADD CONSTRAINT "reforge_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_plans" ADD CONSTRAINT "reforge_plans_analysis_id_reforge_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."reforge_analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reforge_plans" ADD CONSTRAINT "reforge_plans_promoted_project_id_projects_id_fk" FOREIGN KEY ("promoted_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reforge_analyses_project_id_created_at_idx" ON "reforge_analyses" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "reforge_findings_analysis_id_type_idx" ON "reforge_findings" USING btree ("analysis_id","type");--> statement-breakpoint
CREATE INDEX "reforge_outputs_project_status_idx" ON "reforge_outputs" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "reforge_outputs_plan_span_idx" ON "reforge_outputs" USING btree ("plan_id","span_key");--> statement-breakpoint
CREATE INDEX "reforge_plans_project_id_status_idx" ON "reforge_plans" USING btree ("project_id","status");