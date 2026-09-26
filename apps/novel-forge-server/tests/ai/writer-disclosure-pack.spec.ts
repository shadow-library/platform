import { describe, expect, it } from 'bun:test';

import { type AssembledPack } from '@modules/ai/context/sections';
import { loadWriterBrief } from '@modules/ai/context/writer-brief';
import { loadWriterDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';

import {
  CLUE,
  ENDING,
  FACT_MARKERS,
  KEY,
  PAGE_MARKERS,
  PAYLOAD,
  PLANNED_MARKERS,
  type Scenario,
  TERM,
  TIMELINE_LINE,
  TRUTH,
  V2_GOAL,
  V3_GOAL,
  writerAssembler,
  writerDb,
  writerTables,
} from './writer-disclosure-fixtures';

type Row = Record<string, unknown>;

interface WriterInputs {
  pack: AssembledPack;
  chapterBrief: string;
  endingContract: string;
  note: string;
}

const PLUGIN_POLICY = {
  writerClass: 'standard',
  contextSections: [{ key: 'plugin_notes', title: 'Harbour notes', rendered: PAYLOAD, segment: 'volatile', minWriterClass: 'standard' }],
};

async function writerInputs(scenario: Scenario): Promise<WriterInputs> {
  const db = writerDb(writerTables(scenario));
  const disclosure = await loadWriterDisclosurePolicy(db as never, 7n, 5);
  const pack = await writerAssembler(db).forChapter(7n, 5, { dryRun: true, disclosure, policy: PLUGIN_POLICY as never });
  const brief = (await db.query.briefs?.findFirst()) as Row;
  const { chapterBrief, endingContract } = await loadWriterBrief(db as never, 7n, 5, brief as never, disclosure);
  return { pack, chapterBrief, endingContract, note: disclosure.scrub(`[soft] brief: tighten the pier. ${PAYLOAD}`, 'note') };
}

const section = (pack: AssembledPack, key: string): string => pack.sections.find(candidate => candidate.key === key)?.rendered ?? '';

interface WriterFieldCase {
  name: string;
  read: (inputs: WriterInputs) => string;
  /** Copies authored canon, so the planner-only pages' lines are withheld from it as well. */
  copies: boolean;
  /** Carries the whole payload in both scenarios, so what the policy lets through can be checked. */
  payload: boolean;
}

const field = (name: string, read: WriterFieldCase['read'], copies = false, payload = true): WriterFieldCase => ({ name, read, copies, payload });

const WRITER_FIELDS: WriterFieldCase[] = [
  field('previous prose ending', ({ pack }) => section(pack, 'prev_ending')),
  field('continuation state', ({ pack }) => section(pack, 'continuation_state')),
  field('recent summaries', ({ pack }) => section(pack, 'memory')),
  field('current volume objective', ({ pack }) => section(pack, 'volume_objective'), false, false),
  field('known facts', ({ pack }) => section(pack, 'known_facts')),
  field("this chapter's reveals", ({ pack }) => section(pack, 'chapter_reveals')),
  field('hidden-fact writer notes', ({ pack }) => section(pack, 'hidden_constraints'), false, false),
  field('POV entity sheet', ({ pack }) => section(pack, 'ref:entity:keeper'), true),
  field('cited entity sheet and its alias', ({ pack }) => section(pack, 'ref:entity:apprentice'), true),
  field('character state', ({ pack }) => section(pack, 'character_state')),
  field('relationships', ({ pack }) => section(pack, 'relationships')),
  field('cited world facts', ({ pack }) => section(pack, 'ref:world_fact:lamps'), true),
  field('cited plot thread', ({ pack }) => section(pack, 'ref:thread:harbour_debt'), true),
  field('cited mystery', ({ pack }) => section(pack, 'ref:mystery:lamp_builder'), true),
  field('cited earlier chapter and its heading', ({ pack }) => section(pack, 'ref:chapter:4')),
  field('cited canon fact', ({ pack }) => section(pack, 'ref:fact:harbour_rule')),
  field('renamed page holding copied secrets', ({ pack }) => section(pack, 'ref:bible_doc:lore/harbour-notes'), true),
  field('plugin section', ({ pack }) => section(pack, 'plugin_notes'), true),
  field('writing style', ({ pack }) => section(pack, 'writing_style')),
  field('writer lines', ({ pack }) => section(pack, 'writer_lines')),
  field('chapter brief', ({ chapterBrief }) => chapterBrief),
  field('ending contract', ({ endingContract }) => endingContract, false, false),
  field('feedback, guidance and findings', ({ note }) => note),
];

describe('the writer disclosure policy across every writer-bound field', () => {
  it.each(WRITER_FIELDS.map(row => [row.name, row] as const))('should keep a locked secret, the ending and later volumes out of the %s', async (_, row) => {
    const text = row.read(await writerInputs('locked'));

    expect(text).not.toBe('');
    expect(text).toContain('[withheld]');
    for (const marker of [...FACT_MARKERS, ...PLANNED_MARKERS, V3_GOAL]) expect(text).not.toContain(marker);
    for (const marker of PAGE_MARKERS) {
      if (row.copies) expect(text).not.toContain(marker);
      else if (row.payload) expect(text).toContain(marker);
    }
  });

  it.each(WRITER_FIELDS.filter(row => row.payload).map(row => [row.name, row] as const))(
    'should hand over the unlocked secret, the ending on the ending chapter and the current volume, never a later one, in the %s',
    async (_, row) => {
      const text = row.read(await writerInputs('unlocked'));

      for (const marker of [...FACT_MARKERS, ...PLANNED_MARKERS]) expect(text).toContain(marker);
      expect(text).not.toContain(V3_GOAL);
      for (const marker of PAGE_MARKERS) expect(text.includes(marker)).toBe(!row.copies);
    },
  );

  it("should keep an opening timeline line the chapter's plan quotes, and withhold it from a page that copies it", async () => {
    const { pack, chapterBrief } = await writerInputs('locked');

    expect(chapterBrief).toContain(TIMELINE_LINE);
    expect(section(pack, 'ref:bible_doc:lore/harbour-notes')).not.toContain(TIMELINE_LINE);
  });

  it('should keep allowed clues in every field and list them for a locked secret only', async () => {
    const lockedInputs = await writerInputs('locked');
    const unlockedInputs = await writerInputs('unlocked');

    for (const row of WRITER_FIELDS.filter(candidate => candidate.payload)) expect(row.read(lockedInputs)).toContain(CLUE);
    expect(section(lockedInputs.pack, 'allowed_clues')).toContain(`- ${CLUE}`);
    expect(section(unlockedInputs.pack, 'allowed_clues')).toBe('');
  });

  it('should report refused refs as withheld, apart from the refs that are missing', async () => {
    const lockedPack = (await writerInputs('locked')).pack;
    const unlockedPack = (await writerInputs('unlocked')).pack;
    const refused = ['bible_doc:project/open-questions', 'bible_doc:project/timeline', 'bible_doc:story_state/volume-plan', 'chapter:7', 'thread:winter_debt', 'volume:v3'];

    expect(lockedPack.unresolvedRefs).toEqual(['entity:ghost']);
    expect([...(lockedPack.withheldRefs ?? [])].sort()).toEqual([...refused, 'volume:v2'].sort());
    expect([...(unlockedPack.withheldRefs ?? [])].sort()).toEqual(refused);
    expect(section(unlockedPack, 'ref:volume:v2')).toContain(V2_GOAL);
    expect(section(unlockedPack, 'volume_objective')).toContain(V2_GOAL);
    expect(section(lockedPack, 'ref:volume:v1')).toContain('[withheld]');
  });

  it('should drop an established fact carrying a locked give-away term from the continuation state', async () => {
    const state = section((await writerInputs('locked')).pack, 'continuation_state');

    expect(state).toContain('The pier is rotten.');
    expect(state).not.toContain('is paid');
  });
});

describe('the planner and chat contexts', () => {
  it('should resolve every reference unscrubbed when no chapter is being written', async () => {
    const refs = ['volume:v3', 'bible_doc:lore/harbour-notes', 'chapter:4', 'thread:winter_debt'];
    const { resolved, unresolved, withheld } = await writerAssembler(writerDb(writerTables('locked'))).resolveRefs(7n, refs);
    const text = resolved.map(ref => ref.rendered).join('\n');

    expect([unresolved, withheld]).toEqual([[], []]);
    for (const marker of [TRUTH, TERM, KEY, ENDING, V3_GOAL, TIMELINE_LINE]) expect(text).toContain(marker);
  });

  it('should give the chat hub the premise and pages as the author wrote them', async () => {
    const pack = await writerAssembler(writerDb(writerTables('locked'))).forChatTurn(7n, { scopeType: 'project', createdAt: new Date() } as never, {});

    expect(section(pack, 'premise')).toContain(TRUTH);
    expect(section(pack, 'premise')).toContain(ENDING);
    expect(section(pack, 'doc_inventory')).toContain('lore/harbour-notes');
  });
});
