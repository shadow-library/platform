import { describe, expect, it } from 'bun:test';

import { type SQL } from 'drizzle-orm';

import { UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { stageIsolatedContinuity } from '@modules/ai/graphs/chapter-finalization.graph';
import { ISOLATED_EXTRACTION_NOTE, WALLED_OFF_EXCERPT } from '@modules/ai/isolation-read-policy';

import { render } from '../generation/generation-fixtures';

const MARKER = 'ISOLATED_MARKER';
const CTX = { projectId: 7n, runId: 'run-1', node: 'extractContinuity', promptKey: 'continuity', promptVersion: '1', role: 'continuity', chapter: 4 };

function staging(extract: () => Promise<unknown> = async () => ({ relationships: [{ from: 'keeper', to: 'apprentice', evidence: `${MARKER} in the cellar.` }] })) {
  const calls: { contextPack: string; contentMode?: string }[] = [];
  const upserts: { values: Record<string, unknown>; set: Record<string, unknown>; setWhere?: SQL }[] = [];
  const db = {
    query: { projects: { findFirst: async () => ({ id: 7n, contentMode: 'standard' }) } },
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async (config: { set: Record<string, unknown>; setWhere?: SQL }) => {
          upserts.push({ values, set: config.set, setWhere: config.setWhere });
        },
      }),
    }),
  };
  const modelRouter = {
    structured: async (_prompt: unknown, input: { contextPack: string }, _ctx: unknown, project?: { contentMode?: string }) => {
      calls.push({ contextPack: input.contextPack, contentMode: project?.contentMode });
      return extract();
    },
    resolveFor: async () => UNRESTRICTED_DEFAULTS.continuity,
  };
  const run = () => stageIsolatedContinuity({ db: db as never, modelRouter: modelRouter as never }, { projectId: 7n, chapter: 4, prose: MARKER, contextPack: 'ROSTER' }, CTX);
  return { run, calls, upserts };
}

describe('stageIsolatedContinuity', () => {
  it('should read on the unrestricted route, told to describe non-graphically', async () => {
    const { run, calls } = staging();

    await run();

    expect(calls).toEqual([{ contextPack: `${ISOLATED_EXTRACTION_NOTE}\n\nROSTER`, contentMode: 'unrestricted' }]);
  });

  it('should stage a pending proposal stamped as isolated, with no excerpt left', async () => {
    const { run, upserts } = staging();

    await run();

    expect(upserts[0]?.values).toMatchObject({ status: 'pending', proposal: { sourceIsolated: true, relationships: [{ evidence: WALLED_OFF_EXCERPT }] } });
    expect(JSON.stringify(upserts[0]?.values['proposal'])).not.toContain(MARKER);
  });

  it('should never reopen a proposal the author already settled when finalize replays', async () => {
    const { run, upserts } = staging();

    await run();

    expect(render(upserts[0]?.setWhere)).toMatchObject({ sql: '"continuity_proposals"."status" = $1', params: ['pending'] });
    expect(upserts[0]?.set).not.toHaveProperty('status');
  });

  it('should log and move on when the extraction fails, so the chapter still finalizes', async () => {
    const { run, upserts } = staging(async () => {
      throw new Error('gateway down');
    });

    await run();

    expect(upserts).toEqual([]);
  });
});
