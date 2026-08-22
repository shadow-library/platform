CREATE TABLE "character_states" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"entity_key" varchar NOT NULL,
	"location" varchar,
	"conditions" jsonb,
	"immediate_goal" text,
	"status_note" text,
	"last_updated_chapter" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_states_project_id_entity_key_unique" UNIQUE("project_id","entity_key")
);
--> statement-breakpoint
ALTER TABLE "character_states" ADD CONSTRAINT "character_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;