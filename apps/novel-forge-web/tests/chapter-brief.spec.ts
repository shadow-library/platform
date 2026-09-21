import { describe, expect, it } from 'bun:test';

import { appliedBriefChapters, endingContractOf, parseBriefBody, regenerableChapters } from '../src/lib/chapter-brief';

describe('parseBriefBody', () => {
  it('should split a labelled brief into sections with inline text and lists', () => {
    const body = 'Purpose: Orrin reaches the Saltvine archive.\n\nBeats:\n- He bribes the ferryman.\n- Pell meets him at the door.\n\nTone: quiet, wary.';
    expect(parseBriefBody(body)).toEqual([
      { heading: 'Purpose', paragraphs: ['Orrin reaches the Saltvine archive.'], items: [] },
      { heading: 'Beats', paragraphs: [], items: ['He bribes the ferryman.', 'Pell meets him at the door.'] },
      { heading: 'Tone', paragraphs: ['quiet, wary.'], items: [] },
    ]);
  });

  it('should read an outlined brief as its objective followed by beats', () => {
    const body = 'Orrin must reach the archive before the tide bell.\nHe bribes the ferryman.\nPell meets him at the door.\nHandoff beat: the door swings shut.';
    expect(parseBriefBody(body)).toEqual([
      { heading: 'Objective', paragraphs: ['Orrin must reach the archive before the tide bell.'], items: [] },
      { heading: 'Beats', paragraphs: [], items: ['He bribes the ferryman.', 'Pell meets him at the door.'] },
      { heading: 'Continuity', paragraphs: [], items: ['Handoff beat: the door swings shut.'] },
    ]);
  });

  it('should fall back to plain paragraphs for free-form prose', () => {
    const body = 'Orrin arrives at dusk and the archive is already flooding.\n\nPell is waiting, soaked and angry.';
    expect(parseBriefBody(body)).toEqual([
      { heading: null, paragraphs: ['Orrin arrives at dusk and the archive is already flooding.', 'Pell is waiting, soaked and angry.'], items: [] },
    ]);
  });

  it('should not mistake a long sentence with a colon for a heading', () => {
    const body = 'Purpose: arrive.\n\nWhen Orrin finally reaches the flooded door of the archive: he hesitates.';
    expect(parseBriefBody(body)[0]?.paragraphs).toEqual(['arrive.', 'When Orrin finally reaches the flooded door of the archive: he hesitates.']);
  });

  it('should keep a "Name: action" beat as a bullet under its section', () => {
    const body = 'Purpose: arrive.\n\nBeats:\n- Orrin: bribes the ferryman.\nPell: waits at the door.';
    expect(parseBriefBody(body)).toEqual([
      { heading: 'Purpose', paragraphs: ['arrive.'], items: [] },
      { heading: 'Beats', paragraphs: ['Pell: waits at the door.'], items: ['Orrin: bribes the ferryman.'] },
    ]);
  });

  it('should return nothing for an empty body', () => {
    expect(parseBriefBody('  \n ')).toEqual([]);
  });
});

describe('endingContractOf', () => {
  it('should read the contract fields and humanise the hook type', () => {
    const contract = {
      hookType: 'quiet_dread',
      emotionalBeat: 'unease',
      openQuestion: 'who rang the bell?',
      handoffState: 'Orrin alone in the dark',
      mustNotResolve: ['thread:bell'],
    };
    expect(endingContractOf(contract)).toEqual({ ...contract, hookType: 'quiet dread' });
  });

  it('should return null for a missing or empty contract', () => {
    expect(endingContractOf(null)).toBeNull();
    expect(endingContractOf({})).toBeNull();
    expect(endingContractOf('cliffhanger')).toBeNull();
  });
});

describe('regenerableChapters', () => {
  it('should offer only drafted chapters that are not finalized', () => {
    const drafts = [
      { chapter: 2, status: 'draft' },
      { chapter: 3, status: 'final' },
    ];
    expect(regenerableChapters([2, 3, 4], drafts)).toEqual([2]);
  });
});

describe('appliedBriefChapters', () => {
  it('should list the chapters whose brief update landed', () => {
    const proposal = {
      id: '1',
      status: 'applied',
      changeSet: [
        { op: 'brief.update', chapter: 5 },
        { op: 'brief.update', chapter: 2 },
        { op: 'brief.update', chapter: 9 },
        { op: 'entity.upsert', entityKey: 'orrin' },
      ],
      opResults: [{ index: 2, status: 'declined' }],
    };
    expect(appliedBriefChapters(proposal)).toEqual([2, 5]);
  });

  it('should list nothing for a proposal that has not been applied', () => {
    expect(appliedBriefChapters({ id: '1', status: 'pending', changeSet: [{ op: 'brief.update', chapter: 5 }] })).toEqual([]);
  });
});
