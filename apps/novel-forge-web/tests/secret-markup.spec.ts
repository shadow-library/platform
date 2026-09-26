import { describe, expect, it } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { RungDetail, RungList } from '../src/features/story-bible/PowerLadder';
import { SecretCard } from '../src/features/story-bible/SecretCard';
import { SecretStates } from '../src/features/story-bible/SecretStates';
import { type FactResponse, type KnowledgeEntryResponse } from '../src/lib/apis/api-types.gen';
import { ladderRungs } from '../src/lib/power-ladder';
import { type UnlockLookup } from '../src/lib/secret-states';

const TRUTH = 'Hollis struck her name from the ledger';

const noop = (): void => undefined;

function fact(overrides: Partial<FactResponse> = {}): FactResponse {
  return {
    id: '1',
    projectId: 'p',
    factKey: 'why_tamsin_never_paid',
    text: TRUTH,
    subjects: ['lamp_ranks'],
    writerNote: 'Nobody has ever asked her to pay.',
    knowledge: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const known: KnowledgeEntryResponse = { entityKey: 'hollis', entityName: 'Hollis', learnedInChapter: 1, status: 'committed', source: 'manual', createdAt: '2026-09-01T00:00:00Z' };

const lookup: UnlockLookup = { milestones: new Map(), volumes: new Map(), nextChapter: 5, status: 'ready' };

function render(element: ReactElement): string {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, element));
}

function ladder(target: FactResponse): string {
  const [rung] = ladderRungs([target], lookup);
  if (!rung) throw new Error('expected one rung');
  return render(
    createElement(
      'div',
      null,
      createElement(RungList, { rungs: [rung], selected: rung, onSelect: noop }),
      createElement(RungDetail, { novelId: 'p', rung, lookup, onEditFact: noop }),
    ),
  );
}

describe('secret truth in markup', () => {
  it('should keep a locked secret’s truth out of the four-state pane and the card until shown', () => {
    expect(render(createElement(SecretStates, { novelId: 'p', fact: fact() }))).not.toContain(TRUTH);
    expect(render(createElement(SecretCard, { novelId: 'p', fact: fact(), onEdit: noop }))).not.toContain(TRUTH);
  });

  it('should keep a rung’s truth out of the ladder while it is locked, and while a character knows it but readers have not been shown it', () => {
    const lockedHtml = ladder(fact());
    expect(lockedHtml).not.toContain(TRUTH);
    expect(lockedHtml).toContain('Nobody has ever asked her to pay.');
    expect(ladder(fact({ knowledge: [known] }))).not.toContain(TRUTH);
  });

  it('should print a rung’s truth once a finalized chapter has shown it to readers', () => {
    expect(ladder(fact({ knowledge: [known], disclosedInChapter: 3 }))).toContain(TRUTH);
  });

  it('should keep a knower’s note behind Show truth too, since an author note can restate the secret', () => {
    const NOTE = 'knows Hollis paid her share';
    const noted = fact({ knowledge: [{ ...known, note: NOTE }] });
    expect(render(createElement(SecretStates, { novelId: 'p', fact: noted }))).not.toContain(NOTE);
    expect(render(createElement(SecretCard, { novelId: 'p', fact: noted, onEdit: noop }))).not.toContain(NOTE);
    expect(ladder(noted)).not.toContain(NOTE);
    expect(ladder({ ...noted, disclosedInChapter: 3 })).toContain(NOTE);
  });

  it('should mark unknown condition states while the lookups load', () => {
    const html = render(createElement(SecretStates, { novelId: 'p', fact: fact({ unlock: { all: [{ milestone: 'teaches_beacon' }] } }) }));
    expect(html).toContain('teaches_beacon · checking…');
  });
});
