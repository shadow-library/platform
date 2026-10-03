import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { answeredInPanel, turnCardsInline } from '../src/features/chat/chat-view';

const CHAT = new URL('../src/features/chat/', import.meta.url);
const OLD_INLINE_UI = ['ProposalSlot', 'SuggestionCard', 'SuggestionGroup', 'OrganiseReceipt', 'AppliedBlock', 'AppliedChange', 'CommitBar'];
const THREAD_PROPOSAL_VIEWS = ['ChatPlanCard', 'TranscriptPlanCard', 'TurnProposalCard', 'TurnReceipt'];

const source = (file: string): string => readFileSync(new URL(file, CHAT), 'utf-8');
const sources = readdirSync(CHAT).filter(file => /\.tsx?$/.test(file));

function componentBody(code: string, name: string): string {
  const start = code.indexOf(`function ${name}(`);
  const end = code.indexOf('\n}\n', start);
  return start < 0 ? '' : code.slice(start, end);
}

describe('chat thread', () => {
  it('should keep the inline proposal cards deleted: changes are reviewed in the panel from a receipt', () => {
    for (const name of OLD_INLINE_UI) expect({ name, exists: existsSync(new URL(`${name}.tsx`, CHAT)) }).toEqual({ name, exists: false });
    const drawn = (name: string): RegExp => new RegExp(`<${name}\\b|function ${name}\\b|from '\\./${name}'`);
    const named = sources.flatMap(file => OLD_INLINE_UI.filter(name => drawn(name).test(source(file))).map(name => `${file}: ${name}`));
    expect(named).toEqual([]);
  });

  it('should draw a proposal in the thread only as a receipt, a plan card, or the own card of an action, prose or a plan edit', () => {
    const column = source('ChatColumn.tsx');
    const drawn = [...column.matchAll(/<(\w+)\b[^<>]*?\bproposal(?:Id)?=/g)].map(match => match[1]);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.filter(name => !THREAD_PROPOSAL_VIEWS.includes(name ?? ''))).toEqual([]);
  });

  it('should end a job with one receipt and never a card of its own', () => {
    const outcome = componentBody(source('ChatColumn.tsx'), 'JobOutcome');
    expect(outcome).toContain('<TurnReceipt');
    expect(outcome).not.toContain('<TurnProposalCard');
  });

  it('should keep every Story Bible suggestion out of the thread, an organise round’s included', () => {
    const council = { op: 'entity.upsert', entityKey: 'council', name: 'The Council' };
    for (const kind of ['organise', 'chat', 'hub']) {
      expect(answeredInPanel({ kind, changeSet: [council, { op: 'organise.rule', rule: 'No magic at sea' }] })).toBe(true);
      expect(turnCardsInline({ kind, changeSet: [council] }, false)).toBe(false);
    }
    expect(turnCardsInline({ kind: 'chat', changeSet: [{ op: 'action.organise_notes' }] }, false)).toBe(true);
  });
});
