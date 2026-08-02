export * from './api-types.gen';
export * from './library.api';
export * from './notifications.api';
export * from './novels.api';
export * from './progress.api';
export * from './session.api';
export * from './shared.api';
export * from './taxonomy';
export * from './transport';
export * from './types';

/**
 * `types.ts` holds the internal client view-model — the presentation shapes the mappers in each `*.api.ts`
 * normalize the wire responses into — and two of its names (`NovelSummary`, `ChapterListResponse`) match
 * schemas `api-types.gen.ts` independently exports, so the two star exports above collide for exactly those.
 * Explicit re-exports win over an ambiguous star export, so these keep `types.ts`'s versions: the whole UI is
 * built on the client model, and the generated wire shapes are consumed only inside the api modules (imported
 * directly from `./api-types.gen`, aliased to `Server*` at the boundary), never through the barrel.
 */
export type { ChapterListResponse, NovelSummary } from './types';
