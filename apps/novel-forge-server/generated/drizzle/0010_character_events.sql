CREATE TYPE "public"."character_event_kind" AS ENUM('state', 'appearance', 'relationship');--> statement-breakpoint
CREATE TYPE "public"."character_event_source" AS ENUM('continuity', 'backfill', 'manual');--> statement-breakpoint
CREATE TABLE "character_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entity_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"kind" character_event_kind NOT NULL,
	"detail_key" varchar DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"source" character_event_source DEFAULT 'continuity' NOT NULL,
	"status" "knowledge_status" DEFAULT 'committed' NOT NULL,
	"draft_revision" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_events_project_id_entity_id_chapter_kind_detail_unique" UNIQUE("project_id","entity_id","chapter","kind","detail_key")
);
--> statement-breakpoint
ALTER TABLE "character_events" ADD CONSTRAINT "character_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_events" ADD CONSTRAINT "character_events_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_events_project_id_entity_id_idx" ON "character_events" USING btree ("project_id","entity_id","chapter");