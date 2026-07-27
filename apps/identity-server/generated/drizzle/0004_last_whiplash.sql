CREATE TABLE "scim_group_role_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"role_id" integer NOT NULL,
	"created_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scim_group_role_mappings_group_role_unique" UNIQUE("group_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "scim_group_role_mappings" ADD CONSTRAINT "scim_group_role_mappings_group_id_scim_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scim_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_role_mappings" ADD CONSTRAINT "scim_group_role_mappings_role_id_application_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."application_roles"("id") ON DELETE cascade ON UPDATE no action;