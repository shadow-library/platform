-- Pulse is the ecosystem's own operations console, not a product anyone may sign into. Deployments
-- seeded before `visibility` existed created it as PUBLIC, which lets any authenticated user reach it.
-- Guarded on PUBLIC so this converges those deployments exactly once and never overrides a platform
-- admin who has since chosen a visibility deliberately.
UPDATE "applications" SET "visibility" = 'INTERNAL' WHERE "name" = 'pulse' AND "visibility" = 'PUBLIC';
