import { describe, expect, it } from 'bun:test';

import { type JudgeFinding, mergeKnowledgeCompliance, routeAfterJudge, routeAfterPatch, sameFinding } from '@modules/ai/graphs/chapter-generation.graph';

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

  it('does not treat overlapping finding text as the same finding', () => {
    const findings: JudgeFinding[] = [{ severity: 'hard', text: 'iron covenant' }];
    const previousFindings: JudgeFinding[] = [{ severity: 'hard', text: 'the iron covenant contradicts chapter 3' }];
    expect(sameFinding(findings, previousFindings)).toBe(false);
  });

  it('returns false when text matches but severity differs', () => {
    const findings: JudgeFinding[] = [{ severity: 'soft', text: 'the iron covenant' }];
    const previousFindings: JudgeFinding[] = [{ severity: 'hard', text: 'the iron covenant' }];
    expect(sameFinding(findings, previousFindings)).toBe(false);
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

  it('routes a knowledge leak to repairPatch with autoFix even when the verdict is consistent', () => {
    const state = {
      verdict: 'consistent' as const,
      attempt: 0,
      maxFixes: 3,
      findings: [{ severity: 'soft' as const, text: 'knowledge leak: "forgery" exposes [ledger_forgery]' }],
      previousFindings: [],
      knowledgeCompliant: false,
    };
    expect(routeAfterJudge({ ...state, autoFix: true })).toBe('repairPatch');
    expect(routeAfterJudge({ ...state, autoFix: false })).toBe('awaitReview');
  });

  it('accepts a consistent verdict when the draft is knowledge-compliant', () => {
    expect(routeAfterJudge({ verdict: 'consistent', autoFix: true, attempt: 0, maxFixes: 3, findings: [], previousFindings: [], knowledgeCompliant: true })).toBe('accept');
  });

  it('routes to awaitReview when the judge output was unparseable, regardless of autoFix', () => {
    const state = {
      verdict: 'evaluation_failed' as const,
      attempt: 0,
      maxFixes: 3,
      findings: [{ severity: 'hard' as const, text: 'judge output unparseable' }],
      previousFindings: [],
    };
    expect(routeAfterJudge({ ...state, autoFix: true })).toBe('awaitReview');
    expect(routeAfterJudge({ ...state, autoFix: false })).toBe('awaitReview');
  });

  it('never routes an unparseable judge output to accept or acceptAsIs, even past maxFixes', () => {
    const result = routeAfterJudge({
      verdict: 'evaluation_failed',
      autoFix: true,
      attempt: 5,
      maxFixes: 3,
      findings: [{ severity: 'hard', text: 'judge output unparseable' }],
      previousFindings: [],
    });
    expect(result).toBe('awaitReview');
  });
});

describe('mergeKnowledgeCompliance', () => {
  it('is compliant when neither the pre-scan nor the judge found leaks', () => {
    expect(mergeKnowledgeCompliance({ compliant: true, issues: [] }, [])).toEqual({ knowledgeCompliant: true, findings: [] });
    expect(mergeKnowledgeCompliance(undefined, [])).toEqual({ knowledgeCompliant: true, findings: [] });
  });

  it('lets a deterministic pre-scan hit force non-compliance over a compliant judge', () => {
    const result = mergeKnowledgeCompliance({ compliant: true, issues: [] }, [{ factKey: 'ledger_forgery', term: 'forgery', excerpt: 'a forgery, she realized' }]);
    expect(result.knowledgeCompliant).toBe(false);
    expect(result.findings).toEqual([{ severity: 'soft', text: 'knowledge leak: "forgery" exposes [ledger_forgery] — a forgery, she realized' }]);
  });

  it('merges judge-reported paraphrase leaks after pre-scan hits as soft findings', () => {
    const result = mergeKnowledgeCompliance({ compliant: false, issues: ['[motive_debt] Amara acts on the debt she cannot know about'] }, [
      { factKey: 'ledger_forgery', term: 'forgery', excerpt: 'x' },
    ]);
    expect(result.knowledgeCompliant).toBe(false);
    expect(result.findings.map(f => f.severity)).toEqual(['soft', 'soft']);
    expect(result.findings[1]?.text).toBe('knowledge leak: [motive_debt] Amara acts on the debt she cannot know about');
  });
});

describe('routeAfterPatch', () => {
  it('routes to persistDraft when patch was applied', () => {
    expect(routeAfterPatch({ patchApplied: true })).toBe('persistDraft');
  });

  it('routes to repairRewrite when patch was not applied', () => {
    expect(routeAfterPatch({ patchApplied: false })).toBe('repairRewrite');
  });
});
