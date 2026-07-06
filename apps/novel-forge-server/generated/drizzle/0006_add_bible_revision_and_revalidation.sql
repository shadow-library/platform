ALTER TABLE "chapters" ADD COLUMN "needs_revalidation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bible_documents" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "bible_documents" ADD COLUMN "content_hash" varchar;