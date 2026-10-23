DROP TABLE "passage_suggestions" CASCADE;--> statement-breakpoint
ALTER TABLE "mysteries" DROP COLUMN "known_to";--> statement-breakpoint
ALTER TABLE "tool_calls" DROP COLUMN "model_call_id";--> statement-breakpoint
DROP TYPE "public"."passage_suggestion_status";