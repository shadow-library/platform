import { describe, expect, it } from 'bun:test';

import { LIFECYCLE_PHASES, lifecyclePhase, projectDotColor, projectKindIntent, projectKindLabel, projectKindTag } from '../src/lib/format';

describe('projectKindLabel', () => {
  it('should label every project kind', () => {
    expect(projectKindLabel('new_novel')).toBe('Original novel');
    expect(projectKindLabel('source')).toBe('Adapted from source');
    expect(projectKindLabel('translation')).toBe('Translated novel');
    expect(projectKindLabel('curated')).toBe('Curated novel');
  });
});

describe('projectKindTag', () => {
  it('should tag every project kind', () => {
    expect(projectKindTag('new_novel')).toBe('new-novel');
    expect(projectKindTag('source')).toBe('source');
    expect(projectKindTag('translation')).toBe('translation');
    expect(projectKindTag('curated')).toBe('curated');
  });
});

describe('projectKindIntent', () => {
  it('should map each kind to the chip intent used in the design mockup', () => {
    expect(projectKindIntent('new_novel')).toBe('accent');
    expect(projectKindIntent('source')).toBe('info');
    expect(projectKindIntent('translation')).toBe('success');
    expect(projectKindIntent('curated')).toBe('warning');
  });
});

describe('projectDotColor', () => {
  it('should give every project kind a distinct dot colour', () => {
    const colors = (['new_novel', 'source', 'translation', 'curated'] as const).map(kind => projectDotColor({ kind }));
    expect(new Set(colors).size).toBe(4);
  });
});

describe('lifecyclePhase', () => {
  it('should default to the new_novel phases when status is unknown', () => {
    expect(lifecyclePhase(undefined)).toEqual({ completed: 0, total: 5, label: 'Bible' });
  });

  it('should walk the authoring phases forward as status fields complete, for both new_novel and source', () => {
    for (const kind of ['new_novel', 'source'] as const) {
      expect(lifecyclePhase({ kind })).toEqual({ completed: 1, total: 5, label: 'Plan' });
      expect(lifecyclePhase({ kind, volumesTotal: 3 })).toEqual({ completed: 2, total: 5, label: 'Arcs' });
      expect(lifecyclePhase({ kind, volumesTotal: 3, planApproved: true })).toEqual({ completed: 3, total: 5, label: 'Drafts' });
      expect(lifecyclePhase({ kind, volumesTotal: 3, planApproved: true, draftsTotal: 10 })).toEqual({ completed: 4, total: 5, label: 'Review' });
      expect(lifecyclePhase({ kind, volumesTotal: 3, planApproved: true, draftsTotal: 10, draftsFinal: 10 })).toEqual({ completed: 5, total: 5, label: 'Review' });
    }
  });

  it('should report the translation project as always current on Originals — status carries nothing translation-specific yet', () => {
    expect(lifecyclePhase({ kind: 'translation' })).toEqual({ completed: 0, total: 5, label: 'Originals' });
    expect(LIFECYCLE_PHASES.translation).toEqual(['Originals', 'Terms', 'Translate', 'Review', 'Publish']);
  });

  it('should report no lifecycle bar for a curated project', () => {
    expect(lifecyclePhase({ kind: 'curated' })).toEqual({ completed: 0, total: 0, label: '' });
    expect(LIFECYCLE_PHASES.curated).toEqual([]);
  });
});
