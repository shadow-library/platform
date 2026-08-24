CREATE TYPE "public"."meal_type" AS ENUM('cooked', 'ate_out');--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"text" text NOT NULL,
	"mood" smallint,
	"tags" text[],
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_mood_check" CHECK ("journal_entries"."mood" IS NULL OR "journal_entries"."mood" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "meal_presets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(200) NOT NULL,
	"calories" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_presets_calories_check" CHECK ("meal_presets"."calories" >= 0)
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"calories" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"note" text,
	"preset_id" bigint,
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meals_calories_check" CHECK ("meals"."calories" >= 0)
);
--> statement-breakpoint
CREATE TABLE "side_quests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"stat_affinity" "stat_affinity",
	"xp_awarded" smallint DEFAULT 0 NOT NULL,
	"coins_awarded" smallint DEFAULT 0 NOT NULL,
	"stat_ticked" smallint DEFAULT 0 NOT NULL,
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weights" (
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"kg" numeric(5, 2) NOT NULL,
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weights_account_id_date_pk" PRIMARY KEY("account_id","date")
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_presets" ADD CONSTRAINT "meal_presets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "side_quests" ADD CONSTRAINT "side_quests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entries_account_id_date_idx" ON "journal_entries" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "journal_entries_account_id_sync_seq_idx" ON "journal_entries" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "meals_account_id_date_idx" ON "meals" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "meals_account_id_sync_seq_idx" ON "meals" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "side_quests_account_id_date_idx" ON "side_quests" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "side_quests_account_id_sync_seq_idx" ON "side_quests" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "weights_account_id_sync_seq_idx" ON "weights" USING btree ("account_id","sync_seq");