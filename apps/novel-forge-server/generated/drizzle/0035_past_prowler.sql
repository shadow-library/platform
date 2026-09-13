CREATE TYPE "public"."chapter_translation_status" AS ENUM('translated', 'attention', 'finalized', 'failed');--> statement-breakpoint
CREATE TYPE "public"."translation_glossary_category" AS ENUM('character', 'place', 'organization', 'profession', 'title', 'rank', 'ability', 'item', 'creature', 'term');--> statement-breakpoint
CREATE TYPE "public"."translation_glossary_origin" AS ENUM('seed', 'discovered', 'manual');--> statement-breakpoint
CREATE TYPE "public"."translation_glossary_status" AS ENUM('suggested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."translation_phase" AS ENUM('pending', 'seeding', 'review', 'translating', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."translation_treatment" AS ENUM('translate', 'localize', 'transliterate', 'preserve');--> statement-breakpoint
-- `project_kind` is recreated instead of extended with ALTER TYPE … ADD VALUE: drizzle applies every pending
-- migration inside ONE transaction, and Postgres refuses a value added by ADD VALUE until that transaction
-- commits — which the `curated` backfill at the end of this file has to do. The existing values keep their
-- order, so the rewrite is invisible to every reader of the column.
ALTER TYPE "public"."project_kind" RENAME TO "project_kind_old";--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('source', 'new_novel', 'translation', 'curated');--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "kind" SET DATA TYPE "public"."project_kind" USING "kind"::text::"public"."project_kind";--> statement-breakpoint
DROP TYPE "public"."project_kind_old";--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'translate';--> statement-breakpoint
CREATE TABLE "chapter_translations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"title" varchar(500),
	"body" text NOT NULL,
	"status" "chapter_translation_status" NOT NULL,
	"issues" jsonb,
	"applied_terms" jsonb,
	"glossary_stale" boolean DEFAULT false NOT NULL,
	"source_hash" varchar(64),
	"source_stale" boolean DEFAULT false NOT NULL,
	"segments" jsonb,
	"run_id" uuid,
	"last_error" varchar(2000),
	"last_failed_run_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"edited_at" timestamp,
	"finalized_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_translations_project_id_chapter_unique" UNIQUE("project_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "translation_glossary" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"source_term" varchar(300) NOT NULL,
	"variants" jsonb,
	"target" varchar(300) NOT NULL,
	"category" "translation_glossary_category" NOT NULL,
	"treatment" "translation_treatment" NOT NULL,
	"meaning" text,
	"context_excerpt" text,
	"alternatives" jsonb,
	"status" "translation_glossary_status" DEFAULT 'suggested' NOT NULL,
	"origin" "translation_glossary_origin" NOT NULL,
	"notes" text,
	"created_chapter" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translation_glossary_project_id_source_term_unique" UNIQUE("project_id","source_term")
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"phase" "translation_phase" DEFAULT 'pending' NOT NULL,
	"style_notes" text,
	"settings" jsonb,
	"last_error" varchar(2000),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translations_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "original_language" varchar(16);--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "original_title" varchar(500);--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "original_content" text;--> statement-breakpoint
ALTER TABLE "chapter_translations" ADD CONSTRAINT "chapter_translations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_glossary" ADD CONSTRAINT "translation_glossary_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_translations_project_id_status_idx" ON "chapter_translations" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "chapter_translations_project_id_glossary_stale_idx" ON "chapter_translations" USING btree ("project_id","glossary_stale");--> statement-breakpoint
CREATE INDEX "chapter_translations_project_id_source_stale_idx" ON "chapter_translations" USING btree ("project_id","source_stale");--> statement-breakpoint
CREATE INDEX "chapter_translations_applied_terms_idx" ON "chapter_translations" USING gin ("applied_terms");--> statement-breakpoint
CREATE INDEX "translation_glossary_project_id_status_idx" ON "translation_glossary" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "translation_glossary_project_id_category_idx" ON "translation_glossary" USING btree ("project_id","category");--> statement-breakpoint
-- Curated-ingest novels predate the `curated` workflow kind and landed as `new_novel`; `source_ref` is
-- exactly the ingest door's marker, and re-running the statement changes nothing. Reforge promotions also
-- carry `source_project_id` and have no clean predicate, so they stay `new_novel` and are switched by hand.
UPDATE "projects" SET "kind" = 'curated' WHERE "source_ref" IS NOT NULL;
