ALTER TABLE "publications" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "sexual_content" varchar(16);--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "violence" varchar(16);--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "dark_content" varchar(16);