CREATE TABLE "ingest_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"api_key_id" bigint,
	"action" varchar(64) NOT NULL,
	"source_ref" varchar(64) NOT NULL,
	"project_id" bigint,
	"outcome" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "source_ref" varchar(64);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "original_author" varchar(256);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "imported_meta" jsonb;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "source_ordinal" integer;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
CREATE INDEX "ingest_audit_log_source_ref_id_idx" ON "ingest_audit_log" USING btree ("source_ref","id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_ref_unique" UNIQUE("source_ref");--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_project_id_source_ordinal_unique" UNIQUE("project_id","source_ordinal");