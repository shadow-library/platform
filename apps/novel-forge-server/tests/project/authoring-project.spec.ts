import { describe, expect, it } from 'bun:test';

import { assertAuthoringProject } from '@server/common';
import { type Project } from '@server/database';

function gate(kind: Project.Kind): string {
  try {
    assertAuthoringProject({ kind });
    return 'allowed';
  } catch (err) {
    return (err as { code?: string }).code ?? 'NO_CODE';
  }
}

describe('assertAuthoringProject', () => {
  it('should allow a new_novel or source project', () => {
    expect(gate('new_novel')).toBe('allowed');
    expect(gate('source')).toBe('allowed');
  });

  it('should refuse a translation or curated project', () => {
    expect(gate('translation')).toBe('PRJ_009');
    expect(gate('curated')).toBe('PRJ_009');
  });
});
