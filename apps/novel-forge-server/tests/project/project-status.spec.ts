import { describe, expect, it } from 'bun:test';

import { assertActiveProject, assertAuthoringProject } from '@server/common';
import { type Project } from '@server/database';

function gate(kind: Project.Kind, status: Project.Status = 'active'): string {
  try {
    assertAuthoringProject({ kind, status });
    return 'allowed';
  } catch (err) {
    return (err as { code?: string }).code ?? 'NO_CODE';
  }
}

describe('assertAuthoringProject', () => {
  it('should allow an active new_novel or source project', () => {
    expect(gate('new_novel')).toBe('allowed');
    expect(gate('source')).toBe('allowed');
  });

  it('should refuse a translation or curated project', () => {
    expect(gate('translation')).toBe('PRJ_009');
    expect(gate('curated')).toBe('PRJ_009');
  });

  it('should refuse a seed ahead of the kind check, whatever the kind', () => {
    expect(gate('new_novel', 'seed')).toBe('IDE_004');
    expect(gate('translation', 'seed')).toBe('IDE_004');
  });

  it('should leave the seed-only gate indifferent to the new kinds', () => {
    expect(() => assertActiveProject({ status: 'active' })).not.toThrow();
    expect(() => assertActiveProject({ status: 'seed' })).toThrow();
  });
});
