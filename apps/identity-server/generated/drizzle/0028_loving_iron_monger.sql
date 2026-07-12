CREATE TABLE "application_members" (
	"application_id" integer NOT NULL,
	"user_id" bigint NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_members_application_id_user_id_pk" PRIMARY KEY("application_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "application_members" ADD CONSTRAINT "application_members_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_members" ADD CONSTRAINT "application_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_members_user_id_idx" ON "application_members" USING btree ("user_id");