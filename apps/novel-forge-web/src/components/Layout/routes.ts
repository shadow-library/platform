export interface NovelParams {
  novelId?: string;
}

export type ProjectRoute =
  | '/novels/$novelId/overview'
  | '/novels/$novelId/story-bible'
  | '/novels/$novelId/canon-facts'
  | '/novels/$novelId/chapters'
  | '/novels/$novelId/illustrations'
  | '/novels/$novelId/review'
  | '/novels/$novelId/chat'
  | '/novels/$novelId/runs'
  | '/novels/$novelId/publish'
  | '/novels/$novelId/usage'
  | '/novels/$novelId/settings';
