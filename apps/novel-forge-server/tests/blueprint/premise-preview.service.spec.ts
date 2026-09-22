import { describe, expect, it, mock } from 'bun:test';

import { type RoundWithJob } from '@modules/blueprint/engine/blueprint-round.service';
import { PremisePreviewService } from '@modules/blueprint/steps/premise-preview.service';

import { round } from './blueprint-fixtures';

const PREMISE = 'A clerk who audits the dead finds his own childhood on a manifest.';

function fakeService(state: { projectKind?: string; latest?: RoundWithJob } = {}) {
  const db = { query: { projects: { findFirst: mock(async () => ({ id: 7n, kind: state.projectKind ?? 'new_novel' })) } } };
  const rounds = { latestForStep: mock(async () => state.latest) };
  const structured = mock(async () => ({ paragraph: '  The manifest was thirty years old and still warm from the press.  ' }));
  const modelRouter = { structured };
  const workflowRunService = {
    runChain: mock(async (_p: bigint, _g: string, _t: string, _i: unknown, run: (runId: string) => Promise<string>) => ({ result: await run('run-1') })),
  };
  const pluginPolicy = { resolve: mock(async () => ({})) };
  const service = new PremisePreviewService({ getPostgresClient: () => db } as never, rounds as never, modelRouter as never, workflowRunService as never, pluginPolicy as never);
  return { service, structured, rounds };
}

describe('PremisePreviewService', () => {
  it('should return one trimmed paragraph from a single model call', async () => {
    const { service, structured } = fakeService();
    expect(await service.preview(7n, PREMISE)).toBe('The manifest was thirty years old and still warm from the press.');
    expect(structured).toHaveBeenCalledTimes(1);
  });

  it('should refuse a second preview until the cooldown has passed', async () => {
    const { service, structured } = fakeService();
    await service.preview(7n, PREMISE);
    await expect(service.preview(7n, PREMISE)).rejects.toThrow(expect.objectContaining({ code: 'BPR_008' }));
    expect(structured).toHaveBeenCalledTimes(1);
  });

  it('should keep the cooldown per project', async () => {
    const { service, structured } = fakeService();
    await service.preview(7n, PREMISE);
    await service.preview(8n, PREMISE);
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it('should refuse while the premise step is generating', async () => {
    const { service, structured } = fakeService({ latest: { round: round({ stepKey: 'premise', status: 'running' }), jobStatus: 'in_progress' } as RoundWithJob });
    await expect(service.preview(7n, PREMISE)).rejects.toThrow(expect.objectContaining({ code: 'BPR_002' }));
    expect(structured).not.toHaveBeenCalled();
  });

  it('should refuse a project the Blueprint does not design', async () => {
    const { service } = fakeService({ projectKind: 'curated' });
    await expect(service.preview(7n, PREMISE)).rejects.toThrow(expect.objectContaining({ code: 'BPR_003' }));
  });

  it('should let the author try again straight away when the call itself failed', async () => {
    const { service, structured } = fakeService();
    structured.mockImplementationOnce(() => Promise.reject(new Error('the model was unreachable')));
    await expect(service.preview(7n, PREMISE)).rejects.toThrow('the model was unreachable');
    expect(await service.preview(7n, PREMISE)).toBe('The manifest was thirty years old and still warm from the press.');
  });
});
