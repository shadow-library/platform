import { type LedgerContextEntry, ledgerSection } from './ledger-sections';
import { type ContextSection, type ContextSegment, type ContextTier, renderSection } from './sections';
import { countTokens } from './token-budget';

export const BLUEPRINT_BUDGET = 24_000;
export const STEP_THREAD_MESSAGES = 4;

export interface BlueprintStepMessage {
  from: 'author' | 'coach';
  text: string;
}

export interface BlueprintInputSection {
  key: string;
  content: string;
  /** Reserved against the budget like the ledger, for input the step cannot work without. */
  required?: boolean;
}

export interface BlueprintPackParts {
  /** What the step reads beyond the ledger: earlier decisions or pages, rendered by the step. */
  inputs: BlueprintInputSection[];
  /** The step's conversation, oldest first; only the last few messages reach the model. */
  thread: BlueprintStepMessage[];
  roundInput: string;
}

function section(key: string, content: string, tier: ContextTier, segment: ContextSegment, required = false): ContextSection {
  const rendered = renderSection(key, content);
  return { key, tier, segment, tokens: countTokens(rendered), truncated: false, sourceRefs: [], rendered, ...(required ? { required } : {}) };
}

function renderThread(messages: BlueprintStepMessage[]): string {
  return messages.map(message => `${message.from === 'author' ? 'Author' : 'Coach'}: ${message.text}`).join('\n\n');
}

export function blueprintSections(ledger: LedgerContextEntry[], parts: BlueprintPackParts): ContextSection[] {
  const sections = [ledgerSection(ledger, 'stable'), ...parts.inputs.map(input => section(input.key, input.content, 'approved_intent', 'stable', input.required))];
  const thread = parts.thread.slice(-STEP_THREAD_MESSAGES);
  if (thread.length > 0) sections.push(section('step_thread', renderThread(thread), 'working', 'volatile'));
  sections.push(section('round_input', parts.roundInput, 'working', 'volatile', true));
  return sections;
}
