CREATE TABLE "service_route_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"caller_client_id" uuid NOT NULL,
	"method" varchar(10) NOT NULL,
	"path_pattern" varchar(512) NOT NULL,
	"created_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_route_access_unique" UNIQUE("application_id","caller_client_id","method","path_pattern")
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "workload_subject" varchar(512);--> statement-breakpoint
ALTER TABLE "service_route_access" ADD CONSTRAINT "service_route_access_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_route_access" ADD CONSTRAINT "service_route_access_caller_client_id_oauth_clients_id_fk" FOREIGN KEY ("caller_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_route_access_application_id_idx" ON "service_route_access" USING btree ("application_id");--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_workload_subject_unique" UNIQUE("workload_subject");