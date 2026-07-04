CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."content_generator" AS ENUM('standard', 'grok');--> statement-breakpoint
CREATE TYPE "public"."content_mode" AS ENUM('standard', 'grok_only');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('source', 'new_novel');--> statement-breakpoint
CREATE TYPE "public"."chapter_status" AS ENUM('done', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."entity_origin" AS ENUM('extracted', 'seeded', 'generated');--> statement-breakpoint
CREATE TYPE "public"."entity_significance" AS ENUM('major', 'minor');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('character', 'faction', 'location', 'power_rule', 'item', 'concept');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'approved', 'source');--> statement-breakpoint
CREATE TYPE "public"."mystery_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."bible_section" AS ENUM('project', 'world', 'power', 'plot', 'story_state', 'ai', 'lore');--> statement-breakpoint
CREATE TYPE "public"."continuity_proposal_status" AS ENUM('pending', 'applied', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TYPE "public"."judge_verdict" AS ENUM('consistent', 'contradiction');--> statement-breakpoint
CREATE TYPE "public"."job_kind" AS ENUM('ingest', 'extract', 'generate', 'finalize', 'backfill', 'resume');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'in_progress', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."validation_scope" AS ENUM('novel', 'chapter');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_id" bigint,
	"name" varchar(255) NOT NULL,
	"kind" "project_kind" NOT NULL,
	"title" varchar(500),
	"content_mode" "content_mode" DEFAULT 'standard' NOT NULL,
	"config" jsonb,
	"brief" text,
	"premise" text,
	"themes" jsonb,
	"instructions" text,
	"source_project_id" bigint,
	"source_url" varchar,
	"source_adapter" varchar,
	"source_novel_id" varchar,
	"scrape_next_url" varchar,
	"scrape_next_number" integer DEFAULT 1 NOT NULL,
	"scrape_complete" boolean DEFAULT false NOT NULL,
	"story_current_chapter" integer DEFAULT 0,
	"story_current_volume_key" varchar,
	"skeleton_character_arcs" jsonb,
	"skeleton_power_curve" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"title" varchar(500),
	"url" varchar,
	"content" text,
	"summary" text,
	"word_count" integer,
	"status" "chapter_status" NOT NULL,
	"generator" "content_generator" DEFAULT 'standard' NOT NULL,
	"continuity_applied" boolean DEFAULT false NOT NULL,
	"note" text,
	"scraped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_project_id_number_unique" UNIQUE("project_id","number")
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entity_key" varchar NOT NULL,
	"type" "entity_type" NOT NULL,
	"name" varchar NOT NULL,
	"attributes" jsonb,
	"significance" "entity_significance",
	"first_seen_chapter" integer,
	"status" varchar,
	"origin" "entity_origin",
	"notes" text,
	"motivation" text,
	"body" text,
	"image_path" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entities_project_id_entity_key_unique" UNIQUE("project_id","entity_key")
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"entity_id" bigint NOT NULL,
	"alias" varchar NOT NULL,
	CONSTRAINT "entity_aliases_entity_id_alias_pk" PRIMARY KEY("entity_id","alias")
);
--> statement-breakpoint
CREATE TABLE "entity_appearances" (
	"entity_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"first_chapter" integer,
	"last_chapter" integer,
	"seen_chapters" jsonb,
	CONSTRAINT "entity_appearances_entity_id_chapter_pk" PRIMARY KEY("entity_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "entity_relationships" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entity_id" bigint NOT NULL,
	"target_key" varchar NOT NULL,
	"kind" varchar NOT NULL,
	"note" text,
	"chapter" integer,
	CONSTRAINT "entity_relationships_project_id_entity_id_target_key_kind_chapter_unique" UNIQUE("project_id","entity_id","target_key","kind","chapter")
);
--> statement-breakpoint
CREATE TABLE "relationship_observations" (
	"entity_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"target_key" varchar NOT NULL,
	"kind" varchar NOT NULL,
	"chapter" integer NOT NULL,
	"note" text,
	CONSTRAINT "relationship_observations_entity_id_target_key_kind_chapter_pk" PRIMARY KEY("entity_id","target_key","kind","chapter")
);
--> statement-breakpoint
CREATE TABLE "volumes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"volume_key" varchar NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"title" varchar(500),
	"objective" text,
	"conflict" text,
	"payoff" text,
	"start_chapter" integer,
	"end_chapter" integer,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"cast" jsonb,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "volumes_project_id_volume_key_unique" UNIQUE("project_id","volume_key")
);
--> statement-breakpoint
CREATE TABLE "beats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"beat_key" varchar NOT NULL,
	"chapter" integer NOT NULL,
	"beat_type" varchar,
	"summary" text,
	"entities" jsonb,
	"opens_threads" jsonb,
	"closes_threads" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beats_project_id_beat_key_unique" UNIQUE("project_id","beat_key")
);
--> statement-breakpoint
CREATE TABLE "mysteries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"mystery_key" varchar NOT NULL,
	"question" text NOT NULL,
	"status" "mystery_status" NOT NULL,
	"opened_chapter" integer,
	"resolved_chapter" integer,
	"known_to" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mysteries_project_id_mystery_key_unique" UNIQUE("project_id","mystery_key")
);
--> statement-breakpoint
CREATE TABLE "plot_threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"thread_key" varchar NOT NULL,
	"status" "thread_status" NOT NULL,
	"opened_chapter" integer,
	"closed_chapter" integer,
	"summary" text,
	"owner" varchar,
	"payoff" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plot_threads_project_id_thread_key_unique" UNIQUE("project_id","thread_key")
);
--> statement-breakpoint
CREATE TABLE "power_progressions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"character" varchar,
	"stage" varchar,
	"chapter" integer,
	"feat" text,
	"next" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "power_progressions_project_id_character_chapter_unique" UNIQUE("project_id","character","chapter")
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"when_text" varchar,
	"event" text NOT NULL,
	"chapter" integer,
	"significance" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"category" varchar NOT NULL,
	"key" varchar NOT NULL,
	"value" text NOT NULL,
	"chapter" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_facts_project_id_category_key_unique" UNIQUE("project_id","category","key")
);
--> statement-breakpoint
CREATE TABLE "bible_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"section" "bible_section" NOT NULL,
	"slug" varchar NOT NULL,
	"frontmatter" jsonb,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bible_documents_project_id_section_slug_unique" UNIQUE("project_id","section","slug")
);
--> statement-breakpoint
CREATE TABLE "briefs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"volume_key" varchar,
	"title" varchar,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "briefs_project_id_chapter_unique" UNIQUE("project_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "continuity_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"status" "continuity_proposal_status" DEFAULT 'pending' NOT NULL,
	"proposal" jsonb NOT NULL,
	"model" varchar,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "continuity_proposals_project_id_chapter_unique" UNIQUE("project_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"title" varchar(500),
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"words" integer,
	"volume_key" varchar,
	"summary" text,
	"body" text NOT NULL,
	"state" jsonb,
	"generator" "content_generator" DEFAULT 'standard' NOT NULL,
	"judge" "judge_verdict",
	"judge_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_project_id_chapter_unique" UNIQUE("project_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "extraction_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer,
	"role" varchar,
	"model" varchar,
	"status" varchar,
	"raw_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" bigint NOT NULL,
	"kind" "job_kind" NOT NULL,
	"target" varchar NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" varchar(2000),
	"payload" jsonb,
	"progress" jsonb,
	"next_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_project_id_kind_target_unique" UNIQUE("project_id","kind","target")
);
--> statement-breakpoint
CREATE TABLE "validation_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"scope" "validation_scope" NOT NULL,
	"chapter" integer,
	"issues" integer NOT NULL,
	"summary" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapter_chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"chunk_idx" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_project_id_projects_id_fk" FOREIGN KEY ("source_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_appearances" ADD CONSTRAINT "entity_appearances_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relationships" ADD CONSTRAINT "entity_relationships_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_observations" ADD CONSTRAINT "relationship_observations_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beats" ADD CONSTRAINT "beats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mysteries" ADD CONSTRAINT "mysteries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_threads" ADD CONSTRAINT "plot_threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "power_progressions" ADD CONSTRAINT "power_progressions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_facts" ADD CONSTRAINT "world_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bible_documents" ADD CONSTRAINT "bible_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_proposals" ADD CONSTRAINT "continuity_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_chunks" ADD CONSTRAINT "chapter_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapters_project_id_status_idx" ON "chapters" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "entities_project_id_type_idx" ON "entities" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX "volumes_project_id_ordinal_idx" ON "volumes" USING btree ("project_id","ordinal");--> statement-breakpoint
CREATE INDEX "beats_project_id_chapter_idx" ON "beats" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX "world_facts_project_id_category_idx" ON "world_facts" USING btree ("project_id","category");--> statement-breakpoint
CREATE INDEX "extraction_runs_project_id_chapter_idx" ON "extraction_runs" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX "jobs_project_id_kind_status_idx" ON "jobs" USING btree ("project_id","kind","status");--> statement-breakpoint
CREATE INDEX "validation_reports_project_id_scope_chapter_idx" ON "validation_reports" USING btree ("project_id","scope","chapter");--> statement-breakpoint
CREATE INDEX "chapter_chunks_project_id_chapter_idx" ON "chapter_chunks" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chapter_chunks_embedding_idx ON chapter_chunks USING hnsw (embedding vector_cosine_ops);