-- Passage suggestions are no longer offered anywhere, so an open one can never be applied or dismissed; closing them keeps the rows readable as history.
UPDATE "passage_suggestions" SET "status" = 'dismissed', "updated_at" = now() WHERE "status" = 'open';
