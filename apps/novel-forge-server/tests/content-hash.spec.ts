import { describe, expect, it } from 'bun:test';

import { arcContentHash, briefContentHash, computeBibleDocHash, seedContentHash, volumeContentHash } from '@server/common';

describe('volumeContentHash', () => {
  it('should hash only the contracted fields', () => {
    const base = volumeContentHash({ volumeKey: 'v1', ordinal: 1, title: 'Ascent' });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(volumeContentHash({ volumeKey: 'v1', ordinal: 1, title: 'Ascent', draftNotes: 'ignored' })).toBe(base);
    expect(volumeContentHash({ volumeKey: 'v1', ordinal: 1, title: 'Descent' })).not.toBe(base);
  });

  it('should treat an absent field and an explicit null identically', () => {
    expect(volumeContentHash({ volumeKey: 'v1' })).toBe(volumeContentHash({ volumeKey: 'v1', objective: null }));
  });
});

describe('arcContentHash', () => {
  it('should hash only the contracted fields', () => {
    const base = arcContentHash({ arcKey: 'a1', volumeKey: 'v1', title: 'The Trial' });
    expect(base).toBe(arcContentHash({ arcKey: 'a1', volumeKey: 'v1', title: 'The Trial', revision: 7 }));
    expect(base).not.toBe(arcContentHash({ arcKey: 'a1', volumeKey: 'v1', title: 'The Retreat' }));
  });
});

describe('briefContentHash', () => {
  it('should hash only the contracted fields', () => {
    const base = briefContentHash({ chapter: 1, body: 'b' });
    expect(base).toBe(briefContentHash({ chapter: 1, body: 'b', updatedAt: new Date(0).toISOString() }));
    expect(base).not.toBe(briefContentHash({ chapter: 2, body: 'b' }));
  });
});

describe('seedContentHash', () => {
  it('should hash the fields sheet, treating null and undefined as empty', () => {
    const empty = seedContentHash({});
    expect(seedContentHash(null)).toBe(empty);
    expect(seedContentHash(undefined)).toBe(empty);
    expect(seedContentHash({ premise: 'a salvager' })).not.toBe(empty);
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
