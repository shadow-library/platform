import { type Knowledge } from '@server/database';

import { type WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';

export type ArtEvent = Pick<Knowledge.CharacterEvent, 'chapter' | 'kind' | 'detailKey' | 'after' | 'status'>;

export const ART_EVENTS_MAX = 20;
const ART_STATE_FACTS_MAX = 10;

/**
 * How the entity changed up to and including `chapter`, oldest first, the newest kept when capped. Only committed events count: a
 * provisional one belongs to a chapter that may still be rewritten. Sightings are not changes, and every value passes the scrub.
 */
export function renderEventsAsOf(events: readonly ArtEvent[], chapter: number, disclosure: WriterDisclosurePolicy): string {
  return events
    .filter(event => event.status === 'committed' && event.kind !== 'appearance' && event.chapter <= chapter)
    .sort((left, right) => left.chapter - right.chapter)
    .slice(-ART_EVENTS_MAX)
    .map(event => {
      const detail = event.detailKey ? `: ${disclosure.scrub(event.detailKey, 'state')}` : '';
      const after = disclosure.scrubState(event.after, ART_STATE_FACTS_MAX);
      return `- ch ${event.chapter} [${event.kind}${detail}] ${typeof after === 'string' ? after : JSON.stringify(after)}`;
    })
    .join('\n');
}
