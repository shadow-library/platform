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
export * from './wiki.api';

/**
 * `types.ts` shares `NovelSummary` and `ChapterListResponse` with `api-types.gen.ts`, so the star exports collide; explicit re-exports win the ambiguity.
 * The UI builds on the client model; generated wire shapes are used only inside the api modules, aliased to `Server*`.
 * @public
 */
export type { ChapterListResponse, NovelSummary } from './types';
