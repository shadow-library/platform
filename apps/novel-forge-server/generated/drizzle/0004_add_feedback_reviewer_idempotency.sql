ALTER TABLE "user_feedback" ADD COLUMN "reviewer_id" varchar;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD COLUMN "idempotency_key" varchar;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_idempotency_key_unique" UNIQUE("idempotency_key");