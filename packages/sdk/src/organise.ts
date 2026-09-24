/** Where the organise step places an event of the author's notes; shared by the server that writes the timeline and the screen that moves it. */
export const TIMELINE_BANDS = ['opening', 'early', 'later', 'ending', 'unplaced'] as const;

export type TimelineBand = (typeof TIMELINE_BANDS)[number];

export const TIMELINE_BAND_LABELS: Record<TimelineBand, string> = {
  opening: 'The opening',
  early: 'Early on',
  later: 'Later',
  ending: 'The ending',
  unplaced: 'Not yet placed',
};

export const ORGANISE_RECORD_TYPES = ['character', 'location', 'faction', 'power_rule', 'item', 'concept'] as const;

export type OrganiseRecordType = (typeof ORGANISE_RECORD_TYPES)[number];

export const ORGANISE_RECORD_TYPE_WORDS: Record<OrganiseRecordType, string> = {
  character: 'a character',
  location: 'a place',
  faction: 'a faction',
  power_rule: 'a power rule',
  item: 'an item',
  concept: 'an idea',
};

export const ORGANISE_SOURCES = ['notes', 'inferred'] as const;

export type OrganiseSource = (typeof ORGANISE_SOURCES)[number];

export const SUGGESTION_VERDICTS = ['accept', 'reject'] as const;

export type SuggestionVerdict = (typeof SUGGESTION_VERDICTS)[number];

export const ORGANISE_TOPIC = 'organise';
export const ORGANISE_RULES_TOPIC = 'organise.rules';
export const ORGANISE_ACCEPTED_TOPIC = 'organise.accepted';
export const ORGANISE_RULED_OUT_TOPIC = 'organise.ruled_out';
export const ORGANISE_REASON_MAX = 400;
/** What a Blueprint round that failed on its model call says, so a screen can tell that failure from every other and advise on it. */
export const ROUND_MODEL_CALL_FAILED = 'The model call did not finish.';

export function isTimelineBand(value: unknown): value is TimelineBand {
  return typeof value === 'string' && TIMELINE_BANDS.includes(value as TimelineBand);
}

export function isOrganiseRecordType(value: unknown): value is OrganiseRecordType {
  return typeof value === 'string' && ORGANISE_RECORD_TYPES.includes(value as OrganiseRecordType);
}

/** Two items that say the same thing, whatever their spacing or case, are one item across rounds and across the server and the screen. */
export function organiseTextKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function organiseSectionKey(page: { section: string; slug: string }, heading: string): string {
  return `${page.section}/${page.slug}|${organiseTextKey(heading)}`;
}

export function organiseRecordKey(record: { name: string; type: string }): string {
  return `${organiseTextKey(record.name)}|${record.type}`;
}
