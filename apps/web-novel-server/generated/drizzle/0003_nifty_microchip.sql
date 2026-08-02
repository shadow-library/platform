CREATE TABLE "wiki_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"novel_id" bigint NOT NULL,
	"entry_key" varchar(128) NOT NULL,
	"type" varchar(32) NOT NULL,
	"name" varchar(256) NOT NULL,
	"image_ref" varchar(512),
	"first_visible_ordinal" integer NOT NULL,
	"content_hash" varchar(128) NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_entries_novel_id_entry_key_unique" UNIQUE("novel_id","entry_key")
);
--> statement-breakpoint
CREATE TABLE "wiki_entry_facets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"facet_key" varchar(128) NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible_from_ordinal" integer NOT NULL,
	CONSTRAINT "wiki_entry_facets_entry_id_facet_key_unique" UNIQUE("entry_id","facet_key")
);
--> statement-breakpoint
CREATE TABLE "wiki_entry_images" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"image_ref" varchar(512) NOT NULL,
	"caption" varchar(256),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible_from_ordinal" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_entries" ADD CONSTRAINT "wiki_entries_novel_id_novels_id_fk" FOREIGN KEY ("novel_id") REFERENCES "public"."novels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_entry_facets" ADD CONSTRAINT "wiki_entry_facets_entry_id_wiki_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_entry_images" ADD CONSTRAINT "wiki_entry_images_entry_id_wiki_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;