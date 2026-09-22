import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger } from '@server/database';

import {
  BACKLOG_MAX,
  PLACE_DEPTHS,
  PLACE_KINDS,
  type PlaceDepth,
  type PlaceKind,
  PLACES_MAX,
  VOLUME_ONE_LINE_MAX,
  VOLUME_ONE_NAME_MAX,
  VOLUME_ONE_WRITER_LINE_MAX,
} from '../../ai/schemas/blueprint-volume-one.schema';
import { type ContentOp } from '../../refinement/change-set';
import { withoutKnownEntries } from '../engine/blueprint-round';
import { type LockPlan, type PlannedLedgerEntry, type SourcedScreenStep } from '../engine/blueprint-step.types';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { contentKey, lockedLinks, removedContentOps } from './content-keys';
import { lockedCastKeys } from './locked-cast';
import { type PlacesSliceOptions, VOLUME_ONE_PASS_STEP_KEY, type VolumeOneOptions } from './volume-one-pass.step';

export const PLACES_STEP_KEY = 'places';
export const PLACES_TOPIC = 'places';
/** Backlog lives on its own topic, outside what a lock replaces: a deferred idea is not an answer a later lock can retire. */
export const PLACES_BACKLOG_TOPIC = 'places.backlog';
export const PLACES_WHY_MAX = 400;
export const PLACES_PAGE: PageRef = { section: 'world', slug: 'factions-and-locations' };

const PLACES_HEADING = 'Places';
const FACTIONS_HEADING = 'Factions';
const ENTITY_TYPES: Record<PlaceKind, 'location' | 'faction'> = { place: 'location', faction: 'faction' };

@Schema()
export class PlaceChoice {
  @Field({ optional: true, pattern: '^pl[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field(() => String, { enum: [...PLACE_KINDS] })
  kind: PlaceKind;

  @Field(() => String, { enum: [...PLACE_DEPTHS], description: '“deep” only where volume one happens; everywhere else is a sketch of one line.' })
  detail: PlaceDepth;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  summary: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_NAME_MAX })
  usedIn?: string;
}

@Schema()
export class BacklogChoice {
  @Field({ optional: true, pattern: '^bl[0-9]+$' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  item: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_LINE_MAX })
  why?: string;
}

@Schema()
export class PlacesSelection {
  @Field(() => [PlaceChoice], { minItems: 1, maxItems: PLACES_MAX })
  places: PlaceChoice[];

  @Field(() => [BacklogChoice], { optional: true, maxItems: BACKLOG_MAX, description: 'Ideas worth keeping that change no sentence before chapter twenty.' })
  backlog?: BacklogChoice[];

  @Field({ optional: true, maxLength: PLACES_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_WRITER_LINE_MAX, description: 'What these places mean for whoever writes chapter one.' })
  writerLine: string;
}

interface KeyedPlace {
  place: PlaceChoice;
  entityKey: string;
  /** A faction the Core phase already made the opposition: reused as it stands, never written over by a sketch of the same name. */
  existing: boolean;
}

function keyPlaces(places: PlaceChoice[], known: Set<string>): KeyedPlace[] {
  const taken = new Set<string>();
  return places.map(place => {
    const entityKey = contentKey('', place.name, taken);
    return { place, entityKey, existing: known.has(entityKey) };
  });
}

function placeBody(place: PlaceChoice): string {
  const used = place.usedIn?.trim();
  return `${place.summary.trim()}${used ? `\n\nUsed in: ${used}` : ''}`;
}

function entityOp({ place, entityKey }: KeyedPlace): ContentOp {
  return {
    op: 'entity.upsert',
    entityKey,
    type: ENTITY_TYPES[place.kind],
    name: place.name.trim(),
    status: place.detail === 'deep' ? 'Detailed' : 'Sketch',
    body: placeBody(place),
  };
}

function listing(keyed: KeyedPlace[], kind: PlaceKind): string {
  return keyed
    .filter(({ place }) => place.kind === kind)
    .map(
      ({ place }) =>
        `- **${place.name.trim()}**${place.detail === 'sketch' ? ' *(sketch)*' : ''} — ${place.summary.trim()}${place.usedIn?.trim() ? ` (${place.usedIn.trim()})` : ''}`,
    )
    .join('\n');
}

function placesBody(current: string | null, keyed: KeyedPlace[]): string {
  return upsertPageSections(current, 'Factions and locations', null, [
    { heading: PLACES_HEADING, body: listing(keyed, 'place') },
    { heading: FACTIONS_HEADING, body: listing(keyed, 'faction') },
  ]);
}

function assertSelection(selection: PlacesSelection, keyed: KeyedPlace[]): void {
  if (!selection.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what these places mean for whoever writes chapter one' });
  if (keyed.some(({ place }) => !place.name.trim() || !place.summary.trim())) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'every place and faction needs a name and a line saying what it is' });
  }
  if (!keyed.some(({ place }) => place.detail === 'deep')) {
    throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'nowhere is detailed — say which of these volume one actually happens in' });
  }
}

export const placesStep: SourcedScreenStep<VolumeOneOptions, PlacesSliceOptions | null, PlacesSelection> = {
  kind: 'screen',
  key: PLACES_STEP_KEY,
  phase: 'volume_one',
  required: true,
  completionTopics: [PLACES_TOPIC],
  nudges: ['More atmosphere', 'Add a hideout', 'Less detail', 'One more faction'],
  selectionSchema: PlacesSelection,
  source: { step: VOLUME_ONE_PASS_STEP_KEY, select: options => options.places ?? null },

  describeView(view) {
    return [
      ...(view?.places ?? []).map(place => ({ id: place.id, label: `${place.name} — ${place.summary}` })),
      ...(view?.backlog ?? []).map(item => ({ id: item.id, label: item.item })),
    ];
  },

  chosenOptionIds(selection) {
    return [...selection.places.flatMap(place => (place.optionId ? [place.optionId] : [])), ...(selection.backlog ?? []).flatMap(item => (item.optionId ? [item.optionId] : []))];
  },

  /**
   * Places and factions volume one uses become entities and one page section each; everything the author deferred becomes a backlog
   * entry instead. A backlog entry is a promise to come back, so it is never a refusal and never reaches the do-not-propose list.
   */
  async materialise(selection, { ledger, project, tx }) {
    const known = lockedCastKeys(ledger);
    const keyed = keyPlaces(selection.places, known);
    assertSelection(selection, keyed);
    const page = await loadPageBody(tx, project.id, PLACES_PAGE);

    const mine = keyed.filter(item => !item.existing);
    const links: Ledger.Links = { bibleDocuments: [PLACES_PAGE], entityKeys: mine.map(item => item.entityKey) };
    const changeSet: ContentOp[] = [
      ...mine.map(entityOp),
      { op: 'bible_document.upsert', ...PLACES_PAGE, body: placesBody(page, keyed) },
      ...removedContentOps(lockedLinks(ledger, PLACES_STEP_KEY), links, known),
    ];

    const decision: PlannedLedgerEntry = {
      kind: 'decision',
      topic: PLACES_TOPIC,
      statement: keyed.map(({ place }) => place.name.trim()).join(', '),
      why: selection.why?.trim() || null,
      writerLine: selection.writerLine.trim(),
      payload: {
        places: keyed.map(({ place, entityKey, existing }) => ({
          entityKey,
          existing,
          name: place.name.trim(),
          kind: place.kind,
          detail: place.detail,
          summary: place.summary.trim(),
          usedIn: place.usedIn?.trim() ?? '',
        })),
      },
      links,
    };

    const backlog = (selection.backlog ?? [])
      .filter(item => item.item.trim())
      .map((item): PlannedLedgerEntry => ({
        kind: 'backlog',
        topic: PLACES_BACKLOG_TOPIC,
        statement: item.item.trim(),
        why: item.why?.trim() || null,
        payload: { source: item.optionId ? 'coach' : 'author' },
      }));

    const plan: LockPlan = {
      entries: withoutKnownEntries([decision, ...backlog], ledger, 'backlog'),
      changeSet,
      summary: 'Blueprint: the places volume one uses',
      replaces: [PLACES_TOPIC],
    };
    return plan;
  },
};
