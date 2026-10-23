import { beforeAll, describe, expect, it, mock } from 'bun:test';

import { awaitAllCallbacks } from '@langchain/core/callbacks/promises';
import { type BaseMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';

import { ModelRouterService } from '@modules/ai/model-router.service';
import { appearanceDescribePrompt } from '@modules/ai/prompts/appearance-describe.prompt';
import { type AppearanceDescribeOutput } from '@modules/ai/schemas/appearance-describe.schema';
import { type JudgeOutput, JudgeSchema } from '@modules/ai/schemas/judge.schema';
import { type OutlineOutput, OutlineSchema, validateOutlineCoverage } from '@modules/ai/schemas/outline.schema';
import { TelemetryHandler } from '@modules/ai/telemetry.handler';

import { FakeSynapse } from './synapse-fakes';

// Minimal DatabaseService stub: cache always misses, cache writes are no-ops, and no project has an owner.
function stubDatabaseService(): never {
  const noopInsert = { values: () => ({ onConflictDoNothing: () => Promise.resolve() }) };
  const db = { query: { llmCache: { findFirst: async () => undefined }, projects: { findFirst: async () => undefined } }, insert: () => noopInsert };
  return { getPostgresClient: () => db } as never;
}

describe('ModelRouterService.structured (repair ladder)', () => {
  function makeRouter(fakeChain: { invoke: ReturnType<typeof mock> }): ModelRouterService {
    const stubTelemetry = {} as never;
    const router = new ModelRouterService(stubTelemetry, stubDatabaseService(), new FakeSynapse().client);
    // The router invokes the returned client directly with the formatted messages, so Synapse is never reached.
    (router as unknown as Record<string, unknown>)['buildSynapseClient'] = () => fakeChain;
    return router;
  }

  // A prompt whose template yields no messages of its own — buildMessages appends the schema
  // instruction — so the fake chain drives the repair ladder deterministically.
  const fakePrompt = {
    key: 'judge' as const,
    version: '1.0.0',
    kind: 'analytical' as const,
    system: 'test',
    template: { formatMessages: async () => [] } as never,
    schema: JudgeSchema,
  };

  it('returns parsed result on first success', async () => {
    const fakeChain = { invoke: mock(async () => ({ content: JSON.stringify({ verdict: 'consistent', findings: [] }) })) };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.verdict).toBe('consistent');
    expect(fakeChain.invoke).toHaveBeenCalledTimes(1);
  });

  it('attempts repair on first parse failure', async () => {
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async () => {
        callCount++;
        if (callCount === 1) return { content: 'not json at all' };
        return { content: JSON.stringify({ verdict: 'consistent', findings: [] }) };
      }),
    };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.verdict).toBe('consistent');
    expect(callCount).toBe(2);
  });

  it('reports the schema issues, the prompt and its version above debug level', async () => {
    const fakeChain = { invoke: mock(async () => ({ content: JSON.stringify({ verdict: 'consistent' }) })) };
    const router = makeRouter(fakeChain);
    const records: { level: string; message: string; meta: Record<string, unknown> }[] = [];
    const record = (level: string) => (message: string, meta: Record<string, unknown>) => void records.push({ level, message, meta });
    (router as unknown as Record<string, unknown>)['logger'] = { debug: record('debug'), info: record('info'), warn: record('warn'), error: record('error') };

    await expect(router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' })).rejects.toThrow();

    const above = records.filter(entry => entry.level !== 'debug');
    const warned = above.find(entry => entry.message.startsWith('Attempt 1 parse failed'));
    expect(warned?.meta).toMatchObject({ promptKey: 'judge', promptVersion: '1.0.0' });
    expect(String(warned?.meta['issues'])).toContain('findings');

    const failed = above.find(entry => entry.message === 'All parse attempts failed');
    expect(failed?.level).toBe('error');
    expect(failed?.meta).toMatchObject({ promptKey: 'judge', promptVersion: '1.0.0' });
    expect(String(failed?.meta['issues1'])).toContain('findings');
    expect(String(failed?.meta['issues2'])).toContain('findings');
  });

  it('throws when all attempts fail', async () => {
    const fakeChain = { invoke: mock(async () => ({ content: 'not json' })) };
    const router = makeRouter(fakeChain);

    await expect(router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' })).rejects.toThrow();
  });

  it('should extract from attempt 1 when the repair answers with no object at all', async () => {
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async () => {
        callCount++;
        if (callCount === 1)
          return { content: 'Two things before I hand you anything invented: {"note":"still thinking"}\n\nFinal answer:\n{"verdict":"consistent","findings":[]}' };
        return { content: 'I have said all I can say about this chapter.' };
      }),
    };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.verdict).toBe('consistent');
    expect(callCount).toBe(2);
  });

  it('should extract a prose-wrapped object whose string value carries an unbalanced brace', async () => {
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async () => {
        callCount++;
        if (callCount === 1) return { content: 'Verdict below.\n{"verdict":"consistent","findings":[{"severity":"soft","text":"the ward sigil closes with a } glyph"}]}' };
        return { content: 'no further comment' };
      }),
    };
    const router = makeRouter(fakeChain);

    const result = await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });
    expect(result.findings[0]?.text).toContain('} glyph');
  });

  it('should still carry the required schema in the conversation the repair rung sees', async () => {
    const seen: BaseMessage[][] = [];
    let callCount = 0;
    const fakeChain = {
      invoke: mock(async (messages: BaseMessage[]) => {
        seen.push(messages);
        callCount++;
        if (callCount === 1) return { content: '{"verdict":"consistent"}' };
        return { content: JSON.stringify({ verdict: 'consistent', findings: [] }) };
      }),
    };
    const router = makeRouter(fakeChain);

    await router.structured<JudgeOutput>(fakePrompt, {}, { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' });

    const repairConversation = (seen[1] ?? []).map(message => String(message.content)).join('\n');
    expect(repairConversation).toContain('matching this JSON schema');
    expect(repairConversation).toContain('one finding, citing the canon it conflicts with');
  });

  describe('with an advisory rule', () => {
    const ctx = { projectId: BigInt(1), promptKey: 'judge', promptVersion: '1.0.0', role: 'judge' };
    const flagged = JSON.stringify({ verdict: 'consistent', findings: [{ severity: 'soft', text: 'flagged' }] });
    const clean = JSON.stringify({ verdict: 'consistent', findings: [] });
    const advisoryPrompt = { ...fakePrompt, advise: (data: JudgeOutput) => (data.findings.length > 0 ? ['advisory: finding present'] : []) };

    it('should spend one repair on an advisory issue and show it to the repair', async () => {
      const seen: BaseMessage[][] = [];
      const fakeChain = {
        invoke: mock(async (messages: BaseMessage[]) => {
          seen.push(messages);
          return { content: seen.length === 1 ? flagged : clean };
        }),
      };

      const result = await makeRouter(fakeChain).structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(result.findings).toEqual([]);
      expect(seen).toHaveLength(2);
      expect((seen[1] ?? []).map(message => String(message.content)).join('\n')).toContain('advisory: finding present');
    });

    it('should accept the repair when the advisory issue survives it', async () => {
      const fakeChain = { invoke: mock(async () => ({ content: flagged })) };

      const result = await makeRouter(fakeChain).structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(result.findings).toHaveLength(1);
      expect(fakeChain.invoke).toHaveBeenCalledTimes(2);
    });

    it('should log an advisory-only repair apart from a parse failure', async () => {
      const fakeChain = { invoke: mock(async () => ({ content: flagged })) };
      const router = makeRouter(fakeChain);
      const records: { message: string; meta: Record<string, unknown> }[] = [];
      const record = (message: string, meta: Record<string, unknown>) => void records.push({ message, meta });
      (router as unknown as Record<string, unknown>)['logger'] = { debug: () => undefined, info: record, warn: record, error: record };

      await router.structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(records.some(entry => entry.message.startsWith('Attempt 1 parse failed'))).toBe(false);
      expect(records.find(entry => entry.message.startsWith('Attempt 1 has advisory issues only'))?.meta).toMatchObject({ advisory: true });
    });

    it('should send blocking and advisory issues in one repair request', async () => {
      const seen: BaseMessage[][] = [];
      const both = { ...advisoryPrompt, postValidate: (data: JudgeOutput) => (data.verdict === 'consistent' && data.findings.length > 0 ? ['blocking: verdict'] : []) };
      const fakeChain = {
        invoke: mock(async (messages: BaseMessage[]) => {
          seen.push(messages);
          return { content: seen.length === 1 ? flagged : clean };
        }),
      };

      await makeRouter(fakeChain).structured<JudgeOutput>(both, {}, ctx);

      const repair = (seen[1] ?? []).map(message => String(message.content)).join('\n');
      expect(repair).toContain('blocking: verdict');
      expect(repair).toContain('advisory: finding present');
    });

    it('should fall back to the first attempt when the repair breaks the schema', async () => {
      let callCount = 0;
      const fakeChain = {
        invoke: mock(async () => {
          callCount++;
          return { content: callCount === 1 ? flagged : 'no longer json' };
        }),
      };

      const result = await makeRouter(fakeChain).structured<JudgeOutput>(advisoryPrompt, {}, ctx);

      expect(result.findings).toHaveLength(1);
    });

    describe('on an array-schema prompt', () => {
      const brief = (title: string) => ({
        chapter: 1,
        volumeKey: 'vol_01',
        title,
        objective: 'Cross the salt flats.',
        scenes: [{ goal: 'Reach the well.', obstacle: 'A broken axle.', turn: 'The caravan stalls.', beats: ['the axle snaps', 'the guide deserts'], estimatedWords: 700 }],
        requiredContext: [],
        endingContract: { hookType: 'turn', emotionalBeat: 'dread', openQuestion: 'who cut the rope?', handoffState: 'stranded', mustNotResolve: [] },
        chapterPurpose: 'Strands the caravan.',
        readerValue: ['world_state_change'],
      });
      const arrayPrompt = {
        ...fakePrompt,
        key: 'outline' as const,
        schema: OutlineSchema,
        postValidate: (briefs: OutlineOutput) => validateOutlineCoverage(briefs, 1, 1),
        advise: (briefs: OutlineOutput) => (briefs.some(b => b.title.includes('secret')) ? ['advisory: early reveal'] : []),
      };
      const outlineCtx = { ...ctx, promptKey: 'outline', role: 'outline' };
      const firstAttempt = JSON.stringify([brief('The secret road')]);

      it('should keep the first attempt when the repair breaks the schema', async () => {
        let callCount = 0;
        const fakeChain = {
          invoke: mock(async () => {
            callCount++;
            return { content: callCount === 1 ? firstAttempt : 'I would rather not.' };
          }),
        };

        const result = await makeRouter(fakeChain).structured<OutlineOutput>(arrayPrompt, {}, outlineCtx);

        expect(result.map(b => b.title)).toEqual(['The secret road']);
      });

      it('should keep the first attempt when the repair passes the schema but fails a blocking rule', async () => {
        let callCount = 0;
        const fakeChain = {
          invoke: mock(async () => {
            callCount++;
            return { content: callCount === 1 ? firstAttempt : JSON.stringify([{ ...brief('Salt'), chapter: 2 }]) };
          }),
        };

        const result = await makeRouter(fakeChain).structured<OutlineOutput>(arrayPrompt, {}, outlineCtx);

        expect(result.map(b => [b.chapter, b.title])).toEqual([[1, 'The secret road']]);
      });
    });
  });
});

describe('ModelRouterService.structuredWithImage', () => {
  const IMAGE = `data:image/png;base64,${'QUJD'.repeat(4096)}`;
  const DESCRIPTION = { appearance: 'A broad-shouldered man in dented plate armour, close-cropped grey hair, a scar across the left brow.', confidence: 'high' };
  const ctx = { projectId: BigInt(1), promptKey: 'appearance-describe', promptVersion: '1.0.0', role: 'vision' };
  const input = { subjectLabel: 'Aldric', note: 'the armored man in the center' };

  beforeAll(async () => {
    await new FakeListChatModel({ responses: ['warm'] }).invoke('warm');
    await awaitAllCallbacks();
  });

  function makeRouter(client: unknown, db: unknown = stubDatabaseService(), telemetry: unknown = {}): { router: ModelRouterService; buildClient: ReturnType<typeof mock> } {
    const router = new ModelRouterService(telemetry as never, db as never, new FakeSynapse().client);
    const buildClient = mock(() => client);
    (router as unknown as Record<string, unknown>)['buildSynapseClient'] = buildClient;
    return { router, buildClient };
  }

  it('should append the image as an image_url part after the text of the last human message', async () => {
    const invoke = mock<(messages: BaseMessage[]) => Promise<{ content: string }>>(async () => ({ content: JSON.stringify(DESCRIPTION) }));
    const { router } = makeRouter({ invoke });

    await router.structuredWithImage<AppearanceDescribeOutput>(appearanceDescribePrompt, input, IMAGE, ctx);

    const messages = invoke.mock.calls[0]?.[0] ?? [];
    const withImage = messages.filter(message => Array.isArray(message.content));
    expect(withImage).toHaveLength(1);
    expect(withImage[0]?.getType()).toBe('human');
    const parts = withImage[0]?.content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(parts.map(part => part.type)).toEqual(['text', 'image_url']);
    expect(parts[0]?.text).toContain('Subject: Aldric');
    expect(parts[0]?.text).toContain('the armored man in the center');
    expect(parts[1]?.image_url?.url).toBe(IMAGE);
    expect(messages[0]?.getType()).toBe('system');
    expect(String(messages.at(-1)?.content)).toContain('JSON schema');
  });

  it('should return the parsed structured output', async () => {
    const { router } = makeRouter({ invoke: async () => ({ content: JSON.stringify(DESCRIPTION) }) });
    const result = await router.structuredWithImage<AppearanceDescribeOutput>(appearanceDescribePrompt, input, IMAGE, ctx);
    expect(result).toEqual(DESCRIPTION as AppearanceDescribeOutput);
  });

  it('should bypass llm_cache even for a cacheable role, since the request hash cannot see the image', async () => {
    const findFirst = mock(async () => undefined);
    const db = {
      getPostgresClient: () => ({
        query: { llmCache: { findFirst }, projects: { findFirst: async () => undefined } },
        insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
      }),
    };
    const judge = {
      key: 'judge' as const,
      version: '1.0.0',
      kind: 'analytical' as const,
      system: 'test',
      template: { formatMessages: async () => [] } as never,
      schema: JudgeSchema,
    };
    const invoke = mock<(messages: BaseMessage[]) => Promise<{ content: string }>>(async () => ({ content: JSON.stringify({ verdict: 'consistent', findings: [] }) }));
    const { router } = makeRouter({ invoke }, db);

    await router.structuredWithImage<JudgeOutput>(judge, {}, IMAGE, { ...ctx, role: 'judge' });

    expect(findFirst).not.toHaveBeenCalled();
    const imageOnly = invoke.mock.calls[0]?.[0]?.find(message => Array.isArray(message.content));
    expect((imageOnly?.content as { type: string }[]).map(part => part.type)).toEqual(['image_url']);
  });

  it('should write a model_calls row that carries no image data and does not count the base64 as prompt tokens', async () => {
    const rows: unknown[] = [];
    const telemetryDb = { insert: () => ({ values: async (row: unknown) => void rows.push(row) }) };
    const telemetry = new TelemetryHandler({ getPostgresClient: () => telemetryDb } as never);
    const { router } = makeRouter(new FakeListChatModel({ responses: [JSON.stringify(DESCRIPTION)] }), stubDatabaseService(), telemetry);
    const image = `data:image/png;base64,${'QUJD'.repeat(1024)}`;

    await router.structuredWithImage<AppearanceDescribeOutput>(appearanceDescribePrompt, input, image, ctx);
    await awaitAllCallbacks();

    expect(rows).toHaveLength(1);
    const serialized = JSON.stringify(rows[0], (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value));
    expect(serialized).toContain('"promptKey":"appearance-describe"');
    expect(serialized).not.toContain('QUJD');
    expect(serialized).not.toContain('data:image');
    // Tokenising the image itself costs half a second; base64 runs about two characters a token, so a count that
    // included it would clear a quarter of its length.
    expect((rows[0] as { inputTokens: number }).inputTokens).toBeLessThan(image.length / 4);
  });
});
