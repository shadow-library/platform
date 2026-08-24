ALTER TYPE "public"."hero_event_type" ADD VALUE 'returner_fired';--> statement-breakpoint
CREATE TABLE "progress_counters" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cosmetic_unlocks" ADD COLUMN "kind" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "cosmetic_unlocks" ADD COLUMN "equipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_counters" ADD CONSTRAINT "progress_counters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cosmetic_unlocks_account_id_kind_equipped_unique" ON "cosmetic_unlocks" USING btree ("account_id","kind") WHERE "cosmetic_unlocks"."equipped";--> statement-breakpoint

-- T-21: Achievements/titles/cosmetics grants (ARCHITECTURE §5.4, §10.4, §26), following 0002_add_role_grants's
-- per-migration convention for tables that did not exist yet when that file was written.

ALTER TABLE progress_counters OWNER TO memoir_migrator;--> statement-breakpoint

-- progress_counters is a mutable per-account projection (not append-only), so memoir_api gets full CRUD;
-- memoir_deleter needs it for the T-30 deletion state machine. It carries no AI/§15.5 read need.
GRANT SELECT, INSERT, UPDATE, DELETE ON progress_counters TO memoir_api;--> statement-breakpoint
GRANT SELECT, DELETE ON progress_counters TO memoir_deleter;--> statement-breakpoint

-- cosmetic_unlocks stays grant-frozen (§10.4) for every column except `equipped`, the one mutable column
-- `EquipCosmetic` (T-21) needs to flip; memoir_api's existing SELECT, INSERT grant (0002) is unaffected.
GRANT UPDATE (equipped) ON cosmetic_unlocks TO memoir_api;