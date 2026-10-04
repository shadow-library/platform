-- Per-role model pins are gone: chats choose a model type and cost tier instead, so a stored pin is dropped rather than left to apply again.
UPDATE "projects" SET "config" = nullif("config" - 'models', '{}'::jsonb) WHERE jsonb_exists("config", 'models');
