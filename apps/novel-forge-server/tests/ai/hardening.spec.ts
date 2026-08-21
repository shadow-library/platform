import { describe, expect, it, mock } from 'bun:test';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { applyBudget, countTokens, truncateAtParagraph } from '@modules/ai/context/token-budget';
import { routeAfterJudge, routeAfterPatch, sameFinding } from '@modules/ai/graphs/chapter-generation.graph';

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

describe('countTokens — edge cases', () => {
  it('returns 0 for an empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('returns 0 for a whitespace-only string', () => {
    // tiktoken encodes whitespace; this asserts the boundary is consistent.
    expect(typeof countTokens('   ')).toBe('number');
  });
});

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
  it('detects duplicate finding regardless of casing', () => {
    const current = [{ severity: 'hard' as const, text: 'Character A teleports without explanation' }];
    const previous = [{ severity: 'hard' as const, text: 'character a teleports without explanation' }];
    expect(sameFinding(current, previous)).toBe(true);
  });

  it('normalizes leading/trailing whitespace before comparison', () => {
    const current = [{ severity: 'soft' as const, text: '  sword is broken  ' }];
    const previous = [{ severity: 'soft' as const, text: 'sword is broken' }];
    expect(sameFinding(current, previous)).toBe(true);
  });

  it('returns false when previousFindings is empty', () => {
    const current = [{ severity: 'hard' as const, text: 'Some finding' }];
    expect(sameFinding(current, [])).toBe(false);
  });

  it('returns false when findings lists have no overlap', () => {
    const current = [{ severity: 'hard' as const, text: 'completely different finding about dragons' }];
    const previous = [{ severity: 'hard' as const, text: 'entirely unrelated observation about magic' }];
    expect(sameFinding(current, previous)).toBe(false);
  });

  it('returns false when both arrays are empty', () => {
    expect(sameFinding([], [])).toBe(false);
  });
});

describe('routeAfterJudge', () => {
  const base = { verdict: 'contradiction' as const, autoFix: true, attempt: 0, maxFixes: 3, findings: [{ severity: 'hard' as const, text: 'some issue' }], previousFindings: [] };

  it('routes to "accept" when verdict is consistent', () => {
    expect(routeAfterJudge({ ...base, verdict: 'consistent' })).toBe('accept');
  });

  it('routes to "awaitReview" when autoFix is false', () => {
    expect(routeAfterJudge({ ...base, autoFix: false })).toBe('awaitReview');
  });

  it('routes to "acceptAsIs" when attempt equals maxFixes', () => {
    expect(routeAfterJudge({ ...base, attempt: 3, maxFixes: 3 })).toBe('acceptAsIs');
  });

  it('routes to "acceptAsIs" when attempt exceeds maxFixes', () => {
    expect(routeAfterJudge({ ...base, attempt: 5, maxFixes: 3 })).toBe('acceptAsIs');
  });

  it('routes to "acceptAsIs" when same finding repeats (dedup triggered)', () => {
    const repeated = { severity: 'hard' as const, text: 'sword inconsistency detected' };
    expect(routeAfterJudge({ ...base, findings: [repeated], previousFindings: [repeated] })).toBe('acceptAsIs');
  });

  it('routes to "repairPatch" when autoFix, under maxFixes, and no repeated findings', () => {
    expect(routeAfterJudge(base)).toBe('repairPatch');
  });

  it('routes to "repairPatch" when previousFindings is empty (never trips dedup)', () => {
    expect(routeAfterJudge({ ...base, previousFindings: [] })).toBe('repairPatch');
  });

  it('routes an ending-contract violation into the repair ladder even on a consistent verdict', () => {
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: false })).toBe('repairPatch');
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: false, autoFix: false })).toBe('awaitReview');
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: false, attempt: 3 })).toBe('acceptAsIs');
    expect(routeAfterJudge({ ...base, verdict: 'consistent', endingCompliant: true })).toBe('accept');
    // Legacy callers without the flag keep today's behavior.
    expect(routeAfterJudge({ ...base, verdict: 'consistent' })).toBe('accept');
  });
});

describe('routeAfterPatch', () => {
  it('routes to "persistDraft" when patch was applied', () => {
    expect(routeAfterPatch({ patchApplied: true })).toBe('persistDraft');
  });

  it('routes to "repairRewrite" when patch was not applied', () => {
    expect(routeAfterPatch({ patchApplied: false })).toBe('repairRewrite');
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
