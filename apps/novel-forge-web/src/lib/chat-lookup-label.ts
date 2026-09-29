export const GENERIC_LOOKUP_LABEL = 'Looked something up';
const QUERY_LIMIT = 40;

type Args = Record<string, unknown>;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);
const count = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function humanise(key: string): string {
  const name = key.split(/[:/]/).at(-1) ?? key;
  return name.replace(/[-_]+/g, ' ').trim();
}

function quoted(query: string): string {
  return `“${query.length > QUERY_LIMIT ? `${query.slice(0, QUERY_LIMIT).trimEnd()}…` : query}”`;
}

function chapterLabel(args: Args, suffix: string): string {
  const chapter = count(args.chapter);
  return chapter === undefined ? `A chapter ${suffix}` : `Chapter ${chapter} ${suffix}`;
}

function bibleLabel(args: Args): string {
  const slug = text(args.slug);
  if (slug) return capitalise(humanise(slug));
  const section = text(args.section);
  return section ? `${capitalise(humanise(section))} page` : 'Story Bible page';
}

function notesLabel(args: Args): string {
  const from = count(args.from);
  if (from !== undefined) return `Notes from ¶${from}`;
  const part = count(args.part);
  if (part !== undefined) return `Notes, part ${part}`;
  const query = text(args.query);
  return query ? `Notes mentioning ${quoted(query)}` : 'Your notes';
}

function summariesLabel(args: Args): string {
  const from = count(args.from);
  const to = count(args.to);
  if (from === undefined || to === undefined) return 'Chapter summaries';
  return from === to ? `Summary of chapter ${from}` : `Summaries of chapters ${from}–${to}`;
}

function threadsLabel(args: Args): string {
  const status = text(args.status);
  return status ? `${capitalise(status)} plot threads` : 'Plot threads';
}

function named(prefix: string, key: unknown, fallback: string): string {
  const value = text(key);
  return value ? `${prefix} ${capitalise(humanise(value))}` : fallback;
}

function searched(where: string, query: unknown): string {
  const value = text(query);
  return value ? `Searched ${where} for ${quoted(value)}` : `Searched ${where}`;
}

const LABELS: Record<string, (args: Args) => string> = {
  get_bible_document: bibleLabel,
  get_brief: args => chapterLabel(args, 'plan'),
  get_draft: args => chapterLabel(args, 'draft'),
  get_review: args => chapterLabel(args, 'review'),
  get_canon_facts: () => 'Canon facts',
  get_chapter_summaries: summariesLabel,
  get_character_timeline: args => named('Timeline of', args.entityKey, 'A character timeline'),
  get_entity: args => named('Profile of', args.entityKey, 'A profile'),
  get_notes: notesLabel,
  get_plot_threads: threadsLabel,
  get_usage: () => 'Usage figures',
  get_volume: args => named('Volume plan:', args.volumeKey, 'A volume plan'),
  get_world_facts: args => named('World facts:', args.category, 'World facts'),
  search_lore: args => searched('the lore', args.query),
  search_prose: args => searched('the prose', args.query),
};

export function lookupLabel(tool: string, args: Args): string {
  return Object.hasOwn(LABELS, tool) ? (LABELS[tool]?.(args) ?? GENERIC_LOOKUP_LABEL) : GENERIC_LOOKUP_LABEL;
}
