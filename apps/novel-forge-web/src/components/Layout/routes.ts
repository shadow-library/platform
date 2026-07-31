/**
 * The project-scoped screens, shared by the sidebar nav and the topbar breadcrumb/command palette.
 */
/** The novel id from the route, absent in global (no-project) mode. */
export interface NovelParams {
  novelId?: string;
}

export type ProjectRoute =
  | '/novels/$novelId/overview'
  | '/novels/$novelId/source'
  | '/novels/$novelId/rebrand'
  | '/novels/$novelId/reforge'
  | '/novels/$novelId/story-bible'
  | '/novels/$novelId/volumes'
  | '/novels/$novelId/import-plan'
  | '/novels/$novelId/chapters'
  | '/novels/$novelId/review'
  | '/novels/$novelId/chat'
  | '/novels/$novelId/proposals'
  | '/novels/$novelId/runs'
  | '/novels/$novelId/publish'
  | '/novels/$novelId/settings';
