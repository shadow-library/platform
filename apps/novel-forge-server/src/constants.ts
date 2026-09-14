export const APP_NAME = 'novel-forge';

/** The identity permission that authorises authoring and ingest; API keys act only as an owner who still holds it. */
export const CURATE_PERMISSION = 'novel-forge:curate';

export const PROJECTS_READ_PERMISSION = 'novel-forge:projects:read';
export const PROJECTS_WRITE_PERMISSION = 'novel-forge:projects:write';
export const ILLUSTRATIONS_WRITE_PERMISSION = 'novel-forge:illustrations:write';
export const GENERATION_RUN_PERMISSION = 'novel-forge:generation:run';

/** Scope identity itself presents when it reconciles or transfers what an organisation's bot owns here. */
export const BOTS_MANAGE_SCOPE = 'novel-forge:bots:manage';
