/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { type JudgeFinding, routeAfterJudge, routeAfterPatch, sameFinding } from '@modules/ai/graphs/chapter-generation.graph';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// ─── sameFinding helper ───────────────────────────────────────────────────────

describe('sameFinding', () => {
  it('returns false when previousFindings is empty', () => {
    const findings: JudgeFinding[] = [{ severity: 'hard', text: 'some finding' }];
    expect(sameFinding(findings, [])).toBe(false);
  });

  it('returns true when finding text matches normalized previousFinding (identical)', () => {
    const findings: JudgeFinding[] = [{ severity: 'hard', text: 'the iron covenant' }];
    const previousFindings: JudgeFinding[] = [{ severity: 'hard', text: 'the iron covenant' }];
    expect(sameFinding(findings, previousFindings)).toBe(true);
  });

  it('returns true when finding matches case-insensitively', () => {
    const findings: JudgeFinding[] = [{ severity: 'hard', text: 'The Iron Covenant' }];
    const previousFindings: JudgeFinding[] = [{ severity: 'hard', text: 'the iron covenant' }];
    expect(sameFinding(findings, previousFindings)).toBe(true);
  });

  it('returns true when finding text is a substring of previousFinding', () => {
    const findings: JudgeFinding[] = [{ severity: 'hard', text: 'iron covenant' }];
    const previousFindings: JudgeFinding[] = [{ severity: 'hard', text: 'the iron covenant contradicts chapter 3' }];
    expect(sameFinding(findings, previousFindings)).toBe(true);
  });

  it('returns false when findings are unrelated', () => {
    const findings: JudgeFinding[] = [{ severity: 'hard', text: 'character A is dead' }];
    const previousFindings: JudgeFinding[] = [{ severity: 'hard', text: 'timeline inconsistency' }];
    expect(sameFinding(findings, previousFindings)).toBe(false);
  });

  it('returns false when both findings and previousFindings are empty', () => {
    expect(sameFinding([], [])).toBe(false);
  });
});

// ─── routeAfterJudge ─────────────────────────────────────────────────────────

describe('routeAfterJudge', () => {
  it('routes to accept when verdict is consistent', () => {
    const result = routeAfterJudge({ verdict: 'consistent', autoFix: false, attempt: 0, maxFixes: 3, findings: [], previousFindings: [] });
    expect(result).toBe('accept');
  });

  it('routes to accept when verdict is consistent even with autoFix on', () => {
    const result = routeAfterJudge({ verdict: 'consistent', autoFix: true, attempt: 1, maxFixes: 3, findings: [], previousFindings: [] });
    expect(result).toBe('accept');
  });

  it('routes to awaitReview when contradiction and autoFix=false', () => {
    const result = routeAfterJudge({ verdict: 'contradiction', autoFix: false, attempt: 0, maxFixes: 3, findings: [{ severity: 'hard', text: 'x' }], previousFindings: [] });
    expect(result).toBe('awaitReview');
  });

  it('routes to acceptAsIs when attempt >= maxFixes', () => {
    const result = routeAfterJudge({ verdict: 'contradiction', autoFix: true, attempt: 3, maxFixes: 3, findings: [{ severity: 'hard', text: 'x' }], previousFindings: [] });
    expect(result).toBe('acceptAsIs');
  });

  it('routes to acceptAsIs when attempt exceeds maxFixes', () => {
    const result = routeAfterJudge({ verdict: 'contradiction', autoFix: true, attempt: 5, maxFixes: 3, findings: [{ severity: 'hard', text: 'x' }], previousFindings: [] });
    expect(result).toBe('acceptAsIs');
  });

  it('routes to acceptAsIs on repeated finding', () => {
    const result = routeAfterJudge({
      verdict: 'contradiction',
      autoFix: true,
      attempt: 1,
      maxFixes: 3,
      findings: [{ severity: 'hard', text: 'the iron covenant' }],
      previousFindings: [{ severity: 'hard', text: 'The Iron Covenant' }],
    });
    expect(result).toBe('acceptAsIs');
  });

  it('routes to repairPatch on first contradiction with autoFix', () => {
    const result = routeAfterJudge({
      verdict: 'contradiction',
      autoFix: true,
      attempt: 0,
      maxFixes: 3,
      findings: [{ severity: 'hard', text: 'new finding' }],
      previousFindings: [],
    });
    expect(result).toBe('repairPatch');
  });

  it('routes to repairPatch when attempt < maxFixes and finding is novel', () => {
    const result = routeAfterJudge({
      verdict: 'contradiction',
      autoFix: true,
      attempt: 2,
      maxFixes: 3,
      findings: [{ severity: 'hard', text: 'completely different finding' }],
      previousFindings: [{ severity: 'hard', text: 'some other finding' }],
    });
    expect(result).toBe('repairPatch');
  });
});

// ─── routeAfterPatch ─────────────────────────────────────────────────────────

describe('routeAfterPatch', () => {
  it('routes to persistDraft when patch was applied', () => {
    expect(routeAfterPatch({ patchApplied: true })).toBe('persistDraft');
  });

  it('routes to repairRewrite when patch was not applied', () => {
    expect(routeAfterPatch({ patchApplied: false })).toBe('repairRewrite');
  });
});
