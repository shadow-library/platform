import { describe, expect, it } from 'bun:test';

import {
  buildVoiceSelection,
  EMPTY_VOICE_DRAFT,
  nextVoiceDraft,
  parseVoiceRound,
  pickVoice,
  restoreVoiceDraft,
  voiceDraftFrom,
  voiceLockIssue,
} from '@/features/blueprint/voice-step';
import { type LedgerEntryResponse } from '@/lib/apis';

const round = {
  id: '1',
  options: {
    samples: [
      { id: 'vs1', label: 'Close third, dry', tradeoff: 'Closest to his thinking', opening: 'The third door owed the city nine hours.' },
      { id: 'vs2', label: 'First person, present', tradeoff: 'Immediate', opening: 'I knock twice.' },
    ],
  },
} as never;

const parsed = parseVoiceRound(round);

function entry(overrides: Partial<LedgerEntryResponse> = {}): LedgerEntryResponse {
  return {
    id: '1',
    kind: 'decision',
    phase: 'opening',
    topic: 'voice',
    statement: 'Close third, dry wit',
    why: 'It suits a narrator who lies',
    rejectedAlternatives: [],
    writerLine: 'Stay inside his head and never explain the rules.',
    decidedBy: 'author',
    stepKey: 'voice',
    payload: { label: 'Close third, dry wit', paragraph: 'Widow Pell opened after four knocks.' },
    links: {},
    status: 'active',
    withdrawnReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as LedgerEntryResponse;
}

describe('parseVoiceRound', () => {
  it('should read every sample offered', () => {
    expect(parsed.samples.map(sample => sample.id)).toEqual(['vs1', 'vs2']);
  });

  it('should survive a round with nothing in it', () => {
    expect(parseVoiceRound(null)).toEqual({ samples: [] });
    expect(parseVoiceRound({ id: '2', options: { samples: ['junk', {}] } } as never).samples).toEqual([]);
  });
});

describe('pickVoice', () => {
  it('should take the sample’s label and opening as the starting point, leaving the notes to the author', () => {
    const drafted = pickVoice(EMPTY_VOICE_DRAFT, parsed.samples[1]!);
    expect(drafted).toMatchObject({ optionId: 'vs2', label: 'First person, present', paragraph: 'I knock twice.', notes: '' });
  });
});

describe('voiceLockIssue', () => {
  it('should name what is still missing, in the order the author fills it in', () => {
    expect(voiceLockIssue(EMPTY_VOICE_DRAFT)).toContain('Pick a voice');
    expect(voiceLockIssue({ ...EMPTY_VOICE_DRAFT, label: 'Dry third' })).toContain('paragraph');
    expect(voiceLockIssue({ ...EMPTY_VOICE_DRAFT, label: 'Dry third', paragraph: 'A line.' })).toContain('every chapter pack');
    expect(voiceLockIssue({ ...EMPTY_VOICE_DRAFT, label: 'Dry third', paragraph: 'A line.', notes: 'Short paragraphs.' })).toBeNull();
  });
});

describe('buildVoiceSelection', () => {
  it('should send the chosen sample and the author’s own lines', () => {
    const draft = { ...pickVoice(EMPTY_VOICE_DRAFT, parsed.samples[0]!), notes: 'Short paragraphs.', why: 'It suits him' };
    expect(buildVoiceSelection(draft, parsed)).toEqual({
      optionId: 'vs1',
      label: 'Close third, dry',
      notes: 'Short paragraphs.',
      paragraph: 'The third door owed the city nine hours.',
      why: 'It suits him',
    });
  });

  it('should drop an option id the round no longer offers, so a stale id never reaches the lock', () => {
    const draft = { optionId: 'vs9', label: 'My own voice', notes: 'Short paragraphs.', paragraph: 'A line.', why: '' };
    expect(buildVoiceSelection(draft, parsed)).toEqual({ label: 'My own voice', notes: 'Short paragraphs.', paragraph: 'A line.' });
  });

  it('should refuse exactly when the lock issue answers', () => {
    expect(buildVoiceSelection(EMPTY_VOICE_DRAFT, parsed)).toBeNull();
  });
});

describe('restoreVoiceDraft', () => {
  it('should read the locked voice back with its notes and paragraph, naming no round-local option', () => {
    expect(restoreVoiceDraft([entry()])).toEqual({
      optionId: '',
      label: 'Close third, dry wit',
      notes: 'Stay inside his head and never explain the rules.',
      paragraph: 'Widow Pell opened after four knocks.',
      why: 'It suits a narrator who lies',
    });
  });

  it('should answer null before anything is locked', () => {
    expect(restoreVoiceDraft([])).toBeNull();
  });
});

describe('nextVoiceDraft', () => {
  it('should take a new round’s first sample when the author has only been shown the last one', () => {
    const offered = voiceDraftFrom(parsed);
    expect(nextVoiceDraft(offered, offered, parsed).label).toBe('Close third, dry');
  });

  it('should keep the author’s own lines and resolve the pick against the new round by label', () => {
    const offered = voiceDraftFrom(parsed);
    const touched = { ...offered, notes: 'Short paragraphs.', paragraph: 'My own paragraph.' };
    const rerolled = { ...parsed, samples: parsed.samples.map(sample => ({ ...sample, id: `x${sample.id}` })) };

    const next = nextVoiceDraft(touched, offered, rerolled);
    expect(next).toMatchObject({ optionId: 'xvs1', notes: 'Short paragraphs.', paragraph: 'My own paragraph.' });
  });

  it('should forget the pick when the voice the author named is no longer offered', () => {
    const offered = voiceDraftFrom(parsed);
    const touched = { ...offered, label: 'A voice of my own', notes: 'x' };
    expect(nextVoiceDraft(touched, offered, parsed).optionId).toBe('');
  });
});
