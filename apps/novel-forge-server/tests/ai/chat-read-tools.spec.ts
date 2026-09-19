import { describe, expect, it, mock } from 'bun:test';

import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { type ToolContext } from '@modules/ai/tools/types';

function makeCtx(overrides: Record<string, { findFirst: ReturnType<typeof mock> }> = {}): ToolContext {
  return {
    chapter: 1,
    db: {
      query: {
        arcs: { findFirst: mock(async () => undefined) },
        bibleDocuments: { findFirst: mock(async () => undefined) },
        briefs: { findFirst: mock(async () => undefined) },
        drafts: { findFirst: mock(async () => undefined) },
        volumes: { findFirst: mock(async () => undefined) },
        ...overrides,
      },
      select: mock(() => ({ from: mock(() => ({ where: mock(async () => []) })) })),
    } as never,
    node: 'chat-hub',
    projectId: BigInt(1),
    retrieval: {
      searchLore: mock(async () => []),
      searchProse: mock(async () => []),
    } as never,
    runId: 'test-run',
  };
}

const registry = new ToolRegistryService();

function rawTool(name: string) {
  const tool = registry.getRaw('chat-hub').find(t => t.name === name);
  if (!tool) throw new Error(`${name} not found in chat-hub node`);
  return tool;
}

describe('ToolRegistryService.forNode chat-hub', () => {
  it('includes all five artifact-read tools on chat-hub and none on judge', () => {
    const hubNames = registry.forNode('chat-hub', makeCtx()).map(t => t.name);
    const judgeNames = registry.forNode('judge', makeCtx()).map(t => t.name);

    for (const name of ['get_bible_document', 'get_volume', 'get_arc', 'get_brief', 'get_draft']) {
      expect(hubNames).toContain(name);
      expect(judgeNames).not.toContain(name);
    }
  });
});

describe('get_bible_document handler', () => {
  it('returns the full body, section and slug on a hit', async () => {
    const doc = { body: 'Full canon text.', frontmatter: { owner: 'lore' }, revision: 3, section: 'lore', slug: 'the-empire' };
    const ctx = makeCtx({ bibleDocuments: { findFirst: mock(async () => doc) } });

    const result = await rawTool('get_bible_document').handler({ section: 'lore', slug: 'the-empire' }, ctx);

    expect(result).toContain('lore/the-empire');
    expect(result).toContain('rev 3');
    expect(result).toContain('Full canon text.');
    expect(result).toContain('owner');
  });

  it('degrades gracefully on a miss', async () => {
    const ctx = makeCtx();

    const result = await rawTool('get_bible_document').handler({ section: 'world', slug: 'nonexistent' }, ctx);

    expect(result).toBe('Bible document not found: world/nonexistent');
  });

  it('truncates a long body to tokensBudget * 4 characters via the forNode wrapper', async () => {
    const longBody = 'A'.repeat(40000);
    const ctx = makeCtx({ bibleDocuments: { findFirst: mock(async () => ({ body: longBody, frontmatter: null, revision: 1, section: 'lore', slug: 'big' })) } });

    const tools = registry.forNode('chat-hub', ctx);
    const tool = tools.find(t => t.name === 'get_bible_document');
    if (!tool) throw new Error('get_bible_document not found');
    const result = await tool.invoke({ section: 'lore', slug: 'big' });
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

    expect(resultStr.length).toBeLessThanOrEqual(6000 * 4 + 20);
    expect(resultStr).toContain('[truncated]');
  });
});

describe('get_volume handler', () => {
  it('returns the full volume record on a hit', async () => {
    const volume = {
      body: 'Volume prose plan.',
      cast: ['hero', 'sidekick'],
      conflict: 'The war begins.',
      endChapter: 20,
      epitome: 'The opening war.',
      objective: 'Introduce the war.',
      ordinal: 1,
      payoff: 'The city falls.',
      startChapter: 1,
      status: 'approved',
      targetChapterCount: 20,
      title: 'The Opening War',
      volumeKey: 'v1',
    };
    const ctx = makeCtx({ volumes: { findFirst: mock(async () => volume) } });

    const result = await rawTool('get_volume').handler({ volumeKey: 'v1' }, ctx);

    expect(result).toContain('v1');
    expect(result).toContain('The Opening War');
    expect(result).toContain('1–20');
    expect(result).toContain('hero, sidekick');
  });

  it('degrades gracefully on a miss', async () => {
    const ctx = makeCtx();

    const result = await rawTool('get_volume').handler({ volumeKey: 'nonexistent' }, ctx);

    expect(result).toBe('Volume not found: nonexistent');
  });

  it('truncates a long body to tokensBudget * 4 characters via the forNode wrapper', async () => {
    const longBody = 'C'.repeat(20000);
    const ctx = makeCtx({
      volumes: {
        findFirst: mock(async () => ({
          body: longBody,
          cast: null,
          conflict: null,
          endChapter: 20,
          epitome: null,
          objective: null,
          ordinal: 1,
          payoff: null,
          startChapter: 1,
          status: 'approved',
          targetChapterCount: null,
          title: 'Big Volume',
          volumeKey: 'v1',
        })),
      },
    });

    const tools = registry.forNode('chat-hub', ctx);
    const tool = tools.find(t => t.name === 'get_volume');
    if (!tool) throw new Error('get_volume not found');
    const result = await tool.invoke({ volumeKey: 'v1' });
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

    expect(resultStr.length).toBeLessThanOrEqual(2000 * 4 + 20);
    expect(resultStr).toContain('[truncated]');
  });
});

describe('get_arc handler', () => {
  it('returns the full arc record with its chapter span on a hit', async () => {
    const arc = {
      arcKey: 'a1',
      body: null,
      cast: ['hero'],
      chapterEnd: 10,
      chapterStart: 1,
      escalation: 'Stakes rise.',
      hook: 'A stranger arrives.',
      objective: 'Set the stage.',
      ordinal: 1,
      payoff: 'The reveal.',
      status: 'draft',
      title: 'Arrival',
      volumeKey: 'v1',
    };
    const ctx = makeCtx({ arcs: { findFirst: mock(async () => arc) } });

    const result = await rawTool('get_arc').handler({ arcKey: 'a1' }, ctx);

    expect(result).toContain('a1');
    expect(result).toContain('Arrival');
    expect(result).toContain('1–10');
    expect(result).toContain('Set the stage.');
  });

  it('degrades gracefully on a miss', async () => {
    const ctx = makeCtx();

    const result = await rawTool('get_arc').handler({ arcKey: 'nonexistent' }, ctx);

    expect(result).toBe('Arc not found: nonexistent');
  });

  it('truncates a long body to tokensBudget * 4 characters via the forNode wrapper', async () => {
    const longBody = 'D'.repeat(20000);
    const ctx = makeCtx({
      arcs: {
        findFirst: mock(async () => ({
          arcKey: 'a1',
          body: longBody,
          cast: null,
          chapterEnd: 10,
          chapterStart: 1,
          escalation: null,
          hook: null,
          objective: null,
          ordinal: 1,
          payoff: null,
          status: 'draft',
          title: 'Big Arc',
          volumeKey: 'v1',
        })),
      },
    });

    const tools = registry.forNode('chat-hub', ctx);
    const tool = tools.find(t => t.name === 'get_arc');
    if (!tool) throw new Error('get_arc not found');
    const result = await tool.invoke({ arcKey: 'a1' });
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

    expect(resultStr.length).toBeLessThanOrEqual(2000 * 4 + 20);
    expect(resultStr).toContain('[truncated]');
  });
});

describe('get_brief handler', () => {
  it('returns the full brief including ending and knowledge contracts on a hit', async () => {
    const brief = {
      arcKey: 'a1',
      body: 'Chapter beats go here.',
      chapter: 5,
      chapterPurpose: 'Land the twist.',
      contextRefs: ['entity:hero'],
      endingContract: { mustEnd: 'on a cliffhanger' },
      handEdited: false,
      knowledgeContract: { readerLearns: ['the truth'] },
      pov: 'hero',
      readerValue: { tension: 'high' },
      repetitionRisks: ['overused metaphor'],
      revision: 2,
      title: 'The Twist',
      volumeKey: 'v1',
      writeMode: 'standard',
    };
    const ctx = makeCtx({ briefs: { findFirst: mock(async () => brief) } });

    const result = await rawTool('get_brief').handler({ chapter: 5 }, ctx);

    expect(result).toContain('Chapter 5');
    expect(result).toContain('The Twist');
    expect(result).toContain('mustEnd');
    expect(result).toContain('readerLearns');
  });

  it('degrades gracefully on a miss', async () => {
    const ctx = makeCtx();

    const result = await rawTool('get_brief').handler({ chapter: 99 }, ctx);

    expect(result).toBe('Brief not found for chapter 99');
  });

  it('truncates a long body to tokensBudget * 4 characters via the forNode wrapper', async () => {
    const longBody = 'E'.repeat(30000);
    const ctx = makeCtx({
      briefs: {
        findFirst: mock(async () => ({
          arcKey: 'a1',
          body: longBody,
          chapter: 5,
          chapterPurpose: null,
          contextRefs: null,
          endingContract: null,
          handEdited: false,
          knowledgeContract: null,
          pov: null,
          readerValue: null,
          repetitionRisks: null,
          revision: 1,
          title: 'Big Brief',
          volumeKey: 'v1',
          writeMode: 'standard',
        })),
      },
    });

    const tools = registry.forNode('chat-hub', ctx);
    const tool = tools.find(t => t.name === 'get_brief');
    if (!tool) throw new Error('get_brief not found');
    const result = await tool.invoke({ chapter: 5 });
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

    expect(resultStr.length).toBeLessThanOrEqual(5000 * 4 + 20);
    expect(resultStr).toContain('[truncated]');
  });
});

describe('get_draft handler', () => {
  it('returns the full draft prose on a hit', async () => {
    const draft = {
      body: 'Once upon a time...',
      chapter: 3,
      reviewStatus: 'needs_review',
      revision: 1,
      status: 'draft',
      summary: 'The hero sets out.',
      title: 'Departure',
      words: 3200,
    };
    const ctx = makeCtx({ drafts: { findFirst: mock(async () => draft) } });

    const result = await rawTool('get_draft').handler({ chapter: 3 }, ctx);

    expect(result).toContain('Chapter 3');
    expect(result).toContain('Departure');
    expect(result).toContain('Once upon a time...');
    expect(result).toContain('3200');
  });

  it('degrades gracefully on a miss', async () => {
    const ctx = makeCtx();

    const result = await rawTool('get_draft').handler({ chapter: 99 }, ctx);

    expect(result).toBe('Draft not found for chapter 99');
  });

  it('truncates full prose to tokensBudget * 4 characters via the forNode wrapper', async () => {
    const longBody = 'B'.repeat(100000);
    const ctx = makeCtx({
      drafts: { findFirst: mock(async () => ({ body: longBody, chapter: 3, reviewStatus: 'draft', revision: 1, status: 'draft', summary: null, title: null, words: null })) },
    });

    const tools = registry.forNode('chat-hub', ctx);
    const tool = tools.find(t => t.name === 'get_draft');
    if (!tool) throw new Error('get_draft not found');
    const result = await tool.invoke({ chapter: 3 });
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

    expect(resultStr.length).toBeLessThanOrEqual(10000 * 4 + 20);
    expect(resultStr).toContain('[truncated]');
  });
});
