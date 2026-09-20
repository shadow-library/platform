export const APP_NAME = 'novel-forge';

/** The identity permission that authorises curation and the ingest surface; a bot reaches it through the `curated-ingest` grant. */
export const CURATE_PERMISSION = 'novel-forge:curate';

export const PROJECTS_READ_PERMISSION = 'novel-forge:projects:read';
export const PROJECTS_WRITE_PERMISSION = 'novel-forge:projects:write';
export const ILLUSTRATIONS_WRITE_PERMISSION = 'novel-forge:illustrations:write';
export const GENERATION_RUN_PERMISSION = 'novel-forge:generation:run';

/** Gates the run-inspection API — prompt anatomy, token shares, per-call latency, raw model output — behind an explicit admin grant. */
export const ADMIN_PERMISSION = 'novel-forge:admin';

/** Scope identity itself presents when it reconciles or transfers what an organisation's bot owns here. */
export const BOTS_MANAGE_SCOPE = 'novel-forge:bots:manage';
