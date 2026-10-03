import { describe, expect, it } from 'bun:test';

import { buildChatRefinePrompt } from '@modules/ai/prompts';
import {
  isNotesOrganiseRequest,
  laterPlanIssues,
  ORGANISE_ROUTED_NOTE,
  PLANS_WITHHELD_NOTE,
  withLaterPlansRouted,
  writesPlansOnWriterPage,
} from '@modules/refinement/later-plans-guard';

const NOTES_OPENER =
  'Here are my notes for the story. Organise them into my Story Bible as the world stands when the story opens, and keep anything that happens later as my plans.';
const plansPage = { op: 'bible_document.upsert', section: 'plot', slug: 'default', frontmatter: { title: 'Plans' }, body: '## The Café Treaty\n\nThey meet at noon.' };
const openingPage = { op: 'bible_document.upsert', section: 'world', slug: 'default', frontmatter: { title: 'The World at Story Open' }, body: '## The evening\n\nA call.' };
const organise = { op: 'action.organise_notes' };

describe('isNotesOrganiseRequest', () => {
  it('should recognise the new-novel opener and the opener chip, in either spelling', () => {
    expect(isNotesOrganiseRequest(NOTES_OPENER)).toBe(true);
    expect(isNotesOrganiseRequest('Organise my notes')).toBe(true);
    expect(isNotesOrganiseRequest('  organize my notes, please')).toBe(true);
  });

  it('should leave any other message alone, one that only mentions the notes included', () => {
    expect(isNotesOrganiseRequest('Give me a few ideas for chapter 1, from where the story stands.')).toBe(false);
    expect(isNotesOrganiseRequest('Do not organise my notes yet.')).toBe(false);
  });
});

describe('writesPlansOnWriterPage', () => {
  it('should catch a page titled as plans on a page the chapter writer reads, by title, heading or slug', () => {
    expect(writesPlansOnWriterPage(plansPage)).toBe(true);
    expect(writesPlansOnWriterPage({ ...plansPage, frontmatter: undefined, body: '# Future events\n\nThey marry.' })).toBe(true);
    expect(writesPlansOnWriterPage({ op: 'bible_document.upsert', section: 'plot', slug: 'later-plans', body: 'x' })).toBe(true);
    expect(writesPlansOnWriterPage({ ...plansPage, frontmatter: { title: 'What happens next' } })).toBe(true);
  });

  it('should let plans onto the planner-only timeline and the writer-excluded escalation map', () => {
    expect(writesPlansOnWriterPage({ ...plansPage, section: 'project', slug: 'timeline' })).toBe(false);
    expect(writesPlansOnWriterPage({ ...plansPage, section: 'plot', slug: 'escalation-map' })).toBe(false);
  });

  it('should leave world pages whose titles only contain a plan word, and every other op', () => {
    expect(writesPlansOnWriterPage(openingPage)).toBe(false);
    expect(writesPlansOnWriterPage({ ...openingPage, frontmatter: { title: 'Battle plans of the north' } })).toBe(false);
    expect(writesPlansOnWriterPage({ ...openingPage, frontmatter: { title: 'The future city' } })).toBe(false);
    expect(writesPlansOnWriterPage({ op: 'bible_document.remove', section: 'plot', slug: 'plans' })).toBe(false);
    expect(writesPlansOnWriterPage({ op: 'entity.upsert', entityKey: 'plans', type: 'concept' })).toBe(false);
  });
});

describe('laterPlanIssues', () => {
  it('should ask a notes organise request for the organise action alone', () => {
    expect(laterPlanIssues([openingPage, plansPage], true)).toEqual([expect.stringContaining('{"op":"action.organise_notes"}')]);
    expect(laterPlanIssues(undefined, true)).toHaveLength(1);
    expect(laterPlanIssues([organise], true)).toEqual([]);
  });

  it('should send a plans page to the timeline under its later bands, and pass the opening state', () => {
    const issues = laterPlanIssues([openingPage, plansPage], false);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toStartWith('changeSet[1]: plot/default holds plans for later');
    expect(issues[0]).toContain('bible_document.upsert project/timeline');
    expect(issues[0]).toContain('"## Early on", "## Later", "## The ending", "## Not yet placed"');
  });
});

describe('withLaterPlansRouted', () => {
  it('should stage the organise action alone for a notes organise request, and say why', () => {
    const routed = withLaterPlansRouted({ reply: 'Organised.', changeSet: [openingPage, plansPage] }, true);

    expect(routed.changeSet).toEqual([organise]);
    expect(routed.reply).toBe(`Organised.\n\n${ORGANISE_ROUTED_NOTE}`);
  });

  it('should add the organise action to a reply that proposed nothing, and leave one that proposed it alone', () => {
    const bare: { reply: string; changeSet?: Record<string, unknown>[] } = { reply: 'Sure.' };
    expect(withLaterPlansRouted(bare, true).changeSet).toEqual([organise]);
    const proposed = { reply: 'Accept the card.', changeSet: [organise] };
    expect(withLaterPlansRouted(proposed, true)).toBe(proposed);
  });

  it('should withhold a plans page from any other turn and keep the rest', () => {
    const routed = withLaterPlansRouted({ reply: 'Saved.', changeSet: [openingPage, plansPage], question: { q: 1 } }, false);

    expect(routed.changeSet).toEqual([openingPage]);
    expect(routed.reply).toBe(`Saved.\n\n${PLANS_WITHHELD_NOTE}`);
    expect(routed.question).toEqual({ q: 1 });
    expect(withLaterPlansRouted({ reply: 'Saved.', changeSet: [plansPage] }, false)).toEqual({ reply: `Saved.\n\n${PLANS_WITHHELD_NOTE}` });
  });

  it('should leave a turn with no plans page untouched', () => {
    const output = { reply: 'Saved.', changeSet: [openingPage] };
    expect(withLaterPlansRouted(output, false)).toBe(output);
  });
});

describe('chat turn advice', () => {
  it('should spend one repair on a plans page or an inline organise, never on a lookup round', () => {
    expect(buildChatRefinePrompt('project').advise?.({ reply: 'x', changeSet: [plansPage] } as never)).toHaveLength(1);
    expect(buildChatRefinePrompt('project', { proseEdits: false, organiseNotes: true }).advise?.({ reply: 'x', changeSet: [openingPage] } as never)).toHaveLength(1);
    expect(buildChatRefinePrompt('project', { proseEdits: false, organiseNotes: true }).advise?.({ reply: 'x', changeSet: [organise] } as never)).toEqual([]);
    expect(buildChatRefinePrompt('project', { proseEdits: false, organiseNotes: true }).advise?.({ reply: 'x', lookups: [{ tool: 'get_notes' }] } as never)).toEqual([]);
  });
});
