ALTER TABLE "entities" ADD COLUMN "image_depicts_chapter" integer;--> statement-breakpoint
ALTER TABLE "entity_images" ADD COLUMN "depicts_chapter" integer;--> statement-breakpoint
ALTER TABLE "illustrations" ADD COLUMN "depicts_chapter" integer;