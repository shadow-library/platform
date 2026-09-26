import { describe, expect, it } from 'bun:test';

import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { NOTES_PART_TOKENS, splitNotesParagraph } from '@modules/ai/tools/tools/get-notes.tool';
import { type ToolContext } from '@modules/ai/tools/types';

function ctxWith(query: Record<string, unknown>): ToolContext {
  return { chapter: null, db: { query } as never, node: 'chat-hub', projectId: 1n, retrieval: {} as never, runId: 'run-1' };
}

function hubTool(name: string) {
  const tool = new ToolRegistryService().getRaw('chat-hub').find(candidate => candidate.name === name);
  if (!tool) throw new Error(`${name} is not a chat-hub lookup`);
  return tool;
}

function notesCtx(statement: string | null): ToolContext {
  return ctxWith({ decisionLedgerEntries: { findFirst: async () => (statement === null ? undefined : { statement }) } });
}

// A token never spans less than a byte, so a UTF-8 length within a budget bounds the token count without tokenising the text.
function utf8Length(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

const NOTES = ['Mira keeps the lamp.', 'The tide court wants the harbour.', 'Mira’s mother drowned in the flood.'].join('\n\n');

describe('get_notes', () => {
  it('should be a chat-hub lookup only', () => {
    const registry = new ToolRegistryService();

    expect(registry.getRaw('chat-hub').map(tool => tool.name)).toContain('get_notes');
    expect(registry.getRaw('judge').map(tool => tool.name)).not.toContain('get_notes');
  });

  it('should return the author’s notes verbatim, numbered by paragraph', async () => {
    const result = await hubTool('get_notes').handler({}, notesCtx(NOTES));

    expect(result).toContain('(3 paragraphs)');
    expect(result).toContain('[¶1] Mira keeps the lamp.');
    expect(result).toContain('[¶3] Mira’s mother drowned in the flood.');
  });

  it('should keep only the paragraphs containing the query', async () => {
    const result = String(await hubTool('get_notes').handler({ query: 'MIRA' }, notesCtx(NOTES)));

    expect(result).toContain('[¶1]');
    expect(result).toContain('[¶3]');
    expect(result).not.toContain('[¶2]');
  });

  it('should page long notes and say where to continue', async () => {
    const long = Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}: ${'the harbour at night '.repeat(40)}`).join('\n\n');
    const result = String(await hubTool('get_notes').handler({ from: 2 }, notesCtx(long)));

    expect(result).toStartWith("The author's notes (40 paragraphs)");
    expect(result).toContain('[¶2] Paragraph 2:');
    expect(result).not.toContain('[¶1]');
    expect(result).toMatch(/more — continue with from: \d+\)$/);
  });

  it('should split an oversized paragraph into numbered parts that rejoin exactly, and resume inside it', async () => {
    const giant = Array.from({ length: 900 }, (_, index) => `word${index}`).join(' ');
    const notes = `Opening line.\n\n${giant}\n\nClosing line.`;
    const first = String(await hubTool('get_notes').handler({ from: 2 }, notesCtx(notes)));

    expect(first).toContain('[¶2.1] word0 word1');
    expect(splitNotesParagraph(giant).join('')).toBe(giant);

    const resumed = String(await hubTool('get_notes').handler({ from: 2, part: 2 }, notesCtx(notes)));
    expect(resumed).not.toContain('[¶2.1]');
    expect(resumed).toContain('[¶2.2]');
    expect(resumed).toContain('[¶3] Closing line.');
  });

  it('should page a 10k-character Chinese paragraph in parts within their budget, each page keeping its continue hint', async () => {
    const chinese = '灯塔守护者用记忆换取灯火，潮汐法庭想要夺走港口。'.repeat(420).slice(0, 10_000);
    const parts = splitNotesParagraph(chinese);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(chinese);
    for (const part of parts) expect(utf8Length(part)).toBeLessThanOrEqual(NOTES_PART_TOKENS);

    const page = String(await hubTool('get_notes').handler({}, notesCtx(chinese)));
    expect(page.length).toBeLessThan(4_500 * 4);
    expect(utf8Length(page)).toBeLessThanOrEqual(4_500);
    expect(page).toMatch(/continue with from: 1, part: \d+\)$/);
  });

  it('should cut a single word longer than a part by character', () => {
    const word = Array.from({ length: 3_000 }, (_, index) => 'lampharbourtide'[(index * 7) % 15]).join('');
    const parts = splitNotesParagraph(`short ${word} tail`);

    expect(parts.join('')).toBe(`short ${word} tail`);
    for (const part of parts) expect(utf8Length(part)).toBeLessThanOrEqual(NOTES_PART_TOKENS);
  });

  it('should split a 20k-character unspaced run without tokenising it whole', () => {
    const run = '潮'.repeat(20_000);
    const started = performance.now();
    const parts = splitNotesParagraph(run);

    expect(performance.now() - started).toBeLessThan(50);
    expect(parts.join('')).toBe(run);
  });

  it('should match the query against whole paragraphs and page within them', async () => {
    const long = `${Array.from({ length: 900 }, (_, index) => `word${index}`).join(' ')} lamp`;
    const result = String(await hubTool('get_notes').handler({ query: 'lamp' }, notesCtx(`Nothing here.\n\n${long}`)));

    expect(result).toContain('[¶2.1] word0');
    expect(result).not.toContain('[¶1]');
  });

  it('should say clearly when `from` is past the last paragraph', async () => {
    expect(await hubTool('get_notes').handler({ from: 9 }, notesCtx(NOTES))).toBe("The author's notes have 3 paragraphs; there is no paragraph 9.");
  });

  it('should say so when the author has stored no notes', async () => {
    expect(await hubTool('get_notes').handler({}, notesCtx(null))).toBe('The author has not stored any notes.');
  });
});

describe('get_canon_facts', () => {
  it('should return each fact’s truth and unlock, and name the keys it did not find', async () => {
    const fact = {
      factKey: 'keeper_bargain',
      text: 'The keeper trades a memory for every hour.',
      unlock: { all: [{ milestone: 'lamp_rank_3' }] },
      disclosedInChapter: null,
      plannedChapter: null,
      writerNote: 'She seems forgetful.',
      allowedClues: ['gaps in her stories'],
      terms: ['memory toll'],
    };
    const result = String(await hubTool('get_canon_facts').handler({ keys: ['keeper_bargain', 'missing'] }, ctxWith({ canonFacts: { findMany: async () => [fact] } })));

    expect(result).toContain('**keeper_bargain**: The keeper trades a memory for every hour.');
    expect(result).toContain('Unlocks: milestone lamp_rank_3 reached');
    expect(result).toContain('Cover note for the writer: She seems forgetful.');
    expect(result).toContain('Give-away terms: memory toll');
    expect(result).toContain('Allowed clues: gaps in her stories');
    expect(result).toContain('Not found: missing');
  });
});
