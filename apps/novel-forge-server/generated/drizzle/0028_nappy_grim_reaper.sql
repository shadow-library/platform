CREATE TABLE "plugin_kv" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"plugin_id" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_kv_project_id_plugin_id_key_unique" UNIQUE("project_id","plugin_id","key")
);
--> statement-breakpoint
CREATE TABLE "project_plugins" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"plugin_id" varchar(64) NOT NULL,
	"plugin_version" varchar(32) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"enabled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_plugins_project_id_plugin_id_unique" UNIQUE("project_id","plugin_id")
);
--> statement-breakpoint
ALTER TABLE "plugin_kv" ADD CONSTRAINT "plugin_kv_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_plugins" ADD CONSTRAINT "project_plugins_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;