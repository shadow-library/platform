import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ChecksPanel, type ChecksPanelProps, FindingCard } from '../src/features/chapter-workspace/ChecksPanel';
import { type ChapterReviewRecordResponse, type ReviewFindingResponse } from '../src/lib/apis/api-types.gen';
import { ApiError } from '../src/lib/apis/transport';
import { type FindingFormAction } from '../src/lib/chapter-checks';

const BLOCKING: ReviewFindingResponse = {
  id: 'pov',
  severity: 'blocking',
  category: 'continuity',
  text: 'Scene 3 reports what Hollis is thinking.',
  evidence: 'Hollis wondered if she already knew',
};
const WARNING: ReviewFindingResponse = { id: 'lid', severity: 'warning', category: 'editorial', text: 'The lid comes up three times.' };

function review(overrides: Partial<ChapterReviewRecordResponse> = {}): ChapterReviewRecordResponse {
  return {
    id: 'r1',
    chapter: 4,
    kind: 'judge',
    disposition: 'blocking',
    draftRevision: 2,
    stale: false,
    isolated: false,
    findings: [BLOCKING, WARNING],
    openFindings: 2,
    openBlocking: 1,
    checked: ['continuity with the Story Bible', 'the chapter plan'],
    model: 'Claude Sonnet 5',
    costTier: 'balanced',
    createdAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}

const noop = (): void => undefined;

function panel(overrides: Partial<ChecksPanelProps> = {}): string {
  const props: ChecksPanelProps = {
    list: { chapter: 4, currentRevision: 2, latest: [review()], history: [review()] },
    loading: false,
    onRetry: noop,
    kind: 'judge',
    onKindChange: noop,
    jobs: { active: {}, failed: {}, activeIds: [] },
    onRun: noop,
    onFormChange: noop,
    onRemedy: noop,
    onClearRemedy: noop,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(ChecksPanel, props));
}

function card(finding: ReviewFindingResponse, answerable = true, form?: FindingFormAction): string {
  return renderToStaticMarkup(createElement(FindingCard, { finding, answerable, busy: false, form, onFormChange: noop, onRemedy: noop, onClear: noop }));
}

describe('ChecksPanel', () => {
  it('should show a loading state before the reviews arrive', () => {
    expect(panel({ list: undefined, loading: true })).toContain('Loading the checks');
  });

  it('should show an error with a way to try again', () => {
    const html = panel({ list: undefined, error: new ApiError(500, { code: 'X', type: 'SERVER_ERROR', message: 'Backend down' }) });
    expect(html).toContain('Couldn’t load the checks');
    expect(html).toContain('Backend down');
    expect(html).toContain('Try again');
  });

  it('should list every kind as a keyboard tab with the selected one reachable', () => {
    const html = panel();
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain('aria-selected="true" aria-controls=');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('Editor’s read');
    expect(html).toContain('Not run yet');
  });

  it('should explain a kind that has never run and offer to run it', () => {
    const html = panel({ kind: 'mechanics' });
    expect(html).toContain('No mechanics check yet');
    expect(html).toContain('Run the mechanics check');
    expect(html).not.toContain('Cost tier for this review');
  });

  it('should say reviews work on hand-written chapters too', () => {
    expect(panel()).toContain('Works on chapters you wrote yourself too');
  });

  it('should offer a cost tier only for the model reviews', () => {
    expect(panel({ kind: 'editorial' })).toContain('Cost tier for this review');
  });

  it('should group findings by severity with their evidence', () => {
    const html = panel();
    expect(html).toContain('Findings · 2 open');
    expect(html).toContain('Blocking · 1');
    expect(html).toContain('Warnings · 1');
    expect(html).toContain('Hollis wondered if she already knew');
    expect(html).toContain('read by Claude Sonnet 5 · Balanced');
  });

  it('should say no issue was detected, for which version, and what was checked', () => {
    const clean = review({ disposition: 'clear', findings: [], openFindings: 0, openBlocking: 0 });
    const html = panel({ list: { chapter: 4, currentRevision: 2, latest: [clean], history: [clean] } });
    expect(html).toContain('No issue detected · version 2');
    expect(html).toContain('✓ the chapter plan');
    expect(html).toContain('not that nothing is there');
  });

  it('should say honestly when a review assessed nothing', () => {
    const failed = review({ disposition: 'failed', findings: [], openFindings: 0, openBlocking: 0, checked: [] });
    const html = panel({ list: { chapter: 4, currentRevision: 2, latest: [failed], history: [failed] } });
    expect(html).toContain('Not assessed');
    expect(html).not.toContain('No issue detected');
  });

  it('should mark a stale review, offer the current version and withdraw its remedies', () => {
    const stale = review({ stale: true });
    const html = panel({ list: { chapter: 4, currentRevision: 3, latest: [stale], history: [stale] } });
    expect(html).toContain('This review is for version 2. This is version 3.');
    expect(html).toContain('Review version 3');
    expect(html).not.toContain('I’ll fix it myself');
  });

  it('should show a queued review in place of the run button', () => {
    const html = panel({ jobs: { active: { judge: 'queued' }, failed: {}, activeIds: ['j1'] } });
    expect(html).toContain('AI review queued');
    expect(html).not.toContain('Run a new review');
  });

  it('should say why no review can start', () => {
    const html = panel({ runBlockedReason: 'There’s no text to review yet.' });
    expect(html).toContain('There’s no text to review yet.');
    expect(html).not.toContain('Run a new review');
  });

  it('should report a review job that failed', () => {
    expect(panel({ jobs: { active: {}, failed: { judge: 'The model timed out' }, activeIds: [] } })).toContain('The model timed out');
  });

  it('should offer the held-chapter actions under a judge review that blocks', () => {
    expect(panel({ heldActions: createElement('span', null, 'Repair with AI') })).toContain('Repair with AI');
    const released = review({ findings: [{ ...BLOCKING, remedy: { action: 'overridden', updatedAt: '2026-09-26T10:30:00.000Z' } }, WARNING], openBlocking: 0, openFindings: 1 });
    expect(panel({ list: { chapter: 4, currentRevision: 2, latest: [released], history: [released] }, heldActions: createElement('span', null, 'Repair with AI') })).not.toContain(
      'Repair with AI',
    );
  });
});

describe('FindingCard', () => {
  it('should offer override only on a blocking finding', () => {
    expect(card(BLOCKING)).toContain('Override…');
    expect(card(WARNING)).not.toContain('Override…');
    expect(card(WARNING)).toContain('Dismiss…');
    expect(card(WARNING)).toContain('I’ll fix it myself');
  });

  it('should show an answered finding with its reason and an inline undo', () => {
    const html = card({ ...WARNING, remedy: { action: 'dismissed', reason: 'deliberate', updatedAt: '2026-09-26T10:00:00.000Z' } });
    expect(html).toMatch(/Dismissed: deliberate — won’t be raised again for this text · <button[^>]*>Undo<\/button>/);
    expect(html).not.toContain('Dismiss…');
  });

  it('should ask for a reason in the open form, and only require one to dismiss', () => {
    const dismissing = card(WARNING, true, 'dismissed');
    expect(dismissing).toContain('Why dismiss this finding?');
    expect(dismissing).toMatch(/<button type="submit"[^>]*disabled/);
    expect(dismissing).not.toContain('I’ll fix it myself');
    expect(card(BLOCKING, true, 'overridden')).not.toMatch(/<button type="submit"[^>]*disabled/);
  });

  it('should not offer undo on a review of an older text', () => {
    expect(card({ ...WARNING, remedy: { action: 'fixing_myself', updatedAt: '2026-09-26T10:00:00.000Z' } }, false)).not.toContain('Undo');
  });
});
