import { describe, expect, it } from 'bun:test';

import { resolveWordTarget } from '@modules/eval/deterministic-metrics';
import {
  dispositionOf,
  editorialOutcome,
  findingFingerprint,
  graphJudgeOutcome,
  hashReviewedBody,
  isReviewStale,
  judgeOutcome,
  mechanicsOutcome,
  openFindings,
  readabilityOutcome,
  settleFindings,
  verifiedEvidence,
} from '@modules/review/review-findings';
import { renderJudgeTask, renderSettledFindings } from '@modules/review/review-prompts';

const BODY = 'Mara counted the lanterns on the quay twice. “Nine,” she said. “There were ten last night.”';

describe('isReviewStale', () => {
  const reviewed = { draftRevision: 2, bodyHash: hashReviewedBody(BODY) };

  it('should keep a review fresh while the chapter is at the revision and text it read', () => {
    expect(isReviewStale(reviewed, { draftRevision: 2, bodyHash: hashReviewedBody(BODY) })).toBe(false);
  });

  it.each([
    ['the draft moved to a new revision', { draftRevision: 3, bodyHash: hashReviewedBody(BODY) }],
    ['the text changed under the same revision', { draftRevision: 2, bodyHash: hashReviewedBody(`${BODY} More.`) }],
    ['the chapter has no prose any more', null],
  ])('should mark a review stale when %s', (_, current) => {
    expect(isReviewStale(reviewed, current)).toBe(true);
  });
});

describe('verifiedEvidence', () => {
  it('should accept a quote found in the prose across curly quotes, spacing and a truncation mark', () => {
    expect(verifiedEvidence(BODY, ['"Nine," she  said.'])).toBe('"Nine," she  said.');
    expect(verifiedEvidence(BODY, ['counted the lanterns on the…'])).toBe('counted the lanterns on the');
    expect(verifiedEvidence(BODY, ['...the lanterns on the quay'])).toBe('the lanterns on the quay');
  });

  it('should drop a quote the prose does not contain', () => {
    expect(verifiedEvidence(BODY, ['She counted eleven lanterns.', null])).toBeNull();
  });
});

describe('settleFindings', () => {
  it('should number findings, lift a quoted passage from the text as evidence and fingerprint the finding', () => {
    const [finding] = settleFindings('judge', BODY, [{ severity: 'warning', category: 'continuity', text: 'Canon says ten, yet "There were ten last night." reads as news.' }]);

    expect(finding).toMatchObject({ id: 'f1', evidence: 'There were ten last night.' });
    expect(finding?.fingerprint).toBe(findingFingerprint('judge', 'continuity', 'canon says ten yet there were ten last night reads as news'));
  });

  it('should fingerprint the same finding the same way however it is punctuated, and apart by kind', () => {
    expect(findingFingerprint('judge', 'continuity', 'Ten lanterns!')).toBe(findingFingerprint('judge', 'continuity', 'ten   lanterns'));
    expect(findingFingerprint('judge', 'continuity', 'Ten lanterns')).not.toBe(findingFingerprint('editorial', 'continuity', 'Ten lanterns'));
  });
});

describe('dispositionOf', () => {
  it.each([
    [[], false, 'clear'],
    [[{ severity: 'note' as const }], false, 'issues'],
    [[{ severity: 'warning' as const }, { severity: 'blocking' as const }], false, 'blocking'],
    [[], true, 'failed'],
  ])('should read %j (failed: %s) as %s', (findings, failed, expected) => {
    expect(dispositionOf(findings, failed)).toBe(expected);
  });
});

describe('judgeOutcome', () => {
  const fact = { factKey: 'lamp_heir', text: 'Mara is the lamp-keeper’s heir.', terms: ['heir'] };

  const cast = { factKey: 'harbour_debt', text: 'The harbour master owes the Guild.' };
  const clean = { verdict: 'consistent' as const, findings: [], readabilityCompliance: { compliant: true, issues: [] } };

  it('should keep every compliance the judge was asked for and turn each issue into a finding', () => {
    const result = judgeOutcome(BODY, {
      output: {
        verdict: 'consistent',
        findings: [{ severity: 'soft', text: 'The quay is unnamed.' }],
        briefCompliance: { compliant: false, issues: ['the harbour master never speaks'] },
        endingCompliance: { compliant: true, issues: [] },
        knowledgeCompliance: { compliant: false, issues: ['Mara acts as if she knows [lamp_heir]'] },
        readabilityCompliance: { compliant: true, issues: [] },
      },
      hasBrief: true,
      hasEndingContract: true,
      lockedFromReader: [fact],
      hiddenFromCast: [cast],
      leaks: [],
    });

    expect(result).toMatchObject({ verdict: 'consistent', endingCompliance: { compliant: true } });
    expect(result.knowledgeCompliance).toEqual({ compliant: false, issues: ['Mara acts as if she knows [lamp_heir]'] });
    expect(result.findings.map(finding => [finding.category, finding.severity])).toEqual([
      ['continuity', 'warning'],
      ['brief', 'warning'],
      ['knowledge', 'blocking'],
    ]);
    expect(result.checked).toEqual([
      'continuity with the Story Bible',
      'the chapter plan',
      'the ending contract',
      '1 secret kept from the reader',
      '1 fact the point-of-view cast does not know',
      'readability',
    ]);
  });

  it('should block on a deterministic leak, with its excerpt as evidence, even when the judge missed it', () => {
    const result = judgeOutcome(BODY, {
      output: { ...clean, knowledgeCompliance: { compliant: true, issues: [] } },
      hasBrief: false,
      hasEndingContract: false,
      lockedFromReader: [fact],
      hiddenFromCast: [],
      leaks: [{ factKey: 'lamp_heir', term: 'lanterns', excerpt: '…counted the lanterns on the quay…' }],
    });

    expect(result.knowledgeCompliance?.compliant).toBe(false);
    expect(result.findings[0]).toMatchObject({ category: 'knowledge', severity: 'blocking', evidence: 'counted the lanterns on the quay' });
    expect(result).toMatchObject({ disposition: 'blocking', briefCompliance: null });
  });

  it('should keep plan and ending shortfalls as warnings, since a hand-writer may leave the plan on purpose', () => {
    const result = judgeOutcome(BODY, {
      output: { ...clean, briefCompliance: { compliant: false, issues: ['skips the bribe'] }, endingCompliance: { compliant: false, issues: ['ends at rest'] } },
      hasBrief: true,
      hasEndingContract: true,
      lockedFromReader: [],
      hiddenFromCast: [],
      leaks: [],
    });

    expect(result.disposition).toBe('issues');
    expect(result.findings.every(finding => finding.severity === 'warning')).toBe(true);
  });

  it('should never claim a check the judge left out, and never read as clear because of it', () => {
    const result = judgeOutcome(BODY, { output: clean, hasBrief: true, hasEndingContract: true, lockedFromReader: [fact], hiddenFromCast: [], leaks: [] });

    expect(result.checked).toEqual(['continuity with the Story Bible', '1 secret kept from the reader', 'readability']);
    expect(result.findings.map(finding => finding.text)).toEqual([
      expect.stringContaining('Plan compliance was not assessed'),
      expect.stringContaining('The ending contract was not assessed'),
      expect.stringContaining('Secret-keeping beyond give-away words was not assessed'),
    ]);
    expect(result.disposition).toBe('issues');
  });

  it('should fail, never clear, when the judge could not be read', () => {
    const result = judgeOutcome(BODY, { output: null, hasBrief: true, hasEndingContract: false, lockedFromReader: [], hiddenFromCast: [], leaks: [] });

    expect(result).toMatchObject({ disposition: 'failed', verdict: 'evaluation_failed', checked: [] });
    expect(result.findings[0]?.severity).toBe('blocking');
  });
});

describe('graphJudgeOutcome', () => {
  it('should sort the graph’s prefixed findings into categories, with leaks blocking and plan shortfalls as warnings', () => {
    const result = graphJudgeOutcome(BODY, {
      verdict: 'consistent',
      findings: [
        { severity: 'soft', text: 'brief: the bribe happens off-page' },
        { severity: 'soft', text: 'knowledge leak: "heir" exposes [lamp_heir] — …counted the lanterns…' },
        { severity: 'soft', text: 'readability: "His hope was a candle." — say it plainly' },
        { severity: 'hard', text: 'mechanical: draft is 16 words, below the 1200-word floor' },
      ],
    });

    expect(result.findings.map(finding => [finding.category, finding.severity, finding.text.slice(0, 12)])).toEqual([
      ['brief', 'warning', 'the bribe ha'],
      ['knowledge', 'blocking', '"heir" expos'],
      ['readability', 'warning', '"His hope wa'],
      ['mechanics', 'warning', 'draft is 16 '],
    ]);
    expect(result).toMatchObject({ disposition: 'blocking', briefCompliance: { compliant: false, issues: ['the bribe happens off-page'] } });
  });
});

describe('editorialOutcome', () => {
  const slip = { kind: 'spelling' as const, quote: 'counted the lanterns on the quay twice', fix: 'counted the lanterns on the quay twice over' };

  it('should turn each proofreading slip into a warning quoting the span, with the fix in its text', () => {
    const result = editorialOutcome(
      BODY,
      { disposition: 'approve', findings: [], proofreading: [slip, { kind: 'name', quote: 'Mara counted', fix: 'Marra counted', reason: 'the Story Bible spells it Marra' }] },
      false,
    );

    expect(result.findings).toEqual([
      expect.objectContaining({
        severity: 'warning',
        category: 'proofreading',
        text: 'Spelling: “counted the lanterns on the quay twice” → “counted the lanterns on the quay twice over”',
        evidence: 'counted the lanterns on the quay twice',
      }),
      expect.objectContaining({ severity: 'warning', category: 'proofreading', text: 'Name: “Mara counted” → “Marra counted” (the Story Bible spells it Marra)' }),
    ]);
    expect(result.disposition).toBe('issues');
    expect(result.checked).toContain('grammar, spelling, punctuation, tense, point of view, names and references');
  });

  it('should drop a slip whose quote is not in the prose, whose fix changes nothing, or that repeats', () => {
    const result = editorialOutcome(
      BODY,
      {
        disposition: 'approve',
        proofreading: [
          { kind: 'grammar', quote: 'the harbour master shouted', fix: 'the harbour master shouts' },
          { kind: 'punctuation', quote: '“Nine,” she said.', fix: '“Nine,” she said.' },
          slip,
          { ...slip, quote: `  ${slip.quote} ` },
        ],
      },
      false,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.evidence).toBe(slip.quote);
  });

  it('should never block on proofreading, however many slips there are, and keep at most twenty', () => {
    const slips = Array.from({ length: 25 }, (_, index) => ({ kind: 'tense' as const, quote: 'Mara counted', fix: `Mara counts ${index}` }));

    const result = editorialOutcome(BODY, { disposition: 'revision_requested', proofreading: slips }, false);

    expect(result.findings).toHaveLength(20);
    expect(result.findings.every(finding => finding.severity === 'warning')).toBe(true);
    expect(result.disposition).toBe('issues');
  });

  it('should say proofreading was not assessed when the editor left it out, rather than read as clean', () => {
    const result = editorialOutcome(BODY, { disposition: 'approve', findings: [] }, true);

    expect(result.findings).toEqual([expect.objectContaining({ severity: 'note', category: 'proofreading', text: expect.stringContaining('Proofreading was not assessed') })]);
    expect(result.checked).toEqual(['the chapter plan', 'canon', 'prose against the established style']);
  });

  it('should read an empty proofreading list as checked and clean', () => {
    const result = editorialOutcome(BODY, { disposition: 'approve', findings: [], proofreading: [] }, false);

    expect(result.disposition).toBe('clear');
    expect(result.checked).toContain('grammar, spelling, punctuation, tense, point of view, names and references');
  });
});

describe('deterministic outcomes', () => {
  it('should report mechanics without the internal prefix and say what was measured', () => {
    const result = mechanicsOutcome(BODY, [], resolveWordTarget({ wordTargetMin: 2400, wordTargetMax: 3200 }));

    expect(result.findings[0]?.text).toMatch(/^draft is \d+ words/);
    expect(result.checked[0]).toBe('length against the 2400–3200-word target');
    expect(result.metrics).toEqual({ words: 16 });
  });

  it('should say a chapter is too short to measure rather than call it readable', () => {
    expect(readabilityOutcome(BODY)).toMatchObject({ disposition: 'issues', readabilityCompliance: null, metrics: null });
  });

  it('should measure a long, plain chapter as clear', () => {
    const plain = Array.from({ length: 120 }, (_, index) => `Mara lit lamp ${index}. She walked on.`).join('\n\n');

    const result = readabilityOutcome(plain);

    expect(result).toMatchObject({ disposition: 'clear', readabilityCompliance: { compliant: true, issues: [] } });
    expect(result.metrics?.words).toBeGreaterThan(400);
  });
});

describe('openFindings', () => {
  it('should close dismissed and overridden findings but keep one the author plans to fix', () => {
    const findings = [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }];
    const remedies = [
      { findingId: 'f1', action: 'dismissed' as const },
      { findingId: 'f2', action: 'fixing_myself' as const },
      { findingId: 'f3', action: 'overridden' as const },
    ];

    expect(openFindings(findings, remedies)).toEqual([{ id: 'f2' }]);
  });
});

describe('renderJudgeTask', () => {
  const task = {
    contextPack: 'CANON',
    body: BODY,
    chapterBrief: 'Mara notices a lantern is missing.',
    endingContract: 'hookType: cliffhanger',
    lockedFromReader: [{ factKey: 'lamp_heir', text: 'Mara is the heir.', allowedClues: ['the lamp warms to her touch'] }],
    hiddenFromCast: [{ factKey: 'harbour_debt', text: 'The harbour master owes the Guild.' }],
    readabilityEvidence: null,
    settled: [
      { fingerprint: 'a', action: 'dismissed' as const, reason: 'sold in chapter 2', text: 'Ten lanterns in canon.' },
      { fingerprint: 'b', action: 'fixing_myself' as const, reason: null, text: 'The quay is unnamed.' },
    ],
  };

  it('should give the judge the plan, the ending contract, the secrets with their allowed clues and what the author settled', () => {
    const rendered = renderJudgeTask(task);

    expect(rendered).toContain('## BRIEF\nMara notices a lantern is missing.');
    expect(rendered).toContain('## ENDING CONTRACT\nhookType: cliffhanger');
    expect(rendered).toContain('- [lamp_heir] Mara is the heir.\n  Allowed clues (may be shown without the explanation): the lamp warms to her touch');
    expect(rendered).toContain('### Locked from the reader\nThe reader must not learn these yet.');
    expect(rendered).toContain('### Hidden from the point-of-view cast\nThe reader may already know these, so the page may mention them. Flag only a point-of-view character');
    expect(rendered).toContain('- [harbour_debt] The harbour master owes the Guild.');
    expect(rendered).toContain('- Ten lanterns in canon. (the author: sold in chapter 2)');
    expect(rendered).not.toContain('The quay is unnamed.');
  });

  it('should leave out the blocks a hand-written chapter without a plan does not have', () => {
    const rendered = renderJudgeTask({ ...task, chapterBrief: null, endingContract: '', lockedFromReader: [], hiddenFromCast: [], settled: [] });

    expect(rendered).not.toContain('## BRIEF');
    expect(rendered).not.toContain('## ENDING CONTRACT');
    expect(rendered).not.toContain('## FORBIDDEN KNOWLEDGE');
    expect(renderSettledFindings([])).toBe('');
  });
});
