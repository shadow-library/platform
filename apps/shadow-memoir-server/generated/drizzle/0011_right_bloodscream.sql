ALTER TABLE "accounts" ADD COLUMN "pending_returner_shields" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quest_streaks" ADD COLUMN "pending_shield_grant" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_pending_returner_shields_check" CHECK ("accounts"."pending_returner_shields" >= 0);--> statement-breakpoint
ALTER TABLE "quest_streaks" ADD CONSTRAINT "quest_streaks_pending_shield_grant_check" CHECK ("quest_streaks"."pending_shield_grant" >= 0);