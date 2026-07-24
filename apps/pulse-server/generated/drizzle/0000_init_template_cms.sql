CREATE TYPE "public"."message_types" AS ENUM('OTP', 'TRANSACTIONAL', 'PROMOTIONAL');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."notification_service_providers" AS ENUM('DEV', 'SENDGRID', 'TWILIO', 'FIREBASE', 'AWS_SES');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('EMAIL', 'SMS', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'PROCESSING', 'FAILED', 'SENT', 'PERMANENTLY_FAILED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TABLE "layout_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"layout_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"status" "version_status" DEFAULT 'DRAFT' NOT NULL,
	"body" text NOT NULL,
	"notes" varchar(1000),
	"edited_by" varchar(255),
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "layout_versions_layout_id_version_unique" UNIQUE("layout_id","version")
);
--> statement-breakpoint
CREATE TABLE "layouts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"layout_key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "layouts_layout_key_unique" UNIQUE("layout_key")
);
--> statement-breakpoint
CREATE TABLE "partial_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"partial_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"status" "version_status" DEFAULT 'DRAFT' NOT NULL,
	"body" text NOT NULL,
	"notes" varchar(1000),
	"edited_by" varchar(255),
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partial_versions_partial_id_version_unique" UNIQUE("partial_id","version")
);
--> statement-breakpoint
CREATE TABLE "partials" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"partial_key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partials_partial_key_unique" UNIQUE("partial_key")
);
--> statement-breakpoint
CREATE TABLE "template_channel_settings" (
	"template_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "template_channel_settings_template_id_channel_pk" PRIMARY KEY("template_id","channel")
);
--> statement-breakpoint
CREATE TABLE "template_contents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_version_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" varchar(10) DEFAULT 'en-ZZ' NOT NULL,
	"subject" varchar(255),
	"body" text NOT NULL,
	"layout_key" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "template_contents_version_channel_locale_unique" UNIQUE("template_version_id","channel","locale")
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"status" "version_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" varchar(1000),
	"edited_by" varchar(255),
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "template_versions_template_id_version_unique" UNIQUE("template_id","version")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"message_type" "message_types" DEFAULT 'TRANSACTIONAL' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"category" varchar(100),
	"variable_schema" jsonb DEFAULT '{"variables":{}}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "templates_template_key_unique" UNIQUE("template_key")
);
--> statement-breakpoint
CREATE TABLE "sender_endpoints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sender_profile_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"provider" "notification_service_providers" NOT NULL,
	"identifier" varchar(500) NOT NULL,
	"weight" smallint DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sender_endpoints_channel_provider_identifier_unique" UNIQUE("channel","provider","identifier")
);
--> statement-breakpoint
CREATE TABLE "sender_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sender_profiles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sender_routing_rules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sender_profile_id" bigint NOT NULL,
	"service" varchar(100),
	"region" varchar(2),
	"message_type" "message_types",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sender_routing_rules_service_region_message_type_unique" UNIQUE("service","region","message_type")
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" bigint NOT NULL,
	"template_version_id" bigint NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"locale" varchar(5) NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"service" varchar(100),
	"recipient" varchar(500) NOT NULL,
	"payload" jsonb,
	"status" "notification_status" NOT NULL,
	"attempt" smallint DEFAULT 0 NOT NULL,
	"last_attempted_at" timestamp,
	"next_attempt_at" timestamp,
	"last_error" varchar(2000),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"notification_job_id" uuid NOT NULL,
	"rendered_subject" varchar(255),
	"rendered_body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "layout_versions" ADD CONSTRAINT "layout_versions_layout_id_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partial_versions" ADD CONSTRAINT "partial_versions_partial_id_partials_id_fk" FOREIGN KEY ("partial_id") REFERENCES "public"."partials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_channel_settings" ADD CONSTRAINT "template_channel_settings_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_contents" ADD CONSTRAINT "template_contents_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_endpoints" ADD CONSTRAINT "sender_endpoints_sender_profile_id_sender_profiles_id_fk" FOREIGN KEY ("sender_profile_id") REFERENCES "public"."sender_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_routing_rules" ADD CONSTRAINT "sender_routing_rules_sender_profile_id_sender_profiles_id_fk" FOREIGN KEY ("sender_profile_id") REFERENCES "public"."sender_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_template_version_id_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_messages" ADD CONSTRAINT "notification_messages_notification_job_id_notification_jobs_id_fk" FOREIGN KEY ("notification_job_id") REFERENCES "public"."notification_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_jobs_status_priority_next_attempt_at_idx" ON "notification_jobs" USING btree ("status","priority","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_messages_created_at_channel_idx" ON "notification_messages" USING btree ("created_at");