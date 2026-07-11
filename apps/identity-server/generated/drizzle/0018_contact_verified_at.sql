ALTER TABLE "user_emails" DROP CONSTRAINT "user_emails_email_id_unique";--> statement-breakpoint
ALTER TABLE "user_phones" DROP CONSTRAINT "user_phones_phone_number_unique";--> statement-breakpoint
ALTER TABLE "user_emails" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_phones" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_verified_email_unique" ON "user_emails" USING btree (lower("email_id")) WHERE "user_emails"."verified_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_primary_unique" ON "user_emails" USING btree ("user_id") WHERE "user_emails"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "user_phones_verified_phone_unique" ON "user_phones" USING btree ("phone_number") WHERE "user_phones"."verified_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_phones_primary_unique" ON "user_phones" USING btree ("user_id") WHERE "user_phones"."is_primary";