/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect, type ForgeActor, test } from './forge-actors';
import { assertSpendGuarded, insertJob, listDispatchedModelCalls } from './forge-db';
import { createEntity, type Draft, errorCode, saveChapter, startNextChapter } from './forge-helpers';
import {
  approveAsRead,
  type ContextPreview,
  createGuardedProject,
  type EndingContract,
  insertEntities,
  insertFinalChapters,
  insertVolumes,
  insertWorldFacts,
  occurrences,
  previewContext,
  putFact,
  readBriefContracts,
  readContextPacks,
  readPreview,
  setBriefRefs,
  setBriefVolume,
  WITHHELD,
  writeBibleDoc,
  writeBrief,
  writeFact,
  writerPack,
  writerPrompt,
} from './forge-story';

/**
 * Defining types
 */

interface FactView {
  readonly allowedClues?: string[] | null;
  readonly terms?: string[] | null;
}

/**
 * Declaring the constants
 *
 * What each reader of the story model is handed, observed through the packs the server assembles without a model: the chapter writer's
 * pack (`/context/preview?purpose=generation`, a dry run, and `/drafts/:n/prompt`), the planner's outline pack, the chat pack, and the
 * packs a refused model call leaves behind. Every withholding is checked on the exact rendered text, beside a control where the same
 * text is allowed through, so an assertion never passes because the text was simply never there.
 */

const HEIR_KEY = 'heir_secret';

const HEIR_TEXT = 'Mira is the lost daughter of the drowned king Aldren.';

const HEIR_TERM = 'drowned king';

const HEIR_AUTHOR_NOTE = 'Author only: this protects the second volume twist about the throne.';

const HEIR_WRITER_NOTE = 'Mira reacts to royal ceremony with an unease she cannot name.';

const HEIR_CLUE = 'Her signet ring warms whenever she passes the harbour shrine.';

const MIRA_OWN_LINE = 'Mira grew up hauling rope on the river barges.';

const HEIR = { text: HEIR_TEXT, constraintNote: HEIR_AUTHOR_NOTE, writerNote: HEIR_WRITER_NOTE, terms: [HEIR_TERM] };

const QUIET_ENDING: EndingContract = {
  hookType: 'quiet_dread',
  emotionalBeat: 'A cold unease settles over the docks.',
  openQuestion: 'Who sent the letter?',
  handoffState: 'Mira holds the unopened letter at dawn.',
};

function section(pack: ContextPreview, heading: string): string {
  const start = pack.rendered.indexOf(heading);
  if (start === -1) return '';
  const end = pack.rendered.indexOf('\n\n---\n\n', start);
  return pack.rendered.slice(start, end === -1 ? undefined : end);
}

function sectionKeys(pack: ContextPreview): string[] {
  return pack.sections.map(entry => entry.key);
}

function expectNoTrace(pack: ContextPreview, what: string, ...needles: string[]): void {
  const lower = pack.rendered.toLowerCase();
  for (const needle of needles) expect(lower, `${what}: "${needle}" never reaches the pack`).not.toContain(needle.toLowerCase());
}

async function expectNoSpend(projectId: string): Promise<void> {
  expect(await listDispatchedModelCalls(projectId), 'no model call was dispatched').toEqual([]);
}

async function mira(owner: ForgeActor, projectId: string, body = `${MIRA_OWN_LINE}\n\n${HEIR_TEXT}`): Promise<void> {
  await createEntity(owner.ctx, projectId, { entityKey: 'mira', name: 'Mira', body, significance: 'major' });
}

async function writeChapterOne(ctx: APIRequestContext, projectId: string, body: string, summary: string): Promise<Draft> {
  return saveChapter(ctx, projectId, await startNextChapter(ctx, projectId), { title: 'The Ferry', body, summary });
}

test.describe('novel-forge chapter writer pack — secrets', () => {
  test("should give the writer a hidden fact's writer note once and never its truth, author note, key or give-away terms, and the truth only at its reveal", async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-hidden' });
    const projectId = await createGuardedProject(forge, owner, 'pack-hidden');
    const vault = { text: 'The vault opens only to the song of the eastern bells.', terms: ['eastern bells'], revealChapter: 5 };
    await mira(owner, projectId, `${MIRA_OWN_LINE}\n\n${HEIR_TEXT}\n\nShe hums a tune about the eastern bells at night.`);
    await writeFact(owner.ctx, projectId, HEIR_KEY, { ...HEIR, revealChapter: 3 });
    await writeFact(owner.ctx, projectId, 'vault_song', vault);
    await writeBrief(owner.ctx, projectId, 2, { body: 'Mira bargains for passage at the docks.', pov: 'mira', knowledgeContract: { pov: ['mira'], learns: [] } });
    await setBriefRefs(projectId, 2, [`fact:${HEIR_KEY}`, 'fact:vault_song']);

    const early = await writerPack(owner.ctx, projectId, 2);
    expect(occurrences(early.rendered, HEIR_WRITER_NOTE), 'the writer note is given exactly once, even though the plan also cites the fact').toBe(1);
    expect(section(early, '## BEHAVIORAL CONSTRAINTS')).toContain(`- ${HEIR_WRITER_NOTE}`);
    expectNoTrace(early, 'a hidden fact', HEIR_TEXT, HEIR_AUTHOR_NOTE, HEIR_KEY, HEIR_TERM);
    expectNoTrace(early, 'a hidden fact without a writer note', vault.text, 'vault_song', 'eastern bells');
    expect(sectionKeys(early), 'a hidden fact with no writer note is not even cited').not.toContain('ref:fact:vault_song');
    const earlyCard = section(early, '## POV CHARACTER: Mira');
    expect(earlyCard, "the POV sheet keeps the author's own lines").toContain(MIRA_OWN_LINE);
    expect(earlyCard, 'and loses the copied secret and give-away term').toContain(WITHHELD);
    expect(await writerPrompt(owner.ctx, projectId, 2), 'the prompt route renders the same pack').toBe(early.rendered);

    const ahead = await mutate(owner.ctx, 'put', `/api/v1/projects/${projectId}/briefs/2`, {
      data: { body: 'Mira learns the truth too soon.', knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: HEIR_KEY }] } },
    });
    expect(ahead.status(), `a plan may not reveal a fact before its chapter — body ${await ahead.text()}`).toBe(400);
    expect(await errorCode(ahead)).toBe('PLN_001');
    expect(await readBriefContracts(projectId, 2), 'the refused plan write left the plan as it was').toMatchObject({ knowledgeContract: { pov: ['mira'], learns: [] } });

    await writeBrief(owner.ctx, projectId, 3, {
      body: 'Mira finds the royal seal.',
      pov: 'mira',
      knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: HEIR_KEY }] },
    });
    const reveal = await writerPack(owner.ctx, projectId, 3);
    expect(section(reveal, '## REVEALED THIS CHAPTER'), 'the reveal chapter states the truth').toContain(`- [${HEIR_KEY}] ${HEIR_TEXT}`);
    expect(section(reveal, '## POV CHARACTER: Mira'), 'and stops withholding its copies').toContain(HEIR_TEXT);
    expect(reveal.rendered, 'the writer note gives way to the truth').not.toContain(HEIR_WRITER_NOTE);
    expectNoTrace(reveal, 'the author-only note, even at the reveal', HEIR_AUTHOR_NOTE);
    expectNoTrace(reveal, 'a fact still ahead of its reveal', vault.text, 'eastern bells');

    await writeBrief(owner.ctx, projectId, 5, { body: 'Mira sings at the vault door.', pov: 'mira' });
    await setBriefRefs(projectId, 5, ['fact:vault_song']);
    const opened = await writerPack(owner.ctx, projectId, 5);
    expect(section(opened, '## CANON FACT: vault_song'), 'once its chapter comes, the fact without a writer note is cited in full').toContain(vault.text);
    expect(section(opened, '## POV CHARACTER: Mira'), 'and its give-away term is no longer cut').toContain('She hums a tune about the eastern bells at night.');
    await expectNoSpend(projectId);
  });

  test("should keep a character's private reveal from unlocking a fact ahead of its schedule, and unlock an undated fact once an approved plan reveals it", async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-schedule' });
    const projectId = await createGuardedProject(forge, owner, 'pack-schedule');
    const tower = 'The northern tower will collapse during the winter solstice.';
    const oath = 'Kel swore the river oath to protect the ferry children.';
    await mira(owner, projectId, MIRA_OWN_LINE);
    await writeFact(owner.ctx, projectId, 'tower_fall', { text: tower, revealChapter: 4 });
    await writeFact(owner.ctx, projectId, 'river_oath', { text: oath, revealChapter: null, unlock: { all: [{ chapter: 1 }] } });
    const revealed = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/facts/tower_fall/reveal`, { data: { entityKey: 'mira', chapter: 1 } });
    expect(revealed.status(), await revealed.text()).toBe(200);

    await writeBrief(owner.ctx, projectId, 1, {
      body: 'Kel makes a promise at the ferry.',
      pov: 'mira',
      knowledgeContract: { pov: ['mira'], learns: [{ entityKey: 'mira', factKey: 'river_oath' }] },
    });
    await writeBrief(owner.ctx, projectId, 2, { body: 'Mira crosses the river.' });
    await setBriefRefs(projectId, 2, ['fact:river_oath', 'fact:tower_fall']);
    const chapterOne = await writeChapterOne(owner.ctx, projectId, `The ferry groaned against the pier.\n\n${oath} ${tower}`, `${oath} ${tower}`);

    const before = await writerPack(owner.ctx, projectId, 2);
    expectNoTrace(before, 'an undated fact no approved plan has revealed', oath, 'river_oath');
    expectNoTrace(before, 'a fact a character learned privately, ahead of its schedule', tower, 'tower_fall');
    expect(section(before, '## PREVIOUS CHAPTER ENDING'), "the previous chapter's prose still reaches the writer, scrubbed").toContain('The ferry groaned against the pier.');

    await approveAsRead(owner.ctx, projectId, chapterOne);

    const after = await writerPack(owner.ctx, projectId, 2);
    expect(section(after, '## PREVIOUS CHAPTER ENDING'), 'the approved plan revealed the oath on the page').toContain(oath);
    expect(section(after, '## CANON FACT: river_oath'), 'so the next plan may cite it').toContain(`**river_oath**: ${oath}`);
    expectNoTrace(after, 'the private reveal still unlocks nothing', tower, 'tower_fall');

    const scheduled = await writerPack(owner.ctx, projectId, 4);
    expect(section(scheduled, '## RECENT SUMMARIES'), 'once its chapter comes, the scheduled fact is open to the writer').toContain(tower);
    await expectNoSpend(projectId);
  });

  test("should keep a scheduled fact from a point-of-view cast that never learned it, and re-hide a known fact the plan's ending must not resolve", async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-contract' });
    const projectId = await createGuardedProject(forge, owner, 'pack-contract');
    await mira(owner, projectId, MIRA_OWN_LINE);
    await createEntity(owner.ctx, projectId, { entityKey: 'kel', name: 'Kel', body: 'Kel ferries passengers for coin.' });
    await writeFact(owner.ctx, projectId, HEIR_KEY, { ...HEIR, revealChapter: 2 });
    const revealed = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/facts/${HEIR_KEY}/reveal`, { data: { entityKey: 'mira', chapter: 1 } });
    expect(revealed.status(), await revealed.text()).toBe(200);

    await writeBrief(owner.ctx, projectId, 3, { body: 'Kel waits at the pier.', pov: 'kel', knowledgeContract: { pov: ['kel'], learns: [] } });
    await writeBrief(owner.ctx, projectId, 4, { body: 'Kel waits at the pier again.', pov: 'kel' });
    await setBriefRefs(projectId, 3, [`fact:${HEIR_KEY}`]);
    await setBriefRefs(projectId, 4, [`fact:${HEIR_KEY}`]);
    await writeBrief(owner.ctx, projectId, 5, { body: 'Mira remembers.', pov: 'mira', knowledgeContract: { pov: ['mira'], learns: [] } });
    await writeBrief(owner.ctx, projectId, 6, {
      body: 'Mira keeps her silence.',
      pov: 'mira',
      knowledgeContract: { pov: ['mira'], learns: [] },
      endingContract: { ...QUIET_ENDING, mustNotResolve: [`fact:${HEIR_KEY}`] },
    });

    const unlearned = await writerPack(owner.ctx, projectId, 3);
    expectNoTrace(unlearned, 'a fact past its reveal chapter that the POV cast never learned', HEIR_TEXT, HEIR_KEY, HEIR_TERM);
    expect(section(unlearned, '## BEHAVIORAL CONSTRAINTS')).toContain(HEIR_WRITER_NOTE);
    const uncontracted = await writerPack(owner.ctx, projectId, 4);
    expect(section(uncontracted, `## CANON FACT: ${HEIR_KEY}`), 'without a contract the schedule alone opens it').toContain(HEIR_TEXT);

    const known = await writerPack(owner.ctx, projectId, 5);
    expect(section(known, '## KNOWN FACTS (POV CAST)'), 'Mira learned it in chapter 1').toContain(`- [${HEIR_KEY}] ${HEIR_TEXT}`);
    const unresolved = await writerPack(owner.ctx, projectId, 6);
    expectNoTrace(unresolved, 'a known fact the ending must not resolve', HEIR_TEXT, HEIR_KEY);
    expect(section(unresolved, '## KNOWN FACTS (POV CAST)')).toContain(WITHHELD);

    const stored = await owner.ctx.get(`/api/v1/projects/${projectId}/briefs/6`);
    expect(stored.status(), await stored.text()).toBe(200);
    expect(await stored.json(), 'the ending contract reads back as written').toMatchObject({ endingContract: { ...QUIET_ENDING, mustNotResolve: [`fact:${HEIR_KEY}`] } });
    expect(await readBriefContracts(projectId, 6), 'and the knowledge contract is stored as written').toEqual({
      knowledgeContract: { pov: ['mira'], learns: [] },
      endingContract: { ...QUIET_ENDING, mustNotResolve: [`fact:${HEIR_KEY}`] },
    });
    await expectNoSpend(projectId);
  });

  test('should pass allowed clues to the writer unscrubbed while their fact is locked, and refuse a clue that names a give-away term', async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-clues' });
    const projectId = await createGuardedProject(forge, owner, 'pack-clues');
    await writeFact(owner.ctx, projectId, HEIR_KEY, { ...HEIR, revealChapter: 5, allowedClues: [HEIR_CLUE] });

    const namingClue = await putFact(owner.ctx, projectId, HEIR_KEY, { text: HEIR_TEXT, allowedClues: [HEIR_CLUE, `She dreams of the ${HEIR_TERM} each night.`] });
    expect(namingClue.status(), await namingClue.text()).toBe(400);
    expect(await errorCode(namingClue)).toBe('FCT_006');
    const namingTerm = await putFact(owner.ctx, projectId, HEIR_KEY, { text: HEIR_TEXT, terms: [HEIR_TERM, 'signet ring'] });
    expect(namingTerm.status(), 'a new give-away term an existing clue names is refused too').toBe(400);
    expect(await errorCode(namingTerm)).toBe('FCT_006');
    const unchanged = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/facts/${HEIR_KEY}`)).json()) as FactView;
    expect(unchanged, 'a refused write changes nothing').toMatchObject({ allowedClues: [HEIR_CLUE], terms: [HEIR_TERM] });

    for (const chapter of [2, 5]) {
      await writeBrief(owner.ctx, projectId, chapter, { body: `Mira at the harbour shrine, chapter ${chapter}.` });
      await setBriefRefs(projectId, chapter, [`fact:${HEIR_KEY}`]);
    }
    const locked = await writerPack(owner.ctx, projectId, 2);
    expect(section(locked, '## ALLOWED CLUES'), 'the clue reaches the writer as written').toContain(`- ${HEIR_CLUE}`);
    expectNoTrace(locked, 'the locked fact behind the clue', HEIR_TEXT, HEIR_TERM);

    const legacyClue = `The ${HEIR_TERM} haunts her dreams.`;
    await novelForgeDb()`
      UPDATE canon_facts SET allowed_clues = ${novelForgeDb().json([HEIR_CLUE, legacyClue] as never)} WHERE project_id = ${projectId} AND fact_key = ${HEIR_KEY}
    `;
    const legacy = await writerPack(owner.ctx, projectId, 2);
    expect(section(legacy, '## ALLOWED CLUES'), 'a clue stored before the rule still reaches the writer when clean').toContain(`- ${HEIR_CLUE}`);
    expectNoTrace(legacy, 'a stored clue that names a give-away term is dropped', legacyClue, HEIR_TERM);

    const open = await writerPack(owner.ctx, projectId, 5);
    expect(sectionKeys(open), 'an unlocked fact needs no clues').not.toContain('allowed_clues');
    expect(section(open, `## CANON FACT: ${HEIR_KEY}`), 'the plan that cites it now reads the truth').toContain(HEIR_TEXT);
    await expectNoSpend(projectId);
  });
});

test.describe('novel-forge chapter writer pack — the ending, planner pages and volumes', () => {
  test('should keep the ending, planner-only pages and later volumes out of the writer pack until the chapter may read them', async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-ending' });
    const projectId = await createGuardedProject(forge, owner, 'pack-ending');
    const ending = 'In the end the tower falls and Mira rules the harbour alone.';
    const endingQuestion = 'Will Mira choose the crown over her own brother?';
    const timeline = 'Year nine brings the burning of the archive by the regent.';
    const openQuestion = 'Does the regent know where the second seal is hidden?';
    const laterGoal = 'Mira must win the council vote in the capital.';
    const laterNotes = 'Volume two notes: the council scenes run long and cold.';
    const cityLine = 'The harbour city smells of tar and wet rope.';
    const patched = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { ending, endingQuestion } });
    expect(patched.status(), await patched.text()).toBe(200);
    await assertSpendGuarded(projectId);

    await insertVolumes(projectId, [
      { volumeKey: 'v1', ordinal: 1, title: 'The Harbour', objective: 'Mira escapes the harbour debts.', state: 'active' },
      { volumeKey: 'v2', ordinal: 2, title: 'The Capital', objective: laterGoal, body: laterNotes },
    ]);
    await writeBibleDoc(owner.ctx, projectId, 'project', 'timeline', timeline);
    await writeBibleDoc(owner.ctx, projectId, 'project', 'open-questions', openQuestion);
    await writeBibleDoc(owner.ctx, projectId, 'world', 'setting', `${cityLine}\n\n${ending}\n\n${endingQuestion}\n\n${timeline}`);
    await mira(owner, projectId, `${MIRA_OWN_LINE}\n\n${laterGoal}\n\n${laterNotes}\n\n${openQuestion}`);
    const refs = ['bible_doc:world/setting', 'bible_doc:project/timeline', 'bible_doc:project/open-questions', 'volume:v2'];
    await writeBrief(owner.ctx, projectId, 2, { body: 'Mira bargains at the docks.', pov: 'mira' });
    await writeBrief(owner.ctx, projectId, 3, { body: 'The last night in the capital.', pov: 'mira', isEnding: true });
    for (const [chapter, volumeKey] of [
      [2, 'v1'],
      [3, 'v2'],
    ] as const) {
      await setBriefVolume(projectId, chapter, volumeKey);
      await setBriefRefs(projectId, chapter, refs);
    }

    const early = await writerPack(owner.ctx, projectId, 2);
    expect(section(early, '## VOLUME OBJECTIVE')).toContain('Mira escapes the harbour debts.');
    expect(section(early, '## BIBLE: world/setting'), 'the cited page reaches the writer').toContain(cityLine);
    expectNoTrace(early, 'the ending before the chapter planned as the ending', ending, endingQuestion);
    expectNoTrace(early, 'a later volume', laterGoal, laterNotes);
    expectNoTrace(early, 'the planner-only pages', timeline, openQuestion);
    expect(sectionKeys(early), 'a later volume and the planner-only pages never resolve for the writer').not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^ref:(volume:v2|bible_doc:project\/)/)]),
    );
    expect(early.unresolvedRefs, 'they are withheld, not reported missing').toEqual([]);

    const last = await writerPack(owner.ctx, projectId, 3);
    expect(section(last, '## BIBLE: world/setting'), 'the ending chapter reads the ending').toContain(ending);
    expect(section(last, '## BIBLE: world/setting')).toContain(endingQuestion);
    expect(section(last, '## VOLUME OBJECTIVE'), 'and its own volume is no longer a later one').toContain(laterGoal);
    expect(section(last, '## POV CHARACTER: Mira')).toContain(laterGoal);
    expect(section(last, '## POV CHARACTER: Mira'), 'and reads its notes where they were copied').toContain(laterNotes);
    expectNoTrace(last, 'the planner-only pages, even at the ending', timeline, openQuestion);
    expect(sectionKeys(last)).not.toEqual(expect.arrayContaining([expect.stringMatching(/^ref:bible_doc:project\//)]));
    await expectNoSpend(projectId);
  });
});

test.describe('novel-forge chat and planning packs', () => {
  test('should serve a chat pack whose stable index holds across reads and moves only in its volatile tail, and grade the premise and audit inventories', async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-chat' });
    const projectId = await createGuardedProject(forge, owner, 'pack-chat');
    const ending = 'Mira burns the ledger and walks into the sea.';
    const patched = await mutate(owner.ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { ending } });
    expect(patched.status(), await patched.text()).toBe(200);
    const pageLines = ['The harbour city smells of tar.', 'Second line of the setting page.', 'Third line.', 'Fourth line.', 'Fifth line.', 'Sixth line of the page.'];
    await writeBibleDoc(owner.ctx, projectId, 'world', 'setting', pageLines.join('\n'));
    await mira(owner, projectId);
    await writeFact(owner.ctx, projectId, HEIR_KEY, { ...HEIR, revealChapter: 3 });

    const first = await previewContext(owner.ctx, projectId, 'chat', { scopeType: 'project' });
    const second = await previewContext(owner.ctx, projectId, 'chat', { scopeType: 'project' });
    expect(second.renderedStable, 'the cached prefix is byte-identical while canon is unchanged').toBe(first.renderedStable);
    expect(first.rendered.startsWith(first.renderedStable), 'and leads the rendered pack').toBe(true);
    const order = ['## THE STORY', "## THE NOTEBOOK (THE AUTHOR'S DECISIONS)", '## STORY BIBLE INVENTORY'].map(heading => first.renderedStable.indexOf(heading));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(
      [...order].sort((left, right) => left - right),
      'in a fixed section order',
    ).toEqual(order);
    const inventory = section(first, '## STORY BIBLE INVENTORY');
    expect(inventory).toContain('mira — Mira (character, major)');
    expect(inventory).toContain('world/setting');
    expect(inventory).toContain(`${HEIR_KEY} (secret)`);
    for (const body of [MIRA_OWN_LINE, pageLines[0] as string, HEIR_TEXT]) expect(first.renderedStable, 'the stable segment is an index, never bodies').not.toContain(body);
    expect(section(first, '## THE STORY'), 'the chat, which plans with the author, reads the ending').toContain(ending);

    // A pending backfill only ever runs embedding indexing (local Ollama, never a paid model) and is cascaded away with the project.
    await insertJob({ projectId, kind: 'backfill', target: 'e2e' });
    const moved = await previewContext(owner.ctx, projectId, 'chat', { scopeType: 'project' });
    expect(moved.renderedStable, 'queued work leaves the stable prefix alone').toBe(first.renderedStable);
    expect(moved.renderedVolatile).not.toBe(first.renderedVolatile);
    expect(moved.renderedVolatile).toContain('Jobs running or queued: 1');

    const bare = await readPreview(owner.ctx, projectId, 'chat');
    expect(bare.status(), await bare.text()).toBe(400);
    expect(await errorCode(bare)).toBe('CHT_003');
    expect((await readPreview(owner.ctx, projectId, 'chat', { scopeType: 'ideation' })).status(), 'a retired scope is not a scope').toBe(422);

    const premise = await previewContext(owner.ctx, projectId, 'premise');
    const audit = await previewContext(owner.ctx, projectId, 'audit');
    expect(section(premise, '## BIBLE DOCUMENT INVENTORY'), 'the premise pack grades a page down to its opening line').toContain(pageLines[0]);
    expect(premise.rendered).not.toContain(pageLines[1]);
    expect(section(audit, '## BIBLE DOCUMENT INVENTORY'), 'the audit pack reads further into it').toContain(pageLines[1]);
    await expectNoSpend(projectId);
  });

  test("should give the planner a capped, ordered catalog with every secret's standing, and keep that catalog out of the writer pack", async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-catalog' });
    const projectId = await createGuardedProject(forge, owner, 'pack-catalog');
    await insertFinalChapters(
      projectId,
      Array.from({ length: 52 }, (_, index) => ({
        number: index + 1,
        title: index + 1 === 50 ? 'The Walled Chapter' : `Crossing ${index + 1}`,
        isolated: index + 1 === 50,
        summary: `Summary ${index + 1}.`,
      })),
    );
    const minors = Array.from({ length: 151 }, (_, index) => ({ entityKey: `minor_${String(index).padStart(3, '0')}`, name: `Minor ${index}`, significance: 'minor' as const }));
    await insertEntities(projectId, [...minors, { entityKey: 'zz_major', name: 'The Regent', significance: 'major', body: 'The Regent rules the capital.' }]);
    await writeFact(owner.ctx, projectId, 'fact_revealed', { text: 'The ferry is haunted by the old captain.', revealChapter: 60 });
    await writeFact(owner.ctx, projectId, 'fact_undated', { text: 'The regent poisoned the old king.' });
    await writeFact(owner.ctx, projectId, 'fact_scheduled', { text: 'The second seal lies beneath the lighthouse.', revealChapter: 60 });
    const ledgered = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/facts/fact_revealed/reveal`, { data: { entityKey: 'zz_major', chapter: 10 } });
    expect(ledgered.status(), await ledgered.text()).toBe(200);
    await writeBibleDoc(owner.ctx, projectId, 'world', 'setting', 'The harbour city smells of tar.');
    await writeBibleDoc(owner.ctx, projectId, 'plot', 'escalation', 'The debts grow until the regent calls them in.');
    await writeBibleDoc(owner.ctx, projectId, 'project', 'timeline', 'Year nine brings the burning of the archive.');

    const outline = await previewContext(owner.ctx, projectId, 'outline', { chapter: 53 });
    const catalog = section(outline, '## CANON CATALOG');
    expect(catalog, 'the planner reads the catalog').toContain('CHAPTERS:');
    expect(catalog, 'only the latest fifty chapters, the rest counted').toContain('(+2 earlier chapters omitted)');
    expect(catalog).toContain('3 — Crossing 3');
    expect(catalog).not.toContain('\n1 — Crossing 1');
    expect(catalog, 'an isolated chapter is tagged, its title walled off').toContain('50 — Chapter 50 [unrestricted]');
    expect(catalog).not.toContain('The Walled Chapter');

    expect(catalog, 'the cast is capped, the major entity kept over minor ones').toContain('zz_major — character: The Regent rules the capital.');
    expect(catalog).toContain('(+2 minor entities omitted)');
    expect(catalog).toContain('minor_148');
    expect(catalog).not.toContain('minor_149');
    expect(catalog.indexOf('zz_major'), 'major entities lead').toBeLessThan(catalog.indexOf('minor_000'));

    const facts = [
      'fact_scheduled: The second seal lies beneath the lighthouse. (unrevealed; scheduled ch 60)',
      'fact_undated: The regent poisoned the old king. (unrevealed)',
      'fact_revealed: The ferry is haunted by the old captain. (revealed)',
    ];
    for (const line of facts) expect(catalog, 'every secret carries its standing, revealed only by a ledger row').toContain(line);
    expect(
      facts.map(line => catalog.indexOf(line)),
      'scheduled, then unscheduled, then revealed',
    ).toEqual([...facts.map(line => catalog.indexOf(line))].sort((left, right) => left - right));

    expect(catalog.indexOf('plot/escalation'), 'plot pages list before world pages').toBeLessThan(catalog.indexOf('world/setting'));
    expect(catalog, 'a planner-only page is not citable').not.toContain('project/timeline');

    const writer = await writerPack(owner.ctx, projectId, 53);
    expect(sectionKeys(writer), 'the writer never reads the catalog').not.toContain('catalog');
    expectNoTrace(writer, 'secrets the catalog lists in full', 'The second seal lies beneath the lighthouse.', 'The regent poisoned the old king.');
    await expectNoSpend(projectId);
  });

  test('should render the same catalog whatever order its rows were written in', async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-order' });
    const entities = ['alder', 'birch', 'cedar', 'damson'].map((key, index) => ({
      entityKey: key,
      name: key.toUpperCase(),
      significance: index % 2 === 0 ? ('major' as const) : ('minor' as const),
    }));
    const facts = [
      { key: 'fact_one', body: { text: 'The first secret of the harbour.', revealChapter: 9 } },
      { key: 'fact_two', body: { text: 'The second secret of the harbour.' } },
      { key: 'fact_three', body: { text: 'The third secret of the harbour.', revealChapter: 7 } },
    ];
    const catalogs: string[] = [];
    for (const reversed of [false, true]) {
      const projectId = await createGuardedProject(forge, owner, `pack-order-${reversed ? 'reverse' : 'forward'}`);
      for (const entity of reversed ? [...entities].reverse() : entities) await insertEntities(projectId, [entity]);
      for (const fact of reversed ? [...facts].reverse() : facts) await writeFact(owner.ctx, projectId, fact.key, fact.body);
      catalogs.push(section(await previewContext(owner.ctx, projectId, 'outline', { chapter: 1 }), '## CANON CATALOG'));
      await expectNoSpend(projectId);
    }
    expect(catalogs[0]).toContain('ENTITIES:');
    expect(catalogs[1], 'row order never moves the cached catalog').toBe(catalogs[0]);
  });
});

test.describe('novel-forge packs behind a refused model call', () => {
  test('should build a validation window pack that lists world facts by key only, before the model is refused', async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-validation' });
    const projectId = await createGuardedProject(forge, owner, 'pack-validation');
    const rule = 'Every spell costs one drop of the caster blood.';
    await insertFinalChapters(projectId, [
      { number: 1, summary: 'Mira reaches the harbour.' },
      { number: 2, summary: 'Mira signs the debt.' },
    ]);
    await insertWorldFacts(projectId, [
      { category: 'magic', key: 'blood_price', value: rule },
      { category: 'magic', key: 'iron_ward', value: 'Iron wards break every enchantment they touch.' },
    ]);

    await assertSpendGuarded(projectId);
    const run = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/validate`, { data: {} });
    expect(run.status(), await run.text()).toBe(200);

    const packs = (await readContextPacks(projectId)).filter(pack => pack.purpose === 'validation');
    expect(packs, 'the window pack was assembled before the model call was refused').toHaveLength(1);
    const rendered = packs[0]?.rendered ?? '';
    expect(rendered).toContain('## WORLD FACTS');
    expect(rendered).toContain('magic: blood_price | iron_ward');
    expect(rendered, 'never the values').not.toContain(rule);
    expect(rendered).toContain('Ch 2: Mira signs the debt.');
    await expectNoSpend(projectId);
  });

  test('should hand a revision the same spoiler-gated pack as the writer, even when the revision itself is refused', async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-revise' });
    const projectId = await createGuardedProject(forge, owner, 'pack-revise');
    await mira(owner, projectId);
    await writeFact(owner.ctx, projectId, HEIR_KEY, { ...HEIR, revealChapter: 4 });
    await writeBrief(owner.ctx, projectId, 1, { body: 'Mira reaches the harbour.', pov: 'mira', knowledgeContract: { pov: ['mira'], learns: [] } });
    const draft = await writeChapterOne(owner.ctx, projectId, 'Mira stepped off the barge into the rain.', 'Mira arrives.');

    await assertSpendGuarded(projectId);
    const revise = await mutate(owner.ctx, 'post', `/api/v1/projects/${projectId}/drafts/1/revise`, { data: { note: `Make it clear that ${HEIR_TEXT}` } });
    expect(revise.status(), `the quota pin refuses the revision call — body ${await revise.text()}`).toBe(429);
    expect(await errorCode(revise)).toBe('AI_008');
    const untouched = (await (await owner.ctx.get(`/api/v1/projects/${projectId}/drafts/1`)).json()) as Draft;
    expect(untouched).toMatchObject({ revision: draft.revision, body: draft.body });

    const packs = (await readContextPacks(projectId)).filter(pack => pack.purpose === 'generation' && pack.chapter === 1);
    expect(packs, 'the revision assembled its pack before the call').toHaveLength(1);
    const rendered = packs[0]?.rendered ?? '';
    expect(occurrences(rendered, HEIR_WRITER_NOTE)).toBe(1);
    for (const needle of [HEIR_TEXT, HEIR_AUTHOR_NOTE, HEIR_KEY, HEIR_TERM])
      expect(rendered.toLowerCase(), `the revision pack withholds "${needle}"`).not.toContain(needle.toLowerCase());
    expect(await writerPrompt(owner.ctx, projectId, 1), "it is the drafting writer's pack, byte for byte").toBe(rendered);
    await expectNoSpend(projectId);
  });

  test('should persist a writer pack at most once per distinct content and never for a dry-run preview', async ({ forge }) => {
    const owner = await forge.actor({ label: 'pack-cache' });
    const projectId = await createGuardedProject(forge, owner, 'pack-cache');
    await mira(owner, projectId, MIRA_OWN_LINE);
    await writeBrief(owner.ctx, projectId, 1, { body: 'Mira reaches the harbour.', pov: 'mira' });

    for (let read = 0; read < 3; read++) await writerPack(owner.ctx, projectId, 1);
    expect(await readContextPacks(projectId), 'a preview is a dry run').toEqual([]);

    const prompts = new Set<string>();
    for (let read = 0; read < 3; read++) prompts.add(await writerPrompt(owner.ctx, projectId, 1));
    expect(prompts.size).toBe(1);
    expect((await readContextPacks(projectId)).length, 'repeated reads of an unchanged pack never add rows').toBeLessThanOrEqual(1);

    await createEntity(owner.ctx, projectId, { entityKey: 'kel', name: 'Kel', body: 'Kel ferries passengers for coin.' });
    await writeBrief(owner.ctx, projectId, 1, { body: 'Mira reaches the harbour with Kel.', pov: 'mira', knowledgeContract: { pov: ['mira', 'kel'], learns: [] } });
    const changed = await writerPrompt(owner.ctx, projectId, 1);
    expect(changed, 'a canon change is a new pack').not.toBe([...prompts][0]);
    const packs = await readContextPacks(projectId);
    expect(packs.length).toBeLessThanOrEqual(2);
    expect(new Set(packs.map(pack => pack.rendered)).size, 'each stored pack is distinct').toBe(packs.length);
    await expectNoSpend(projectId);
  });
});
