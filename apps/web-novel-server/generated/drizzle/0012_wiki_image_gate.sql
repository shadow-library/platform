ALTER TABLE "wiki_entries" ADD COLUMN "gated_image_ref" varchar(512);--> statement-breakpoint
ALTER TABLE "wiki_entries" ADD COLUMN "image_visible_from_ordinal" integer;