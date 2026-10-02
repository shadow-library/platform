import { describe, expect, it } from 'bun:test';

import { renderNotebook, TURNED_DOWN_LIMIT } from '@modules/ai/context/novel-chat-context';
import { type ChangeOp, renderActionVocabulary, renderOpVocabulary, validateChangeSet } from '@modules/refinement/change-set';
import { dropRejectedIdeas } from '@modules/refinement/idea-filter';
import { ideaIdOf, ideaLabel, stampIdeaIds } from '@modules/refinement/idea-id';
import { type IdeaRejectionEntry, rejectionAnchor, type RejectionContext, rejectionInScope } from '@modules/refinement/idea-rejections';
import { type CardDisposition, type ChangeSetSplit, type DirectDisposition, type OpDisposition } from '@modules/refinement/write-policy';

const kael: ChangeOp = { op: 'entity.upsert', entityKey: 'kael', type: 'character', name: 'Kael', motivation: 'He wants the lamp for himself.' };
const kaelPage: ChangeOp = { op: 'fact.upsert', factKey: 'kael_betrayal', body: 'Kael sold the keeper out.', subjects: ['kael'] };
const mira: ChangeOp = { op: 'entity.upsert', entityKey: 'mira', type: 'character', status: 'thief', quote: 'Mira is a thief' };
const MISSING = { exists: false, revision: null, contentHash: null };

function split(ops: ChangeOp[], dispositions: (Omit<DirectDisposition, 'index'> | Omit<CardDisposition, 'index'>)[]): ChangeSetSplit {
  const indexed = dispositions.map((disposition, index) => ({ ...disposition, index }) as OpDisposition);
  const on = (side: 'direct' | 'card') => indexed.filter(d => d.side === side).map(d => ops[d.index] as ChangeOp);
  const sources = indexed.flatMap(d => (d.side === 'direct' ? [d.source] : []));
  return { ops, direct: on('direct'), cards: on('card'), sources, dispositions: indexed, held: 'none' };
}

function context(overrides: Partial<RejectionContext> = {}): RejectionContext {
  return { activeVolumeKey: 'volume_1', states: {}, ...overrides };
}

function rejection(scope: IdeaRejectionEntry['rejectionScope'], anchor: IdeaRejectionEntry['rejectionAnchor'] = null): IdeaRejectionEntry {
  return { ideaId: ideaIdOf(kael), rejectionScope: scope, rejectionAnchor: anchor };
}

describe('ideaIdOf', () => {
  it('should give the same idea the same id however it is spaced, cased or explained', () => {
    const again = { ...kael, motivation: '  he wants the LAMP   for himself. ', rationale: 'A rival raises the stakes.', quote: 'a rival' } as ChangeOp;

    expect(ideaIdOf(again)).toBe(ideaIdOf(kael));
    expect(ideaIdOf(kael)).toMatch(/^[0-9a-f]{24}$/);
  });

  it('should give a reworded idea or another record a different id', () => {
    expect(ideaIdOf({ ...kael, motivation: 'He wants the keeper dead.' } as ChangeOp)).not.toBe(ideaIdOf(kael));
    expect(ideaIdOf({ ...kael, entityKey: 'kael_2' } as ChangeOp)).not.toBe(ideaIdOf(kael));
  });

  it('should stamp every content op over whatever id it arrived with, and no action', () => {
    const [stamped, action] = stampIdeaIds([{ ...kael, ideaId: 'forged' } as ChangeOp, { op: 'action.audit_bible', ideaId: 'forged' } as ChangeOp]);

    expect(stamped?.ideaId).toBe(ideaIdOf(kael));
    expect(action).toEqual({ op: 'action.audit_bible' });
  });

  it('should accept a stamped id back on a hand edit but never show the model the field', () => {
    expect(validateChangeSet(stampIdeaIds([kael]))).toEqual([]);
    expect(renderOpVocabulary(['entity.upsert'], { quotes: true })).not.toContain('ideaId');
    expect(renderActionVocabulary(['action.audit_bible'])).not.toContain('ideaId');
  });

  it('should label a secret by its key alone, never by its truth', () => {
    expect(ideaLabel(kaelPage as never)).toBe('Secret kael_betrayal');
    expect(ideaLabel(kael as never)).toBe('Kael (character): He wants the lamp for himself.');
  });
});

describe('rejectionInScope', () => {
  it('should keep a never rejection through a volume change and an edit to the record', () => {
    const never = rejection('never');

    expect(rejectionInScope(never, context())).toBe(true);
    expect(rejectionInScope(never, context({ activeVolumeKey: 'volume_2', states: { 'entity:kael': { exists: true, revision: null, contentHash: 'edited' } } }))).toBe(true);
  });

  it('should let a not_now rejection lapse once another volume is active', () => {
    const notNow = rejection('not_now', rejectionAnchor('not_now', context(), []));

    expect(rejectionInScope(notNow, context())).toBe(true);
    expect(rejectionInScope(notNow, context({ activeVolumeKey: 'volume_2' }))).toBe(false);
    expect(rejectionInScope(notNow, context({ activeVolumeKey: null }))).toBe(false);
  });

  it('should let a not_this_version rejection lapse once a record it would change is written', () => {
    const before = context({ states: { 'entity:kael': MISSING } });
    const notThisVersion = rejection('not_this_version', rejectionAnchor('not_this_version', before, ['entity:kael']));

    expect(rejectionInScope(notThisVersion, before)).toBe(true);
    expect(rejectionInScope(notThisVersion, context({ activeVolumeKey: 'volume_2', states: { 'entity:kael': MISSING } }))).toBe(true);
    expect(rejectionInScope(notThisVersion, context({ states: { 'entity:kael': { exists: true, revision: null, contentHash: 'abc' } } }))).toBe(false);
  });
});

describe('dropRejectedIdeas', () => {
  it('should drop a re-proposed card whose idea the author turned down, keeping the rest', () => {
    const turn = split(
      [mira, kael],
      [
        { side: 'direct', source: 'quoted' },
        { side: 'card', reason: 'no_quote' },
      ],
    );

    const { split: filtered, dropped } = dropRejectedIdeas(turn, new Set([ideaIdOf(kael)]), new Map());

    expect(dropped).toEqual([ideaIdOf(kael)]);
    expect(filtered.ops).toEqual([mira]);
    expect(filtered.direct).toEqual([mira]);
    expect(filtered.cards).toEqual([]);
  });

  it('should leave a card alone when its idea is not turned down', () => {
    const turn = split([kael], [{ side: 'card', reason: 'no_quote' }]);

    expect(dropRejectedIdeas(turn, new Set([ideaIdOf(mira)]), new Map())).toEqual({ split: turn, dropped: [] });
  });

  it('should drop a card that only stands on a dropped one', () => {
    const turn = split(
      [kael, kaelPage],
      [
        { side: 'card', reason: 'no_quote' },
        { side: 'card', reason: 'always_card' },
      ],
    );

    const { split: filtered, dropped } = dropRejectedIdeas(turn, new Set([ideaIdOf(kael)]), new Map());

    expect(filtered.ops).toEqual([]);
    expect(dropped).toEqual([ideaIdOf(kael), ideaIdOf(kaelPage)]);
  });

  it('should keep a card when the record it needs already exists', () => {
    const turn = split(
      [kael, kaelPage],
      [
        { side: 'card', reason: 'no_quote' },
        { side: 'card', reason: 'always_card' },
      ],
    );

    const { split: filtered } = dropRejectedIdeas(turn, new Set([ideaIdOf(kael)]), new Map([['entity:kael', {}]]));

    expect(filtered.ops).toEqual([kaelPage]);
    expect(filtered.dispositions).toEqual([{ index: 0, side: 'card', reason: 'always_card' }]);
  });

  it('should never drop what the author said this turn, nor a turned-down card it leans on', () => {
    const quotedPage = { ...kaelPage, quote: 'Kael sold the keeper out' } as ChangeOp;
    const turn = split(
      [kael, quotedPage, { ...kael, entityKey: 'kael_2' } as ChangeOp],
      [
        { side: 'card', reason: 'no_quote' },
        { side: 'card', reason: 'just_discussing' },
        { side: 'card', reason: 'manual_mode' },
      ],
    );

    const { split: filtered, dropped } = dropRejectedIdeas(turn, new Set(turn.ops.map(ideaIdOf)), new Map());

    expect(dropped).toEqual([]);
    expect(filtered).toBe(turn);
  });

  it('should drop a turned-down idea Edit freely would apply, with what leans on it, but never a quoted op', () => {
    const turn = split(
      [mira, kael, kaelPage],
      [
        { side: 'direct', source: 'quoted' },
        { side: 'direct', source: 'idea' },
        { side: 'direct', source: 'idea' },
      ],
    );

    const { split: filtered, dropped } = dropRejectedIdeas(turn, new Set([ideaIdOf(kael), ideaIdOf(mira)]), new Map());

    expect(dropped).toEqual([ideaIdOf(kael), ideaIdOf(kaelPage)]);
    expect(filtered.direct).toEqual([mira]);
    expect(filtered.sources).toEqual(['quoted']);
  });
});

describe('renderNotebook turned-down suggestions', () => {
  function turnedDown(index: number, scope: 'never' | 'not_now' = 'never') {
    const statement = `Kael ${index} (character): ${'a rival who wants the lamp for himself '.repeat(10)}`;
    return {
      kind: 'rejected',
      topic: `idea.${index}`,
      statement,
      why: 'The keeper already has a rival.',
      rejectedAlternatives: [],
      writerLine: null,
      decidedBy: 'author',
      ideaId: `${index}`,
      rejectionScope: scope,
    };
  }

  it('should list only the most recent, each cut short and without the reason', () => {
    const entries = Array.from({ length: TURNED_DOWN_LIMIT + 5 }, (_, index) => turnedDown(index, index % 2 ? 'not_now' : 'never'));

    const notebook = renderNotebook(entries as never);
    const lines = notebook.split('\n').filter(line => line.startsWith('- Kael'));

    expect(lines).toHaveLength(TURNED_DOWN_LIMIT);
    expect(notebook).toContain(`(the ${TURNED_DOWN_LIMIT} most recent of ${TURNED_DOWN_LIMIT + 5})`);
    expect(notebook).not.toContain('- Kael 4 ');
    expect(notebook).toContain('- Kael 14 ');
    expect(notebook).toContain('(not during this volume)');
    expect(notebook).not.toContain('The keeper already has a rival.');
    expect(notebook).not.toContain('### Do not propose');
    for (const line of lines) expect(line.length).toBeLessThan(200);
  });

  it('should keep a rejection recorded by hand in the do-not-propose list with its reason', () => {
    const notebook = renderNotebook([{ ...turnedDown(1), ideaId: null, rejectionScope: null, statement: 'No chosen one.' }] as never);

    expect(notebook).toContain("### Do not propose\n- No chosen one. (the author's reason: The keeper already has a rival.)");
  });
});
