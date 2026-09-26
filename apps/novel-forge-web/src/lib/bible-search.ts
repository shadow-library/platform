import { parseGuideAddress } from './bible-entries';
import { type BibleTopic, parseBibleTopic, topicForEntityType } from './bible-topics';
import { parseEntityType } from './story-bible';

export type BibleView = 'secrets' | 'threads' | 'recent';

export const BIBLE_VIEWS: readonly BibleView[] = ['secrets', 'threads', 'recent'];

export interface BibleSearch {
  topic?: BibleTopic;
  view?: BibleView;
  entity?: string;
  guide?: string;
  fact?: string;
  /** A power rule whose ladder fills the page in place of the list and pane. */
  ladder?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** Links from before the redesign still land: `view=facts` and a bare `fact` open Secrets, and an entity `type` opens its topic. */
export function parseBibleSearch(search: Record<string, unknown>): BibleSearch {
  const fact = text(search.fact);
  const legacyType = parseEntityType(search.type);
  const named = BIBLE_VIEWS.find(view => view === search.view);
  const view: BibleView | undefined = search.view === 'facts' ? 'secrets' : (named ?? (fact ? 'secrets' : undefined));
  const guide = text(search.guide);
  return {
    topic: parseBibleTopic(search.topic) ?? (legacyType ? topicForEntityType(legacyType) : undefined),
    view,
    entity: text(search.entity),
    guide: parseGuideAddress(guide) ? guide : undefined,
    fact,
    ladder: text(search.ladder),
  };
}
