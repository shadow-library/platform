ALTER TYPE "public"."content_generator" RENAME VALUE 'grok' TO 'unrestricted';--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "isolated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "isolated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "content_rating" jsonb;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "content_rating" jsonb;--> statement-breakpoint
UPDATE "chapters" SET "isolated" = true WHERE "generator" = 'unrestricted';--> statement-breakpoint
UPDATE "drafts" SET "isolated" = true WHERE "generator" = 'unrestricted';
