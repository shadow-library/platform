import { describe, expect, it } from 'bun:test';

import { briefContentHash, computeBibleDocHash, volumeContentHash } from '@server/common';

describe('volumeContentHash', () => {
  it('should hash only the contracted fields', () => {
    const base = volumeContentHash({ volumeKey: 'v1', ordinal: 1, title: 'Ascent' });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(volumeContentHash({ volumeKey: 'v1', ordinal: 1, title: 'Ascent', draftNotes: 'ignored', revision: 7 })).toBe(base);
    expect(volumeContentHash({ volumeKey: 'v1', ordinal: 1, title: 'Descent' })).not.toBe(base);
  });

  it('should treat an absent field and an explicit null identically', () => {
    expect(volumeContentHash({ volumeKey: 'v1' })).toBe(volumeContentHash({ volumeKey: 'v1', objective: null }));
  });
});

describe('chat-first plan fields in content hashes', () => {
  it('should hash a brief whose plan fields hold their defaults the same as one hashed before they existed', () => {
    const planDefaults = { direction: null, contentMode: null, scenes: null, claimedMilestones: null, isEnding: false };
    expect(briefContentHash({ chapter: 3, body: 'b', ...planDefaults })).toBe(briefContentHash({ chapter: 3, body: 'b' }));
  });

  it('should change a brief hash when any plan field leaves its default', () => {
    const base = briefContentHash({ chapter: 3, body: 'b' });
    const changed = [{ direction: 'd' }, { contentMode: 'unrestricted' }, { scenes: [] }, { claimedMilestones: ['m'] }, { isEnding: true }];
    for (const fields of changed) expect(briefContentHash({ chapter: 3, body: 'b', ...fields })).not.toBe(base);
  });

  it('should hash a volume not yet started the same as one hashed before volumes had a state', () => {
    expect(volumeContentHash({ volumeKey: 'v1', state: 'not_started' })).toBe(volumeContentHash({ volumeKey: 'v1' }));
    expect(volumeContentHash({ volumeKey: 'v1', state: 'active' })).not.toBe(volumeContentHash({ volumeKey: 'v1' }));
  });
});

describe('briefContentHash', () => {
  it('should hash only the contracted fields', () => {
    const base = briefContentHash({ chapter: 1, body: 'b' });
    expect(base).toBe(briefContentHash({ chapter: 1, body: 'b', updatedAt: new Date(0).toISOString() }));
    expect(base).not.toBe(briefContentHash({ chapter: 2, body: 'b' }));
  });

  it('should change when only the pov or the guidance changes', () => {
    const base = briefContentHash({ chapter: 1, body: 'b' });
    expect(briefContentHash({ chapter: 1, body: 'b', pov: 'hero' })).not.toBe(base);
    expect(briefContentHash({ chapter: 1, body: 'b', guidance: 'slow down' })).not.toBe(base);
  });
});

describe('computeBibleDocHash', () => {
  it('should treat null and undefined inputs identically', () => {
    expect(computeBibleDocHash(undefined, 'body')).toBe(computeBibleDocHash(null, 'body'));
  });

  // Frontmatter key order is deliberately significant here — stored hashes were computed without
  // canonicalization, so this pins the behaviour that keeps documents from spuriously re-versioning.
  it('should be sensitive to frontmatter key order', () => {
    const a = computeBibleDocHash({ title: 'Promise', status: 'draft' }, 'body');
    const b = computeBibleDocHash({ status: 'draft', title: 'Promise' }, 'body');
    expect(a).not.toBe(b);
  });
});
