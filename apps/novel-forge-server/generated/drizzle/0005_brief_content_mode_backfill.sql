-- Routing now reads a chapter's mode from its plan alone (null is standard), so plans written before the project default was copied onto them take it now.
UPDATE "briefs" SET "content_mode" = 'unrestricted' FROM "projects" WHERE "briefs"."project_id" = "projects"."id" AND "projects"."content_mode" = 'unrestricted' AND "briefs"."content_mode" IS NULL;
