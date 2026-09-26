import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AuditFindingCard, type AuditFindingCardProps } from '../src/features/story-bible/AuditFindingCard';
import { type AuditFindingDecision, type BibleAuditFindingResponse } from '../src/lib/apis/api-types.gen';

const noop = (): void => undefined;

function card(finding: Partial<BibleAuditFindingResponse> & Pick<BibleAuditFindingResponse, 'id' | 'group'>, overrides: Partial<AuditFindingCardProps> = {}): string {
  const full: BibleAuditFindingResponse = { ref: 'entity:hollis_vane', text: 'His age contradicts chapter 2.', evidence: [], opIndexes: [0], ...finding };
  const decision: AuditFindingDecision = overrides.decision ?? 'kept';
  const props: AuditFindingCardProps = {
    finding: full,
    index: 0,
    humanRef: 'Hollis Vane',
    names: new Map(),
    docTitles: new Map(),
    decision,
    reason: '',
    readOnly: false,
    busy: false,
    onDecisionChange: noop,
    onReasonChange: noop,
    onReasonCommit: noop,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(AuditFindingCard, props));
}

describe('AuditFindingCard', () => {
  it('should show the human ref, the text and Keep/Skip when the card carries a change', () => {
    const html = card({ id: 'c1', group: 'contradiction' });
    expect(html).toContain('Hollis Vane');
    expect(html).toContain('His age contradicts chapter 2.');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('Keep');
    expect(html).toContain('Skip');
    expect(html).not.toContain('Flagged only');
  });

  it('should default an undecided finding to kept', () => {
    const html = card({ id: 'c1', group: 'add' });
    expect(html).toMatch(/aria-checked="true"[^>]*>\s*Keep/);
  });

  it('should show a chosen skip and its reason field', () => {
    const html = card({ id: 'c1', group: 'add' }, { decision: 'skipped', reason: 'already covered' });
    expect(html).toMatch(/aria-checked="true"[^>]*>\s*Skip/);
    expect(html).toContain('already covered');
    expect(html).toContain('Why skip it? (optional)');
  });

  it('should show evidence quotes and refs, falling back to the raw address when nothing resolves it', () => {
    const html = card({ id: 'c1', group: 'revise', evidence: [{ ref: 'entity:tamsin_rook', quote: 'still in the lamp room' }] });
    expect(html).toContain('entity:tamsin_rook');
    expect(html).toContain('still in the lamp room');
  });

  it('should humanize an evidence ref the same way as the finding’s own ref', () => {
    const html = card(
      { id: 'c1', group: 'revise', evidence: [{ ref: 'entity:tamsin_rook', quote: 'still in the lamp room' }] },
      { names: new Map([['tamsin_rook', 'Tamsin Rook']]) },
    );
    expect(html).toContain('Tamsin Rook');
    expect(html).not.toContain('entity:tamsin_rook');
  });

  it('should mark a finding the card carries nothing for as flagged only, with no Keep/Skip', () => {
    const html = card({ id: 'c1', group: 'contradiction', opIndexes: [] });
    expect(html).toContain('Flagged only');
    expect(html).not.toContain('role="radiogroup"');
  });

  it('should show why a change was withheld', () => {
    const html = card({ id: 'c1', group: 'add', opIndexes: [], withheld: 'the page already has an owner' });
    expect(html).toContain('Not staged: the page already has an owner');
  });

  it('should disable the controls while a decision is saving', () => {
    const html = card({ id: 'c1', group: 'add' }, { busy: true });
    expect(html).toMatch(/role="radio"[^>]*disabled/);
  });

  it('should read out as settled once the card is no longer pending: a status chip, and Keep/Skip shown but disabled', () => {
    const html = card({ id: 'c1', group: 'add' }, { readOnly: true, decision: 'skipped', reason: 'not needed' });
    expect(html).toContain('Skipped');
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/role="radio"[^>]*disabled/);
    expect(html).toContain('not needed');
  });

  it('should give two findings that resolve to the same human ref distinct control labels', () => {
    const first = card({ id: 'c1', group: 'add' }, { index: 0 });
    const second = card({ id: 'c2', group: 'add' }, { index: 1 });
    expect(first).toContain('Keep or skip: Hollis Vane (Add 1)');
    expect(second).toContain('Keep or skip: Hollis Vane (Add 2)');
  });
});
