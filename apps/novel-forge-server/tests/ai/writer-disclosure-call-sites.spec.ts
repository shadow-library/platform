import { describe, expect, it } from 'bun:test';

import { PRODUCTION_DEFAULTS, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { createChapterGenerationNodes } from '@modules/ai/graphs/chapter-generation.graph';
import { schema } from '@server/database';

import { draftRow, fakeGenerationDb, makeGenerationService } from '../generation/generation-fixtures';
import { ENDING, ENDING_QUESTION, FACT_MARKERS, PAYLOAD, TERM, V2_GOAL, V3_GOAL, writerAssembler, writerDb, writerTables } from './writer-disclosure-fixtures';

interface RecordedCall {
  key: string;
  vars: Record<string, unknown>;
}

const LONG_BODY = 'The tide came in slowly. '.repeat(900);
const POLICY = { writerClass: 'standard', raised: false, contextSections: [] };

function recordingRouter(calls: RecordedCall[], answer: (key: string) => unknown) {
  return {
    structured: async (prompt: { key: string }, vars: Record<string, unknown>) => {
      calls.push({ key: prompt.key, vars });
      return answer(prompt.key);
    },
    resolveModel: (role: string, project?: { contentMode?: string }) =>
      project?.contentMode === 'unrestricted' ? UNRESTRICTED_DEFAULTS[role as 'generation'] : PRODUCTION_DEFAULTS[role as 'generation'],
  };
}

function expectWriterSafe(text: unknown): void {
  expect(typeof text).toBe('string');
  for (const marker of [...FACT_MARKERS, ENDING, ENDING_QUESTION, V2_GOAL, V3_GOAL]) expect(text as string).not.toContain(marker);
  expect(text as string).toContain('[withheld]');
}

function graphNodes() {
  const calls: RecordedCall[] = [];
  const db = writerDb(writerTables('locked'));
  const modelRouter = recordingRouter(calls, key =>
    key === 'fix' ? { action: 'rewrite', body: LONG_BODY } : { title: 'Low Water', body: LONG_BODY, summary: 'Done.', state: {} },
  );
  const nodes = createChapterGenerationNodes({
    db: db as never,
    contextAssembler: writerAssembler(db),
    modelRouter: modelRouter as never,
    telemetry: {} as never,
    toolRegistry: {} as never,
    indexingService: {} as never,
    pluginPolicy: { scoped: async () => ({ for: () => POLICY, forPack: () => POLICY }) } as never,
    writerSnapshots: { onMessages: () => () => {} } as never,
  });
  return { nodes, calls };
}

const RUN = {
  projectId: '7',
  chapter: 5,
  runId: 'run-1',
  guidance: `Push harder. ${PAYLOAD}`,
  findings: [{ severity: 'soft', text: `brief: ${PAYLOAD}` }],
  knowledgeWriterFindings: [],
};

describe('the chapter-generation graph hands the writer model scrubbed inputs', () => {
  it('should draft from a scrubbed stored pack, brief, ending contract and guidance', async () => {
    const { nodes, calls } = graphNodes();
    const { contextPackId } = await nodes.assembleContext(RUN as never);

    await nodes.draftChapter({ ...RUN, contextPackId } as never);

    const draft = calls.find(call => call.key === 'generation');
    for (const name of ['stableContext', 'volatileContext', 'chapterBrief', 'guidance']) expectWriterSafe(draft?.vars[name]);
    expect(draft?.vars['endingContract']).not.toContain(TERM);
  });

  it('should repair from the scrubbed pack and findings', async () => {
    const { nodes, calls } = graphNodes();
    const { contextPackId } = await nodes.assembleContext(RUN as never);

    await nodes.repairPatch({ ...RUN, contextPackId, prose: 'The tide came in.' } as never);

    const fix = calls.find(call => call.key === 'fix');
    expectWriterSafe(fix?.vars['contextPack']);
    expectWriterSafe(fix?.vars['findings']);
  });

  it('should rewrite from scrubbed guidance, findings and brief', async () => {
    const { nodes, calls } = graphNodes();
    const { contextPackId } = await nodes.assembleContext(RUN as never);

    await nodes.repairRewrite({ ...RUN, contextPackId } as never);

    const rewrite = calls.find(call => call.key === 'generation');
    for (const name of ['stableContext', 'volatileContext', 'chapterBrief', 'guidance']) expectWriterSafe(rewrite?.vars[name]);
  });
});

function serviceOver(revisedBody: string) {
  const calls: RecordedCall[] = [];
  const tables = writerTables('locked');
  const fake = fakeGenerationDb({ draftReads: [draftRow({ chapter: 5, body: `She paid the ${TERM} at dawn.` })], draftWriteResult: [draftRow({ chapter: 5 })] });
  const db = { ...fake.db, query: writerDb(tables).query };
  const service = makeGenerationService(db, {
    modelRouter: recordingRouter(calls, () => ({ title: 'Low Water', body: revisedBody, summary: 'Done.', state: {} })),
    contextAssembler: writerAssembler(writerDb(tables)),
    pluginPolicy: { resolve: async () => POLICY },
  });
  return { service, calls, fake };
}

describe('the generation service hands the writer model scrubbed inputs', () => {
  it('should revise from a scrubbed pack, brief and note, telling the writer which locked terms the draft uses', async () => {
    const { service, calls } = serviceOver(LONG_BODY);

    await service.reviseDraft(7n, 5, { note: `Slow down. ${PAYLOAD}` });

    const revision = calls.find(call => call.key === 'revision');
    const [note, ...leakLines] = String(revision?.vars['feedback']).split('\n- remove or avoid ');
    for (const text of [revision?.vars['contextPack'], revision?.vars['chapterBrief'], note]) expectWriterSafe(text);
    expect(leakLines).toEqual([`"${TERM}" — Keep the lamp's price off the page. [withheld].`]);
  });

  it('should hold a revision that still uses a locked give-away term for review as a contradiction', async () => {
    const clean = serviceOver(LONG_BODY);
    const leaking = serviceOver(`${LONG_BODY} The ${TERM} came due.`);

    await clean.service.reviseDraft(7n, 5, { note: 'Slow down.' });
    await leaking.service.reviseDraft(7n, 5, { note: 'Slow down.' });

    const status = (run: ReturnType<typeof serviceOver>) =>
      run.fake.writesTo(schema.drafts, 'update').find(write => write.values && 'body' in write.values)?.values?.['reviewStatus'];
    expect([status(clean), status(leaking)]).toEqual(['needs_review', 'contradiction']);
  });

  it('should fill an unrestricted chapter from a scrubbed pack, brief and guidance', async () => {
    const { service, calls } = serviceOver(LONG_BODY);

    await service.generateUnrestricted(7n, 5, { guidance: `Go darker. ${PAYLOAD}` });

    const fill = calls.find(call => call.key === 'generation');
    for (const name of ['stableContext', 'volatileContext', 'chapterBrief', 'guidance']) expectWriterSafe(fill?.vars[name]);
  });
});
