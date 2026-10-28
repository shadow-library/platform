-- A chat follows its project and a new project starts on balanced, so stored chat pins, per-chat selections and account default tiers are cleared; the columns and table stay until older pods are gone.
UPDATE "chat_sessions" SET "model_provider" = NULL, "model_id" = NULL, "alias_key" = NULL, "content_mode" = NULL, "cost_tier" = NULL WHERE "model_provider" IS NOT NULL OR "model_id" IS NOT NULL OR "alias_key" IS NOT NULL OR "content_mode" IS NOT NULL OR "cost_tier" IS NOT NULL;--> statement-breakpoint
DELETE FROM "account_settings";
