export interface ContinuityHighlight {
  label: string;
  count: number;
  items: string[];
  more: number;
}

type Entry = Record<string, unknown>;

interface HighlightField {
  field: string;
  label: string;
  describe: (entry: Entry) => string | undefined;
}

const MAX_ITEMS = 3;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const HIGHLIGHT_FIELDS: readonly HighlightField[] = [
  { field: 'newEntities', label: 'New entries', describe: entry => text(entry['name']) },
  { field: 'threads', label: 'Threads', describe: entry => text(entry['threadKey']) },
  { field: 'mysteries', label: 'Mysteries', describe: entry => text(entry['mysteryKey']) },
  { field: 'timeline', label: 'Timeline', describe: entry => text(entry['event']) },
  {
    field: 'relationships',
    label: 'Relationships',
    describe: entry => (text(entry['entityKey']) && text(entry['targetKey']) ? `${text(entry['entityKey'])} and ${text(entry['targetKey'])}` : undefined),
  },
  { field: 'power', label: 'Power', describe: entry => text(entry['character']) },
  { field: 'characterStates', label: 'Character states', describe: entry => text(entry['entityKey']) },
  { field: 'knowledgeChanges', label: 'Knowledge', describe: entry => text(entry['entityKey']) },
];

export function continuityHighlights(blob: Record<string, unknown>): ContinuityHighlight[] {
  return HIGHLIGHT_FIELDS.flatMap(({ field, label, describe }) => {
    const entries = Array.isArray(blob[field]) ? (blob[field] as Entry[]) : [];
    if (entries.length === 0) return [];
    const names = [...new Set(entries.flatMap(entry => describe(entry) ?? []))];
    const items = names.slice(0, MAX_ITEMS);
    return [{ label, count: entries.length, items, more: names.length - items.length }];
  });
}
