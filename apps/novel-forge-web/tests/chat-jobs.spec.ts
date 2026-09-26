import { describe, expect, it } from 'bun:test';

import { type ChatJobEventResponse, type ChatJobResponse } from '../src/lib/apis/api-types.gen';
import { learnAnchors, mergeChatJobs, parseChatJobEvent, reduceChatJobs } from '../src/lib/apis/chat.api';
import { choiceLabel, choiceScope, modelTagParts, turnChoiceDefaults, turnOverride } from '../src/lib/chat-model';

function event(seq: number, type: ChatJobEventResponse['type'], data?: Record<string, unknown>): ChatJobEventResponse {
  return { seq, jobId: 'j1', kind: 'organise', type, data, createdAt: '2026-09-26T10:00:00.000Z' };
}

describe('parseChatJobEvent', () => {
  it('should read a job event and refuse anything else', () => {
    expect(parseChatJobEvent(JSON.stringify(event(3, 'started')))?.seq).toBe(3);
    expect(parseChatJobEvent('not json')).toBeUndefined();
    expect(parseChatJobEvent(JSON.stringify({ type: 'started' }))).toBeUndefined();
    expect(parseChatJobEvent(undefined)).toBeUndefined();
  });
});

describe('reduceChatJobs', () => {
  it('should follow a job from queued to done with its staged card and receipt', () => {
    let jobs = reduceChatJobs({}, event(1, 'queued'));
    jobs = reduceChatJobs(jobs, event(2, 'started'));
    jobs = reduceChatJobs(jobs, event(3, 'step', { done: 0, total: 2, phase: 'organising', current: 'notes' }));
    expect(jobs.j1).toMatchObject({ status: 'in_progress', progress: { phase: 'organising' } });
    jobs = reduceChatJobs(
      jobs,
      event(4, 'done', {
        phase: 'staged',
        proposalId: '8',
        appliedProposalId: '7',
        applyNote: 'One entry quotes a question',
        organised: { notesDigest: 'abcd1234', paragraphs: 3, unusedParagraphs: [2], fromNotes: 2, suggested: 1, rules: 0, applied: [], card: [] },
      }),
    );
    expect(jobs.j1).toMatchObject({ status: 'done', progress: { proposalId: '8', appliedProposalId: '7', applyNote: 'One entry quotes a question' } });
    expect(jobs.j1?.progress.organised?.unusedParagraphs).toEqual([2]);
  });

  it('should ignore an event a reconnect replays', () => {
    const done = reduceChatJobs(reduceChatJobs({}, event(1, 'started')), event(2, 'done', { proposalId: '8' }));
    expect(reduceChatJobs(done, event(1, 'started'))).toBe(done);
  });

  it('should keep a failure’s reason and a retry’s flag', () => {
    const retrying = reduceChatJobs({}, event(5, 'retrying', { error: 'timeout' }));
    expect(retrying.j1).toMatchObject({ retrying: true, error: 'timeout' });
    const failed = reduceChatJobs(retrying, event(6, 'failed', { message: 'Gave up' }));
    expect(failed.j1).toMatchObject({ status: 'failed', retrying: false, error: 'Gave up' });
    expect(reduceChatJobs(failed, event(7, 'cancelled')).j1?.status).toBe('cancelled');
  });
});

describe('mergeChatJobs', () => {
  const listed: ChatJobResponse = {
    id: 'j1',
    kind: 'plan',
    target: 'chapter-4',
    status: 'in_progress',
    attempts: 1,
    progress: { phase: 'planning', current: '4' },
    origin: { proposalId: '3', opIndex: 0, messageId: 'm9' },
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: '2026-09-26T10:00:00.000Z',
  };

  it('should show a listed job before its first event and keep the message that started it after', () => {
    expect(mergeChatJobs([listed], {})[0]).toMatchObject({ id: 'j1', status: 'in_progress', messageId: 'm9', progress: { current: '4' } });
    const streamed = reduceChatJobs({}, { ...event(9, 'done', { proposalId: '11' }), kind: 'plan' });
    expect(mergeChatJobs([listed], streamed, 5)[0]).toMatchObject({ status: 'done', messageId: 'm9', progress: { current: '4', proposalId: '11' } });
  });

  it('should trust the listing over a streamed state it already covers', () => {
    const stale = reduceChatJobs({}, { ...event(4, 'started'), kind: 'plan' });
    expect(mergeChatJobs([{ ...listed, status: 'done' }], stale, 5)[0]?.status).toBe('done');
  });

  it('should keep a settled job under its message after the cursor moves past it and the listing drops it', () => {
    const anchors = learnAnchors(new Map(), [listed]);
    const settled = reduceChatJobs(reduceChatJobs({}, { ...event(6, 'started'), kind: 'plan' }), { ...event(7, 'done', { proposalId: '11' }), kind: 'plan' });
    const [job] = mergeChatJobs([], settled, 9, anchors);
    expect(job).toMatchObject({ id: 'j1', status: 'done', messageId: 'm9', progress: { proposalId: '11' } });
  });

  it('should not forget an anchor when a later listing leaves the job out', () => {
    const anchors = learnAnchors(learnAnchors(new Map(), [listed]), []);
    expect(anchors.get('j1')).toBe('m9');
    expect(learnAnchors(anchors, [listed])).toBe(anchors);
    expect(mergeChatJobs([], { j1: { id: 'j1', kind: 'plan', status: 'in_progress', progress: {}, retrying: false, seq: 3, firstSeq: 3 } }, 0, anchors)[0]?.messageId).toBe('m9');
  });

  it('should treat a settled job from the listing as settled and anchored, receipt and all', () => {
    const receipt = { notesDigest: 'abcd1234', paragraphs: 2, unusedParagraphs: [2], fromNotes: 1, suggested: 0, rules: 0, applied: [], card: [] };
    const done = { ...listed, kind: 'organise' as const, status: 'done' as const, progress: { phase: 'staged', appliedProposalId: '7', organised: receipt } };
    const [job] = mergeChatJobs([done], {}, 12);
    expect(job).toMatchObject({ status: 'done', messageId: 'm9', progress: { appliedProposalId: '7' } });
    expect(job?.progress.organised?.unusedParagraphs).toEqual([2]);
  });

  it('should keep jobs in the order they were first seen and take the kind from events', () => {
    let streamed = reduceChatJobs({}, { ...event(3, 'queued'), jobId: 'a', kind: 'plan' });
    streamed = reduceChatJobs(streamed, { ...event(4, 'queued'), jobId: 'b', kind: 'organise' });
    streamed = reduceChatJobs(streamed, { ...event(9, 'step'), jobId: 'a', kind: 'plan' });
    expect(mergeChatJobs([], streamed).map(job => job.id)).toEqual(['a', 'b']);
    expect(streamed.b?.kind).toBe('organise');
  });
});

describe('modelTagParts', () => {
  it('should read model · tier · cost, naming the content mode only when it is unrestricted', () => {
    expect(modelTagParts({ model: 'Claude Sonnet 5', contentMode: 'standard', costTier: 'balanced', costUsd: 0.041 })).toEqual(['Claude Sonnet 5', 'Balanced', '$0.041']);
    expect(modelTagParts({ model: 'GLM 5.2', contentMode: 'unrestricted', costTier: 'economy', costUsd: 0 })).toEqual(['GLM 5.2', 'Unrestricted', 'Economy', '$0.00']);
    expect(modelTagParts({ model: 'Claude Haiku 4.5' })).toEqual(['Claude Haiku 4.5']);
  });
});

describe('turn choice', () => {
  const project = { contentMode: 'standard' as const, costTier: 'balanced' as const };

  it('should default to the chat’s own choice, then the project’s', () => {
    expect(turnChoiceDefaults(undefined, project)).toEqual({ choice: project, source: 'project' });
    expect(turnChoiceDefaults({ costTier: 'performant' }, project)).toEqual({ choice: { contentMode: 'standard', costTier: 'performant' }, source: 'chat' });
  });

  it('should send a pick on the turn only when it differs from the default', () => {
    expect(turnOverride(undefined, project)).toEqual({});
    expect(turnOverride(project, project)).toEqual({});
    expect(turnOverride({ contentMode: 'unrestricted', costTier: 'economy' }, project)).toEqual({ contentMode: 'unrestricted', costTier: 'economy' });
  });

  it('should label the scope of the pick', () => {
    const defaults = turnChoiceDefaults(undefined, project);
    expect(choiceScope(undefined, defaults)).toBe('project default');
    expect(choiceScope({ contentMode: 'standard', costTier: 'economy' }, defaults)).toBe('this turn only');
    expect(choiceLabel({ contentMode: 'unrestricted', costTier: 'performant' })).toBe('Unrestricted · Performant');
  });
});
