import { describe, expect, it } from 'bun:test';

import { SECRET_WITHHELD } from '@modules/audit/bible-audit-report';
import { HubActionRegistrar } from '@modules/hub/hub-action.registrar';
import { ActionExecutorRegistry } from '@modules/refinement';

import { auditHarness, CHAPTER_THREE, GEOGRAPHY } from './audit-fixtures';

const LANTERN_FIX = { op: 'bible_document.upsert', section: 'world', slug: 'geography', body: 'The harbour of Saltgate keeps nine lanterns lit every night.' };
const SEEDED = {
  contradictions: [
    {
      finding: 'The geography page says ten lanterns; chapter 3 treats nine as the usual count.',
      evidence: [
        { ref: 'doc:world/geography', quote: 'keeps ten lanterns lit every night' },
        { ref: 'chapter:3', quote: 'calls it the usual count' },
      ],
      changeSet: [LANTERN_FIX],
    },
  ],
};
const TWO_FINDINGS = {
  coverage: {
    findings: [{ ref: 'entity:kael', action: 'add', finding: 'Kael has no record.' }],
    changeSet: [{ op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael' }],
  },
  contradictions: SEEDED,
};

describe('BibleAuditService', () => {
  it('should find a seeded contradiction, store it with its evidence and stage its fix as a pending card', async () => {
    const { service, reports, staged } = auditHarness({ contradictions: SEEDED });

    const { report, proposal } = await service.run(1n);

    expect(report.findings).toMatchObject([{ id: 'f1', group: 'contradiction', opIndexes: [0], evidence: [{ ref: 'doc:world/geography' }, { ref: 'chapter:3' }] }]);
    expect(report.summary).toBe('1 finding: 1 contradiction. Checked: 1 page, 1 character, 0 facts, chapter 3.');
    expect(staged).toMatchObject([{ kind: 'bible_audit', changeSet: [LANTERN_FIX], runId: 'run-1' }]);
    expect(proposal?.status).toBe('pending');
    expect(reports[0]).toMatchObject({ scope: 'bible', issues: 1, proposalId: proposal?.id, runId: 'run-1' });
  });

  it('should hand the contradiction check the pages, records, facts and chapter summaries under their labels', async () => {
    const { service, prompts } = auditHarness();

    await service.run(1n);

    expect(prompts['bible-contradiction']?.['material']).toContain('[doc:world/geography]');
    expect(prompts['bible-contradiction']?.['material']).toContain(`[chapter:3]\nThe Count\n${'Mara counts nine lanterns'}`);
  });

  it('should say a clean audit found nothing and list what it checked, staging no card', async () => {
    const { service, staged } = auditHarness();

    const { report, proposal } = await service.run(1n);

    expect(report.summary).toBe('Nothing found. Checked: 1 page, 1 character, 0 facts, chapter 3.');
    expect(report.checked.passes).toEqual({ coverage: 'ran', contradictions: 'ran' });
    expect(proposal).toBeNull();
    expect(staged).toEqual([]);
  });

  it('should never claim the facts and chapters a failed contradiction check did not read', async () => {
    const { service } = auditHarness({ contradictions: new Error('model unavailable') });

    const { report } = await service.run(1n);

    expect(report.summary).toBe('Nothing found. Checked: 1 page, 1 character. The contradiction check did not run, so facts and chapters were not compared.');
    expect(report.checked.chapters).toBeNull();
  });

  it('should fail the audit when neither check could run', async () => {
    const { service, reports } = auditHarness({ coverage: new Error('down'), contradictions: new Error('down') });

    await expect(service.run(1n)).rejects.toMatchObject({ code: 'AUD_004' });
    expect(reports).toEqual([]);
  });

  it('should put no secret truth on a card that writes where the chapter writer reads', async () => {
    const leak = { op: 'entity.upsert', entityKey: 'mara', type: 'character', notes: 'Mara is secretly the lost heir of the lamp-keeper.' };
    const facts = [
      {
        factKey: 'lamp_heir',
        text: 'Mara is the lamp-keeper’s lost heir.',
        writerNote: null,
        terms: ['lost heir'],
        allowedClues: null,
        revealChapter: 9,
        disclosedInChapter: null,
        source: 'manual',
      },
    ];
    const contradictions = { contradictions: [{ ...SEEDED.contradictions[0], changeSet: [leak] }] };
    const { service, staged } = auditHarness({ facts, contradictions });

    const { report } = await service.run(1n);

    expect(staged).toEqual([]);
    expect(report.findings[0]).toMatchObject({ opIndexes: [], withheld: SECRET_WITHHELD });
  });

  it('should never read an isolated chapter, and say it was left out', async () => {
    const isolated = { number: 4, title: 'The Deep', summary: 'Mara drowns the harbour master in the flooded vault.', isolated: true };
    const { service, prompts } = auditHarness({ chapters: [CHAPTER_THREE, isolated] });

    const { report } = await service.run(1n);

    expect(prompts['bible-contradiction']?.['material']).not.toContain('flooded vault');
    expect(report.checked.chaptersIsolated).toEqual([4]);
    expect(report.summary).toBe('Nothing found. Checked: 1 page, 1 character, 0 facts, chapter 3. Chapter 4 is isolated, so not compared.');
  });

  it('should stage its card on the states it read when it loaded the bible', async () => {
    const { service, staged } = auditHarness({ contradictions: SEEDED });

    await service.run(1n);

    expect(Object.keys(staged[0]?.['baseline'] as object)).toEqual(['doc:world/geography', 'entity:mara']);
  });

  it('should read the bible and its baseline in one repeatable-read snapshot', async () => {
    const { service, isolation } = auditHarness({ contradictions: SEEDED });

    await service.run(1n);

    expect(isolation[0]).toBe('repeatable read');
  });

  it('should not withhold a fix to a page that already names a secret when the fix adds nothing of it', async () => {
    const page = { ...GEOGRAPHY, body: 'The lost heir of Saltgate is a harbour legend. The harbour of Saltgate keeps ten lanterns lit every night.' };
    const fix = {
      op: 'bible_document.upsert',
      section: 'world',
      slug: 'geography',
      body: 'The lost heir of Saltgate is a harbour legend. The harbour of Saltgate keeps nine lanterns lit every night.',
    };
    const facts = [
      {
        factKey: 'lamp_heir',
        text: 'Mara is the lamp-keeper’s lost heir.',
        writerNote: null,
        terms: ['lost heir'],
        allowedClues: null,
        revealChapter: 9,
        disclosedInChapter: null,
        source: 'manual',
      },
    ];
    const { service, staged } = auditHarness({ documents: [page], facts, contradictions: { contradictions: [{ ...SEEDED.contradictions[0], changeSet: [fix] }] } });

    await service.run(1n);

    expect(staged[0]?.['changeSet']).toEqual([fix]);
  });

  it('should store nothing when its run was cancelled while the checks ran', async () => {
    const { service, reports, staged, cancel } = auditHarness({ contradictions: SEEDED });
    cancel();

    await expect(service.run(1n)).rejects.toMatchObject({ code: 'AI_013' });
    expect(reports).toEqual([]);
    expect(staged).toEqual([]);
  });

  it('should settle a retried job whose report an earlier attempt already stored, without auditing again', async () => {
    const { service, reports, queued, runRegisteredJob } = auditHarness({ priorRun: { id: 'run-1' } });
    await service.run(1n);

    await runRegisteredJob({ id: 'job-1', projectId: 1n, kind: 'audit', attempts: 1 });

    expect(reports).toHaveLength(1);
    expect(queued).toContainEqual(['settled', 'job-1', 'completed']);
  });

  it('should queue an audit as a job under its own run', async () => {
    const { service, queued } = auditHarness();

    const job = await service.start(1n);

    expect(job).toEqual({ jobId: 'job-1', runId: 'run-queued', status: 'pending' });
    expect(queued).toEqual([
      ['enqueue', 1n, 'audit', 'bible', {}],
      ['run', 1n, 'bible-audit', 'bible', {}, 'job-1'],
    ]);
  });

  it('should register the audit job kind with the executor', () => {
    const { service, registeredKinds } = auditHarness();

    service.onModuleInit();

    expect(registeredKinds).toEqual(['audit']);
  });
});

describe('BibleAuditService.decide', () => {
  it('should persist a Skip with its reason and take the finding’s ops off the card selection', async () => {
    const { service } = auditHarness(TWO_FINDINGS);
    const { report } = await service.run(1n);

    const decided = await service.decide(1n, report.id, 'f1', { decision: 'skipped', reason: ' the chapter is wrong, not the page ' });

    expect(decided.findings[0]?.decision).toMatchObject({ decision: 'skipped', reason: 'the chapter is wrong, not the page' });
    expect(decided.selection).toEqual([1]);
    expect(decided.openFindings).toBe(1);
    expect(decided.proposalStatus).toBe('pending');
  });

  it('should persist a Keep, which leaves the finding on a pending card', async () => {
    const { service } = auditHarness(TWO_FINDINGS);
    const { report } = await service.run(1n);

    const decided = await service.decide(1n, report.id, 'f2', { decision: 'kept' });

    expect(decided.findings[1]?.decision).toMatchObject({ decision: 'kept', reason: null });
    expect(decided.selection).toEqual([0, 1]);
  });

  it('should refuse to discard a card that something else settled while the decision was being made', async () => {
    const { service, proposals, settleAfterNextLock } = auditHarness(TWO_FINDINGS);
    const { report } = await service.run(1n);
    await service.decide(1n, report.id, 'f1', { decision: 'skipped' });
    settleAfterNextLock('applied');

    await expect(service.decide(1n, report.id, 'f2', { decision: 'skipped' })).rejects.toMatchObject({ code: 'RFN_002' });
    expect(proposals.at(-1)?.status).toBe('applied');
  });

  it('should discard the card once every finding on it is skipped, and restage it when one is kept again', async () => {
    const { service, proposals } = auditHarness(TWO_FINDINGS);
    const { report, proposal } = await service.run(1n);

    await service.decide(1n, report.id, 'f1', { decision: 'skipped' });
    const discarded = await service.decide(1n, report.id, 'f2', { decision: 'skipped' });
    expect(discarded.proposalStatus).toBe('discarded');
    expect(discarded.selection).toEqual([]);

    const restaged = await service.decide(1n, report.id, 'f1', { decision: 'kept' });
    expect(restaged.proposalId).not.toBe(proposal?.id ?? null);
    expect(restaged.proposalStatus).toBe('pending');
    expect(restaged.selection).toEqual([0]);
    expect(proposals.at(-1)).toMatchObject({ kind: 'bible_audit', changeSet: proposal?.changeSet, baseline: proposal?.baseline });
  });

  it('should lock the report, then its card, before answering', async () => {
    const { service, locks } = auditHarness(TWO_FINDINGS);
    const { report } = await service.run(1n);

    await service.decide(1n, report.id, 'f1', { decision: 'skipped' });

    expect(locks).toEqual(['report', 'card']);
  });

  it('should restage through the proposal checks, on the baseline the audit read', async () => {
    const { service, staged } = auditHarness(TWO_FINDINGS);
    const { report } = await service.run(1n);
    await service.decide(1n, report.id, 'f1', { decision: 'skipped' });
    await service.decide(1n, report.id, 'f2', { decision: 'skipped' });

    await service.decide(1n, report.id, 'f2', { decision: 'kept' });

    expect(staged).toHaveLength(2);
    expect(staged[1]).toMatchObject({ kind: 'bible_audit', changeSet: staged[0]?.['changeSet'], baseline: staged[0]?.['baseline'], entityMaterialization: false });
  });

  it('should refuse to answer a finding once its card was applied', async () => {
    const { service, proposals } = auditHarness(TWO_FINDINGS);
    const { report } = await service.run(1n);
    Object.assign(proposals[0] ?? {}, { status: 'applied' });

    await expect(service.decide(1n, report.id, 'f1', { decision: 'skipped' })).rejects.toMatchObject({ code: 'AUD_003' });
  });

  it('should refuse a finding that is not part of the report', async () => {
    const { service } = auditHarness(TWO_FINDINGS);
    const { report } = await service.run(1n);

    await expect(service.decide(1n, report.id, 'f9', { decision: 'kept' })).rejects.toMatchObject({ code: 'AUD_002' });
  });
});

describe('BibleAuditService.list', () => {
  it('should list a project’s reports newest first with the state of each card', async () => {
    const { service } = auditHarness(TWO_FINDINGS);
    const first = await service.run(1n);
    const second = await service.run(1n);
    await service.decide(1n, first.report.id, 'f1', { decision: 'skipped' });
    await service.decide(1n, first.report.id, 'f2', { decision: 'skipped' });

    const reports = await service.list(1n);

    expect(reports.map(report => [report.id, report.proposalStatus])).toEqual([
      [second.report.id, 'pending'],
      [first.report.id, 'discarded'],
    ]);
  });
});

describe('HubActionRegistrar action.audit_bible', () => {
  it('should queue the audit as a job instead of running it in the request', async () => {
    const { service, reports } = auditHarness({ contradictions: SEEDED });
    const registry = new ActionExecutorRegistry();
    new HubActionRegistrar(registry, {} as never, {} as never, {} as never, service).onModuleInit();

    const result = await registry.get('action.audit_bible')?.(1n, { op: 'action.audit_bible' }, { proposalId: 9n, opIndex: 0, sessionId: null, messageId: null });

    expect(result).toEqual({ summary: 'bible audit queued', jobId: 'job-1', runId: 'run-queued' });
    expect(reports).toEqual([]);
  });
});
