import { describe, expect, it } from 'bun:test';

import { type IllustrationReferenceResponse, type ReferenceOptionsResponse, type ReferenceWarningResponse } from '../src/lib/apis/api-types.gen';
import {
  addDraftReference,
  buildAttachPayload,
  collectReferenceMeta,
  defaultRole,
  describeReferenceWarning,
  type DraftReference,
  editSourceKeys,
  planRefineSlots,
  planStartSlots,
  referenceErrorMessage,
  sameAttachedSet,
  settledStartOptions,
  visibleRoundWarnings,
} from '../src/lib/illustration-references';

const portrait = (entityKey: string, name: string, reason = 'auto:entity-portrait'): IllustrationReferenceResponse => ({
  source: 'portrait',
  sourceId: entityKey,
  ref: `entities/${entityKey}.png`,
  role: 'likeness',
  origin: 'auto',
  reason,
  label: `portrait of ${name}`,
  name,
  url: `https://cdn.test/${entityKey}.png`,
});

const draft = (overrides: Partial<DraftReference> = {}): DraftReference => ({ source: 'gallery', sourceId: '7', role: 'likeness', note: '', ...overrides });

const options: ReferenceOptionsResponse = {
  capacity: 1,
  cover: { source: 'cover', label: 'the project cover', url: 'https://cdn.test/cover.png' },
  portraits: [{ source: 'portrait', sourceId: 'alistair', label: 'portrait of Alistair', url: 'https://cdn.test/alistair.png', entityKey: 'alistair' }],
  gallery: [],
  chapterImages: [{ source: 'chapter-image', sourceId: '12', label: 'chapter 3 scene image', url: 'https://cdn.test/c3.png', chapter: 3 }],
  candidates: [],
  truncated: false,
  autoPreview: [],
  autoPreviewWarnings: [],
};

const startMeta = collectReferenceMeta(options);

describe('planStartSlots', () => {
  it('should send the auto portrait when nothing is attached', () => {
    const plan = planStartSlots(1, [], true, [portrait('alistair', 'Alistair')], startMeta);

    expect(plan).toMatchObject({ capacity: 1, attachedCount: 0, used: 1, overBy: 0, droppedAuto: [] });
    expect(plan.sentAuto.map(reference => reference.sourceId)).toEqual(['alistair']);
  });

  it('should drop auto suggestions when attached references take the free slots', () => {
    const plan = planStartSlots(1, [draft()], true, [portrait('alistair', 'Alistair')], startMeta);

    expect(plan).toMatchObject({ attachedCount: 1, used: 1, overBy: 0, sentAuto: [] });
    expect(plan.droppedAuto.map(reference => reference.sourceId)).toEqual(['alistair']);
  });

  it('should not count an attached copy of an auto suggestion twice', () => {
    const plan = planStartSlots(1, [draft({ source: 'portrait', sourceId: 'alistair' })], true, [portrait('alistair', 'Alistair')], startMeta);

    expect(plan).toMatchObject({ attachedCount: 1, used: 1, overBy: 0, sentAuto: [], droppedAuto: [] });
  });

  it('should count one image attached through two sources once', () => {
    const shared = collectReferenceMeta({
      ...options,
      candidates: [{ source: 'candidate', sourceId: '5', label: 'a selected illustration of Alistair', url: 'https://cdn.test/alistair.png', subjectType: 'entity' }],
    });
    const drafts = [draft({ source: 'portrait', sourceId: 'alistair' }), draft({ source: 'candidate', sourceId: '5' })];

    expect(planStartSlots(1, drafts, true, [portrait('alistair', 'Alistair')], shared)).toMatchObject({ attachedCount: 1, used: 1, overBy: 0, sentAuto: [], droppedAuto: [] });
  });

  it('should report how many attached references exceed capacity', () => {
    const plan = planStartSlots(1, [draft(), draft({ source: 'cover', sourceId: undefined })], false, [], startMeta);

    expect(plan).toMatchObject({ attachedCount: 2, used: 1, overBy: 1 });
  });

  it('should ignore the auto preview when automatic references are off', () => {
    const plan = planStartSlots(3, [], false, [portrait('alistair', 'Alistair')], startMeta);

    expect(plan).toMatchObject({ used: 0, sentAuto: [], droppedAuto: [] });
  });

  it('should fill remaining slots with auto suggestions in send order on a larger model', () => {
    const plan = planStartSlots(
      3,
      [draft()],
      true,
      [portrait('a', 'A', 'auto:chapter-cast'), portrait('b', 'B', 'auto:chapter-cast'), portrait('c', 'C', 'auto:chapter-cast')],
      startMeta,
    );

    expect(plan.sentAuto.map(reference => reference.sourceId)).toEqual(['a', 'b']);
    expect(plan.droppedAuto.map(reference => reference.sourceId)).toEqual(['c']);
    expect(plan.used).toBe(3);
  });
});

describe('planRefineSlots', () => {
  const editSourceUrl = 'https://cdn.test/candidate-9.png';

  it('should leave no free slot beside the edit source on a single-reference model', () => {
    const plan = planRefineSlots({ capacity: 1, editSourceUrl, drafts: [], stored: [], meta: startMeta });

    expect(plan).toMatchObject({ freeSlots: 0, newCount: 0, canAdd: false, overBy: 0 });
  });

  it('should refuse newly attached references that do not fit beside the edit source', () => {
    const plan = planRefineSlots({ capacity: 1, editSourceUrl, drafts: [draft()], stored: [], meta: startMeta });

    expect(plan).toMatchObject({ newCount: 1, canAdd: false, overBy: 1 });
  });

  it('should carry stored references without blocking and mark them unsent when out of slots', () => {
    const stored = [{ source: 'gallery' as const, sourceId: '7', role: 'likeness' as const }];
    const plan = planRefineSlots({ capacity: 1, editSourceUrl, drafts: [draft()], stored, meta: startMeta });

    expect(plan).toMatchObject({ newCount: 0, overBy: 0, canAdd: false });
    expect([...plan.unsentKeys]).toEqual(['gallery:7']);
  });

  it('should give every slot to references when there is no image to edit yet', () => {
    const plan = planRefineSlots({ capacity: 1, drafts: [], stored: [], meta: startMeta });

    expect(plan).toMatchObject({ freeSlots: 1, canAdd: true });
  });

  it('should send new references ahead of carried ones on a larger model', () => {
    const stored = [{ source: 'cover' as const, role: 'style' as const }];
    const plan = planRefineSlots({ capacity: 2, editSourceUrl, drafts: [draft({ source: 'cover', sourceId: undefined, role: 'style' }), draft()], stored, meta: startMeta });

    expect(plan).toMatchObject({ freeSlots: 1, newCount: 1, canAdd: false, overBy: 0 });
    expect([...plan.unsentKeys]).toEqual(['cover:']);
  });

  it('should count one new image attached through two sources once', () => {
    const shared = collectReferenceMeta({
      ...options,
      candidates: [{ source: 'candidate', sourceId: '5', label: 'a selected illustration of Alistair', url: 'https://cdn.test/alistair.png', subjectType: 'entity' }],
    });
    const drafts = [draft({ source: 'portrait', sourceId: 'alistair' }), draft({ source: 'candidate', sourceId: '5' })];
    const plan = planRefineSlots({ capacity: 2, editSourceUrl, drafts, stored: [], meta: shared });

    expect(plan).toMatchObject({ freeSlots: 1, newCount: 1, canAdd: false, overBy: 0 });
    expect(plan.unsentKeys.size).toBe(0);
  });

  it('should not count an attachment of the image being edited against the free slots', () => {
    const meta = collectReferenceMeta({ ...options, chapterImages: [{ source: 'chapter-image', sourceId: '12', label: 'chapter 3 scene image', url: editSourceUrl, chapter: 3 }] });
    const plan = planRefineSlots({ capacity: 1, editSourceUrl, drafts: [draft({ source: 'chapter-image', sourceId: '12' })], stored: [], meta });

    expect(plan).toMatchObject({ newCount: 0, overBy: 0 });
  });
});

describe('settledStartOptions', () => {
  const withAuto: ReferenceOptionsResponse = {
    ...options,
    capacity: 2,
    autoPreview: [portrait('alistair', 'Alistair')],
    autoPreviewWarnings: [{ code: 'capacity-trimmed', source: 'portrait', sourceId: 'b', reason: 'no slot' }],
  };

  it('should keep capacity but drop the previous subject auto preview while placeholder data is shown', () => {
    const settled = settledStartOptions(withAuto, true);

    expect(settled).toMatchObject({ capacity: 2, autoPreview: [], autoPreviewWarnings: [] });
    expect(planStartSlots(settled!.capacity, [draft(), draft({ sourceId: '8' }), draft({ sourceId: '9' })], true, settled!.autoPreview, startMeta)).toMatchObject({
      overBy: 1,
      sentAuto: [],
    });
  });

  it('should pass fresh options through unchanged', () => {
    expect(settledStartOptions(withAuto, false)).toBe(withAuto);
    expect(settledStartOptions(undefined, true)).toBeUndefined();
  });
});

describe('editSourceKeys', () => {
  it('should flag attached references that resolve to the image being edited', () => {
    const meta = collectReferenceMeta({ ...options, chapterImages: [{ source: 'chapter-image', sourceId: '12', label: 'scene', url: 'https://cdn.test/edit.png', chapter: 3 }] });
    const drafts = [draft({ source: 'chapter-image', sourceId: '12' }), draft()];

    expect([...editSourceKeys(drafts, meta, 'https://cdn.test/edit.png')]).toEqual(['chapter-image:12']);
    expect(editSourceKeys(drafts, meta, undefined).size).toBe(0);
  });
});

describe('visibleRoundWarnings', () => {
  const trimmedAuto: ReferenceWarningResponse = { code: 'capacity-trimmed', source: 'portrait', sourceId: 'alistair', reason: 'no slot' };
  const trimmedAttached: ReferenceWarningResponse = { code: 'capacity-trimmed', source: 'gallery', sourceId: '7', reason: 'no slot' };
  const missing: ReferenceWarningResponse = { code: 'missing-file', source: 'portrait', sourceId: 'alistair', reason: 'gone' };
  const stored = [{ source: 'gallery' as const, sourceId: '7', role: 'likeness' as const }];

  it('should hide auto capacity trims on refine and save when the edited image fills the only slot', () => {
    expect(visibleRoundWarnings([trimmedAuto, trimmedAttached, missing], 'refine', true, stored)).toEqual([trimmedAttached, missing]);
    expect(visibleRoundWarnings([trimmedAuto], 'save', true, stored)).toEqual([]);
  });

  it('should keep every warning after a start or when a slot is free', () => {
    expect(visibleRoundWarnings([trimmedAuto], 'start', true, stored)).toEqual([trimmedAuto]);
    expect(visibleRoundWarnings([trimmedAuto], 'refine', false, stored)).toEqual([trimmedAuto]);
  });
});

describe('buildAttachPayload', () => {
  it('should dedupe by source and source id, keeping the first entry', () => {
    const payload = buildAttachPayload([draft({ role: 'style' }), draft({ role: 'likeness' }), draft({ sourceId: '8' })]);

    expect(payload).toEqual([
      { source: 'gallery', sourceId: '7', role: 'style' },
      { source: 'gallery', sourceId: '8', role: 'likeness' },
    ]);
  });

  it('should trim notes, drop blank ones and cap them at 300 characters', () => {
    const payload = buildAttachPayload([draft({ note: '  the scar only  ' }), draft({ sourceId: '8', note: '   ' }), draft({ sourceId: '9', note: 'x'.repeat(320) })]);

    expect(payload[0]?.note).toBe('the scar only');
    expect(payload[1]).not.toHaveProperty('note');
    expect(payload[2]?.note).toHaveLength(300);
  });

  it('should omit the source id for the project cover', () => {
    expect(buildAttachPayload([draft({ source: 'cover', sourceId: undefined, role: 'style' })])).toEqual([{ source: 'cover', role: 'style' }]);
  });

  it('should treat whitespace-only note edits as an unchanged attached set', () => {
    expect(sameAttachedSet([draft({ note: ' hood ' })], [{ source: 'gallery', sourceId: '7', role: 'likeness', note: 'hood' }])).toBe(true);
    expect(sameAttachedSet([draft({ role: 'style' })], [{ source: 'gallery', sourceId: '7', role: 'likeness' }])).toBe(false);
  });
});

describe('defaultRole', () => {
  it('should default to style for everything attached to a cover', () => {
    expect(defaultRole('cover', { source: 'portrait' })).toBe('style');
  });

  it('should default to likeness for figure images and style for scenes on an entity or chapter', () => {
    expect(defaultRole('entity', { source: 'portrait' })).toBe('likeness');
    expect(defaultRole('entity', { source: 'cover' })).toBe('likeness');
    expect(defaultRole('chapter', { source: 'chapter-image' })).toBe('style');
    expect(defaultRole('entity', { source: 'candidate', subjectType: 'entity' })).toBe('likeness');
    expect(defaultRole('entity', { source: 'candidate', subjectType: 'chapter' })).toBe('style');
  });

  it('should add a picked option once with its default role', () => {
    const once = addDraftReference([], options.portraits[0]!, 'entity');

    expect(once).toEqual([{ source: 'portrait', sourceId: 'alistair', role: 'likeness', note: '' }]);
    expect(addDraftReference(once, options.portraits[0]!, 'entity')).toBe(once);
  });
});

describe('describeReferenceWarning', () => {
  const meta = collectReferenceMeta(options);
  const warning = (overrides: Partial<ReferenceWarningResponse>): ReferenceWarningResponse => ({
    code: 'capacity-trimmed',
    source: 'portrait',
    sourceId: 'alistair',
    reason: 'the image model accepts at most 1 reference image(s)',
    ...overrides,
  });

  it('should name the trimmed image and the missing slot', () => {
    expect(describeReferenceWarning(warning({}), meta)).toBe('Portrait of Alistair not sent: no free reference slot');
  });

  it('should mention a dropped note when an attachment merges with the edit source', () => {
    const merged = warning({
      code: 'merged-with-edit-source',
      source: 'chapter-image',
      sourceId: '12',
      reason: 'this is the image being refined, so it is sent once as the edit source and its note was not applied',
    });

    expect(describeReferenceWarning(merged, meta)).toBe('Chapter 3 scene image is the image being edited, so it is sent once as the edit source, and its note was not used');
  });

  it('should explain skipped files and fall back to a generic label for unknown images', () => {
    expect(describeReferenceWarning(warning({ code: 'missing-file', source: 'gallery', sourceId: '99' }), meta)).toBe('A gallery image skipped: the image no longer exists');
    expect(describeReferenceWarning(warning({ code: 'too-large', source: 'cover', sourceId: undefined }), meta)).toBe(
      'The project cover skipped: the file is too large to send as a reference',
    );
    expect(describeReferenceWarning(warning({ code: 'unsupported-format', sourceId: 'nobody' }), meta)).toBe(
      'Portrait of nobody skipped: only PNG, JPEG and WebP images can be sent',
    );
  });
});

describe('referenceErrorMessage', () => {
  it('should turn an over-capacity refusal into a count of references to remove', () => {
    const message = referenceErrorMessage({ code: 'ILL_011', message: 'The image model accepts at most 1 reference image(s), but 3 were requested' });

    expect(message).toBe('The image model accepts 1 reference image per generation, but 3 were requested. Remove 2 to continue.');
  });

  it('should read the model limit from the router refusal despite digits in the model name', () => {
    const message = referenceErrorMessage({ code: 'AI_010', message: 'Model openai/gpt-5.4-image-2 accepts at most 2 reference image(s), but 3 were supplied' });

    expect(message).toBe('The image model accepts 2 reference images per generation, but 3 were requested. Remove 1 to continue.');
  });

  it('should express byte limits in megabytes', () => {
    expect(referenceErrorMessage({ code: 'ILL_012', message: 'Reference image for gallery is 5000000 bytes, over the 4194304 byte limit' })).toBe(
      'A reference image is over 4 MB. Pick a smaller image.',
    );
    expect(referenceErrorMessage({ code: 'ILL_013', message: 'Reference images total 9000000 bytes, over the 8388608 byte request limit' })).toBe(
      'The reference images together are over 8 MB. Remove one or pick smaller images.',
    );
  });

  it('should give a friendly message for every reference error code', () => {
    for (const code of ['ILL_009', 'ILL_010', 'ILL_014', 'ILL_015']) {
      const message = referenceErrorMessage({ code, message: 'raw server text' });
      expect(message).not.toBe('raw server text');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('should fall back to the server message for unrelated errors', () => {
    expect(referenceErrorMessage({ code: 'ILL_002', message: 'Illustration is not active' })).toBe('Illustration is not active');
  });
});
