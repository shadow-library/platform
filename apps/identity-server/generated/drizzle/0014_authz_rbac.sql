CREATE TYPE "public"."principal_type" AS ENUM('USER', 'SERVICE_ACCOUNT');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(255),
	CONSTRAINT "permissions_application_name_unique" UNIQUE("application_id","name")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"principal_id" varchar(64) NOT NULL,
	"role_id" integer NOT NULL,
	"organisation_id" bigint NOT NULL,
	"granted_by" varchar(64),
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "role_assignments_unique" UNIQUE("principal_type","principal_id","role_id","organisation_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_application_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."application_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_application_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."application_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;