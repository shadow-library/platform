CREATE TABLE "scim_directory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"user_name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"managed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_group_members" (
	"group_id" uuid NOT NULL,
	"directory_id" uuid NOT NULL,
	CONSTRAINT "scim_group_members_group_id_directory_id_pk" PRIMARY KEY("group_id","directory_id")
);
--> statement-breakpoint
CREATE TABLE "scim_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" bigint NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scim_directory" ADD CONSTRAINT "scim_directory_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_directory" ADD CONSTRAINT "scim_directory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_group_id_scim_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scim_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_directory_id_scim_directory_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."scim_directory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_groups_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scim_directory_org_user_unique" ON "scim_directory" USING btree ("organisation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_directory_org_user_name_unique" ON "scim_directory" USING btree ("organisation_id",lower("user_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "scim_directory_org_external_id_unique" ON "scim_directory" USING btree ("organisation_id","external_id") WHERE "scim_directory"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "scim_groups_org_display_name_unique" ON "scim_groups" USING btree ("organisation_id",lower("display_name"));