import { describe, expect, it, mock } from 'bun:test';

import { runToolLoop } from '@modules/ai/tools/tool-loop';
import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { type ToolContext } from '@modules/ai/tools/types';

const ctx: ToolContext = {
  chapter: 1,
  db: {
    query: {
      chapters: { findMany: mock(async () => []) },
      entities: { findFirst: mock(async () => undefined) },
      entityAliases: { findMany: mock(async () => []) },
      entityRelationships: { findMany: mock(async () => []) },
      plotThreads: { findMany: mock(async () => []) },
      worldFacts: { findMany: mock(async () => []) },
    },
    select: mock(() => ({ from: mock(() => ({ where: mock(async () => []) })) })),
  } as never,
  node: 'judge',
  projectId: BigInt(1),
  retrieval: {
    searchLore: mock(async () => []),
    searchProse: mock(async () => []),
  } as never,
  runId: 'test-run',
};

describe('ToolRegistryService.forNode', () => {
  const registry = new ToolRegistryService();

  it('returns tools allowed for judge node', () => {
    const tools = registry.forNode('judge', ctx);
    const names = tools.map(t => t.name);
    expect(names).toContain('search_lore');
    expect(names).toContain('get_entity');
    expect(names).toContain('search_prose');
    expect(names).toContain('get_chapter_summaries');
  });

  it('excludes get_chapter_summaries from review node', () => {
    const tools = registry.forNode('review', ctx);
    const names = tools.map(t => t.name);
    expect(names).not.toContain('get_chapter_summaries');
    expect(names).toContain('search_lore');
  });

  it('excludes search_prose from validateWindow node', () => {
    const tools = registry.forNode('validateWindow', ctx);
    const names = tools.map(t => t.name);
    expect(names).not.toContain('search_prose');
    expect(names).toContain('search_lore');
  });
});

describe('get_entity handler', () => {
  const registry = new ToolRegistryService();

  it('returns Entity not found when entity is missing', async () => {
    const rawTools = registry.getRaw('judge');
    const entityTool = rawTools.find(t => t.name === 'get_entity');
    if (!entityTool) throw new Error('get_entity tool not found in judge node');
    const result = await entityTool.handler({ entityKey: 'nonexistent-key' }, ctx);
    expect(result).toBe('Entity not found: nonexistent-key');
  });
});

// Truncation is applied in the forNode wrapper (DynamicStructuredTool func), not the raw handler.

describe('tool truncation', () => {
  it('truncates result if it exceeds tokensBudget * 4 chars via forNode wrapper', async () => {
    const longText = 'A'.repeat(20000);
    const richCtx: ToolContext = {
      ...ctx,
      retrieval: {
        searchLore: mock(async () => [{ metadata: { kind: 'character', refKey: 'hero' }, score: 0.9, text: longText }]),
        searchProse: mock(async () => []),
      } as never,
    };

    const registry = new ToolRegistryService();
    const tools = registry.forNode('judge', richCtx);
    const lcTool = tools.find(t => t.name === 'search_lore');
    if (!lcTool) throw new Error('search_lore not found in judge node');

    const result = await lcTool.invoke({ query: 'test' });
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    expect(resultStr.length).toBeLessThanOrEqual(4000 * 4 + 20);
    expect(resultStr).toContain('[truncated]');
  });
});

// @ts-expect-error — insert is not in ReadonlyDb (Pick<PrimaryDatabase, 'select'|'query'>)
const _badHandler = (_: unknown, toolCtx: ToolContext) => toolCtx.db.insert;
void _badHandler;

describe('runToolLoop maxRounds', () => {
  it('invokes model at most maxRounds times when model always returns tool calls', async () => {
    const registry = new ToolRegistryService();
    const rawTools = registry.getRaw('judge');
    const tools = registry.forNode('judge', ctx);

    const invokeCount = { bound: 0, final: 0 };

    const boundModel = {
      invoke: mock(async () => {
        invokeCount.bound++;
        return {
          content: '',
          tool_calls: [{ args: { query: 'test' }, id: 'tc-1', name: 'search_lore', type: 'tool_call' }],
        };
      }),
    };

    const finalInvoke = mock(async () => ({ content: 'Final answer', tool_calls: [] }));

    const mockModel = {
      bindTools: mock(() => boundModel),
      invoke: finalInvoke,
    } as never;

    const valuesMock = mock(() => Promise.resolve());
    const insertChainMock = { values: valuesMock };
    const insertMock = mock(() => insertChainMock);
    const fullDb = { insert: insertMock } as never;

    const maxRounds = 3;
    const result = await runToolLoop(mockModel, tools, rawTools, [{ content: 'question' } as never], ctx, fullDb, { maxRounds });

    expect(invokeCount.bound).toBe(maxRounds);
    expect(finalInvoke).toHaveBeenCalledTimes(1);
    expect(result.toolCallCount).toBe(maxRounds);
  });
});

describe('runToolLoop audit', () => {
  it('writes an audit row to fullDb for each tool call', async () => {
    const registry = new ToolRegistryService();
    const rawTools = registry.getRaw('judge');
    const tools = registry.forNode('judge', ctx);

    let callCount = 0;
    const boundModel = {
      invoke: mock(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            content: '',
            tool_calls: [{ args: { query: 'test' }, id: 'tc-1', name: 'search_lore', type: 'tool_call' }],
          };
        }
        return { content: 'done', tool_calls: [] };
      }),
    };

    const mockModel = {
      bindTools: mock(() => boundModel),
      invoke: mock(async () => ({ content: 'done', tool_calls: [] })),
    } as never;

    const valuesMock = mock(() => Promise.resolve());
    const insertChainMock = { values: valuesMock };
    const insertMock = mock(() => insertChainMock);
    const fullDb = { insert: insertMock } as never;

    await runToolLoop(mockModel, tools, rawTools, [{ content: 'go' } as never], ctx, fullDb);

    expect(insertMock).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledTimes(1);
  });
});
