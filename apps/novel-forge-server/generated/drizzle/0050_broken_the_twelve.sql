DROP TABLE "story_seeds" CASCADE;--> statement-breakpoint
DELETE FROM "refinement_proposals" WHERE "scope_type" = 'ideation' OR "kind" = 'ideation';--> statement-breakpoint
DELETE FROM "chat_sessions" WHERE "scope_type" = 'ideation';--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "scope_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "refinement_proposals" ALTER COLUMN "scope_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."chat_scope";--> statement-breakpoint
CREATE TYPE "public"."chat_scope" AS ENUM('project', 'novel', 'bible_document', 'volume_plan', 'volume', 'arc_plan', 'arc', 'brief');--> statement-breakpoint
ALTER TABLE "chat_sessions" ALTER COLUMN "scope_type" SET DATA TYPE "public"."chat_scope" USING "scope_type"::"public"."chat_scope";--> statement-breakpoint
ALTER TABLE "refinement_proposals" ALTER COLUMN "scope_type" SET DATA TYPE "public"."chat_scope" USING "scope_type"::"public"."chat_scope";--> statement-breakpoint
ALTER TABLE "refinement_proposals" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."refinement_kind";--> statement-breakpoint
CREATE TYPE "public"."refinement_kind" AS ENUM('chat', 'hub', 'premise_enhance', 'bible_audit', 'arc_plan', 'chapter_extract', 'plugin', 'blueprint');--> statement-breakpoint
ALTER TABLE "refinement_proposals" ALTER COLUMN "kind" SET DATA TYPE "public"."refinement_kind" USING "kind"::"public"."refinement_kind";--> statement-breakpoint
DELETE FROM "projects" WHERE "status" = 'seed';--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP COLUMN "payload";--> statement-breakpoint
DROP TYPE "public"."project_status";
