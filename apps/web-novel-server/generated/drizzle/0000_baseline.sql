CREATE TYPE "public"."publish_outcome" AS ENUM('applied', 'noop', 'stale_rejected', 'unauthorized', 'error');--> statement-breakpoint
CREATE TYPE "public"."novel_status" AS ENUM('live', 'retired');--> statement-breakpoint
CREATE TABLE "publish_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"caller_sub" varchar(128),
	"caller_client_id" varchar(128),
	"action" varchar(64) NOT NULL,
	"novel_slug" varchar(128) NOT NULL,
	"ordinal" integer,
	"content_hash" varchar(128),
	"incoming_revision" integer,
	"stored_revision" integer,
	"outcome" "publish_outcome" NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "novels" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" varchar(128) NOT NULL,
	"title" varchar(256) NOT NULL,
	"blurb" text,
	"cover_path" varchar(512),
	"genres" varchar(64)[] DEFAULT '{}' NOT NULL,
	"status" "novel_status" DEFAULT 'live' NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "novels_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "published_chapters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"novel_id" bigint NOT NULL,
	"ordinal" integer NOT NULL,
	"title" varchar(256) NOT NULL,
	"content" text NOT NULL,
	"author_note" text,
	"content_hash" varchar(128) NOT NULL,
	"revision" integer NOT NULL,
	"word_count" integer,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "published_chapters_novel_id_ordinal_unique" UNIQUE("novel_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "library" (
	"user_id" varchar(128) NOT NULL,
	"novel_id" bigint NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "library_user_id_novel_id_pk" PRIMARY KEY("user_id","novel_id")
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"user_id" varchar(128) NOT NULL,
	"novel_id" bigint NOT NULL,
	"ordinal" integer NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_user_id_novel_id_pk" PRIMARY KEY("user_id","novel_id")
);
--> statement-breakpoint
ALTER TABLE "published_chapters" ADD CONSTRAINT "published_chapters_novel_id_novels_id_fk" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library" ADD CONSTRAINT "library_novel_id_novels_id_fk" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_novel_id_novels_id_fk" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publish_audit_log_novel_slug_id_idx" ON "publish_audit_log" USING btree ("novel_slug","id");