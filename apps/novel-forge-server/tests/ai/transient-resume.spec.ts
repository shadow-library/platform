import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { beforeAll, describe, expect, it } from 'bun:test';
import { parseSynapseError, SynapseError } from '@shadow-library/synapse';

import { AppErrorCode } from '@server/classes';

import { resumeOnceOnTransientFailure } from '@modules/ai/graphs/transient-resume';
import { synapseCallFailed } from '@modules/ai/synapse-failure';

const State = Annotation.Root({
  prose: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

interface Script {
  writes: (() => unknown)[];
  calls: { assemble: number; draft: number; persist: number };
}

const scripts = new Map<string, Script>();
const scriptOf = (config: { configurable?: { thread_id?: string } }): Script => scripts.get(config.configurable?.thread_id ?? '') as Script;

const graph = new StateGraph(State)
  .addNode('assemble', (_state, config) => (scriptOf(config).calls.assemble++, { nodeTrace: ['assemble'] }))
  .addNode('draft', (_state, config) => {
    const script = scriptOf(config);
    const failure = script.writes[script.calls.draft++]?.();
    if (failure) throw failure;
    return { prose: 'The ferry waits.', nodeTrace: ['draft'] };
  })
  .addNode('persist', (_state, config) => (scriptOf(config).calls.persist++, { nodeTrace: ['persist'] }))
  .addEdge(START, 'assemble')
  .addEdge('assemble', 'draft')
  .addEdge('draft', 'persist')
  .addEdge('persist', END)
  .compile({ checkpointer: new MemorySaver() });

const bodiless503 = (): unknown => synapseCallFailed(parseSynapseError(503, undefined));

interface RunOptions {
  draftFinal?: boolean;
  controller?: AbortController;
  backoffMs?: number;
}

function chapterRun(writes: (() => unknown)[], options: RunOptions = {}) {
  const threadId = `run-${scripts.size + 1}`;
  const script: Script = { writes, calls: { assemble: 0, draft: 0, persist: 0 } };
  scripts.set(threadId, script);
  const signal = (options.controller ?? new AbortController()).signal;
  const config = { configurable: { thread_id: threadId }, signal };
  let resumeChecks = 0;
  const run = resumeOnceOnTransientFailure(resume => graph.invoke(resume ? null : { prose: '' }, config), {
    signal,
    backoffMs: options.backoffMs ?? 0,
    mayResume: async () => (resumeChecks++, !options.draftFinal),
  });
  return { run, calls: script.calls, resumeChecks: () => resumeChecks };
}

describe('resumeOnceOnTransientFailure', () => {
  beforeAll(async () => {
    await chapterRun([bodiless503]).run;
  });

  it('should resume from the node a bodiless 503 stopped and write the chapter once', async () => {
    const { run, calls } = chapterRun([bodiless503]);

    const state = await run;

    expect(state).toMatchObject({ prose: 'The ferry waits.', nodeTrace: ['assemble', 'draft', 'persist'] });
    expect(calls).toEqual({ assemble: 1, draft: 2, persist: 1 });
  });

  it('should fail with the resumed run’s own error when it fails transiently too', async () => {
    const second = bodiless503();
    const { run, calls } = chapterRun([bodiless503, () => second]);

    await expect(run).rejects.toBe(second);
    expect(calls).toEqual({ assemble: 1, draft: 2, persist: 0 });
  });

  it('should surface a non-transient failure of the resumed node as it came', async () => {
    const refusal = AppErrorCode.AI_015.create();
    const { run } = chapterRun([bodiless503, () => refusal]);

    await expect(run).rejects.toBe(refusal);
  });

  it('should never retry a failure the request itself caused', async () => {
    const refusals = [
      AppErrorCode.AI_015.create(),
      AppErrorCode.AI_024.create(),
      AppErrorCode.AI_008.create(),
      synapseCallFailed(new SynapseError(422, 'SYN_NO_ELIGIBLE_MODEL', 'no model')),
      synapseCallFailed(parseSynapseError(400, undefined)),
    ];
    for (const refusal of refusals) {
      const { run, calls } = chapterRun([() => refusal]);

      await expect(run).rejects.toBe(refusal);
      expect(calls.draft).toBe(1);
    }
  });

  it('should not resume when the chapter’s draft became final during the backoff', async () => {
    const first = bodiless503();
    const { run, calls } = chapterRun([() => first], { draftFinal: true });

    await expect(run).rejects.toBe(first);
    expect(calls).toEqual({ assemble: 1, draft: 1, persist: 0 });
  });

  it('should stop waiting and not resume when the run is cancelled during the backoff', async () => {
    const controller = new AbortController();
    const first = bodiless503();
    const cancelLater = (): unknown => (setTimeout(() => controller.abort(), 0), first);
    const { run, calls, resumeChecks } = chapterRun([cancelLater], { controller, backoffMs: 60_000 });

    await expect(run).rejects.toBe(first);
    expect(controller.signal.aborted).toBe(true);
    expect(resumeChecks()).toBe(0);
    expect(calls).toEqual({ assemble: 1, draft: 1, persist: 0 });
  });
});
