import { describe, expect, it, mock } from 'bun:test';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { applyBudget, countTokens, truncateAtParagraph } from '@modules/ai/context/token-budget';
import { routeAfterJudge, sameFinding } from '@modules/ai/graphs/chapter-generation.graph';

function makeDbStub() {
  const noRows = mock(async () => []);
  const noRow = mock(async () => null);
  return {
    query: {
      projects: { findFirst: noRow },
      briefs: { findFirst: noRow },
      chapters: { findFirst: noRow, findMany: noRows },
      volumes: { findFirst: noRow, findMany: noRows },
      arcs: { findFirst: noRow, findMany: noRows },
      drafts: { findFirst: noRow },
      entities: { findMany: noRows },
      worldFacts: { findMany: noRows },
      plotThreads: { findMany: noRows },
      mysteries: { findMany: noRows },
      contextPacks: { findFirst: noRow },
      userFeedback: { findMany: noRows },
    },
    insert: mock(() => ({ values: mock(() => ({ onConflictDoNothing: mock(() => ({ returning: mock(async () => []) })) })) })),
  };
}

function makeAssembler() {
  const db = makeDbStub();
  const fakeDatabaseService = { getPostgresClient: () => db } as never;
  const fakeCatalog = { render: mock(async () => '') } as unknown as CatalogService;
  return new ContextAssembler(fakeDatabaseService, fakeCatalog);
}

describe('applyBudget — edge cases', () => {
  it('force-includes the first section when it alone exceeds the budget (at-least-one guarantee)', () => {
    // Single section with 200 tokens, budget of 10 — must still be included.
    const sections = [{ tokens: 200, key: 'only' }];
    const { fitting, omitted } = applyBudget(sections, 10);
    expect(fitting).toHaveLength(1);
    expect(fitting[0]?.key).toBe('only');
    expect(omitted).toHaveLength(0);
  });

  it('force-includes the first of multiple sections when none fit', () => {
    const sections = [
      { tokens: 100, key: 'alpha' },
      { tokens: 100, key: 'beta' },
    ];
    const { fitting, omitted } = applyBudget(sections, 5);
    // Only first is force-included; the rest still cannot fit.
    expect(fitting[0]?.key).toBe('alpha');
    expect(fitting.every(s => s.key !== 'beta')).toBe(true);
    expect(omitted).toEqual([{ key: 'beta', reason: 'budget' }]);
  });

  it('returns empty array when sections list is empty', () => {
    expect(applyBudget([], 1000).fitting).toHaveLength(0);
  });
});

describe('truncateAtParagraph — edge cases', () => {
  it('truncates at word boundary when text has no paragraph breaks', () => {
    // A single long line (no \n\n) that exceeds maxTokens.
    const words = Array.from({ length: 50 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const fullTokens = countTokens(text);

    // Halve the budget so the text must be truncated.
    const maxTokens = Math.floor(fullTokens / 2);
    const { text: result, truncated } = truncateAtParagraph(text, maxTokens);

    expect(truncated).toBe(true);
    // Result must be a prefix of the original (word boundary, no mid-word cuts).
    expect(text.startsWith(result)).toBe(true);
    expect(countTokens(result)).toBeLessThanOrEqual(maxTokens);
  });

  it('returns the full text unchanged when it fits', () => {
    const text = 'Short text that fits easily.';
    const { text: result, truncated } = truncateAtParagraph(text, 1000);
    expect(truncated).toBe(false);
    expect(result).toBe(text);
  });
});

describe('sameFinding', () => {
  it('normalizes leading/trailing whitespace before comparison', () => {
    const current = [{ severity: 'soft' as const, text: '  sword is broken  ' }];
    const previous = [{ severity: 'soft' as const, text: 'sword is broken' }];
    expect(sameFinding(current, previous)).toBe(true);
  });
});

describe('routeAfterJudge', () => {
  const base = { verdict: 'contradiction' as const, autoFix: true, attempt: 0, maxFixes: 3, findings: [{ severity: 'hard' as const, text: 'some issue' }], previousFindings: [] };

  it('routes an ending-contract violation into the repair ladder even on a consistent verdict', () => {
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: false })).toBe('repairPatch');
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: false, autoFix: false })).toBe('awaitReview');
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: false, attempt: 3 })).toBe('acceptAsIs');
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: true })).toBe('accept');
    // Legacy callers without the flag keep today's behavior.
    expect(routeAfterJudge({ ...base, verdict: 'consistent' })).toBe('accept');
  });
});

describe('ContextAssembler.resolveRefs — unknown ref type', () => {
  it('returns the ref in unresolved when the prefix is unknown', async () => {
    const assembler = makeAssembler();
    const { resolved, unresolved } = await assembler.resolveRefs(1n, ['unknowntype:some-value']);
    expect(resolved).toHaveLength(0);
    expect(unresolved).toContain('unknowntype:some-value');
  });

  it('returns the ref in unresolved when there is no colon separator', async () => {
    const assembler = makeAssembler();
    const { resolved, unresolved } = await assembler.resolveRefs(1n, ['no-colon-ref']);
    expect(resolved).toHaveLength(0);
    expect(unresolved).toContain('no-colon-ref');
  });

  it('resolves known prefixes and marks unknown ones as unresolved in the same call', async () => {
    const assembler = makeAssembler();
    // entity:missing-key won't resolve because DB returns [], but unknowntype:x goes straight to unresolved.
    const { unresolved } = await assembler.resolveRefs(1n, ['unknowntype:x', 'entity:missing']);
    expect(unresolved).toContain('unknowntype:x');
    // entity:missing fails to find a row — also ends up in unresolved.
    expect(unresolved).toContain('entity:missing');
  });
});
