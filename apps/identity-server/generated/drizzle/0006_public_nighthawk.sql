ALTER TABLE "bot_ownership_transfers" DROP CONSTRAINT "bot_ownership_transfers_application_id_applications_id_fk";
--> statement-breakpoint
ALTER TABLE "bot_ownership_transfers" ADD CONSTRAINT "bot_ownership_transfers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;