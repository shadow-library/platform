import { parseGuideAddress } from './bible-entries';
import { type BibleTopic, parseBibleTopic, topicForEntityType } from './bible-topics';
import { parseEntityType } from './story-bible';

export type BibleView = 'secrets' | 'recent';

export interface BibleSearch {
  topic?: BibleTopic;
  view?: BibleView;
  entity?: string;
  guide?: string;
  fact?: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** Links from before the redesign still land: `view=facts` and a bare `fact` open Secrets, and an entity `type` opens its topic. */
export function parseBibleSearch(search: Record<string, unknown>): BibleSearch {
  const fact = text(search.fact);
  const legacyType = parseEntityType(search.type);
  const view: BibleView | undefined = search.view === 'secrets' || search.view === 'facts' ? 'secrets' : search.view === 'recent' ? 'recent' : fact ? 'secrets' : undefined;
  const guide = text(search.guide);
  return {
    topic: parseBibleTopic(search.topic) ?? (legacyType ? topicForEntityType(legacyType) : undefined),
    view,
    entity: text(search.entity),
    guide: parseGuideAddress(guide) ? guide : undefined,
    fact,
  };
}
