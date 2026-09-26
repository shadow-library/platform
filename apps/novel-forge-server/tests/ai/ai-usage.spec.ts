import { describe, expect, it } from 'bun:test';

import { type ProjectCostGroupRow, summarizeByProject } from '@modules/ai/ai-usage.service';

function row(overrides: Partial<ProjectCostGroupRow> = {}): ProjectCostGroupRow {
  return {
    projectId: 1n,
    title: 'Novel one',
    model: 'anthropic/claude-sonnet-5',
    costSource: 'provider',
    calls: 1,
    recordedCostUsd: 0.01,
    unpricedInputTokens: 0,
    unpricedOutputTokens: 0,
    ...overrides,
  };
}

describe('summarizeByProject', () => {
  it('should sum rows from the same project into one entry, keeping its title', () => {
    const items = summarizeByProject([row({ recordedCostUsd: 0.01 }), row({ recordedCostUsd: 0.02, calls: 2 })]);

    expect(items).toEqual([{ projectId: 1n, title: 'Novel one', calls: 3, costUsd: 0.03 }]);
  });

  it('should keep two projects separate and sort by highest spend first', () => {
    const items = summarizeByProject([row({ projectId: 1n, title: 'A', recordedCostUsd: 0.01 }), row({ projectId: 2n, title: 'B', recordedCostUsd: 0.05 })]);

    expect(items.map(i => i.projectId)).toEqual([2n, 1n]);
  });

  it('should surface a project with no title as null rather than throwing', () => {
    const items = summarizeByProject([row({ title: null })]);

    expect(items[0]?.title).toBeNull();
  });
});
