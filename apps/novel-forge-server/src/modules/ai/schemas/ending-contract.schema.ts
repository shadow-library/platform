import { Field, Schema } from '@shadow-library/class-schema';

import { HookType, type HookTypeValue } from './enums';

@Schema()
export class EndingContractSchema {
  @Field(() => HookType, { description: 'the kind of hook the closing scene must land on' })
  hookType: HookTypeValue;

  @Field({ minLength: 1, description: 'what the reader should feel on the last line' })
  emotionalBeat: string;

  @Field({ minLength: 1, description: 'the question the ending must leave open' })
  openQuestion: string;

  @Field({ minLength: 1, description: 'the situation the next chapter picks up from — specific enough for a different author to continue' })
  handoffState: string;

  @Field(() => [String], { optional: true, description: 'refs (e.g. "thread:heir_mystery") the ending must NOT resolve' })
  mustNotResolve?: string[];
}

export const HIDDEN_THREAD_PLACEHOLDER = 'keep the hidden thread unresolved';

/** A `mustNotResolve` entry's canon-fact key, when it names one explicitly (`fact:<key>`) or matches a known fact key. */
export function mustNotResolveFactKey(entry: string, factKeys: ReadonlySet<string>): string | null {
  if (entry.startsWith('fact:')) return entry.slice('fact:'.length).trim();
  return factKeys.has(entry.trim()) ? entry.trim() : null;
}

/**
 * Renders a brief's stored ending contract; '' when there is none. The judge reads it verbatim. For the writer, pass
 * `factWriterNotes` (every canon fact key → its writer note): a fact named in `mustNotResolve` is then replaced by its
 * writer note, or a generic instruction, so a spoilery fact key never reaches the drafter.
 */
export function renderEndingContract(contract: unknown, factWriterNotes?: ReadonlyMap<string, string | null>): string {
  if (!contract || typeof contract !== 'object') return '';
  const c = contract as Partial<EndingContractSchema>;
  const lines = [`Hook type: ${c.hookType ?? ''}`, `Emotional beat: ${c.emotionalBeat ?? ''}`, `Open question: ${c.openQuestion ?? ''}`, `Handoff state: ${c.handoffState ?? ''}`];
  const entries = Array.isArray(c.mustNotResolve) ? c.mustNotResolve.filter((entry): entry is string => typeof entry === 'string') : [];
  const rendered = factWriterNotes ? writerSafeEntries(entries, factWriterNotes) : entries;
  if (rendered.length > 0) lines.push(`Must NOT resolve: ${rendered.join(', ')}`);
  return lines.join('\n');
}

function writerSafeEntries(entries: string[], factWriterNotes: ReadonlyMap<string, string | null>): string[] {
  const factKeys = new Set(factWriterNotes.keys());
  const safe = entries.map(entry => {
    const factKey = mustNotResolveFactKey(entry, factKeys);
    if (factKey === null) return entry;
    return factWriterNotes.get(factKey)?.trim() || HIDDEN_THREAD_PLACEHOLDER;
  });
  return [...new Set(safe)];
}
