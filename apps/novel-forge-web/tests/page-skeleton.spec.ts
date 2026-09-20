import { describe, expect, it } from 'bun:test';

import { resolveSkeletonVariant } from '../src/lib/page-skeleton';

describe('resolveSkeletonVariant', () => {
  it('should resolve the project overview route to the overview variant', () => {
    expect(resolveSkeletonVariant('/novels/abc123/overview')).toBe('overview');
  });

  it('should resolve chapters, volumes and the source pipeline to the rows variant', () => {
    expect(resolveSkeletonVariant('/novels/abc123/chapters')).toBe('rows');
    expect(resolveSkeletonVariant('/novels/abc123/volumes')).toBe('rows');
    expect(resolveSkeletonVariant('/novels/abc123/source')).toBe('rows');
  });

  it('should resolve the refinement chat and idea studio routes to the chat variant', () => {
    expect(resolveSkeletonVariant('/novels/abc123/chat')).toBe('chat');
    expect(resolveSkeletonVariant('/ideas/seed-1')).toBe('chat');
  });

  it('should resolve a migrated collection route to the card-grid variant rather than a rail it no longer renders', () => {
    expect(resolveSkeletonVariant('/novels/abc123/story-bible')).toBe('list');
  });

  it('should resolve the migrated illustrations gallery to the card-grid variant rather than a rail it no longer renders', () => {
    expect(resolveSkeletonVariant('/novels/abc123/illustrations')).toBe('list');
  });

  it('should resolve the migrated canon facts directory to the rows variant rather than a rail it no longer renders', () => {
    expect(resolveSkeletonVariant('/novels/abc123/canon-facts')).toBe('rows');
  });

  it('should resolve the migrated review queue to the rows variant rather than a rail it no longer renders', () => {
    expect(resolveSkeletonVariant('/novels/abc123/review')).toBe('rows');
  });

  it('should resolve rail-and-detail workspace routes to the split variant', () => {
    for (const segment of ['proposals', 'runs']) {
      expect(resolveSkeletonVariant(`/novels/abc123/${segment}`)).toBe('split');
    }
  });

  it('should resolve form-shaped project routes to the form variant', () => {
    expect(resolveSkeletonVariant('/novels/abc123/publish')).toBe('form');
    expect(resolveSkeletonVariant('/novels/abc123/settings')).toBe('form');
    expect(resolveSkeletonVariant('/novels/abc123/import-plan')).toBe('form');
  });

  it('should resolve the source-project pipeline dashboards to the form variant', () => {
    expect(resolveSkeletonVariant('/novels/abc123/rebrand')).toBe('form');
    expect(resolveSkeletonVariant('/novels/abc123/reforge')).toBe('form');
    expect(resolveSkeletonVariant('/novels/abc123/transform')).toBe('form');
  });

  it('should resolve the translation dashboard to the form variant', () => {
    expect(resolveSkeletonVariant('/novels/abc123/translation')).toBe('form');
  });

  it('should resolve top-level account settings and import routes to the form variant', () => {
    expect(resolveSkeletonVariant('/settings')).toBe('form');
    expect(resolveSkeletonVariant('/import')).toBe('form');
  });

  it('should resolve the dashboard and ideas shelf to the list variant', () => {
    expect(resolveSkeletonVariant('/')).toBe('list');
    expect(resolveSkeletonVariant('/ideas')).toBe('list');
  });

  it('should fall back to the default variant for an unmapped route', () => {
    expect(resolveSkeletonVariant('/login')).toBe('default');
  });

  it('should not confuse a novel id that happens to be named "settings" or "chapters" for the top-level route', () => {
    expect(resolveSkeletonVariant('/novels/settings/overview')).toBe('overview');
    expect(resolveSkeletonVariant('/novels/chapters/chapters')).toBe('rows');
  });

  it('should ignore a trailing slash', () => {
    expect(resolveSkeletonVariant('/novels/abc123/chapters/')).toBe('rows');
    expect(resolveSkeletonVariant('/ideas/')).toBe('list');
  });
});
