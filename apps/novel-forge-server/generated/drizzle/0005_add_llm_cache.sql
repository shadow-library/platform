CREATE TABLE "llm_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"role" varchar NOT NULL,
	"prompt_key" varchar NOT NULL,
	"prompt_version" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"model" varchar NOT NULL,
	"request_hash" varchar NOT NULL,
	"response" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "llm_cache_request_hash_unique" UNIQUE("request_hash")
);
--> statement-breakpoint
ALTER TABLE "llm_cache" ADD CONSTRAINT "llm_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_cache_project_id_role_idx" ON "llm_cache" USING btree ("project_id","role");